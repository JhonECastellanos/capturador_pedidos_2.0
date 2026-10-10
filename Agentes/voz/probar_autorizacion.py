"""Pruebas de autorización sin descargar modelos ni importar Pipecat."""
import ast
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import unittest
from pathlib import Path
from uuid import UUID, uuid4

arbol = ast.parse((Path(__file__).parent / 'sesiones_audio.py').read_text(encoding='utf-8-sig'))
funcion = next(n for n in arbol.body if isinstance(n, ast.FunctionDef) and n.name == 'autorizar')
entorno = dict(base64=base64, hashlib=hashlib, hmac=hmac, json=json, os=os, time=time, UUID=UUID, usados={}, activas=set())
exec(compile(ast.Module(body=[funcion], type_ignores=[]), 'autorizar', 'exec'), entorno)

class AutorizacionAudio(unittest.TestCase):
    def setUp(self):
        self.anterior = os.environ.get('VOICE_AGENT_TOKEN')
        os.environ['VOICE_AGENT_TOKEN'] = secrets.token_hex(32)
        entorno['usados'].clear()
        entorno['activas'].clear()

    def tearDown(self):
        if self.anterior is None:
            os.environ.pop('VOICE_AGENT_TOKEN', None)
        else:
            os.environ['VOICE_AGENT_TOKEN'] = self.anterior

    def ticket(self, **cambios):
        datos = dict(id=str(uuid4()), exp=int(time.time()) + 30, stt='whisper', modelo='tiny', idioma='es')
        datos.update(cambios)
        cuerpo = base64.urlsafe_b64encode(json.dumps(datos).encode()).decode().rstrip('=')
        firma = base64.urlsafe_b64encode(hmac.new(os.environ['VOICE_AGENT_TOKEN'].encode(), cuerpo.encode(), hashlib.sha256).digest()).decode().rstrip('=')
        return cuerpo + '.' + firma

    def test_autorizacion_un_solo_uso(self):
        ticket = self.ticket()
        self.assertEqual(entorno['autorizar'](ticket)['modelo'], 'tiny')
        with self.assertRaisesRegex(ValueError, 'utilizada'):
            entorno['autorizar'](ticket)

    def test_firma_alterada(self):
        with self.assertRaisesRegex(ValueError, 'inválida'):
            entorno['autorizar'](self.ticket() + 'x')

    def test_vencida_y_futuro(self):
        for vence in [int(time.time()) - 1, int(time.time()) + 3600]:
            with self.assertRaisesRegex(ValueError, 'vencida'):
                entorno['autorizar'](self.ticket(exp=vence))

    def test_limite_conexiones(self):
        entorno['activas'].update(['uno', 'dos'])
        with self.assertRaisesRegex(ValueError, 'ocupado'):
            entorno['autorizar'](self.ticket())

    def test_modelo_no_autorizado(self):
        with self.assertRaisesRegex(ValueError, 'Faster-Whisper'):
            entorno['autorizar'](self.ticket(modelo='large'))

    def test_sin_secreto(self):
        ticket = self.ticket()
        os.environ['VOICE_AGENT_TOKEN'] = ''
        with self.assertRaisesRegex(ValueError, 'inválida'):
            entorno['autorizar'](ticket)

if __name__ == '__main__':
    unittest.main()
