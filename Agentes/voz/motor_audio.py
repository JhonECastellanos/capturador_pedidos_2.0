"""Reutiliza el motor CPU local; cada conversación conserva su propio procesador."""
import threading
from functools import lru_cache
from faster_whisper import WhisperModel
from pipecat.services.whisper.stt import WhisperSTTService

_carga = threading.Lock()

@lru_cache(maxsize=1)
def _motor(ruta):
    return WhisperModel(ruta, device="cpu", compute_type="int8", cpu_threads=2, local_files_only=True)

class WhisperCompartido(WhisperSTTService):
    # Punto de carga comprobado en Pipecat 1.12.0; no compartir FrameProcessors.
    def _load(self):
        with _carga:
            self._model = _motor(str(self._settings.model))
        problema = self._unsupported_language()
        if problema:
            raise ValueError(problema)

def precalentar(ruta):
    with _carga:
        _motor(str(ruta))
