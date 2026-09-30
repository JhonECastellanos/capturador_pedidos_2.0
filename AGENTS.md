# Guía para agentes — AMBIÉ

## Alcance y fuentes de verdad

Monorepo para **una empresa por instalación**, en servidor local, nube o VPS. No introducir tenants ni multiempresa. La API ya existe: NestJS/Fastify, Prisma y PostgreSQL en `Backend/`, prefijo `/api/v1`. La SPA `Frontend/` usa API por defecto; `VITE_DATOS_ORIGEN=local` conserva compatibilidad local, no autenticación de producción.

Leer `README.md` antes de cambiar flujos; el catálogo detallado de entidades vive ahí. Consultar `EQUIVALENCIA_VARIABLES.txt`, `docs/AUDITORIA_PROFESIONAL.md`, `infra/README.md` y `docs/DESPLIEGUE_CONTINUO.md`. Preservar diseño y trabajo simultáneo del usuario; revisar Git antes de editar. No repetir funcionalidades ya implementadas. Distinguir resultados históricos de pruebas actuales.

## Comandos desde la raíz

Node.js 24 o superior. En PowerShell usar `npm.cmd`/`npx.cmd`.

- `npm run verificar`: compila contrato, comprueba enums, compila API, revisa tipos de API/CLI/scripts, compila y revisa frontend.
- `contrato:build`, `contrato:verificar`, `front:dev`, `front:build`, `front:lint`, `api:dev`, `api:build`, `api:verificar`: comandos puntuales.
- `prueba:cache`: caché frontend, invalidación y separación de sesiones.
- `prueba:asistente`: reglas/contrato del asistente sin proveedores remotos.
- `prueba:integracion`: permisos, system, negocio y caché; escribe solo en QA.
- `prueba:voz`: permisos, tickets WebSocket, audio sintético y Vosk en QA.
- `prueba:carga`: pedidos concurrentes, persistencia, reservas y totales en QA.
- `seguridad:repositorio`: rutas privadas y patrones sensibles en archivos versionados.
- `api:cli`: CLI existente. `prueba:humo` escribe datos: usar URL QA explícita, pues el valor predeterminado puede apuntar al negocio.

Después de instalar dependencias o modificar Prisma: `npx prisma generate --schema Backend/prisma/schema.prisma`. No usar cambios de configuración para disimular tipos de un cliente Prisma desactualizado.

## Contrato y equivalencia

`Compartido/` es el paquete `@ambie/contrato`, importado por frontend, API y CLI. DTO, enums y esquemas compartidos viven ahí. Tipos de presentación en `Frontend/src/types/index.ts`, reutilizando el contrato.

Un enum nuevo/modificado va primero en `Backend/prisma/schema.prisma` y luego en `Compartido/src/enums.ts`. `contrato:verificar` compara los `@map(...)` con el contrato compilado (actualmente 14 enums). Actualizar `EQUIVALENCIA_VARIABLES.txt` al agregar/renombrar campos, variables de entorno y revisiones entre capas.

## Backend y autenticación

Un módulo por área con controlador, servicio y módulo. Lógica de negocio en servicios; controladores validan con Zod y devuelven `{ data }` o envelope paginado con `meta`. Usar `ErrorDominio` y `FiltroErrores`. Agregaciones con SQL parametrizado/`Prisma.sql`, sin traer todo el historial a JavaScript.

`AuthGuard` exige cookie `ambie_access` o Bearer salvo `@Public()`. Verifica firma y consulta sesión/usuario para aplicar revocaciones, actividad y rol actual. Operaciones administrativas llevan `@Roles(RolUsuario.ADMINISTRADOR)`: usuarios, cierres, egresos, ajustes, precios, compras y gastos. Ocultar controles no sustituye autorización. Auditoría guarda metadatos, nunca cuerpos, contraseñas ni tokens.

### Cuenta system

