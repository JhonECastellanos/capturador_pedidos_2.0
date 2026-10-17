# Fuentes y evidencias

Fecha de investigación: **2026-10-15**, Colombia. Alcance acotado: auditoría estática del producto, cuatro competidores, contexto DANE, requisitos DIAN y cuatro intentos de Meta Ads Library. No se ejecutaron operaciones productivas, pruebas de aplicación, Git, compras ni campañas.

## Convención

- **Observado en código**: implementación localizada, sin afirmar ejecución actual.
- **Declarado por proveedor**: contenido oficial público observado, sin ensayo independiente.
- **Estadística oficial**: dato con período, publicación y universo.
- **No verificable**: acceso fallido o información insuficiente; nunca significa ausencia.
- **Propuesta**: decisión de posicionamiento, servicio o investigación, sin resultado medido.

## Registro web oficial

Todas las consultas se realizaron el 15-10-2026. Las páginas comerciales no muestran una fecha de publicación verificable; se registra fecha de consulta, no una actualización editorial inventada. Los valores son una instantánea, no una cotización vigente garantizada.

| ID | Fuente oficial | Evidencia utilizada y alcance | Acceso |
| --- | --- | --- | --- |
| W01 | [Alegra Colombia: planes](https://alegra.com/colombia/precios/) | Tarjetas POS; separar precio mensual de equivalente anual promocional | Texto público leído |
| W02 | [Alegra IA Colombia](https://www.alegra.com/colombia/ia/) | Anuncia voz y automatización; impide afirmar exclusividad de IA/voz propia | Texto público leído |
| W03 | [Alegra contabilidad: precios](https://alegra.com/colombia/contabilidad/precios/) | FAQ contable diferente de referencias contables en página general; no usada para tarifas POS | Resultado oficial consultado |
| W04 | [Siigo: planes y precios](https://www.siigo.com/precios-siigo/) | POS, pago anual/cliente nuevo y agentes IA; no extrapolar a todos los paquetes | Texto público leído |
| W05 | [Vendty: página principal](https://www.vendty.com/) | Emprendedor/Profesional/Empresarial; modalidades de pago y alcance por punto | Texto público leído |
| W06 | [Vendty: página alternativa](https://www.vendty.es/home2) | Condiciones diferentes; descartada como referencia tarifaria colombiana | Resultado indexado; no base del CSV |
| W07 | [Loggro Pymes: planes](https://loggro.com/pymes/planes/) | Tarjetas POS; conflicto 350 frente a 30/mes en POS Tienda; no resolverlo sin confirmación | Texto público leído |
| W08 | [DANE: boletín EMICRON 24 ciudades 2025](https://www.dane.gov.co/files/operaciones/EMICRON/bol-EMICRON-24Ciudades-2025.pdf) | Publicado 30-07-2026; pp. 6 y 8: tamaño y distribución por actividad; hasta nueve ocupados | PDF oficial leído como texto |
| W09 | [DANE: boletín II trimestre 2026](https://www.dane.gov.co/files/operaciones/EMICRON/bol-EMICRON-IItrim2026.pdf) | Publicado 28-08-2026; pp. 1 y 6: variación preliminar interanual, 24 ciudades/áreas metropolitanas | PDF oficial leído como texto |
| W10 | [DANE: portal EMICRON](https://www.dane.gov.co/index.php/estadisticas-por-tema/mercado-laboral/micronegocios) | Objetivo, dominios y enlaces a boletines; no representa compradores de software | Texto público leído |
| W11 | [DIAN: Resolución 000227 de 2025 compilada](https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_dian_0227_2025.htm) | Requisitos, habilitación, entrega, numeración y anexos; consulta del texto consolidado | Texto público leído |
| W12 | [DIAN: Resolución 000165 de 2023](https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_dian_0165_2023.htm) | Remisiones explícitas a la compilación de 2025 | Texto público leído |
| W13 | [DIAN: normatividad de facturación](https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/normatividad/) | Índice auxiliar; no asumir que agota modificaciones actuales | Texto público leído |
| W14 | [DIAN: Resolución 000011 de 2026](https://normograma.dian.gov.co/dian/compilacion/docs/resolucion_dian_0011_2026.htm) | Cambio sobre regularización voluntaria; no habilita el producto ni establece exención general | Texto oficial consultado |
| W15 | [Meta Ads Library](https://www.facebook.com/ads/library/) | Cuatro búsquedas CO/activos; enlaces exactos en biblioteca-meta.md | Fallo del lector: Internal Error; sin anuncios verificables |

## Trazabilidad de afirmaciones

| Afirmación o decisión | Evidencia | Clasificación |
| --- | --- | --- |
| Asistente prepara/corrige/revisa y usa acciones existentes | L02–L07 en [auditoría](auditoria-producto.md) | Observado en código |
| Chat administrativo y permisos por rol | L03/L04/L08 | Observado en código |
| Híbrido condicionado; Ollama sin modelos y API Live pendiente | L01/L02/L09 y rechazo Live en sesión de audio L04 | Código y documentación; sin probar proveedor actual |
| Una empresa; factura interna; sin offline, DIAN, multisede centralizado ni RRHH | L01/L10 e instrucciones de alcance de esta tarea | Límite de oferta |
| No exclusividad de IA/voz | W02/W04 | Declaración oficial de competidores |
| Planes por servicio, mismo producto | [planes](../11-modelo-comercial/planes.md) | Propuesta comercial |
| Contexto estadístico | W08–W10; cifras solo en [posicionamiento](posicionamiento.md) | Estadística oficial con alcance |
| Anuncios o rendimiento de campañas | W15 | No verificable; no se generaron datos |

## Uso y actualización

**comparativa-planes.csv es INTERNA: NO DESPLEGAR CON LANDING.** Nueve planes representativos, no catálogo exhaustivo. Cada fila contiene fecha, fuente, modalidad, restricciones, IVA cuando se pudo establecer y observaciones. Los importes no incluyen una estimación inventada de implementación o consumos. Campos no establecidos permanecen identificados como no verificados. Ninguna fila es un precio de ABINOVA.

Antes de cotizar, comprobar oferta, renovación, impuestos y adicionales. Para publicar ventajas medidas, ejecutar un protocolo comparable. Para reanudar Meta, registrar identidad de página y anuncios visibles; no completar datos ausentes. Para DIAN, revisar normativa y anexo aplicables al proyecto y al contribuyente.

El historial local de pruebas se consultó solo como antecedente. No se reutilizaron sus cifras como validación actual. La revisión documental encontró menciones de ramas antiguas en despliegue; no se modificaron archivos fuera de las dos carpetas asignadas.

## Actualización comercial de la landing · 15-10-2026

Por instrucción posterior del titular: cuatro planes después del hero, precios propuestos de ABINOVA visibles, publicidad sin precios y contacto directo por WhatsApp. Usuarios/agentes son cupos comerciales propuestos; no concurrencia medida. Nómina, talento, asistencia, transporte, logística, importaciones y agentes especializados se ofrecen mediante implementación. La auditoría técnica anterior sigue describiendo el código existente. Oferta y estado de implementación son fuentes distintas.

Reconsultadas las páginas oficiales de [Alegra POS](https://www.alegra.com/colombia/pos/precios/), [Siigo](https://www.siigo.com/precios-siigo/), [Vendty](https://www.vendty.com/) y [Loggro](https://loggro.com/pymes/planes/). Análisis vigente en [comparativa comercial](../11-modelo-comercial/comparativa-competencia.md). Los precios de nuestra oferta son una propuesta propia autorizada para revisión, no cifras de competidores ni costos observados.
