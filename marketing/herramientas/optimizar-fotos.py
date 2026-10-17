"""Exporta los originales ilustrativos a WebP, sin cambiar su contenido."""
from pathlib import Path
from PIL import Image
raiz = Path(__file__).resolve().parents[1]
destino = raiz / '12-landing-page/assets/personas'
destino.mkdir(parents=True, exist_ok=True)
for original in sorted((raiz / 'recursos/originales').glob('*.png')):
    with Image.open(original) as foto:
        foto.thumbnail((1200, 900))
        foto.convert('RGB').save(destino / (original.stem + '.webp'), 'WEBP', quality=85)
print(f'{len(list((raiz / "recursos/originales").glob("*.png")))} fotografías exportadas a WebP; originales conservados.')