`Backend/prisma/system.ts` y la semilla crean una cuenta técnica única `system`, `esSistema=true`, activa, administradora y con todos los permisos. Desde Usuarios crea el primer administrador del negocio. Mantener autenticación normal, sin bypass.

Creación inicial: `SYSTEM_PASSWORD`, o `BOOTSTRAP_PASSWORD` si el primero está vacío; correo `SYSTEM_EMAIL` (por defecto `system@ambie.local`). No hay contraseña universal. Estas variables pertenecen a migración/semilla, nunca al frontend. Repetir semilla no cambia credenciales existentes; editar .env no rota una contraseña guardada.

Proteger cuenta/nombre en frontend, API y PostgreSQL: no desactivar, degradar, eliminar ni convertir otra cuenta por coincidencia de correo. El bloqueo de creación devuelve una constante desde `pg_advisory_xact_lock`: Prisma no deserializa su retorno void directamente.

## Frontend y UX

React 19, TypeScript, Vite, Tailwind 4 y React Router 7. `main.tsx` contiene raíz, router y QueryClientProvider. `App.tsx` compone AuthProvider por fuera de OperacionesProvider. Hooks requieren sus proveedores. Entrada explícita `/`, administrador `/admin`, vendedor `/vendedor`; `/administracion` redirige.

Preservar pantalla → contexto/fachada (`OperacionesContext.tsx`) → dominio (`dominio/servicios.ts`) → repositorios/API. `OperacionesApiContext.tsx` implementa fachada remota. Reutilizar `modules/ventas/screens/RutasVentas.tsx` entre roles.

Reutilizar BuscadorInput, SegmentoControl, ListaVacia, TarjetaClicable, SelectorOpciones, TarjetaAccion, MetricaFiltro, PantallaCompletaAdmin y utilidades `utils/fechas.ts`, `utils/estados.ts`. Conservar tokens de `index.css`, interfaz mobile-first, áreas táctiles, pies fijos y scroll interno. Login debe desplazarse con poca altura: conservar overflow-y-auto, contenido sin encogimiento y márgenes automáticos; evitar centrado que recorte formularios.

Hooks separados de proveedores para Fast Refresh, utilidades fuera de módulos de componentes. Nombres intermedios con guion (`auth-context.ts`), porque Windows no distingue mayúsculas. Revisar composición/HMR ante errores de hooks fuera de Provider.

Esperar confirmación de escritura antes de cerrar formularios. Si falla la lectura posterior, indicar que ya se guardó, para evitar duplicados. Conservar borradores y filtros al recibir actualizaciones remotas.

## Persistencia e invariantes

PostgreSQL es la fuente de verdad en API. Imágenes/comprobantes en MinIO privado, con autenticación y validación de formato/tamaño. Semilla crea accesos y catálogos, sin datos comerciales demo.

- Pedidos, stock, reservas, saldos, abonos y caja deben cambiar coherentemente dentro de transacciones; revisar bloqueos y concurrencia.
- Cancelar un pedido abierto revierte reservas, pagos y caja. API no permite cancelar entregados ni reactivar cancelados; reactivación histórica solo existe en modo local.
- Cancelados quedan fuera de ventas/cartera y no admiten cobros. Tablero debe cuadrar con caja.
- Abonos generales aplican FIFO; cobro directo se aplica al pedido elegido.
- Venta abierta no crea cliente y admite efectivo/billetera; crédito exige cliente también en API/BD.
- Conteos parciales solo ajustan líneas digitadas. Consecutivos centralizados en `Backend/src/common/consecutivos.ts`, dentro de la transacción.
- Almacenar fechas ISO y usar calendario local America/Bogota para filtros/cierres. No duplicar saldos derivados.

Modo local: claves `ambie:v2:`, ignorar v1; no borrar ni importar datos automáticamente. Credenciales locales son demo. Imágenes/comprobantes ocupan cuota de localStorage. `limpiarTodo()` borra v2 y legacy: no usar en pruebas del negocio.

