import unittest
from confianza import confianza_frase


class ConfianzaVozTest(unittest.TestCase):
    def test_nombre_poco_claro_no_rechaza_toda_la_frase(self):
        palabras = [{"word": "cinco", "conf": 1}, {"word": "yogures", "conf": .4}, {"word": "durazno", "conf": .95}]
        self.assertGreater(confianza_frase("cinco yogures durazno", palabras), .65)

    def test_cantidad_dudosa_no_se_acepta(self):
        self.assertLess(confianza_frase("dos yogures", [{"word": "dos", "conf": .4}, {"word": "yogures", "conf": 1}]), .65)

    def test_confirmacion_con_palabra_dudosa_no_se_acepta(self):
        self.assertLess(confianza_frase("confirmar operacion", [{"word": "confirmar", "conf": .7}, {"word": "operacion", "conf": 1}]), .85)

    def test_silencio(self):
        self.assertEqual(confianza_frase("", []), 0)


if __name__ == "__main__":
    unittest.main()
