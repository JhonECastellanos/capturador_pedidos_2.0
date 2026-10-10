# Auditoría de integración y preparación operativa

## Revisión vigente de conteos y paginación — 09/10/2026

La API pagina las listas y selectores administrativos; aplica búsqueda, orden y filtros antes de LIMIT. Cartera, caja, jornada y cierre usan agregados SQL completos. La fachada global ya no descarga clientes, productos, pedidos, pagos, adjuntos, proveedores ni cambios de precio completos. Conserva los documentos de inventario en curso y el inicio histórico necesarios para continuar operaciones; un documento individual conserva todas sus líneas. La exportación completa de pedidos se consulta únicamente al solicitarla.

Conteos reutiliza cabeceras, líneas, ajustes y movimientos existentes. Las migraciones añaden fecha diaria, ciclo y responsable; fortalecen la relación única entre conteo y ajuste y retiran tres tablas sin uso solo cuando están vacías. No reinician datos comerciales. No se introducen saldos duplicados, tablas de resumen por pantalla ni empresas adicionales.

Las comprobaciones actuales y su alcance están en [validación de formularios y criterios](VALIDACION_FORMULARIOS_Y_BASE_DATOS.md). Las cifras, servicios y pendientes de las secciones siguientes pertenecen a sus fechas históricas. Las comprobaciones de este cambio no acreditan carga de 100.000 pedidos, un celular físico, una instalación externa ni restauración ensayada.

Validación del 30/09/2026. Se reutilizó la API NestJS/Prisma existente y el `.env` raíz. No se reiniciaron datos comerciales ni se importó automáticamente el contenido local del navegador.

## Actualización de interfaz móvil — 09/10/2026

El detalle de los gráficos ahora se puede consultar y cerrar con un toque, manteniendo el hover de escritorio. El paso de productos compartido por administrador y vendedor presenta cinco tarjetas en un contenedor con scroll propio y deja Continuar debajo. Las listas administrativas principales tienen altura estable, scroll interno y desplazamiento exterior. No se cambiaron reglas comerciales, tablas ni endpoints.

Aprobaron compilación/contrato/tipos, caché, los recorridos reales de paneles QA y los 18 casos de integración. Se comprobó cliente y venta contra PostgreSQL, pago, caja y precios históricos. La versión actual se construyó y activó en localhost:8080; el túnel temporal HTTPS responde y sirve los mismos recursos. Se preservaron los datos y un respaldo previo. Detalles, tiempos y límites de estas comprobaciones: [validación de formularios y base de datos](VALIDACION_FORMULARIOS_Y_BASE_DATOS.md).

El acceso autenticado por el enlace público y la prueba en teléfono físico todavía requieren comprobación; no se presentan como realizados. La auditoría de dependencias actual informa siete paquetes afectados (tres altos y cuatro moderados). Para instalar de forma habitual, completar restauración integral, copias externas programadas, perfil LAN/HTTPS, dirección externa estable y validación de arranque del equipo. Se consolidaron estos pendientes en [oportunidades de mejora](OPORTUNIDADES_MEJORA.md), sin crear otra guía.

## Cambios implementados

