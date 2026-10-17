"""Relay Live privado. Nunca entrega credenciales ni ejecuta operaciones comerciales."""
import asyncio
import audioop  # Runtime del contenedor: Python 3.12; conversión con estado entre bloques.
import base64
import json
import os
import time
from urllib.parse import quote

import aiohttp
from cierres_live import abrir_con_respaldo, cerrar_con_respaldo, marcar_proveedor

GEMINI = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
OPENAI = "wss://api.openai.com/v1/realtime"
INSTRUCCIONES = (
    "Eres ABI, asistente de voz. Responde en el idioma del usuario de forma breve. "
    "Para TODA orden, consulta comercial, corrección, cancelación o confirmación llama "
    "exclusivamente tramitar_turno con el texto fiel del usuario. No ejecutes operaciones "
    "ni inventes resultados. Espera su respuesta y léela al usuario sin volver a llamar "
    "la herramienta por esa respuesta. Una confirmación también debe tramitarse. "
    "No afirmes que se guardó algo hasta recibir ese resultado."
)
PARAMETROS = {"type": "object", "properties": {"texto": {"type": "string"}}, "required": ["texto"], "additionalProperties": False}


async def conversar_live(socket, ticket):
    proveedor_contactado = False
    tokens = None
    rechazada = False
    lista = False
    renovar = False
    uso_pendiente = False
    respuesta_en_curso = False
    uso_incierto = False
    cerrando = False
    tareas = []
    respaldo = False
    headers = {"Authorization": "Bearer " + os.environ.get("VOICE_AGENT_TOKEN", "")}
    async with aiohttp.ClientSession(headers=headers, timeout=aiohttp.ClientTimeout(total=12)) as http:
        try:
            config = await abrir_con_respaldo(http, ticket)
            respaldo = True
            config = config.get("data", config)
            proveedor = config["proveedor"]
            if proveedor not in {"gemini", "openai"}:
                raise ValueError("Proveedor Live no compatible")
            modelo = config["modelo"]
            voz = config["voz"]
            max_tokens = int(config["maxTokens"])
            if not isinstance(modelo, str) or not modelo or not isinstance(voz, str) or max_tokens < 1:
                raise ValueError("Configuración Live incompleta")
            # Sesión independiente: nunca reenviar VOICE_AGENT_TOKEN al proveedor.
            trazas = aiohttp.TraceConfig()
            async def rechazar_redireccion(_sesion, _contexto, _parametros):
                raise ValueError("El proveedor intentó redirigir la conexión Live")
            trazas.on_request_redirect.append(rechazar_redireccion)
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=None, connect=10, sock_connect=10), trace_configs=[trazas]) as externo:
                url = GEMINI if proveedor == "gemini" else OPENAI + "?model=" + quote(modelo, safe="")
                auth = {"x-goog-api-key": config["apiKey"]} if proveedor == "gemini" else {"Authorization": "Bearer " + config["apiKey"]}
                await marcar_proveedor(ticket)
                proveedor_contactado = True
                async with externo.ws_connect(url, headers=auth, heartbeat=15, max_msg_size=2 * 1024 * 1024, timeout=10) as ws:
                    pendientes = []
                    vistos = set()
                    canceladas = set()
                    estado_remuestreo = None
                    inicio = time.monotonic()
                    bytes_entrada = 0
                    turnos = 0
                    turno_abierto = False
                    transcripcion_usuario = ""
                    item_usuario = None
                    transcripciones = {}
                    entradas_respuesta = {}
                    entrada_hablando = False
                    metadata = asyncio.Event()
                    async def enviar(dato):
                        await ws.send_json(dato)
                    if proveedor == "gemini":
                        await enviar({"setup": {"model": modelo if modelo.startswith("models/") else "models/" + modelo,
                            "generationConfig": {"responseModalities": ["AUDIO"], "maxOutputTokens": max_tokens, "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voz}}}},
                            "inputAudioTranscription": {},
                            "systemInstruction": {"parts": [{"text": INSTRUCCIONES}]},
                            "tools": [{"functionDeclarations": [{"name": "tramitar_turno", "description": "Tramita el turno en la aplicación y espera el resultado", "parameters": PARAMETROS}]}]}})
                    else:
                        await enviar({"type": "session.update", "session": {"type": "realtime", "instructions": INSTRUCCIONES,
                            "output_modalities": ["audio"], "max_output_tokens": max_tokens,
                            "audio": {"input": {"transcription": {"model": "gpt-4o-mini-transcribe"}, "format": {"type": "audio/pcm", "rate": 24000}, "turn_detection": {"type": "server_vad", "interrupt_response": True, "create_response": True}}, "output": {"format": {"type": "audio/pcm", "rate": 24000}, "voice": voz}},
                            "tools": [{"type": "function", "name": "tramitar_turno", "description": "Tramita el turno y espera el resultado", "parameters": PARAMETROS}], "tool_choice": "auto"}})
                    # No capturar hasta que el proveedor haya aceptado la configuración.
                    async def recibir_proveedor():
                        nonlocal tokens, rechazada, lista, turnos, uso_pendiente, turno_abierto, respuesta_en_curso, transcripcion_usuario, item_usuario, entrada_hablando, uso_incierto
                        async for mensaje in ws:
                            if mensaje.type not in {aiohttp.WSMsgType.TEXT, aiohttp.WSMsgType.BINARY}:
                                break
                            dato = json.loads(mensaje.data)
                            tipo = dato.get("type")
                            if "error" in dato:
                                error = dato.get("error") or {}
                                codigo = error.get("code")
                                estado = error.get("status")
                                rechazada = not lista and (codigo in {400, 401, 403, 429, "invalid_api_key", "invalid_request_error", "invalid_value", "model_not_found"} or estado in {"INVALID_ARGUMENT", "PERMISSION_DENIED", "UNAUTHENTICATED", "RESOURCE_EXHAUSTED"})
                                raise ValueError("El proveedor rechazó la sesión Live. Revisa modelo, voz y cuota")
                            if "setupComplete" in dato or tipo == "session.updated":
                                lista = True
                                if not cerrando:
                                    await socket.send_json({"tipo": "listo", "live": True})
                            if tipo == "input_audio_buffer.speech_started":
                                item_usuario = dato.get("item_id")
                                entrada_hablando = True
                                uso_pendiente = True
                            if tipo == "input_audio_buffer.speech_stopped":
                                entrada_hablando = False
                            if tipo == "conversation.item.input_audio_transcription.completed":
                                reconocido = dato.get("transcript", "")
                                item = dato.get("item_id")
                                if isinstance(reconocido, str) and item and len(transcripciones) < 60:
                                    transcripciones[item] = reconocido.strip()[:6000]
                                    if not cerrando:
                                        await socket.send_json({"tipo": "texto", "texto": reconocido.strip()[:6000]})
                            if tipo == "response.created":
                                entradas_respuesta[dato.get("response", {}).get("id")] = item_usuario
                                item_usuario = None
                                respuesta_en_curso = True
                            if tipo == "response.done":
                                respuesta_en_curso = False
                                if not (dato.get("response", {}).get("usage") or {}).get("total_tokens"):
                                    uso_incierto = True
                            uso = dato.get("usageMetadata", {})
                            if isinstance(uso.get("totalTokenCount"), int):
                                # Gemini informa el uso de la petición de generación, no un saldo local.
                                tokens = (tokens or 0) + uso["totalTokenCount"]
                                uso_pendiente = False
                                metadata.set()
                            if tipo == "response.done":
                                uso = dato.get("response", {}).get("usage") or {}
                                if isinstance(uso.get("total_tokens"), int):
                                    tokens = (tokens or 0) + uso["total_tokens"]
                                    uso_pendiente = False
                                    metadata.set()
                            if tokens is not None and tokens >= 64000:
                                return
                            contenido = dato.get("serverContent", {})
                            reconocido = contenido.get("inputTranscription", {}).get("text")
                            if isinstance(reconocido, str) and reconocido.strip():
                                transcripcion_usuario = (transcripcion_usuario + " " + reconocido).strip()[:6000]
                                if not isinstance(uso.get("totalTokenCount"), int):
                                    uso_pendiente = True
                                if not cerrando:
                                    await socket.send_json({"tipo": "texto", "texto": transcripcion_usuario})
                            if proveedor == "gemini" and (contenido.get("modelTurn") or dato.get("toolCall")):
                                respuesta_en_curso = True
                                if not turno_abierto and not isinstance(uso.get("totalTokenCount"), int):
                                    uso_pendiente = True
                            if contenido.get("turnComplete"):
                                respuesta_en_curso = False
                            if tipo == "response.created" or (proveedor == "gemini" and not turno_abierto and (contenido.get("modelTurn") or dato.get("toolCall"))):
                                turnos += 1
                                turno_abierto = True
                                if turnos > 30:
                                    return
                            if contenido.get("turnComplete"):
                                turno_abierto = False
                            if not cerrando and (contenido.get("interrupted") or tipo == "input_audio_buffer.speech_started"):
                                await socket.send_json({"tipo": "interrumpido"})
                            for parte in contenido.get("modelTurn", {}).get("parts", []):
                                audio = parte.get("inlineData", {})
                                if not cerrando and audio.get("data") and audio.get("mimeType", "").startswith("audio/pcm"):
                                    await socket.send_json({"tipo": "audio", "audio": audio["data"], "frecuencia": 24000})
                            if tipo == "response.created":
                                uso_pendiente = True
                            if not cerrando and tipo == "response.output_audio.delta":
                                await socket.send_json({"tipo": "audio", "audio": dato["delta"], "frecuencia": 24000})
                            canceladas.update(dato.get("toolCallCancellation", {}).get("ids", []))
                            llamadas = dato.get("toolCall", {}).get("functionCalls", [])
                            if tipo == "response.done":
                                llamadas = [{"id": item["call_id"], "name": item["name"], "args": json.loads(item["arguments"])} for item in dato.get("response", {}).get("output", []) if item.get("type") == "function_call"]
                            evidencia = ""
                            if proveedor == "gemini" and llamadas:
                                evidencia = transcripcion_usuario
                            elif tipo == "response.done":
                                evidencia = transcripciones.pop(entradas_respuesta.pop(dato.get("response", {}).get("id"), None), "")
                            if llamadas or contenido.get("turnComplete"):
                                transcripcion_usuario = ""
                            if cerrando:
                                continue
                            for llamada in llamadas:
                                identificador = llamada.get("id")
                                texto = llamada.get("args", {}).get("texto")
                                if llamada.get("name") != "tramitar_turno" or not identificador or not isinstance(texto, str) or not 0 < len(texto.strip()) <= 6000:
                                    raise ValueError("El proveedor devolvió una instrucción inválida")
                                if identificador in vistos:
                                    continue
                                vistos.add(identificador)
                                if len(pendientes) >= 8:
                                    raise ValueError("Demasiadas instrucciones pendientes")
                                pendientes.append((identificador, texto.strip(), evidencia))
                                evidencia = ""
                                if len(pendientes) == 1:
                                    await socket.send_json({"tipo": "instruccion", "texto": texto.strip(), "transcripcionUsuario": pendientes[-1][2]})
                            if "goAway" in dato:
                                return
                        if not lista:
                            raise ValueError("La sesión Live terminó antes de estar lista")

                    async def recibir_cliente():
                        nonlocal estado_remuestreo, bytes_entrada, uso_pendiente, cerrando
                        while True:
                            mensaje = await socket.receive()
                            if mensaje["type"] == "websocket.disconnect":
                                cerrando = True
                                return
                            audio = mensaje.get("bytes")
                            if audio is not None:
                                if not audio or len(audio) % 2 or len(audio) > 12800:
                                    raise ValueError("El bloque de audio no tiene un formato válido")
                                if not lista:
                                    continue
                                bytes_entrada += len(audio)
                                if bytes_entrada > 1920000 or bytes_entrada > (time.monotonic() - inicio + 2) * 32000:
                                    raise ValueError("La entrada Live superó el límite de audio o su ritmo permitido")
                                if proveedor == "openai":
                                    audio, estado_remuestreo = audioop.ratecv(audio, 2, 1, 16000, 24000, estado_remuestreo)
                                codificado = base64.b64encode(audio).decode()
                                await enviar({"realtimeInput": {"audio": {"mimeType": "audio/pcm;rate=16000", "data": codificado}}} if proveedor == "gemini" else {"type": "input_audio_buffer.append", "audio": codificado})
                            elif mensaje.get("text") is not None:
                                if len(mensaje["text"]) > 32000:
                                    raise ValueError("Respuesta Live demasiado larga")
                                dato = json.loads(mensaje["text"])
                                texto = dato.get("texto")
                                if dato.get("tipo") != "respuesta" or not isinstance(texto, str) or not texto.strip() or len(texto) > 12000:
                                    raise ValueError("Respuesta Live inválida")
                                if pendientes:
                                    identificador, _, _evidencia = pendientes.pop(0)
                                    if proveedor == "gemini" and identificador not in canceladas:
                                        await enviar({"toolResponse": {"functionResponses": [{"id": identificador, "name": "tramitar_turno", "response": {"resultado": texto}}]}})
                                    elif proveedor == "openai":
                                        await enviar({"type": "conversation.item.create", "item": {"type": "function_call_output", "call_id": identificador, "output": json.dumps({"resultado": texto})}})
                                        if not pendientes:
                                            await enviar({"type": "response.create"})
                                    if pendientes:
                                        await socket.send_json({"tipo": "instruccion", "texto": pendientes[0][1], "transcripcionUsuario": pendientes[0][2]})
                                # Saludos/avisos sin tool pendiente no se convierten en órdenes.
                                elif lista:
                                    if proveedor == "gemini":
                                        await enviar({"clientContent": {"turns": [{"role": "user", "parts": [{"text": "Lee este aviso de la aplicación sin tramitar una orden: " + texto}]}], "turnComplete": True}})
                                    else:
                                        await enviar({"type": "response.create", "response": {"instructions": "Lee este aviso sin llamar herramientas: " + texto, "tool_choice": "none"}})
                    tareas = [asyncio.create_task(recibir_proveedor()), asyncio.create_task(recibir_cliente())]
                    hechas, _ = await asyncio.wait(tareas, timeout=min(60, max(1, int(config.get("segundos", 60)))), return_when=asyncio.FIRST_COMPLETED)
                    for tarea in hechas:
                        tarea.result()
                    cerrando = True
                    tareas[1].cancel()
                    await asyncio.gather(tareas[1], return_exceptions=True)
                    if not tareas[0].done():
                        metadata.clear()
                        if proveedor == "gemini":
                            await enviar({"realtimeInput": {"audioStreamEnd": True}})
                        elif entrada_hablando:
                            await enviar({"type": "input_audio_buffer.commit"})
                        if uso_pendiente or respuesta_en_curso:
                            try:
                                await asyncio.wait_for(metadata.wait(), timeout=2)
                            except asyncio.TimeoutError:
                                pass
                    for tarea in tareas:
                        tarea.cancel()
                    await asyncio.gather(*tareas, return_exceptions=True)
                    renovar = True
        except aiohttp.WSServerHandshakeError as error:
            rechazada = not lista and error.status in {400, 401, 403, 429}
            raise ValueError("El proveedor no aceptó la conexión Live") from None
        finally:
            for tarea in tareas:
                tarea.cancel()
            await asyncio.gather(*tareas, return_exceptions=True)
            # Siempre cerrar la reserva, incluso ante rechazo, desconexión o cancelación.
            async def cerrar_consumo():
                if respaldo:
                    try:
                        await cerrar_con_respaldo(ticket, 0 if not proveedor_contactado else None if uso_incierto or uso_pendiente or respuesta_en_curso else tokens, not proveedor_contactado or rechazada)
                    except Exception:
                        print("Live: conciliación conservada para recuperación", flush=True)
            cierre = asyncio.create_task(cerrar_consumo())
            try:
                await asyncio.shield(cierre)
            except asyncio.CancelledError:
                await cierre
                raise

    if renovar:
        await socket.send_json({"tipo": "reconectar", "mensaje": "Renovando la sesión Live"})
