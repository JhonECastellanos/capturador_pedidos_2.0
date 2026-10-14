"""Dos procesadores independientes reutilizan un único motor instalado."""
import unittest
from pathlib import Path
import os
from loguru import logger
logger.remove()
from motor_audio import WhisperCompartido
from pipecat.transcriptions.language import Language

class MotorCompartido(unittest.TestCase):
    def test_reutiliza_motor_sin_compartir_procesador(self):
        rutas = [Path(os.environ.get('HF_HOME', '/data/modelos')) / ('whisper-' + n) for n in ('base', 'tiny', 'small')]
        ruta = next((r for r in rutas if (r / 'model.bin').is_file()), None)
        if ruta is None:
            self.skipTest('No hay pesos locales instalados; no se descargan en esta prueba')
        ajustes = WhisperCompartido.Settings(model=str(ruta), language=Language.ES)
        a = WhisperCompartido(device='cpu', compute_type='int8', settings=ajustes)
        b = WhisperCompartido(device='cpu', compute_type='int8', settings=ajustes)
        self.assertIsNot(a, b)
        self.assertIs(a._model, b._model)

if __name__ == '__main__':
    unittest.main()