- Se eliminó la banda blanca «Datos compartidos / Actualizar» en ambos roles. Servía para estado de conexión y refresco manual, no para persistir información. Se mantienen revisión transaccional cada dos segundos, respaldo de refresco y avisos de desconexión/error con Reintentar.
- El refresco conserva snapshots de la misma sesión con referencias compartidas; ya no vacía el estado operativo al actualizar el tablero ni reaplica snapshots anteriores. Gráficos/listas mantienen contenido durante filtros remotos, con aviso de actualización y acciones bloqueadas sobre páginas anteriores. Navegación móvil no desplaza ancestros para centrar una pestaña. Botones no envían formularios salvo type=submit explícito.
- Listas de hasta 30 registros por página y selectores/pendientes con límite y búsqueda. Paneles tienen mínimo de contenido de 600 px, áreas de lista de 160 px y tarjetas de 64 px, permitiendo scroll exterior con poca altura. El límite visual no altera agregaciones, saldos, FIFO, líneas de una factura ni restricciones de la API.
- Optativamente se añadieron 32 productos y 8 clientes ficticios en un fixture reutilizable y un cargador vía API, separado de la semilla. En esta instalación local, por solicitud expresa, se sustituyeron únicamente los antiguos recursos «Humo» y sus dependencias, verificando IDs, nombres y cantidades dentro de una transacción serializable. Usuarios, accesos, auditoría y consecutivos se conservaron. Respaldo privado previo: `.local/backups/antes-reemplazo-humo-20261001T025209367Z.dump`, 113.957 bytes, leído completamente con pg_restore; recuperable, sin restauración automática sobre datos nuevos. La semilla de una instalación nueva continúa sin ventas demo.
- Lectura de comprobación local: 32 productos, 8 clientes, 8 pedidos, ventas $112.600 y saldo pendiente $81.700; stock físico y reservado coincide con las líneas entregadas/abiertas. No se crearon ventas de prueba adicionales en el negocio. Los resultados anteriores de 4 productos/4 clientes/3 pedidos son históricos, previos a esta sustitución.
- Imágenes finales aplicadas mediante `infra/desplegar.ps1`: seis servicios saludables en el proyecto principal, migración terminada con código 0 y nuevo respaldo de 124.373 bytes en `.local/backups/antes-despliegue-20261001T031726012Z.dump`. Frontend/API disponibles por Nginx en localhost:8080. Repetición final de `verificar` y de los 12 paneles aprobada. QA retirado con `down` sin `-v`: no quedan contenedores temporales y se conservan sus volúmenes; proyectos ajenos no se tocaron.

### Ampliación de sincronización, carga y entrega en V3

Guía `AGENTS.md` actualizada conservando las reglas del proyecto. Sincronización autenticada por revisión transaccional cada dos segundos en pestañas visibles; reconexión e indicador de lectura anterior. Auditoría usa consultas activas para reflejar operaciones de otros usuarios. Los nombres compartidos se agregaron al contrato y a `EQUIVALENCIA_VARIABLES.txt`.

Workflow de verificación y despliegue desde la rama principal preparado para Linux/Windows, desactivado hasta configurar runner, ruta y environment. Instrucciones en [despliegue continuo](DESPLIEGUE_CONTINUO.md). No se modificó la rama principal remota ni se activó un servidor remoto. Escaneo de archivos versionados y coincidencias con secretos locales sin revelar valores; respaldos/configuración personal excluidos de Git y del contexto Docker.

| Área | Resultado |
| --- | --- |
| Frontend/API | Modo API predeterminado, cookies y renovación de sesión, lecturas paginadas, formularios que esperan confirmación, actualización periódica y protección contra respuestas obsoletas. Modo local explícito conservado. |
| Administración | Roles y estado activo, protección del último administrador y de la propia cuenta, revocación de sesiones, pantalla de auditoría, accesos sensibles restringidos en servidor. |
| Pedidos/cartera | Transiciones compartidas; reservas, cancelación, reversión de aplicaciones y caja consistentes; bloqueo transaccional contra sobreventa y doble cobro; distribución FIFO conservada. |
| Inventario/cierre | Cantidades enteras y piso de stock reservado, conteo parcial y ajuste idempotente, cierre con acciones validadas y totales recalculados después de cancelar/trasladar. |
| Métricas/fechas | Cancelados excluidos, rentabilidad con costo vendido y gastos, fecha operativa diferenciada de creación UTC. |
| Archivos | MinIO privado, descarga autenticada, firmas de formatos y límite de 5 MB. |
| Móvil | Viewport dinámico, scroll interno, objetivos táctiles, foco visible, formularios asíncronos y carga diferida de módulos administrativos. Se conservó el lenguaje visual existente. |

## Evidencia ejecutada

### Última ampliación: system, caché y correcciones de acceso

