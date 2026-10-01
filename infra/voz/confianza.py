import re


NUMEROS = set("un uno una dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciseis diecisiete dieciocho diecinueve veinte treinta cuarenta cincuenta sesenta setenta ochenta noventa cien ciento mil".split())


def confianza_frase(texto, palabras):
    valores = [max(0, min(1, p.get("conf", 0))) for p in palabras]
    if not valores:
        return 0
    if texto.strip() in ("confirmar operación", "confirmar operacion", "confirmo la operación", "confirmo la operacion", "cancelar operación", "cancelar operacion", "cancela la operación", "cancela la operacion"):
        return min(valores)
    cantidades = [p.get("conf", 0) for p in palabras if p.get("word", "") in NUMEROS or re.fullmatch(r"\d+", p.get("word", ""))]
    if cantidades and min(cantidades) < 0.65:
        return min(cantidades)
    return sum(valores) / len(valores)
