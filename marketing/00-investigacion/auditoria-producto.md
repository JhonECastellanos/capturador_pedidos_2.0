# Auditoría del producto para comercialización

Fecha de corte: **2026-10-15**. Método: lectura del código y documentación local; sin ejecución de la aplicación, llamadas al proveedor, pruebas de audio ni acceso a datos productivos. V8P4 es la versión declarada por README, no una revisión Git verificada en esta tarea.

## Resultado

ABINOVA administra una empresa por instalación. Su argumento comercial demostrable es unir operación de ventas, cartera, inventario y caja con un asistente de voz/chat que **consulta, prepara, corrige, revisa y solicita confirmación**, utilizando las acciones existentes. Esto describe implementación observada; no acredita rendimiento, autonomía total ni superioridad frente a otros productos.

## Evidencia local trazable

Las rutas son relativas a la raíz del repositorio. No se encontró un archivo llamado literalmente `contratoagentes`; el contrato de agentes efectivamente localizado y leído es `Compartido/src/agentes.ts`.

| ID | Fuente y símbolo | Qué sustenta | Límite de la conclusión |
| --- | --- | --- | --- |
| L01 | `README.md`, Funcionamiento esperado y validación | Pedidos, cobros/crédito, productos, compras, gastos, caja, roles, instalación y modos de IA | Es documentación; no prueba del despliegue actual |
| L02 | `Compartido/src/agentes.ts`, `OperacionesAgente`, `InstruccionAgenteEsquema`, `RevisionAgente` | 13 tipos de instrucción, revisión versionada, faltantes, alternativas de producto y huella | Un tipo declarado no garantiza que cualquier frase se entienda |
| L03 | `Backend/src/agentes/chat.service.ts`, `responder` / `consultar` | Consulta productos, pedidos, compras, proveedores y resumen; máximo diez resultados mostrados | Chat administrativo; exige rol y permisos del módulo |
| L04 | `Backend/src/agentes/agentes.service.ts`, `autorizarOperacion` / `revisar` | Revisión de permisos, referencias, cantidades, disponibilidad, totales y correcciones | Los validadores del negocio siguen teniendo la última palabra |
| L05 | `Frontend/src/modules/agentes/guardar-chat.ts`, `guardarDesdeChat` | Adaptador hacia fachada de operaciones y rutas vigentes; no recalcula stock/saldos | La escritura necesita revisión completa y autorización |
| L06 | `Frontend/src/modules/agentes/operacion-agente.ts`, `useOperacionAgente` | Revalida antes de guardar; ante cambio de huella requiere nueva revisión; comparte promesa en curso | No equivale a demostrar ausencia absoluta de duplicados |
| L07 | `Frontend/src/modules/agentes/ChatAdmin.tsx` | Confirmación dentro de conversación; bloquea con faltantes y atiende correcciones | No es un bot público de WhatsApp ni un chat para todos los roles |
| L08 | `Backend/src/agentes/agentes.controller.ts` | Chat restringido a administrador; interpretación/revisión también para vendedor e inventario | Cada rol conserva su alcance |
| L09 | `Backend/src/agentes/proveedores.ts`, `preparar_operacion` / `interpretarProveedor` | Herramienta de preparación y adaptadores de proveedores, incluido Ollama | No demuestra servidor MCP estándar ni interconexión universal |
| L10 | `docs/constitucion/01_stack_y_reglas.md` | Una empresa, factura interna, modo local de compatibilidad y límites de operación | Prohíbe presentar factura interna como factura DIAN |
| L11 | `EQUIVALENCIA_VARIABLES.txt`, sección V8P4 14/10/2026 | Correspondencia voz/chat, revisión y acciones comerciales | Complementa el código; no reemplaza validación actual |
| L12 | `docs/info/AUDITORIA_PROFESIONAL.md`, `infra/README.md`, `docs/info/DESPLIEGUE_CONTINUO.md` | Historial de pruebas y requisitos de operación/despliegue | Hay referencias antiguas V5P3/V3 en despliegue; README declara V8P4 |

## Cobertura del asistente

El contrato admite pedido, compra, gasto, egreso, precio, cobro, estado, cierre, conteo, iniciar/finalizar/aplicar conteo y consulta. `guardarDesdeChat` conecta las escrituras con las acciones de negocio. Las consultas no se guardan. La voz revisa en formularios existentes; Chat permite revisar y confirmar dentro de la conversación.

| Perfil | Alcance observado |
| --- | --- |
| Administrador | Chat y consultas; operaciones sujetas a permisos, reglas y configuración |
| Vendedor | Interpretación de pedido, cobro y estado; sin consultas administrativas generales |
| Inventario | Cantidades de productos asignados en conteos; sin crear, cerrar o aplicar conteos |

**Todos los planes comerciales incluyen voz/chat dentro de estos permisos.** La igualdad entre planes no amplía permisos ni crea funciones nuevas para un rol.

## Disponibilidad que debe comunicarse

| Estado | Alcance |
| --- | --- |
| Implementado en código/documentado | Gestión operativa y asistente con revisión y confirmación humana |
| Disponible con configuración | Híbrido con proveedor compatible, credenciales, modelo y servicio de voz habilitados; requiere conectividad del proveedor y comprobación en instalación |
| Preparado, sin modelos | Local/Ollama; no vender como IA local lista ni operación sin Internet |
| Pendiente | API Live; aparecen ajustes en contrato, pero la sesión actual de audio rechaza modo Live |
| No implementado en el checkout auditado | Facturación electrónica DIAN, offline operativo, multisede centralizado, RRHH/nómina |

El servidor local no convierte la SPA en una solución offline. El modo de compatibilidad local no es autenticación de producción. Varias instalaciones independientes no equivalen a consolidación multisede. La existencia de endpoints y herramientas de proveedor no acredita compatibilidad MCP estándar.

## Demostración comercial propuesta, aún no ejecutada aquí

En QA con catálogo ficticio y proveedor configurado: consultar un producto; preparar un pedido; corregir dos veces producto/cantidad manteniendo pago y otras líneas; revisar faltantes, disponibilidad y total; confirmar; comprobar persistencia y coherencia de stock/cartera/caja. Repetir permiso denegado y cambio de datos entre revisión y confirmación. Para voz, comprobar micrófono físico, ruido, pausas y eco antes de prometer experiencia en ese equipo.

La demostración acredita esos casos y ese entorno. No publicar cifras de ahorro, precisión, concurrencia o disponibilidad sin medición fechada.