- Semilla idempotente de **system**, con clave del entorno (SYSTEM_PASSWORD o BOOTSTRAP_PASSWORD inicialmente), autenticación normal, todos los permisos y nombre reservado. API y PostgreSQL bloquean desactivación, cambio de rol, eliminación y conversión. Repetir la semilla conserva una sola cuenta y su contraseña; crea administradores del negocio por el endpoint existente, sin bypass de autenticación.
- React Query incorporado: lecturas y snapshots en RAM, claves separadas por sesión/ruta/página, deduplicación, frescura de 30 segundos, caducidad de vistas inactivas de cinco minutos, invalidación tras escrituras y limpieza/cancelación al cerrar o expirar sesión. Se conserva la fachada de operaciones y el modo local.
- El tablero ahora consume agregados SQL y series de máximo 2001 días, con tops históricos sin descargar pedidos ni generar series desde 1900. Se conservaron métricas, gráficos y diseño; se difirieron módulos administrativos para reducir la entrada compilada a aproximadamente 353 kB, sin silenciar el aviso de tamaño.
- Redis real, interno, 128 MB/0,5 CPU y 64 MB de datos con allkeys-lru. TTL de cinco minutos y claves versionadas por una revisión PostgreSQL actualizada dentro de la transacción. Los cálculos usan RepeatableRead; si Redis falla, consultan BD. Se observaron claves reales y hits de Redis, no se dedujo el uso de caché por una medición de tiempo.
- **17 casos integrales aprobados** a través de Nginx QA (8180): se comprueba $100 → hit → POST de $50 → $150, cancelación, pago, gasto, rechazo de escritura sin cambio de versión, límites de fechas y protección de system. Pasaron además la prueba de React Query y la prueba de Redis detenido/reconectado con una escritura QA. Protecciones de BD verificadas con transacciones revertidas. Ninguna prueba crea pedidos en producción.
- Login corregido con scroll interno y centrado que no recorta la parte superior. Navegador: scroll real a 320×320 y 1440×320, formulario accesible a 390×844/1440×900; tablero y system protegido comprobados en móvil/escritorio, incluido gráfico de cinco años. No equivale a validar todos los celulares físicos.
- Despliegue principal terminado con **seis servicios saludables** en capturador_pedidos_20. Respaldo previo `.local/backups/antes-despliegue-20260930T145454617Z.dump`: 90.853 bytes, formato custom comprobado con pg_restore. Clientes 4, productos 4, pedidos 3 y pagos 1 conservados; usuarios 1 → 2 por system. Login de system, permisos, salud y hit del tablero comprobados en la instalación principal. QA detenido sin borrar volúmenes.
- No se activó Cloudflare, ni se desplegó en el VPS. No hay una prueba de carga de 100.000 pedidos; otras pantallas heredadas aún sincronizan snapshots completos. Entre dispositivos puede mostrarse la última lectura del frontend hasta su actualización periódica; las pruebas no garantizan ausencia absoluta de datos obsoletos.

### Ampliación: despliegue local con Nginx y paginación remota

- Frontend compilado en imagen propia, Nginx sin privilegios/solo lectura, 128 MB y 0,5 CPU. SPA, API y archivos comparten origen. `nginx -t` aprobado; `/`, rutas SPA y salud responden 200, API sin sesión 401 y scripts inexistentes 404.
- `infra/desplegar.ps1` ejecutado completo: construcción, respaldo binario legible de 89.761 bytes, migraciones aditivas y cinco servicios saludables. Conteos del negocio antes/después: usuarios 1, clientes 4, productos 4, pedidos 3, pagos 1. No se restauró ni borró información. El script Linux pasó comprobación de sintaxis con `sh -n`; no se ejecutó en un VPS real.
- La repetición final de `npm run verificar` pasó después de corregir la pareja `module: Node16` / `moduleResolution: node16`; el backend sigue emitiendo CommonJS. Permanecen advertencias de lint.
- Navegador QA: sesión administrativa, pedidos página 1/2, cambio de página, búsqueda con reinicio de página y detalle informativo. Revisión visual a 390×844 y 1440×900 conservando el diseño. No equivale a una prueba en un celular físico.
- Las páginas de seguimiento no solicitan el historial completo desde el contexto global; tampoco lo solicitan módulos administrativos que no lo consumen. La exportación de seguimiento en modo API está etiquetada **Exportar página** para no presentar un resultado parcial como el historial completo. Los comprobantes de la página conservan su referencia autenticada.

Pendiente de escalabilidad general: migrar los snapshots de Inicio/Ventas/Créditos/Cierre y sus agregaciones del frontend a consultas específicas del servidor, acotar catálogos/adjuntos globales y proporcionar exportación completa en streaming. No se realizó una prueba de carga de 100.000 pedidos o de usuarios concurrentes; aumentar RAM/CPU no elimina por sí solo estas tareas.