## Caché y sincronización

TanStack Query usa RAM: staleTime 30 s, gcTime 5 min, claves por sesión/ruta/página/filtros. Login/logout/expiración cancelan y limpian consultas; escrituras invalidan lecturas. No persistir respuestas privadas en localStorage. Consumir AbortSignal. Dentro de un queryFn usar `respuestaRed`, evitando esperar otra consulta con la misma clave.

Tablero consume agregados SQL acotados, no historial de pedidos. Otras pantallas conservan snapshots y `listaApi`: optimizar su volumen antes de afirmar soporte de 100.000 pedidos. Caché no sustituye paginación.

Backend usa @nestjs/cache-manager compatible con CommonJS, Keyv y Redis interno, TTL 5 min. Fallos de Redis vuelven a PostgreSQL y no impiden escrituras. Triggers diferidos actualizan `versionesCache.dashboard` una vez por transacción confirmada; rollback no invalida. Cálculos RepeatableRead se guardan bajo la revisión de esa misma instantánea. No usar FLUSHALL. Si cambian fórmulas/DTO, incrementar prefijo de formato en lectura y escritura de DashboardService.

`Compartido/src/sincronizacion.ts` define RevisionDatosDTO e intervalo. `/sincronizacion/revision` está autenticado, sin caché HTTP, y devuelve una revisión opaca. Triggers de sincronización cubren tablas operativas; agregar cobertura cuando aparezcan nuevas tablas que afecten pantallas.

`useSincronizacion` consulta cada dos segundos con sesión/pestaña visible, sin superponer solicitudes; cambios confirmados disparan `ambie:datos-actualizados`. Reconexión/visibilidad reanudan lecturas. Es actualización casi en tiempo real, intervalo más latencia, no entrega instantánea garantizada. Mantener indicador de desconexión, botón Actualizar y refresco periódico de respaldo.

## TypeScript

Backend: rootDir ./src, module/moduleResolution Node16, sin baseUrl. CLI redefine rootDir ., noEmit y sin incremental. No ocultar TypeScript 6 con ignoreDeprecations ni convertir todo a ESM para resolver una dependencia.

`tsconfig.build.json` guarda tsBuildInfoFile dentro de dist: Nest elimina dist y debe eliminar también metadata incremental; fuera de dist puede parecer que compiló sin emitir archivos. Ignorar *.tsbuildinfo en Git/Docker. Diagnósticos antiguos de VS Code: reiniciar TS Server, comprobar carpeta/compiler.

## Docker y despliegue

Proyecto único del negocio `capturador_pedidos_20`: frontend/Nginx, API, PostgreSQL, Redis, MinIO y una voz local, en contenedores separados dentro de la agrupación. migrate termina con código 0. CLI y Cloudflare optativos. No crear voz independiente ni mezclar procesos en un contenedor único.

Nginx sirve SPA y proxy API/WebSocket. Local: http://localhost:8080, /salud y /api/v1/salud. API directa en 127.0.0.1:3000; BD, Redis, archivos y voz internos. Celular: http://IP_DEL_PC:8080 en red privada; micrófono normalmente necesita HTTPS fuera de localhost.

