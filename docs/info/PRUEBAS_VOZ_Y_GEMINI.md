# Probar voz y configurar Google Gemini

## Usar la versión actual

Los cambios del código no actualizan automáticamente los contenedores que ya están funcionando. Desde la raíz, con Docker iniciado:

```powershell
docker.exe compose --profile voz up -d --build api frontend voz
```

Este comando reconstruye y reinicia servicios; puede interrumpir sesiones. Termina los formularios abiertos antes de ejecutarlo. No elimina volúmenes. Después recarga la aplicación. Si falla la descarga de una imagen, no asumas que la actualización se aplicó.

## Separar transcripción de interpretación

Entra como administrador → Configuración → Diagnóstico del micrófono → Probar dictado sin guardar. Apaga antes el micrófono flotante. Habla, deja una pausa y revisa el texto y su confianza. La prueba dura como máximo 20 segundos: no llama a Gemini, no interpreta órdenes ni guarda audio o transacciones.

Si lo escrito no corresponde a lo dicho, el problema está en el reconocimiento local. Acércate al micrófono, reduce ruido y comprueba el dispositivo. Cambiar Gemini no cambia Vosk: Gemini recibe texto, no el audio.

Para probar comprensión, activa el micrófono flotante y empieza un pedido ocasional. Usa productos realmente existentes en tu catálogo:

| Ejercicio | Resultado esperado |
|---|---|
| Quiero cinco yogures de durazno y uno de fresa | Cinco de durazno y uno de fresa, o pregunta de presentación si hay varias |
| Me das cinco yogures de durazno y un yogur de fresa | Mismas cantidades |
| Cinco yogurts de durazno y un fresa | Conserva la familia del producto en esa misma frase |
| Quiero yogures de durazno | Pregunta cuántas unidades; no inventa cantidad |
| Yogur con nombre poco claro | Ofrece coincidencias parecidas; no agrega hasta aclarar |
| El de 200 ml | Resuelve únicamente entre las alternativas preguntadas |
| Noventa unidades cuando no hay stock | Conserva el borrador anterior y avisa |
| Confirmar productos | Avanza al paso siguiente; no guarda |
| Cancelar operación | Descarta; no registra una venta |

Antes de guardar revisa nombres, cantidades, precios, subtotal y total visibles. Para comprobar el guardado sin afectar el negocio, usa QA; no confirmes ventas ficticias en producción. Prueba singular/plural, habla normal y ruido razonable desde cada dispositivo. Audio sintético y transcripciones simuladas no certifican micrófonos físicos ni todos los acentos.

## Google Gemini paso a paso

1. Crea o revisa una clave de **Gemini API** en [Google AI Studio](https://aistudio.google.com/api-keys). Una clave de Maps u otro servicio no sustituye la de Gemini; verifica proyecto, restricciones y cuota. No compartas la clave en chat ni Git.
2. En Configuración elige **Google Gemini**. No uses «API compatible personalizada» para esta conexión nativa.
3. Escribe la clave en **Clave de API**. Deja Modelo vacío inicialmente.
4. Pulsa **Consultar modelos disponibles**. No hace falta guardar primero. El catálogo se obtiene de Google, incluyendo páginas siguientes y filtrando modelos con `generateContent`.
5. Elige un identificador del selector **Modelos disponibles**. El catálogo no certifica gratuidad ni cuota: revísalas en AI Studio. No se activa facturación automáticamente.
6. Pulsa **Probar respuesta de Gemini**. Esta acción sí hace una solicitud breve al modelo y consume la cuota disponible. No crea pedidos ni modifica la conexión guardada.
7. Si indica que Gemini respondió, pulsa **Guardar configuración**. La clave queda cifrada en el servidor; al editar después, dejar el campo vacío conserva la clave de la misma conexión.
8. Prueba un pedido por voz y cancélalo antes de guardar. Comprueba separadamente que la transcripción sea correcta y que los campos visibles correspondan a la orden.

Errores: HTTP 400 indica clave/parámetros rechazados; 401/403, autenticación o acceso/restricciones; 404, modelo/ruta no disponible; 429, cuota o límite de solicitudes. Un catálogo visible no garantiza que el modelo seleccionado pueda generar contenido en ese proyecto. No pegues respuestas con credenciales; comunica únicamente el mensaje y código HTTP.

Fuentes: [claves](https://ai.google.dev/gemini-api/docs/api-key), [catálogo paginado](https://ai.google.dev/api/models), [errores](https://ai.google.dev/gemini-api/docs/troubleshooting).

## Pruebas automatizadas sin consumo externo

```powershell
npm.cmd run verificar
npm.cmd run prueba:asistente
npm.cmd run prueba:asistente:ui
```

Las pruebas del asistente incluyen una matriz de 40 expresiones, ambigüedad, medidas, cantidades, respuestas breves y catálogo de Gemini paginado con claves ficticias. La interfaz usa Chrome real con API y transcripciones simuladas para ambos roles. Consultar el catálogo real valida la conexión y la clave, pero no garantiza cuota de generación; la respuesta del modelo y el micrófono físico se comprueban con los pasos anteriores. No hay garantía absoluta de reconocimiento.

Si aparece un 502 por conexión al proveedor, comprueba que API y frontend tengan la compilación actualizada. El transporte fija IPv4 para conservar la validación de destinos y evitar el formato incompatible del lookup automático en Node.js 24. La consulta correcta muestra un aviso «Conexión verificada» con la cantidad de modelos; una consulta fallida elimina la lista anterior y muestra el error.