- `npm.cmd run prueba:integracion`: **14 casos aprobados** en `ambie-integracion`, API localhost:3100, PostgreSQL y MinIO independientes. Incluye permisos, sesión, venta ocasional, validación, reserva, FIFO/cancelación, dos carreras concurrentes, conteo, adjuntos, compras/precios/gastos, tablero/auditoría y cierre de pedido pagado con rechazo de duplicados. El cierre de esta ejecución se creó sobre la fecha local del 30/09. En repeticiones posteriores un cierre existente se conserva y esa parte solo comprueba el rechazo de duplicados. Las comprobaciones de caja y cierres recorren la paginación completa y filtran por fecha contable, no por creación UTC.
- Script de humo existente: **20 pasos aprobados** nuevamente sobre localhost:3100, sin opción de limpieza. Conservó los cuatro recursos QA creados.
- Respaldo previo: `.local/backups/ambie-antes-integracion-20260930.dump`, 89.245 bytes, formato PostgreSQL custom y lectura completa con `pg_restore --file=/dev/null`. Excluido de Git y del contexto Docker. No equivale a un ensayo de restauración en otra base.

## Alcance y condiciones de producción

1. La revisión histórica de `npm audit --omit=dev` registró **siete alertas: cuatro moderadas y tres altas**, en las cadenas Prisma/config/deepmerge-ts y MinIO/stream-json/query-string/decode-uri-component. Fastify quedó en 5.12.5; no se aplicaron downgrades/actualizaciones incompatibles forzadas a Prisma/MinIO. Ese resultado histórico no sustituye una auditoría actual de dependencias.
2. Cada instalación pertenece a una sola empresa, con su propio servidor local, nube o VPS, base de datos y archivos. No se requiere aislamiento multiempresa ni se añade esa arquitectura. La búsqueda del código no encontró implementaciones de tenants que retirar; los roles administrador/vendedor son internos de esa empresa y se conservan. Antes de publicar en Internet siguen siendo necesarios HTTPS/cookies seguras, copias de respaldo con restauración ensayada, monitorización y revisión del almacenamiento MinIO archivado.
3. Escalabilidad vertical: ampliar recursos del servidor para más usuarios, sin añadir multitenencia. El seguimiento administrativo de pedidos usa páginas y filtros remotos, conteo en PostgreSQL, orden estable e índices aditivos. Los saldos de clientes y aplicaciones se agregan en BD. Otras pantallas heredadas todavía sincronizan snapshots completos: esta mejora no constituye una prueba de carga de 100.000 pedidos ni optimiza todos los módulos. La auditoría genérica posterior a escrituras es best-effort; los cambios de acceso sí tienen registro transaccional.

Comandos y seguridad del despliegue: [infra/README.md](../../infra/README.md). La instalación admite servidores con Docker, sin depender de un proveedor de infraestructura.

La pantalla final y el detalle muestran todas las líneas persistidas con cantidades, precios unitarios y subtotales históricos. También funciona para ventas ocasionales. La lectura individual recupera pedidos ausentes del snapshot y distingue fallo de lectura de fallo de guardado.

Instalación local actualizada: seis servicios saludables, migración terminada con código 0; cantidades de pedidos/clientes/productos antes y después iguales (9/8/32). Respaldo privado previo de 126.383 bytes, comprobado mediante lectura completa con pg_restore, no restauración. QA retirado sin eliminar volúmenes. Escaneo de 279 archivos sin patrones sensibles detectados; no sustituye revisión del historial.

Aplicación local recompilada y reiniciada en `http://localhost:8080`: seis servicios saludables, migración con código 0; raíz, `/salud` y `/api/v1/salud` responden 200. Se comprobó que el archivo servido incluye la nueva revisión directa. Respaldo privado previo `.local/backups/antes-despliegue-20261009T170002796Z.dump`, 146.152 bytes, leído completamente con `pg_restore --file=/dev/null`; no equivale a restauración ensayada. Contenedores QA retirados sin eliminar sus volúmenes. Revisión final de tipos/compilación/lint aprobada y escaneo de 301 archivos sin patrones sensibles detectados.