Límites mediante *_MEMORY/*_CPUS: frontend 128 MB/0,5 CPU; API/PostgreSQL/voz 512 MB/1 CPU; Redis 128 MB/0,5 CPU y 64 MB de datos efímeros; MinIO 384 MB/0,5 CPU. En este PC Docker se trasladó a D: y WSL tiene límites, documentados en `infra/windows/README.md`; no imponer esa ruta Windows al VPS.

`infra/desplegar.ps1` y .sh construyen, respaldan antes de migrar y esperan salud. Mantener docker.exe dentro de función PowerShell Docker para evitar recursión. Dumps binarios mediante docker cp en PowerShell, no redirección de texto. --actualizar/-Actualizar exige Git limpio y fast-forward.

Cloudflare preparado sin activar: token privado .local/cloudflare-token, origen interno http://frontend:8080, dominio/orígenes HTTPS y cookies seguras. Mantener confianza restringida en cabeceras y red del túnel. No afirmar pruebas de VPS/DNS/HTTPS sin realizarlas.

## CLI y voz

`Backend/cli/` corre con tsx, fuera de nest build; api:verificar revisa tsconfig.cli.json. Proveedores implementan ProveedorIA y se registran sin duplicar el bucle común. Herramientas en herramientas.ts con Zod; escrituras requieren confirmación salvo --si explícito. Generador descubre endpoints desde controladores, sin lista paralela. Fallos de humo-api.ts pueden revelar problemas reales de contrato.

CLI preparado sin llamadas externas; --help y rutas no llaman modelos. No activar proveedor ni consumir claves por iniciativa propia. Configuración/sesión persistente son privadas.

Vosk transcribe español localmente; audio no se guarda. Tickets de un solo uso para /asistente/voz. Asistente respeta roles, rellena pantallas existentes y confirmar ejecuta su guardado normal; cancelar descarta borrador. Separar transcripción, interpretación, confirmación y escritura. Audio sintético/silencio valida transporte, no reconocimiento de frases ni micrófono físico.

## Pruebas y seguridad operativa

Ejecutar verificar tras cambios de código. UI: 390×844 y escritorio 1440 px; login también 320×320/poca altura. Distinguir navegador real, mocks, HTTP y compilación.

QA: `docker compose -p ambie-integracion -f docker-compose.yml -f docker-compose.pruebas.yml --profile voz up -d --wait`, con imágenes actualizadas. Frontend 8180, API 3100, BD/volúmenes separados. BASE_PRUEBAS_API solo admite localhost:3100/api/v1 o localhost:8180/api/v1 en scripts protegidos. Integración crea usuarios QA usados por voz/carga.

En Windows, `node --env-file=.env Backend/scripts/probar-cache-caida.cjs` detiene solo Redis QA y lo restaura en finally. Conservar registros QA. Al terminar retirar contenedores temporales con down **sin -v**, liberando RAM.

Carga: registrar cantidad, concurrencia, errores, p95 y comprobar persistencia/stock/totales; no confundir solicitudes recibidas con pedidos confirmados ni extrapolar capacidad máxima. Pruebas concretas no garantizan ausencia absoluta de fallos.

## Git y producción

Rama solicitada: V3. Revisar diff, archivos nuevos y secretos antes de commit; incluir código, configuraciones de ejemplo y documentación de desarrollo. Mensaje descriptivo sin atribuciones automáticas. No hacer push ni cambiar rama principal remota salvo petición.

No versionar .env, tokens, claves, dumps, volúmenes, sesiones CLI, .local, configuración personal ni datos reales. Inspeccionar nombres/presencia de secretos, no sus valores. .env.example contiene placeholders. Escaneo de patrones complementa revisión; no sanea historial anterior.

Workflow detecta rama principal de GitHub. Despliegue desactivado hasta configurar DEPLOY_ENABLED, AMBIE_DEPLOY_PATH, environment produccion y runner dedicado ambie-produccion. No ejecutar PRs en el servidor. Serializar despliegues, respaldar y comprobar salud. Construir/reiniciar tarda; recargar pestañas para nueva compilación, sin perder formularios automáticamente.

No ejecutar docker:limpiar, down -v, podas de volúmenes ni restauraciones sobre negocio sin autorización específica. Preservar respaldos, cambios locales y proyectos ajenos. Reevaluar pendientes de auditoría: dependencias, snapshots grandes, carga mayor, restauración y VPS/HTTPS real.

## Activos

- [Imágenes de productos](Frontend/public/assets/productos/README.md)
- [Comprobantes](Frontend/public/assets/comprobantes/README.md)
