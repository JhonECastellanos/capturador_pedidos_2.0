# ABINOVA · identidad nova

ABINOVA es la marca; ABI es el personaje que acompaña la operación. El sello representa una nova: tres órbitas y un núcleo luminoso azul violeta. SVG nativo con fondo transparente, sin imágenes generadas ni dependencias externas.

## Archivos y originales

- simbolo.svg: sello para favicon y accesos. Mínimo 24 px; en 16 px usar el favicon conservando su geometría.
- logo.svg: sello y nombre horizontal, mínimo 160 px. Nombre en Space Grotesk: cargar la fuente local al insertar SVG en HTML; para impresión convertir el texto a curvas con la fuente instalada.
- abi.svg: personaje, corazón y constelación. Mínimo 60 px; no sustituye el sello.
- originales-pre-nova/: copias de activos reemplazados. Las fotografías y referencias originales permanecen intactas.
- Copias de entrega: Frontend/public/assets/branding/ y marketing/12-landing-page/assets/branding/. Favicon y PNG de instalación derivan del sello. PNG maskable con símbolo dentro de la zona segura central sobre superficie clara.

## Paleta

| Uso | Color |
| --- | --- |
| Órbita azul | #2563EB |
| Órbita violeta | #8B5CF6 |
| Acción principal compatible con tema actual | #4E4CDB |
| Texto profundo | #211D55 |
| Superficie | #F7F8FF |
| ABI reposo | #9E8BFF |
| ABI escucha | #2385AA |
| ABI razonamiento | #7C3AED |
| ABI habla | #D87C1D |

Los colores del personaje son decorativos; el estado lleva texto accesible. No usar acentos como texto pequeño sobre blanco sin revisar contraste. Conservar personalizaciones mediante las variables de estado existentes.

## Tipografía y uso

Space Grotesk para marca y títulos; Inter para lectura. Fuentes locales, sin CDN. Mantener proporciones y zona libre de un cuarto del ancho del símbolo. Usar fondo claro o superficie uniforme; sobre fondos oscuros acompañar con nombre claro en HTML. No estirar, añadir cajas opacas al SVG ni recolorear órbitas con estados.

## ABI y movimiento

Estrellas con brillo pausado en reposo; escucha cian; razonamiento violeta; habla ámbar. CSS sin librería, flotación máxima 3 px sin destellos bruscos. prefers-reduced-motion: reduce elimina animaciones y transiciones. Foco visible y zonas táctiles de al menos 44 px.

Cliente: un toque conserva alternado de micrófono/mute; dos toques conservan apagar. Nunca activar audio al montar, enfocar, arrastrar ni cambiar de estado. Evasión sin mover el botón durante su interacción o con nube abierta; enfocar un formulario superpuesto puede apartarlo sin cambiar foco ni cancelar eventos. Arrastre acotado a ventana.

Operador: mismo dibujo con nota informativa; sin API, chat ni audio. Landing: conserva js/abi.js para su propietario; assets y CSS consumen clases y data-estado existentes.

## Piezas de Facebook e Instagram

Las 48 publicaciones activas (36 Facebook, 12 Instagram) usan el sello nova nativo en sus fuentes SVG y PNG, dentro de marketing/*/facebook/ y marketing/*/instagram/. La fotografía, el nombre ABINOVA, los copies y la composición se conservan. No hay exportaciones paralelas.

Para rasterizar las fuentes existentes sin regenerar contenido: ejecutar desde la raíz del repositorio `node marketing/herramientas/producir-recursos.cjs --solo-renderizar`. Este modo utiliza los SVG ya editados y reemplaza únicamente sus PNG, sin reescribir fuentes ni manifiestos. El modo normal del generador toma el logo maestro vigente.

Los 96 archivos anteriores (48 SVG + 48 PNG) están en originales-pre-nova/redes/, conservando la ruta de perfil/red. Son respaldos históricos; no deben seleccionarse como publicaciones actuales. Las fotos originales permanecen en marketing/recursos/originales/.
