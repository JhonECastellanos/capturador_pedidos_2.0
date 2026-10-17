# Marketing de ABINOVA

Biblioteca local para revisar, sin publicación ni acceso a datos del negocio. El chatbot operativo por chat y voz acompaña los módulos actuales según permisos, configuración y confirmación. Los servicios especializados se ofrecen mediante implementación acordada.

- [Landing comercial](12-landing-page/index.html): http://localhost:8080/comercial/, servida por el Nginx existente del cliente.
- [Vista previa de estos ajustes](http://127.0.0.1:8791): ejecutar el servidor con `PUERTO_MARKETING=8791`; no sustituye producción.
- [Galería por perfil, red y ángulo](14-produccion/galeria.html).
- [Índice de los 12 perfiles](datos/README.md).
- [Planes](11-modelo-comercial/planes.md) y [alcance real del producto](00-investigacion/auditoria-producto.md).

| Entrega | Cantidad |
|---|---:|
| Perfiles, incluidos Droguerías y Empresarial corporativo | 12 |
| Conceptos: tres ángulos en Facebook, Instagram y TikTok | 108 |
| Textos A/B, dentro de cada copy | 216 |
| Documentos consolidados, uno por perfil/red | 36 |
| PNG locales en TikTok, copias exactas de originales | 12 |
| Sugerencias Facebook, una por ángulo | 36 |
| Portadas Instagram, una compartida por perfil | 12 |
| Fotografías originales conservadas, dos nuevas con imagegen integrado | 12 |

Tres propuestas de reels Instagram y tres TikTok por perfil. TikTok contiene una copia exacta local de la fotografía original; no hay MP4 renderizados. A/B son dos enfoques textuales dentro del escenario, sin duplicar piezas. Las composiciones muestran la foto completa y texto en banda índigo, sin UI sobre caras, panel blanco obligatorio ni gradientes.

Droguerías se limita a operación comercial y trazabilidad simple: no ofrece control de lotes, vencimientos ni recetas. Empresarial corporativo plantea implementación a medida con alcance y validación. Las identidades y dolores son hipótesis editoriales, sin testimonios ni pérdidas medidas.

Oferta: Esencial $89.900, 3 usuarios/1 agente; Negocios $199.900, 6/3; Profesional $499.900, 12/6. Empresarial es **Proyecto personalizado**, sin precio ni cupos, con CTA **Armemos tu propuesta**. WhatsApp +57 3125081070 prepara el mensaje y conserva perfil, plan y modalidad; no envía nada automáticamente.

Vista previa desde la raíz (terminal independiente):

```powershell
$env:PUERTO_MARKETING='8791'
# Vista previa opcional, en otro puerto cuando Docker ya ocupa 8790:
$env:PUERTO_MARKETING=8791
node marketing/herramientas/servir.cjs
```



Regeneración y estructura: [guía de producción](14-produccion/README.md). El servidor de landing sirve solo `12-landing-page/`. Para una publicación futura se revisaría únicamente esa carpeta. Investigación, galería y materiales editoriales son internos. Los ejecutores y scripts de pruebas se retiraron.

Vista compacta: cuatro planes en escritorio; en móvil, un plan por vista con desplazamiento horizontal nativo, flechas y teclado. Las secciones usan scroll-snap proximity; las ventanas cortas conservan scroll vertical para no cortar texto. Sin capturar wheel/touch y con movimiento reducido. Microanimaciones por IntersectionObserver, transform y opacity, sin dependencias nuevas.

Contrato comercial público: `GET /api/v1/comercial/planes`, mismo origen. Responde el objeto de `datos/planes-propuestos.json` o `{data: objeto}`; `planes[].creditosMensuales` es entero para los tres planes con tarifa. Empresarial omite precio, usuarios, agentes y créditos numéricos. La landing usa su JSON local inmediatamente y, si la respuesta válida llega, actualiza precios, cupos, créditos, enlaces y resumen de compra. No envía cookies ni claves, no persiste respuestas en el navegador y conserva la fuente local ante 404, red caída o datos inválidos. El servidor de vista previa devuelve 204 en esa ruta: no conecta con la API real. El backend y el editor del operador se implementan fuera de este alcance.

Los créditos sugeridos son 1.000/4.000/12.000 por mes; su base es de 1.000 tokens por crédito, ponderados por modelo, con reserva y conciliación. El cupo requiere conexión asignada por el operador y no es ilimitado. API propia: consumo del proveedor, sin descontar el cupo incluido. Local: tampoco descuenta ese cupo; hardware y configuración opcionales, sin promesa de voz fluida en vivo. La FAQ pública sigue siendo local. Workflows Python, aislamiento multiempresa y controles del operador son trabajo independiente; esta entrega no acredita un SaaS compartido migrado ni servicios especializados activos.

La oferta destaca ABI por tareas y permisos. Los precios y créditos mensuales se administran en /operador y la landing lee el catálogo público; los cupos de usuarios y agentes permanecen en la propuesta. Las fuentes locales sirven como referencia si la API no responde. El flujo de pago sigue en preparación y no captura tarjetas.

## Distribución local por red

En cada perfil, `facebook/CONTENIDO.md`, `instagram/CONTENIDO.md` y `tiktok/CONTENIDO.md` reúnen los tres ángulos, copies A/B, guiones, storyboards y prompts sin descartar texto. Cada documento muestra sus PNG locales: Facebook 3, Instagram 1 y TikTok 1 por perfil (36/12/12 en total). Los 48 PNG y SVG exportados se movieron desde recursos/exportaciones; los 12 PNG TikTok son copias exactas de los originales, que se conservan. No se generaron variantes ni videos.

