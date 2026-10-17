# Producción reducida

48 sugerencias gráficas: 36 Facebook (una por perfil/ángulo) y 12 portadas Instagram (una por perfil, compartida por sus tres propuestas de reels). Archivos PNG listos para revisar y SVG editables en las carpetas `facebook/` e `instagram/` de cada perfil. TikTok utiliza tres STORYBOARD/PROMPTANIMACION por perfil con referencia al original, sin videos exportados.

[Galería](galeria.html) filtra perfil, red y ángulo. Cada concepto enlaza las secciones COPY A/B, STORYBOARD y PROMPTANIMACION del documento por red y foto original. [Visor](visor.html) permite comparar A/B sin exportarlos por separado. Los enlaces conservan los tres ángulos de los perfiles nuevos.

La foto completa se inserta sin recortar ni retocar; marca y texto van en banda índigo separada. Sin app encima de caras, fondos blancos obligatorios ni gradientes. Los originales previos `01.png` a `10.png` se conservaron; `11.png` y `12.png` son fotos nuevas de imagegen integrado, con [prompts finales](../recursos/originales/GENERACION-NUEVOS.md).

Regenerar en orden, desde la raíz:

```powershell
node marketing/datos/generar-contenidos.mjs
python marketing/herramientas/optimizar-fotos.py
node marketing/herramientas/preparar-landing.cjs
node marketing/herramientas/actualizar-oferta.cjs
node marketing/herramientas/producir-recursos.cjs
node marketing/herramientas/crear-galeria.cjs
```

La oferta usa exclusivamente `datos/planes-propuestos.json`. El generador editorial conserva hashes para detectar cambios simultáneos; detenerse ante un conflicto. `--migrar-estructura` se usó para la reorganización expresamente autorizada, no en la regeneración habitual. El generador gráfico rechaza las opciones antiguas de video y archivos fuera del catálogo reducido: no recrea slides, recetas individuales ni variantes A/B gráficas.

Limpieza autorizada realizada: 1.500 archivos generados antiguos y 10 MP4; registro de rutas absolutas en `limpieza-autorizada.json`. El script `retirar-exportaciones-antiguas.ps1` limita el borrado a esos patrones y directorios, comprueba rutas y rechaza enlaces; no toca originales. No hace falta repetirlo.

Validar con `node marketing/datos/verificar-entrega.mjs`, los dos scripts `validar-*.cjs` y `python -m pytest marketing/tests -q`. Chrome real verifica 320, 360, 390, 768, 1024 y 1440 px, selector de 12 perfiles, planes/WhatsApp, galería, recursos y los tres ángulos nuevos. Las capturas e informes fechados acreditan solo esas comprobaciones locales. Las capturas antiguas de QA conservan su procedencia; no se recapturó la app ni se escribieron datos comerciales.

## Ajuste comercial compacto

Vista previa aislada en 8791. Regenerar oferta y textos no requiere regenerar las 48 imágenes: la promoción gráfica permanece igual. `probar-ux-comercial.cjs` mide 390/412/768/1440, altura 700 y ventanas cortas, prueba flechas/teclado, movimiento reducido, ausencia de recortes y contrato API con respuestas simuladas. Informe en `validacion-ux-comercial.json`; no acredita backend remoto, micrófono físico ni despliegue.

La suite Python no se ejecutó en esta revisión: el Python disponible no incluye pytest. Las regresiones actuales de navegador y estructura editorial se comprueban con los scripts Node anteriores.

Estructura vigente: un CONTENIDO.md por red con tres ángulos e imágenes locales (Facebook 36 PNG, Instagram 12 PNG, TikTok 12 copias exactas). El generador editorial histórico está bloqueado para preservar la consolidación; no ejecutar la migración nuevamente. Los originales y activos de marca se conservan.
