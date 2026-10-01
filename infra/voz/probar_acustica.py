import json
import sys
import wave
from pathlib import Path
from vosk import KaldiRecognizer, Model, SetLogLevel
from confianza import confianza_frase

SetLogLevel(-1)
modelo = Model("/opt/vosk-model-small-es-0.42")
carpeta = Path(sys.argv[1])
ejercicios = json.loads((carpeta / "ejercicios.json").read_text(encoding="utf-8-sig"))
resultados = []
for ejercicio in ejercicios:
    rec = KaldiRecognizer(modelo, 16000)
    rec.SetWords(True)
    segmentos = []
    palabras = []
    with wave.open(str(carpeta / ejercicio["archivo"]), "rb") as audio:
        assert audio.getframerate() == 16000 and audio.getnchannels() == 1 and audio.getsampwidth() == 2
        while bloque := audio.readframes(1600):
            if rec.AcceptWaveform(bloque):
                datos = json.loads(rec.Result())
                segmentos.append(datos.get("text", ""))
                palabras.extend(datos.get("result", []))
    datos = json.loads(rec.FinalResult())
    segmentos.append(datos.get("text", ""))
    palabras.extend(datos.get("result", []))
    texto = " ".join(s for s in segmentos if s)
    assert texto, "Audio sin transcripción: " + ejercicio["frase"]
    resultados.append({"frase": ejercicio["frase"], "texto": texto, "confianza": confianza_frase(texto, palabras)})
print(json.dumps(resultados, ensure_ascii=False))
