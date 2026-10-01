# Oportunidades de mejora — AMBIÉ · Capturador de pedidos

**Fecha:** 30 de septiembre de 2026
**Alcance:** revisión completa del proyecto (frontend, backend, API, base de datos, Docker/infraestructura y modelo de negocio).
**Objetivo:** escalar el producto a algo mucho más robusto, manteniendo su naturaleza uniempresa (una instalación = una empresa, sin tenants).

## Cómo leer este documento

Cada oportunidad tiene el mismo formato:

- **Por qué:** el problema o riesgo actual, con evidencia (archivo y línea aproximada).
- **Solución:** qué hacer, en concreto.
- **Integración sin romper:** cómo aplicarlo sin romper el sistema actual (convenciones del proyecto, orden de cambios, dónde probar).

## Regla de oro para cualquier cambio (no negociable)

1. Si toca dominio: primero `Backend/prisma/schema.prisma` → luego `Compartido/src/enums.ts` → `npm run contrato:verificar` → actualizar `EQUIVALENCIA_VARIABLES.txt`.
2. Toda escritura de negocio (pedidos, pagos, caja, stock, cierres) va en transacción con los bloqueos existentes (`pg_advisory_xact_lock`, `FOR UPDATE`, consecutivos en `Backend/src/common/consecutivos.ts`).
3. Probar en QA (`ambie-integracion`, puertos 8180/3100), **nunca** contra la base del negocio.
4. Cerrar con `npm run verificar` desde la raíz.

## Resumen ejecutivo — por dónde empezar

| Orden | Qué | Impacto | Esfuerzo |
|---|---|---|---|
| 1 | Quick wins de seguridad backend (CORS estricto, validación de env al arranque, helmet, request-id) | Alto | Bajo |
| 2 | Quick wins Docker (pin `cloudflared`, redis `healthy`, healthcheck API en Compose, rotación de logs, gzip/CSP en Nginx) | Medio-alto | Bajo |
| 3 | Índices faltantes en BD + `connection_limit` + `shared_buffers` | Alto | Bajo |
| 4 | Idempotencia en POST críticos (anti doble-clic/duplicados) | Alto | Medio |
| 5 | Paginación servidor en `productos`/`usuarios`/`conteos` + frontend `usePaginaApi` | Alto | Medio |
| 6 | Error Boundaries + fin del `disabled` global de UI + Sentry | Alto | Medio |
| 7 | Tests automáticos (vitest backend+frontend, restore ensayado en QA) | Alto | Medio |
| 8 | Impresión de ticket + exportación completa (xlsx/pdf) | Alto (negocio) | Medio |
| 9 | IVA/descuentos/listas de precio + devoluciones + CxP proveedores | Alto (negocio) | Alto |
| 10 | DIAN electrónica (módulo lateral), PWA offline, respaldos programados | Estratégico | Alto |

---

# 1. Frontend

## FE-01 — Contexto global gigante = re-render en cascada · Severidad: ALTA

**Por qué:** `src/context/operaciones-context.ts:27-71` expone 13 arrays (`clientes, pedidos, inventario, movimientosCaja, usuarios, proveedores, recepciones, gastos, conteos, ajustes, cambiosPrecio, abonos, cierres`) + ~20 acciones en un solo `createContext`. Hay ~36 usos de `useOperaciones()` en 17 pantallas; p. ej. `modules/caja/screens/CajaAdmin.tsx:19` solo necesita `movimientosCaja` pero se re-renderiza si cambia `inventario` o `conteos`. Con 10k pedidos la UI se vuelve lenta y bloquea agregar módulos.

**Solución:** partir por dominio (`CatalogoContext`, `VentasContext`, `CajaContext`) o mover cada lista a su `useQuery` por recurso y dejar el contexto solo para acciones puntuales (`clienteActivoId`). Usar selectores para suscribirse a fragmentos.

**Integración sin romper:** hacerlo pantalla por pantalla, empezando por la más pesada (`InventarioAdmin`). Mantener la interfaz `useOperaciones()` como fachada temporal que delegue a los nuevos contextos/hooks, con los mismos nombres de campos. Probar con `front:dev` + QA, comparar totales del tablero antes/después. No cambiar `OperacionesApiContext` y el nuevo sistema a la vez: primero partir el contexto local, luego migrar la fachada remota (ver FE-03).

## FE-02 — Archivos monstruo multi-vista · Severidad: ALTA

**Por qué:** `modules/inventario/screens/InventarioAdmin.tsx` (~844 líneas), `modules/compras/screens/ComprasAdmin.tsx` (~748), `modules/caja/screens/CierreAdmin.tsx` (~666), `context/OperacionesContext.tsx` (~586), `dominio/servicios.ts` (~500). Cada uno mezcla menú + detalle + formularios + estados (p. ej. `VistaInv="menu|general|conteo|descuadres|ajustes"` + ~20 `useState`). Imposible de revisar, testear o cargar con `lazy` fino; un bug tumba varios procesos.

**Solución:** una ruta por vista (`/admin/inventario/conteos/:id`), un hook por proceso (`useConteoEnCurso`), componentes separados (`VistaGeneral`, `Conteo`, `Ajustes`).

**Integración sin romper:** extracción mecánica sin cambiar lógica: mover bloques a componentes nuevos importados por el archivo original, verificar que compila y se comporta igual, y solo después crear las sub-rutas. Cada extracción se valida con `front:lint` + recorrido manual a 390×844 y 1440 px (convención del proyecto).

## FE-03 — TanStack Query infrautilizado + doble caché manual · Severidad: ALTA

**Por qué:** `src/data/query.ts:1-6` solo crea el `QueryClient`; `OperacionesApiContext.cargar()` (`src/context/OperacionesApiContext.tsx:30-76`) ignora `useQuery` y hace `Promise.all` de ~14 recursos + `setInterval` + eventos manuales. Las mutaciones invalidan `["api"]` completo (`src/data/api.ts:41`) y recargan todo. Se pierde deduplicación, `optimistic update`, `retry` y `stale-while-revalidate`. Además `ocupado.current` en `ejecutar()` serializa escrituras y devuelve `null` si hay otra en curso: se pierden clics.

**Solución:** migrar a `useQuery(["clientes"], …)` + `useMutation` por recurso, con invalidación granular (`["pedidos", filtro]`), updates optimistas y eliminar `cargar()` manual. `listaApi` queda solo para trabajos, no para la UI.

**Integración sin romper:** migrar un recurso por vez (empezar por `clientes`, que es simple), manteniendo `cargar()` para el resto. Cada recurso migrado debe pasar el humo manual (crear/editar/ver en admin y vendedor). Solo eliminar `cargar()` cuando el último recurso migre.

## FE-04 — Carga inicial masiva y joins `O(n·m)` en memoria · Severidad: ALTA

**Por qué:** `OperacionesApiContext.tsx:38-57` trae ~14 recursos completos con `listaApi` (bucle `page=1..n`), y luego hace `archivos.find(…)` por cada pedido, `inventario.find(…)` por cada línea, `pedidos.find(…)` por cada abono. `/vendedor` y `/admin/ventas` traen todo el historial. Con 20k pedidos el primer pintado tarda decenas de segundos con picos de RAM.

**Solución:** usar el `usePaginaApi` que ya existe en ventas/créditos/caja, pedir al backend `GET /pedidos?clienteId=&page=` e `include=comprobanteId`, y mover los joins a SQL.

**Integración sin romper:** no quitar `listaApi` de golpe: agregar paginación servidor pantalla por pantalla (requiere BE-11) y dejar `listaApi` como fallback para pantallas pequeñas (catálogos). Medir con QA cargada (`prueba:carga`) antes/después.

## FE-05 — Sin Error Boundaries · Severidad: ALTA

**Por qué:** búsqueda de `ErrorBoundary|componentDidCatch` = 0 resultados. Solo hay un `Suspense` global en `src/App.tsx:44,84`. Una excepción en render (p. ej. en `InventarioAdmin`) deja pantalla blanca sin recuperación ni reporte.

**Solución:** instalar `react-error-boundary` y envolver los layouts (`/admin`, `/vendedor`) con fallback que ofrezca Reintentar + reset de queries + reporte a Sentry (ver FE-16). Preservar el borrador antes del reset.

**Integración sin romper:** es puramente aditivo: envolver sin tocar pantallas. Probar provocando un error en QA y confirmar que el resto de la app sigue viva.

## FE-06 — La escritura bloquea toda la UI · Severidad: ALTA

**Por qué:** `OperacionesApiContext.tsx:134-139` envuelve todo en `<fieldset disabled={guardando}>` + banner `Guardando…`, y `ocupado` descarta la segunda escritura. La vendedora no puede seguir vendiendo mientras se guarda un abono lento (timeout de 20 s en `api.ts:16`). El doble-clic se pierde en silencio.

**Solución:** mutaciones con `isPending` por botón, toast con reintento y cola offline persistente. Nunca `disabled` global.

**Integración sin romper:** cambiar `accion()` para que devuelva la promesa y el estado por operación, manteniendo el banner solo como indicador no bloqueante durante una versión de transición. Requiere idempotencia en backend (API-01) para que el reintento sea seguro.

## FE-07 — Sin PWA / offline real · Severidad: ALTA

**Por qué:** en `public/` no hay `manifest.webmanifest` ni service worker; Nginx marca JS/CSS/HTML como `no-cache`. `useSincronizacion` (`src/data/useSincronizacion.ts:1-42`) consulta cada 2 s pero los datos viven en RAM: recargar sin red = login imposible. Una caída de internet en feria/mercado detiene las ventas.

**Solución:** `vite-plugin-pwa` (AppShell + caché runtime de GET), cola de mutaciones en IndexedDB con Background Sync, banner offline + botón `Actualizar` existente como reintento manual. Ver también NEG-15 (fases read-only → outbox idempotente).

**Integración sin romper:** fase 1 solo lectura (caché de shell y GET), que no cambia escrituras. Fase 2 de escritura solo con claves de idempotencia (API-01) para no duplicar pedidos al reconectar. Probar en QA con red cortada, nunca en el negocio.

## FE-08 — Textos quemados, sin i18n · Severidad: MEDIA-ALTA

**Por qué:** cientos de literales (`"Crear pedido"`, `"Exportar Excel"`, …) en `FlujoVenta.tsx:79-130` y otras pantallas; fechas con `toLocaleString("es-CO")` ad-hoc y moneda en `formatoMoneda` propio. Cambiar un texto, ajustar formato legal (factura) o agregar otro idioma exige tocar ~30 ficheros.

**Solución:** diccionario `es.json` + hook `useT()`, y centralizar `formatoMoneda/fechaOperativa` con `Intl` y zona horaria única `America/Bogota`. No es multi-tenant, solo idioma/formato.

**Integración sin romper:** introducir el diccionario y migrar pantallas una por una, con español idéntico al actual (cambio invisible). `EQUIVALENCIA_VARIABLES.txt` no se toca porque no cambian campos.

## FE-09 — Accesibilidad parcial + `maximum-scale=1.0` bloquea zoom · Severidad: MEDIA-ALTA

**Por qué:** hay buen trabajo (`aria-label/pressed`, `role=status/alert/dialog`, `prefers-reduced-motion`), pero `index.html:6` tiene `maximum-scale=1.0` (falla WCAG 1.4.4, impide zoom), los modales (`ConfirmarAccion`, `GuiaAyuda`) no tienen focus-trap ni retorno de foco, las gráficas son `aria-hidden` sin tabla alternativa, y no hay skip-link.

**Solución:** quitar `maximum-scale`, añadir `focus-trap-react`, tabla `visually-hidden` con los datos de cada gráfica, y auditar con `axe-core` + Lighthouse.

**Integración sin romper:** cambios visuales nulos o mínimos; validar a 390×844, 1440 px y 320×320/poca altura (login), según convención del proyecto.

## FE-10 — Bundle sin splitting + fuentes bloqueantes · Severidad: MEDIA-ALTA

**Por qué:** `vite.config.ts:1-18` no define `manualChunks`, sourcemap ni compresión; `FlujoVenta/InicioVentas/Abonos/PedidoDetalle` van eager. Google Fonts carga 3 familias sin `display=swap` ni subset. `Icons.tsx` (203 líneas de SVG) se importa entero. LCP alto en 4G y cada deploy invalida todo el JS.

**Solución:** `lazy(FlujoVenta)`, `manualChunks` (vendor: react/router/query; admin), `vite-plugin-compression`, `font-display:swap` con solo los pesos usados, y usar el sprite `icons.svg` que ya existe en `public/`.

**Integración sin romper:** solo configuración de build + `lazy` con el `Suspense` existente. Verificar que `front:build` genera chunks estables y que la app carga en QA tras el cambio.

## FE-11 — Listas sin virtualización ni memoización fina · Severidad: MEDIA

**Por qué:** `src/utils/paginacion.ts:7-19` pagina con `slice` en memoria tras `filter+sort` sobre colecciones completas; sin `react-window/@tanstack/virtual` ni `React.memo`. Funciona hasta ~5k filas y se degrada hacia 50-100k (scroll con jank, filtros lentos).

**Solución:** `useDeferredValue` en buscadores + `@tanstack/react-virtual` en inventario/pedidos/cartera + `memo(TarjetaProducto/FilaPedido)` con `key=id` estable.

**Integración sin romper:** aplicar primero en `InventarioAdmin` (la lista más larga típica) manteniendo la paginación actual como fallback. Depende de FE-04 para el caso de 100k pedidos reales (la virtualización no sustituye la paginación servidor).

## FE-12 — Cero testing frontend · Severidad: MEDIA-ALTA

**Por qué:** glob `*.test.*|*.spec.*|vitest|playwright` = 0. `dominio/servicios.ts` (puro, ~500 líneas, ideal para unit) y `FlujoVenta` (cálculos de tope de stock y totales) no tienen red: cualquier refactor de contexto/query puede romper saldos/stock sin que nadie lo note.

**Solución:** `vitest + React Testing Library + MSW`: unit a `construirPedido/distribuirAbonoEnPedidos/serieDe`, integración a `FlujoVenta→registrarPedido`, e2e `Playwright` (vendedor crea pedido → admin lo ve). Añadir `front:verificar` y engancharlo al CI.

**Integración sin romper:** los tests son aditivos; no tocan código productivo. Empezar por `dominio/servicios.ts`, que no depende de React.

## FE-13 — Seguridad frontend: secretos en `localStorage`, `alert`, falta CSP · Severidad: MEDIA-ALTA

**Por qué:** `src/types/index.ts:196` guarda `password` en texto plano "solo para demo local"; `AuthContext.tsx:32-57` compara contraseñas en cliente con match difuso; imágenes/comprobantes como `dataURL` en `localStorage` (cuota 5 MB, persistente ante XSS); `window.alert()` en `cerrarSesion`; Nginx tiene `nosniff/DENY/same-origin` pero sin `Content-Security-Policy/HSTS/Permissions-Policy`.

**Solución:** eliminar `password` del frontend (solo hash en API; modo local con PIN efímero o sin credenciales reales), migrar imágenes a IndexedDB/MinIO (`/archivos` ya existe), sustituir `alert` por toast, añadir `CSP nonce + HSTS + COOP/COEP` (primero en `Report-Only`, ver INF-08), sanitizar `archivo.name` antes de renderizar.

**Integración sin romper:** el modo API ya usa `httpOnly` (bien); el cambio afecta sobre todo al modo local demo. CSP en `Report-Only` primero en QA para no bloquear nada productivo.

## FE-14 — Validación solo HTML, sin schemas compartidos · Severidad: MEDIA

**Por qué:** formularios usan `required/minLength/min` nativo (`CajaAdmin.tsx:143-145`, `FormularioProducto.tsx:60-63`, `FormularioGasto.tsx:29-36`); precio/stock viajan como `string` y se convierten al vuelo. El backend valida con Zod pero el frontend no comparte el schema: doble fuente de verdad y `NaN` si pegan `$12.000`.

**Solución:** reutilizar el `zod` de `@ambie/contrato` con `react-hook-form` + resolver, inputs numéricos con `valueAsNumber` y errores por campo en español.

**Integración sin romper:** migrar formulario por formulario manteniendo los mismos mensajes visibles; el contrato ya existe, solo se importa. Validar que los errores del frontend coincidan con los del backend.

## FE-15 — Duplicación local vs remoto · Severidad: MEDIA

**Por qué:** cada pantalla ramifica `usaApi ? remoto : cálculoLocal` (`Resumen.tsx:52-103`, `PedidosAdmin.tsx:210-211`, `Auditoria.tsx:12-20`); la búsqueda `toLowerCase().includes(q)` está copiada en 4+ pantallas; `serieDe()` en `Resumen:67-80` duplica `utils/tablero.ts:serieTablero`. Doble mantenimiento y riesgo de divergencia de totales.

**Solución:** un solo hook `usePedidosFiltrados(q)` + `useSerieTramos`, y modo `local` como adapter que implementa la misma interfaz de `OperacionesApi` (o eliminarlo tras la migración, dejándolo solo como semilla demo).

**Integración sin romper:** extraer los hooks primero y hacer que ambas ramas los usen; comparar totales local vs API en QA antes de unificar.

## FE-16 — Observabilidad y versionado nulos · Severidad: BAJA-MEDIA

**Por qué:** `APP_VERSION="V3 · datos v2"` hardcodeado en `src/config.ts:1`; sin Sentry, sin web-vitals, sin reintento con `AbortSignal` (salvo refresh 401). Imposible diagnosticar un `No se pudo guardar` en producción.

**Solución:** inyectar `VITE_APP_VERSION=git sha` en build, `Sentry.init` + ErrorBoundary (FE-05), `web-vitals`, e `Idempotency-Key` en `POST /pedidos` (API-01).

**Integración sin romper:** todo aditivo; Sentry solo en producción con DSN por env, desactivado en local.

---

# 2. Backend

## BE-01 — `pedidos.service.ts` es un "dios del dominio" (544 líneas) · Severidad: MEDIA-ALTA

**Por qué:** `Backend/src/pedidos/pedidos.service.ts:544` concentra crear/listar/cambiarEstado/trasladar + pago + caja + factura. Difícil de testear y propenso a regresiones: cualquier cambio toca reserva, consumo, pagos y caja a la vez.

**Solución:** extraer `reservas.service.ts`, `facturacion.service.ts` y `caja-escrituras.service.ts`; dejar a `PedidosService` como orquestador transaccional fino.

**Integración sin romper:** extracción sin cambiar SQL ni orden de locks: mover métodos tal cual, mantener firmas, correr `prueba:humo` + `prueba:integracion` en QA. Recién después, agregar tests unitarios al código extraído (BE-14).

## BE-02 — Sin validación de env al arranque + CORS permisivo + sin helmet · Severidad: ALTA (P0 seguridad)

**Por qué:**
- `app.module.ts:27` usa `ConfigModule.forRoot({isGlobal:true})` **sin** `validate`. `JWT_SECRET` se valida lazy en `tokens.ts:30-38` (revienta en el primer request, no en `bootstrap`); MinIO arranca con `|| ""` (`archivos.service.ts:11,13`) y falla solo al subir.
- `main.ts:23-27`: si falta `CORS_ALLOWED_ORIGIN`, `origin: true` = refleja cualquier origen **con credenciales**.
- Sin `helmet`, sin throttler por ruta, sin validación global (Zod manual por controlador, inconsistente: `inventario.controller.ts:27` usa `.parse()` y el resto `safeParse`).

**Solución:** `validate()` con Zod al arranque (`DATABASE_URL`, `JWT_SECRET>=32`, `CORS_ALLOWED_ORIGIN` requerido en prod, `MINIO_*`, `CACHE_REDIS_URL` opcional) con fail-fast; `@fastify/helmet`; rate-limit por ruta en `login/refresh` (p. ej. 10/min/IP); helper único `validar(schema, body)` con `safeParse` → `ErrorDominio VALIDACION`.

**Integración sin romper:** primero agregar validación en modo "aviso" (log si falta algo en dev), luego fail-fast solo cuando `NODE_ENV=production`. CORS: fijar `CORS_ALLOWED_ORIGIN` explícito en `.env` antes de endurecer el default. Probar login CLI + web + voz en QA.

## BE-03 — Sin request-id ni logger estructurado · Severidad: MEDIA-ALTA

**Por qué:** `auditoria.interceptor.ts:12` lee `request.id` pero **ningún middleware lo asigna** → `requestId: undefined` siempre en BD (`schema.prisma:205`). Errores usan `console.error` (`errores.ts:46`, `main.ts:34`), que no es JSON consultable en Docker. Sin `request-id` no se correlaciona log ↔ auditoría ↔ frontend.

**Solución:** `@fastify/request-id` o middleware que fije `req.id` + header `x-request-id`; `nestjs-pino` con `reqId, userId, sid`; `FiltroErrores` loguea 5xx con contexto y devuelve `requestId` al cliente.

**Integración sin romper:** aditivo: el header y el campo se empiezan a llenar sin cambiar respuestas. Rotar logs con la configuración de INF-12 para no llenar disco.

## BE-04 — Rotación de refresh no atómica + 1 query de sesión por request · Severidad: MEDIA

**Por qué:** `auth.service.ts:87-111` crea la sesión nueva y **después** revoca la anterior: hay una ventana con dos refresh válidos y el reuso concurrente crea 2 sesiones. Además `guards.ts:63` consulta la sesión en BD en **cada** request (correcto para revocación, pero costoso).

**Solución:** rotación atómica (`update` + `create` en transacción con `FOR UPDATE`); cachear sesión 30-60 s con invalidación explícita en `logout/cambiarRol`.

**Integración sin romper:** primero la rotación atómica (cambio interno, mismos tokens); después la caché, manteniendo `logout` revocando en BD **y** en caché en la misma operación. Probar doble-refresh concurrente en QA.

## BE-05 — Login con `contains` permite enumeración · Severidad: MEDIA

**Por qué:** `auth.service.ts:131-144` busca por `nombre contains` + alias `system`: facilita enumerar usuarios y entrar como `system` sin email.

**Solución:** login solo por `email | codigo` exactos (más `system` por nombre exacto, documentado). Rate-limit estricto en `login` (BE-02).

**Integración sin romper:** mantener compatibilidad una versión avisando en el mensaje de error genérico (sin revelar si el usuario existe). Actualizar CLI si usa identificador parcial.

## BE-06 — N+1 y operaciones fila por fila dentro de transacciones largas · Severidad: MEDIA-ALTA

**Por qué:**
- `pedidos.service.ts:216-231` hace `findFirstOrThrow` por línea en bucle (pedido de 20 líneas ≈ 60-80 statements con locks retenidos).
- `pagos.service.ts:35-38` carga **todos** los pedidos del cliente en memoria para el FIFO (cliente con 10k pedidos = OOM).
- `inventario.service.ts:107-139` y `cierres.service.ts:111-138` escriben conteos/cierres fila por fila (conteo general de 500 productos ≈ 2000 writes secuenciales).
- `usuarios.service.ts:18-33` lista usuarios + `Promise.all(permisosDe)` = 2N+1 queries.

**Solución:** `createMany` para movimientos/reservas, `updateMany` donde aplique, FIFO con `SELECT … FOR UPDATE SKIP LOCKED` paginado o `SUM` en BD, y una sola query de permisos con join en memoria. Mantener el orden `ORDER BY id` de los locks actuales.

**Integración sin romper:** reescribir por método con el mismo SQL lógico y comparar resultados en QA con datos de `prueba:carga` (totales, stock, cartera idénticos). No cambiar locks y batching a la vez.

## BE-07 — Incremento de `version` ciego + conteos sin transacción · Severidad: MEDIA

**Por qué:** `pedidos.service.ts:394-397` hace `version:{increment:1}` sin `where:{version}` (no hay control optimista real); `inventario.service.ts:45-74` (`actualizarLinea/finalizar/cancelar`) corre sin tx ni `FOR UPDATE`: hay carrera entre `finalizar` y `aplicarAjuste`.

**Solución:** `updateMany({where:{id, version}})` + reintento ante 0 filas afectadas; envolver el ciclo de conteo en transacción con `FOR UPDATE`.

**Integración sin romper:** agregar el `where` primero (los clientes actuales no envían versión, el reintento solo actúa ante colisión real). Probar con dos conteos concurrentes en QA.

## BE-08 — Dinero pasa por `float` en JS y SQL · Severidad: MEDIA

**Por qué:** la BD está bien (`Decimal(18,2)`), pero `consecutivos.ts:40-43` convierte a `Number` y varios agregados usan `::float8` (`clientes.service.ts:137`, `dashboard.service.ts:92,304`). En COP grandes se pierden céntimos por redondeo.

**Solución:** en JS usar `Decimal.js` o céntimos enteros; en SQL `::numeric`, nunca `::float8`.

**Integración sin romper:** cambiar el casteo manteniendo `Decimal(18,2)` en BD (sin migración). Comparar reportes del tablero antes/después en QA con montos grandes.

## BE-09 — Validaciones laxas puntuales · Severidad: MEDIA-BAJA

**Por qué:** `productos.controller.ts:56` valida `nuevoPrecio` a mano sin Zod; `compras.controller.ts:58-60` hace `trim()` manual; `NuevoClienteSchema` no normaliza `telefono/identificacion` únicos → clientes duplicados.

**Solución:** pasar todo por el helper `validar()` (BE-02) y normalizar documentos/teléfonos (quitar espacios, ceros, formato) con unique tratado (nullable + índice parcial).

**Integración sin romper:** normalizar solo hacia adelante + script de deduplicación en QA antes de agregar constraints. Avisar en UI cuando se fusione un duplicado.

## BE-10 — Salud mínima + sin métricas · Severidad: MEDIA

**Por qué:** `catalogos/salud.controller.ts:16-37` (`GET /salud`) hace `SELECT 1` pero no chequea Redis/MinIO/Voz, no distingue liveness/readiness y no hay métricas. El orquestador cree que la API está sana con Redis/MinIO caídos; sin histogramas no se ve el p95 de `dashboard/pedidos`.

**Solución:** `/salud` (liveness, sin DB) + `/salud/listo` (DB+Redis+MinIO `bucketExists` con timeout) + `/metricas` Prometheus (`http_duration`, `db_errors`, `cache_hit`).

**Integración sin romper:** agregar endpoints nuevos sin tocar `/salud` (el Compose y `desplegar.*` dependen de él). Cambiar `depends_on` a `listo` solo después (INF-05).

## BE-11 — Tres listados no escalables · Severidad: ALTA

**Por qué:**
- `productos.service.ts:40-54`: `findMany` **sin** `skip/take`, filtra `stockEstado` en JS y luego `slice`. Con 50k productos trae todo a Node.
- `usuarios.service.ts:17-35`: sin paginación + N+1 de permisos (BE-06).
- `inventario.service.ts:188-199`: `listarConteos/listarAjustes` sin paginación + `include:{lineas:true}` (un conteo general = miles de líneas).
- Extras: `productos.historialPrecios` acepta `limite` sin validar `NaN`; `caja.service.ts:41-48` calcula totales globales aunque el listado vaya filtrado.

**Solución:** `where` SQL para `stockEstado` (`stockFisico - stockReservado <= stockMinimo`), `skip/take` en BD, paginar usuarios/conteos/ajustes/archivos, validar `limite` con Zod, y totales de caja con el mismo filtro del listado.

**Integración sin romper:** mantener la forma `{data, meta}` y agregar `pagina/porPagina` donde falte (API-03). El frontend migra pantalla por pantalla (FE-04); la API vieja (sin paginar) se retira solo cuando ninguna pantalla la use.

## BE-12 — `dashboard` revienta si falta la fila de versión · Severidad: MEDIA

**Por qué:** `dashboard.service.ts:52` lee `fila.version` sin comprobar que la fila `dashboard` exista → `TypeError` = 500 en vez de degradado. Además el prefijo `v1:` es manual (si cambia una fórmula y se olvida el bump, sirve caché vieja 5 min) y `pendientes` (singleflight) no tiene límite.

**Solución:** `if (!fila) return "0"`; extraer `FORMATO_CACHE` a constante compartida con el contrato; LRU con límite para `pendientes`.

**Integración sin romper:** cambio interno del servicio; el contrato de respuesta no cambia. Probar borrando la fila en QA y confirmando degradado a PostgreSQL.

## BE-13 — WebSocket/voz: sockets colgados, estado solo en memoria · Severidad: MEDIA

**Por qué:** `asistente/voz.service.ts:48` hace `return` silencioso para upgrades de otras rutas sin destruir el socket; el límite global de 2 conexiones vive en memoria (impide escalar horizontalmente); `disponible()` abre un WS real al STT como probe (amplificación); el STT no tiene auth interna.

**Solución:** `socket.destroy()` explícito para rutas no-voz; tickets/conexiones en Redis o sticky sessions; probe STT por TCP/timeout, no WS completo; token interno o mTLS hacia el STT.

**Integración sin romper:** primero el `destroy()` (cierra una fuga, no cambia protocolo); Redis para tickets solo cuando se necesite segunda instancia de API. Probar `prueba:voz` en QA después de cada paso.

## BE-14 — Cero tests unitarios (solo scripts manuales QA) · Severidad: ALTA

**Por qué:** glob `*.spec.ts|*.test.ts` = 0; `package.json` sin jest/vitest/supertest. La lógica crítica (`dominio/cartera.ts` FIFO, `consecutivos`, transiciones, SQL del dashboard) solo se valida con scripts manuales (`humo-api.ts`, `integracion-api.ts`, `probar-carga.cjs`) que exigen QA levantada.

**Solución:** `vitest` + tests puros para `cartera`, `consecutivos-numero`, filtros del dashboard + `testcontainers/pg` para `pedidos.crear` concurrente y `pagos.abono` FIFO. Enganchar al CI (INF-09).

**Integración sin romper:** aditivo; no toca código productivo. Es el prerrequisito para atreverse con BE-01/BE-06/BE-07.

## BE-15 — Auditoría: crece sin límite, sin índices de consulta, sin `requestId` · Severidad: MEDIA

**Por qué:** `AuditoriaEvento` guarda cada escritura exitosa (+2 writes por la invalidación de sincronización) sin purga/archivado; el listado ordena por `creadoEn` sin índice dedicado; `requestId` siempre `undefined` (BE-03).

**Solución:** job mensual (`DELETE … WHERE creadoEn < now() - interval '2 años'` o mover a `auditoriaEventos_archivo` en ventana de mantenimiento), índices `(entidadTipo,creadoEn)` y `(usuarioId,creadoEn)` (ver BD-01), rellenar `requestId` y `datosAntes/Despues` en pagos/caja (hoy solo en `pedidos.trasladar` y `usuarios.actualizarAcceso`).

**Integración sin romper:** índices con `CONCURRENTLY`; purga primero en QA midiendo tiempo de borrado; nunca borrar sin respaldo previo (INF-10).

---

# 3. API y contrato

## API-01 — Sin idempotencia en escrituras: el doble-clic crea duplicados · Severidad: ALTA

**Por qué:** grep `Idempotency|idempotencia` = 0 fuera de reintentos del CLI. `POST /pedidos`, `/clientes/:id/abonos`, `/pedidos/:id/pagos`, `/cierres/:fecha` no deduplican: un reintento de red o doble-clic crea `PED-xxx` duplicados con números distintos (el consecutivo no se consume en rollback, pero tampoco deduplica). Solo `aplicar-ajuste` tiene guard `AJUSTE_DUPLICADO`. Existe `Pago.idempotencyKey unique` (`schema.prisma:446`) pero sin uso sistemático.

**Solución:** tabla `clavesIdempotencia(key, metodo, ruta, status, respuesta, expiraEn)` + header `Idempotency-Key` en POST críticos; el frontend genera `key` por formulario (`crypto.randomUUID()`); ante clave repetida se devuelve la respuesta guardada.

**Integración sin romper:** hacerlo optativo primero (si no hay header, comportamiento actual) y obligatorio por endpoint de forma gradual, empezando por `POST /pedidos`. TTL de claves (p. ej. 24 h) para no crecer sin límite. Es prerrequisito de FE-06 y NEG-15.

## API-02 — Sin OpenAPI/Swagger · Severidad: MEDIA

**Por qué:** grep `swagger|DocumentBuilder` = 0. El frontend está acoplado a rutas exactas sin documentación generada; el CLI "descubre endpoints desde controladores" con un generador propio que puede divergir.

**Solución:** `@nestjs/swagger` solo en no-producción, generado desde los mismos DTO/Zod del contrato.

**Integración sin romper:** aditivo y apagado en prod. Sirve además para generar pruebas del CLI y detectar envelopes inconsistentes (API-03).

## API-03 — Envelopes y `meta` inconsistentes · Severidad: MEDIA-BAJA

**Por qué:** la convención `{data}` / `{data, meta}` se respeta en pedidos/pagos/caja/clientes/productos/auditoría, pero `productos.historialPrecios` devuelve `meta:{total}` sin `pagina/porPagina`, y `clientes.cartera` / `cierres.previsualizar` devuelven objetos crudos con formas distintas. `FiltroErrores` unifica a `{code,message}` pero `HTTP_ERROR` pierde el código de negocio.

**Solución:** congelar `meta` como `{pagina, porPagina, total}` siempre; documentarlo en `docs/diccionario-contrato-api.md`; conservar `code` de negocio en errores HTTP.

**Integración sin romper:** agregar campos faltantes (nunca quitar), versionar el cambio de `HTTP_ERROR` informándolo en el changelog del contrato (`VERSION_CONTRATO` en `Compartido/src/index.ts`).

## API-04 — Rate-limit global único, sin protección por ruta sensible · Severidad: MEDIA

**Por qué:** `main.ts:16-19` aplica `RATE_LIMIT_MAX ?? 300/min` global. `login/refresh` admiten el mismo caudal que una lectura, y QA usa `10000` (`docker-compose.pruebas.yml`), por lo que QA nunca ve los `429` de producción.

**Solución:** límites por ruta (`login/refresh`: p. ej. 10/min/IP; voz: el throttle actual de 3 s está bien), y en CI un `curl` con `RATE_LIMIT_MAX=5` temporal para probar el `429` (INF-09).

**Integración sin romper:** configurar por ruta sin cambiar el global; avisar en UI ante `429` con reintento (hoy `429 = rechazada, no guardada`, documentado en `PRUEBAS_CARGA.md`).

## API-05 — Versionado solo por prefijo, con alias legacy sueltos · Severidad: BAJA

**Por qué:** `main.ts:21` fija `api/v1` y `dashboard.controller.ts:17` mantiene alias `["resumen","totales"]`. Funciona, pero no hay estrategia para un `v2` (p. ej. cuando `total` incluya IVA/descuento, NEG-03).

**Solución:** definir ahora la política: prefijo en URL para breaking changes, campos nuevos aditivos sin versión, y fecha de retiro para alias legacy.

**Integración sin romper:** solo documentación + disciplina; ningún cambio de código hoy.

---

# 4. Base de datos

Contexto: `Backend/prisma/schema.prisma` (763 líneas), 37 modelos, 14 enums, 7 migraciones aditivas. Base sólida: consecutivos sin huecos, `Factura.pedidoId @unique`, FK `RESTRICT` correctas, triggers diferidos bien diseñados. Lo que sigue es escalarla, no remodelarla.

## BD-01 — Índices faltantes para consultas frecuentes · Severidad: ALTA

**Por qué:** existen buenos compuestos de pedidos (`[clienteId]`, `[fechaOperacion]`, `[estado,creadoEn,id]`), pero con 100k pedidos degradan a seq-scan + sort:
- Cartera/FIFO `WHERE clienteId AND estado<>cancelado ORDER BY creadoEn` (`pagos.service.ts:35-38`, `clientes.service.ts:96-99`): falta `(clienteId,estado,creadoEn)`; pedidos por vendedor: falta `(vendedorId,fechaOperacion)`, `(vendedorId,estado)`.
- `reservasStock` solo tiene `[productoId]`; los `updateMany where pedidoId` harán seq-scan: faltan `(pedidoId)`, `(pedidoLineaId)`, `(estado)`.
- `pagos` solo `[clienteId]`: faltan `(fechaOperacion)`, `(estado)`, `(tipo,fechaOperacion)`.
- `movimientosCaja` solo `[fechaContable]`: faltan `(tipo,metodo,creadoEn)`, `(fechaContable,tipo,metodo)`.
- `sesiones` (limpieza `expiraEn/revocadoEn`), `archivosAdjuntos` (por entidad: `(pedidoId)`, `(pagoId)`, `(productoId)`), `auditoriaEventos` (`(creadoEn DESC)`, `(entidadTipo,creadoEn)`, `(usuarioId)`), `movimientosInventario` (`(tipo,creadoEn)`).

**Solución:** migraciones aditivas con `CREATE INDEX CONCURRENTLY IF NOT EXISTS …`. No tocar la paginación existente `(creadoEn,id)`.

**Integración sin romper:** `CONCURRENTLY` no bloquea escrituras; aplicar en QA con volumen (`prueba:carga`) y comparar `EXPLAIN` antes/después. Una migración por grupo de índices para revertir fácil.

## BD-02 — Búsquedas `contains insensitive` sin trigram · Severidad: MEDIA

**Por qué:** productos (`productos.service.ts:24-44`, solo `@@index([nombre])`) y clientes (OR sobre `nombre/alias/telefono/codigo`, solo índice en `nombre`) usan `contains insensitive` = `ILIKE`, que no usa btree simple. Falta `(categoriaId)`, `(activo,stockFisico)`, `(alias)`, `(telefono)`, `(codigo)`.

**Solución:** `CREATE EXTENSION IF NOT EXISTS pg_trgm;` + índices `USING gin (nombre gin_trgm_ops)` (y alias/teléfono/código), más los btree de filtro.

**Integración sin romper:** aditivo; la extensión `pg_trgm` es de confianza y no cambia resultados, solo velocidad. Medir un `q` típico antes/después.

## BD-03 — CHECKs solo en app, no en BD · Severidad: MEDIA

**Por qué:** a nivel BD solo hay 3 CHECKs (venta ocasional sin crédito, identidad system). `cantidad>0, monto>=0, stockFisico>=0, char_length(nombre)<=200` viven solo en Zod/servicio: un `UPDATE` manual o un bug deja saldos negativos o filas gigantes.

**Solución:** agregar `CHECK (cantidad>0)`, `CHECK (monto>=0)`, `CHECK (stockFisico>=0 AND stockReservado>=0)`, `CHECK (char_length(nombre)<=200)` con `NOT VALID` + `VALIDATE CONSTRAINT` posterior. Mantener `RESTRICT`, no cambiar a `CASCADE`.

**Integración sin romper:** `NOT VALID` no bloquea ni valida filas viejas; validar en QA con datos reales y corregir excepciones antes del `VALIDATE`.

## BD-04 — `::float8` en agregados con dinero · Severidad: MEDIA

**Por qué:** ver BE-08. La columna es `Decimal(18,2)` (correcto) pero el SQL castea a `float8` y JS convierte con `Number()`.

**Solución:** `::numeric` en SQL, `Decimal.js`/céntimos en JS. Sin migración de columnas.

**Integración sin romper:** cambio de casteo con comparación de reportes antes/después en QA.

## BD-05 — Fechas: el DDL no tiene zona horaria aunque el doc diga `timestamptz` · Severidad: MEDIA-BAJA

**Por qué:** `schema.prisma:4` comenta `timestamptz`, pero el DDL real es `TIMESTAMP(3)` sin TZ. `fechaOperacion/fechaContable` son `DATE` (correcto para `America/Bogota`), pero si el servidor cambia de TZ los cierres se desplazan; `hoyLocal()` compensa en app, la BD no guarda offset.

**Solución:** NO migrar todo a `timestamptz` ahora (reescritura de tablas). Fijar `timezone='America/Bogota'` a nivel BD/conexión + documentarlo; nuevas columnas de auditoría sí en `timestamptz`.

**Integración sin romper:** cambio de configuración + documentación; verificar cierres en QA con TZ del contenedor distinta.

## BD-06 — `invalidar_dashboard` no cubre `movimientosCaja/cierresDia/facturas` · Severidad: MEDIA

**Por qué:** el trigger diferido (`20260930201000_version_cache`) cubre 8 tablas; un egreso manual (`caja.service.ts:75`) **no** invalida el dashboard → `totalIngresos/Egresos` stale hasta el próximo pedido. El de sincronización cubre 34 tablas (bien, salvo `sesiones/consecutivos/versionesCache`, intencional).

**Solución:** migración aditiva (`DROP TRIGGER IF EXISTS` + `CREATE CONSTRAINT TRIGGER`) agregando `movimientosCaja, cierresDia, facturas` a `invalidar_dashboard`. Checklist obligatorio: "tabla operativa nueva → agregar a ambos triggers" + test que compara `information_schema.tables` vs `pg_trigger`.

**Integración sin romper:** el trigger es diferido y solo suma invalidaciones (más frescura, nunca menos datos). Probar egreso manual → dashboard en QA.

## BD-07 — Tablas de crecimiento monotónico sin retención ni archivado · Severidad: MEDIA

**Por qué:** `AuditoriaEvento` (con JSON), `MovimientoInventario`, `PedidoEstadoHistorial`, `CambioPrecio`, `CierrePedido/Movimiento` (snapshots duplicados) crecen sin TTL, partición ni archivado. El tablero ya migró a agregados SQL, pero `cierre.previsualizar` y `productos.listar` aún cargan todo en memoria (riesgo OOM en API de 512 MB).

**Solución:** retención documentada (auditoría >2 años → tabla `auditoriaEventos_archivo` con `INSERT … SELECT + DELETE` en ventana de mantenimiento); `PARTITION BY RANGE (creadoEn)` solo para tablas nuevas/archivo, no reparticionar en caliente; limitar JSON con `CHECK (pg_column_size(datosAntes)<32768)`; agregados SQL para previsualizar (BE-06/BE-11).

**Integración sin romper:** archivar, nunca `DELETE` masivo sin respaldo (INF-10); la tabla de archivo mantiene lecturas históricas funcionando.

## BD-08 — PostgreSQL y Prisma con defaults, sin tuning · Severidad: MEDIA

**Por qué:** `docker-compose.yml:61-77` usa `postgres:17-alpine` sin `command/postgresql.conf` (`shared_buffers, work_mem, max_connections` por defecto) con `mem_limit 512m`; `PrismaClient` sin `connection_limit`; `DATABASE_URL` sin `pool_timeout`. Bajo carga aparecen `Timed out fetching connection from pool`; los `GROUP BY` del dashboard pueden spillear a disco.

**Solución:** `DATABASE_URL=…?connection_limit=10&pool_timeout=20&connect_timeout=10` + `command: ["postgres","-c","shared_buffers=128MB","-c","effective_cache_size=384MB","-c","max_connections=100","-c","work_mem=8MB"]` vía env/override, sin cambiar imagen. Monitorear `pg_stat_activity, pg_stat_statements`.

**Integración sin romper:** solo configuración; aplicar en QA con `prueba:carga` y comparar p95/consecutivos/stock antes de llevarlo al negocio.

## BD-09 — Higiene de migraciones y seed · Severidad: BAJA

**Por qué:** futuras alteraciones con `CHECK`/`INDEX` sin `NOT VALID`/`CONCURRENTLY` bloquearían tablas grandes; el seed inserta filas `dashboard/sincronizacion` sin `ON CONFLICT` (re-ejecución falla).

**Solución:** norma: `ADD CONSTRAINT … NOT VALID + VALIDATE`, `CREATE INDEX CONCURRENTLY`, `INSERT … ON CONFLICT DO NOTHING`.

**Integración sin romper:** solo disciplina + ajuste del seed; probar `migrate deploy` + seed doble en QA.

---

# 5. Docker e infraestructura

Contexto: proyecto `capturador_pedidos_20` (264 líneas de Compose): frontend/Nginx, API, PostgreSQL 17, Redis 7, MinIO archivado, voz Vosk optativa, CLI optativo, Cloudflare optativo. Orden de arranque por `depends_on` + salud. Bien aislado (API en `127.0.0.1:3000`, BD/Redis/MinIO/voz sin puertos).

## INF-01 — `cloudflared:latest` sin pin · Severidad: MEDIA

**Por qué:** `docker-compose.yml:43` usa `latest` mientras el resto está pineado. Un major puede romper el túnel sin cambio de código.

**Solución:** fijar `cloudflare/cloudflared:2026.XX.X` probada en QA (`--profile cloudflare up -d --wait`).

**Integración sin romper:** cambiar solo el tag; no tocar la red `tunel 172.31.254.0/29` ni `set_real_ip_from` en `Frontend/nginx.conf:17`.

## INF-02 — MinIO archivado sin parches · Severidad: MEDIA

**Por qué:** `docker-compose.yml:226-230` usa `bitnamilegacy/minio` (archivo, sin CVE). Es el almacén privado de imágenes/comprobantes. `docs/AUDITORIA_PROFESIONAL.md:66` ya lo señala.

**Solución:** mantener la imagen + documentar un mirror propio; cambiar la línea `image:` solo cuando haya registro espejo verificado (`curl /minio/health/live`, healthcheck `L245`). No abrir el puerto 9001 salvo temporal.

**Integración sin romper:** cambio de una línea con rollback inmediato (tag anterior). Evaluar a mediano plazo reemplazo por GarageFS/MinIO community mantenido, con migración de buckets espejada.

## INF-03 — `api` y `postgres` sin el endurecimiento que sí tienen los demás · Severidad: MEDIA

**Por qué:** `frontend/redis/voz/cli` tienen `read_only:true + tmpfs + cap_drop:[ALL] + no-new-privileges + pids_limit`; `api:99-141` y `postgres:61-77`, no. La API es la superficie expuesta y la BD el dato crítico.

**Solución:** en QA añadir a `api`: `read_only:true + tmpfs [/tmp,/home/ambie/.cache] + cap_drop + pids_limit 256`, validando `migrate + uploads 5MB + MinIO`. A `postgres` NO `read_only` (necesita escribir PGDATA), solo `cap_drop + no-new-privileges + pids_limit`.

**Integración sin romper:** probar en `ambie-integracion` primero (`prueba:humo` + subida de comprobante); llevar al negocio solo tras verde completo.

## INF-04 — `depends_on: redis service_started` en vez de `healthy` · Severidad: BAJA-MEDIA

**Por qué:** `docker-compose.yml:135-136`. La API puede arrancar con Redis a medio iniciar; el fallback a PostgreSQL oculta el fallo.

**Solución:** `condition: service_healthy` (Redis ya tiene healthcheck `L16-20`).

**Integración sin romper:** cambio de una palabra en Compose, probado con `up -d --wait` en QA. No cambia `CACHE_REDIS_URL`.

## INF-05 — Sin `healthcheck` de `api` en Compose (solo en Dockerfile) · Severidad: BAJA

**Por qué:** `Backend/Dockerfile:94-95` define `HEALTHCHECK`, pero `docker-compose.yml:99-141` no lo duplica; `frontend` depende de `api healthy` (`L27-29`) vía la imagen, frágil si se sobrescribe.

**Solución:** duplicar el mismo test en Compose. A futuro, apuntar a `/salud/listo` (BE-10) en vez de `/salud`.

**Integración sin romper:** mismo endpoint, mismo umbral; verificar el orden de arranque documentado en `README.md:74`.

## INF-06 — Dockerfile backend con `npm install -g` y sin limpieza de caché · Severidad: BAJA

**Por qué:** `Backend/Dockerfile:9-50` es multi-stage correcto (5 etapas, `USER ambie`), pero `L72-75` instala `tsx+prisma` global y no limpia caché de npm: capas más grandes y más superficie.

**Solución:** `npm cache clean --force` tras `L75`; mantener stages y el `USER root→ambie` del target `agente`.

**Integración sin romper:** probar `migrate deploy + seed` en QA tras el cambio; comparar tamaño de imagen.

## INF-07 — Voz: `python:3.12-slim` flotante + modelo sin checksum · Severidad: BAJA-MEDIA

**Por qué:** `infra/voz/Dockerfile:1,5-6` usa tag flotante y descarga `vosk-model-small-es-0.42.zip` sin `SHA256`. Build no reproducible, riesgo supply-chain.

**Solución:** fijar `python:3.12.X-slim` + verificar `sha256sum` del zip antes de `unzip`. Mantener `USER voz`, `OMP_NUM_THREADS=1`, `max_size 8192`.

**Integración sin romper:** solo build; probar `prueba:voz` en QA. El modelo (~50 MB) queda igual en la capa.

## INF-08 — Nginx sin gzip/CSP/HSTS/rate-limit y con timeout excesivo · Severidad: MEDIA

**Por qué:** `Frontend/nginx.conf:1-54` tiene lo esencial (`server_tokens off`, `client_max_body_size 8m`, `nosniff/DENY/same-origin`, proxy WS, assets `1y immutable`, `/api/ no-store`), pero sin `gzip`, sin `Content-Security-Policy/HSTS/Permissions-Policy`, sin `limit_req`, y con `proxy_read_timeout 660s`.

**Solución:** `gzip on` (js/css/svg/json) + CSP en modo `Report-Only` primero en QA + `limit_req` a `/api/v1/auth/*`. No bajar los 660 s sin probar voz real (el micrófono necesita WS largo).

**Integración sin romper:** validar `/api/ no-store`, `/assets/ immutable` y `try_files $uri =404` tras el cambio; CSP en enforcing solo cuando el reporte lleve una semana limpio.

## INF-09 — CI verifica pero no construye imágenes ni prueba integración · Severidad: MEDIA

**Por qué:** `.github/workflows/verificar-desplegar.yml:9-25` corre `verificar, prueba:cache, prueba:asistente`, pero no `docker build`, ni `prueba:integracion/voz/carga`, ni `trivy/npm audit`. Un `Dockerfile` o `nginx.conf` roto solo se detecta en despliegue.

**Solución:** job nuevo: `docker build api/frontend/voz + nginx -t` sin push; job QA con `prueba:integracion`; `npm audit --omit=dev` informativo (la auditoría reporta 7 alertas en Prisma/MinIO). Sin tocar el job `desplegar` (`DEPLOY_ENABLED`, concurrency).

**Integración sin romper:** jobs aditivos en el workflow; no cambian el despliegue desactivado.

## INF-10 — Respaldo solo PostgreSQL, sin MinIO/config, sin retención · Severidad: ALTA

**Por qué:** `infra/desplegar.ps1:19-31` y `desplegar.sh:16-22` hacen `pg_dump -Fc` antes de migrar (bien), pero `minio_data` (imágenes/comprobantes) y `asistente_config/cli_data` quedan fuera; `README.md:284` lo deja como paso manual; `.local/backups/` crece sin límite; `docker:limpiar` (`down -v`) seguiría siendo fatal.

**Solución:** script aparte `infra/respaldar.ps1/.sh`: `pg_dump -Fc` + `mc mirror`/copia de `minio_data` + `tar` de configs + retención 7/30 días (`find -mtime +30 -delete`) + `pg_restore --list` de verificación. No automatizar `restore` sobre el negocio (prohibido por docs).

**Integración sin romper:** script nuevo, no modifica `desplegar.*`; ensayar primero en QA (INF-11).

## INF-11 — Respaldos no ensayados, sin cron diario · Severidad: ALTA

**Por qué:** `docs/AUDITORIA_PROFESIONAL.md:39,62`: dumps verificados con `pg_restore --file=/dev/null` / `--list` (solo lectura): "no equivale a ensayo en otra base". `docs/arquitectura-backend.md:76` pide `pg_dump` diario no implementado. Backup no probado = backup inexistente.

**Solución:** ensayo en `ambie-integracion` (`createdb + pg_restore + smoke login + conteos`), documentar fecha/resultado en la auditoría; programar `pg_dump` diario (cron del host o contenedor lateral, no dentro de `api` para respetar 1 proceso/contenedor).

**Integración sin romper:** el ensayo corre contra QA, nunca contra el negocio; no usar `down -v`.

## INF-12 — Sin rotación de logs ni monitoreo de disco · Severidad: MEDIA

**Por qué:** ningún `logging:` en `docker-compose.yml`; `json-file` por defecto crece hasta llenar disco (límite WSL 6 GB en `infra/windows/wslconfig`), y tumba Postgres.

**Solución:** `logging: {driver: json-file, options: {max-size: 10m, max-file: 3}}` por servicio (primero en QA) + chequeo `df -h /var/lib/docker` en el runbook. No instalar Prometheus aún (BE-10 cubre métricas app).

**Integración sin romper:** solo configuración de logging; `docker compose logs` sigue igual.

## INF-13 — Secretos por env (visibles en `inspect`), TLS solo vía Cloudflare · Severidad: MEDIA-BAJA

**Por qué:** bien aislado (puertos internos, token Cloudflare en `secrets:`), pero `POSTGRES_PASSWORD/MINIO_*` viajan por env y `FRONTEND_BIND=0.0.0.0` por defecto expone HTTP local. Para Internet sin túnel no hay TLS.

**Solución:** no cambiar el default local (conviene para LAN `IP_PC:8080`); en VPS aplicar el checklist existente (`APP_ORIGIN/CORS https, COOKIE_SECURE=true, BIND 127.0.0.1, perfil cloudflare`); a futuro mover secretos a `secrets:`.

**Integración sin romper:** checklist ya documentado en `README.md:292`; ejecutar tal cual, sin inventar pasos.

## INF-14 — Escalado vertical sí, horizontal no · Severidad: BAJA (informativa)

**Por qué:** los límites por `.env` (`API/POSTGRES 512 MB/1 CPU`, etc.) permiten escalar vertical sin editar código (`README.md:301`), pero no hay réplicas: `RepeatableRead + versionesCache`, sesiones/voz en memoria y snapshots del frontend limitan. `docs/PRUEBAS_CARGA.md:21`: 170 concurrentes OK, no multi-instancia.

**Solución:** seguir escalando vertical vía `.env`; para horizontal se requerirá Nginx `ip_hash`/sticky + Redis compartido (tickets/voz, BE-13) + `prueba:carga` en QA. No activar réplicas aún.

**Integración sin romper:** ninguna acción hoy; registrar la decisión para no prometer horizontal sin trabajo previo.

---

# 6. Modelo de negocio

Contexto: hoy es un **ERP ligero de ventas a crédito** sólido en su núcleo (pedido transaccional + reserva/consumo + FIFO + caja reversible + cierre + dashboard SQL + auditoría + voz + CLI). Declaradamente NO es: POS fiscal, contable, logístico ni offline (`docs/arquitectura-backend.md:82`, `EQUIVALENCIA_VARIABLES.txt:400`: "factura INTERNA, no DIAN"). Las brechas siguientes están verificadas con `grep` (ausencia real, no suposición) y ordenadas por valor para el negocio.

## NEG-01 — Impresión de tickets/facturas (80 mm) · AUSENTE · Prioridad 1

**Por qué:** `grep window.print|jspdf|pdfmake` en `Frontend/src` = 0. El "ticket" existente es solo CSS decorativo. Un mostrador real necesita entrega física; hoy solo hay pantalla + CSV.

**Solución:** componente `TicketFactura` presentacional desde `PedidoDTO+FacturaDTO`, CSS `@media print` 80 mm, botón Imprimir con `window.print()`. Después, `GET /pedidos/:id/ticket` para impresora térmica ESC/POS vía proxy local.

**Integración sin romper:** solo lectura y presentación; no muta dominio, transacciones ni consecutivos.

## NEG-02 — Exportación completa (xlsx/pdf), no solo "página" · PARCIAL (CSV de página) · Prioridad 1

**Por qué:** `utils/exportar.ts:9` genera CSV de lo filtrado en memoria; `PedidosAdmin` etiqueta honestamente `Exportar página` en API. Contador/administración piden historial completo. `grep pdf|xlsx|exceljs` = 0 (salvo validación de comprobantes).

**Solución:** `GET /reportes/pedidos?desde&hasta&formato=csv|xlsx` en streaming con cursor (`skip/take` existente) + `Content-Disposition`; botón `Exportar completo` separado. PDF con `pdfkit` solo para cierre del día en segunda fase.

**Integración sin romper:** endpoint nuevo de lectura que reutiliza filtros y agregados existentes; no cambia escrituras. Limitar `desde/hasta` (máx. 1 año) para no OOM.

## NEG-03 — IVA, descuentos y listas de precio · AUSENTE · Prioridad 2

**Por qué:** `docs/modelo-datos.md:72`: `subtotal = total (sin impuestos ni descuentos)`; `grep descuento|promocion|lista.?precio|IVA` en `Backend/src` = 0. Sin esto no hay mayorista/detal, ni promociones trazables, ni precio fiscal discriminado. Todo queda en cuaderno y distorsiona utilidad y tops.

**Solución:** `impuestos{id,nombre,porcentaje,activo}` + `Producto.impuestoId?` + `PedidoLinea.{descuentoUnitario,descuentoTotal,impuestoMonto}` (default 0) + `listasPrecio` + `preciosLista{listaId,productoId,precio}` + `Pedido.cliente.listaPrecioId?`. `total = subtotal − descuento + impuesto`, con snapshot en línea como el `costoUnitario` actual. Validación Zod `descuento <= precio*cantidad`. Default 0 % mantiene `subtotal=total` actual.

**Integración sin romper:** columnas nullable default 0 = migración non-breaking; sin lista/impuesto se usa `precioVenta` (comportamiento idéntico al actual). Requiere bump de `FORMATO_CACHE` del dashboard (BE-12) porque cambian fórmulas. Probar totales viejo vs nuevo en QA.

## NEG-04 — Devoluciones / notas crédito · AUSENTE · Prioridad 2

**Por qué:** `arquitectura-backend.md:82` lo declara; `grep devoluc|nota.?credito` = 0. El `TIPO_PAGO=reembolso` es dinero, no reversa inventario. Hoy un error de entrega se "resuelve" con `ajuste-manual` (`perdida/vencimiento`), perdiendo trazabilidad comercial y descuadrando utilidad.

**Solución:** `devoluciones{pedidoId,lineaId,cantidad,motivo}` + consecutivo `NC-XXXX` (vía `consecutivos.ts`) en la misma transacción: revierte `consumo-pedido`, crea `pago tipo reembolso` + `movimientoCaja egreso`, y anula/ajusta la `factura`. Prohibir si el pedido está `cancelado` o el cierre ya `cerrado` sin reapertura.

**Integración sin romper:** tabla y flujo nuevos; respeta `TRANSICIONES_PEDIDO` y reversos compensatorios existentes. Excluir devoluciones de ventas igual que cancelados (regla tablero/caja).

## NEG-05 — Ficha de proveedor + cuentas por pagar · PARCIAL→AUSENTE · Prioridad 2

**Por qué:** `Proveedor{id,codigo,nombre,telefono}` es mínimo (sin NIT, dirección, plazo); `RecepcionCompra{total,descontarCaja}` es contado o egreso inmediato: la compra a crédito a proveedor queda invisible y caja/utilidad mienten. `grep cuenta.?pagar` = 0.

**Solución:** (a) extensión aditiva nullable `nit,direccion,ciudad,email,contacto,plazoDias,activo` + pestaña ficha en `ComprasAdmin`; (b) espejo de cartera invertido: `cuentasPagar{recepcionId,saldo,fechaVence}` derivado de `pagosProveedor+aplicaciones`, `POST /recepciones/:id/pagos` con `advisory_lock` y FIFO reutilizando `cartera.ts` como `carteraGenerica`. `descontarCaja=false` crea CxP en la misma transacción.

**Integración sin romper:** (a) sin tocar recepciones; (b) flujo nuevo que reutiliza locks/FIFO probados. Sin CxP, `descontarCaja` se comporta como hoy.

## NEG-06 — Notificaciones reales (WhatsApp/SMS/email) · PARCIAL (solo flag) · Prioridad 2

**Por qué:** existe `recordatorioWhatsApp:boolean` + tabla `RecordatorioCredito`, pero `grep twilio|nodemailer|send.*message` = 0: es flag, no envío. El cobro depende de la memoria del vendedor y la mora crece.

**Solución:** `notificaciones{canal,mensaje,estado,intentos}` + interfaz `ProveedorNotificacion`. Fase 1 sin costo: botón que abre `wa.me` con texto prearmado; fase 2: Twilio/SMTP con claves en `asistente_config` cifrada (igual que `ASISTENTE_CONFIG_SECRET`). Encolar post-commit, nunca dentro de la transacción del pedido. Respetar `recordatorioWhatsApp`.

**Integración sin romper:** fase 1 es solo frontend (deep link); fase 2 es módulo lateral async que no bloquea ventas.

## NEG-07 — Comisiones de vendedores · AUSENTE · Prioridad 3

**Por qué:** `grep comision` = 0 (solo ruido de proveedor IA). `Pedido.vendedorId` existe pero sin regla de liquidación: las comisiones se pagan a mano y son disputables.

**Solución:** `reglasComision{vendedorId?,categoriaId?,porcentaje}` + vista agregada SQL por `fechaOperacion` sobre `entregado+pagado` (nunca `pendiente/cancelado`), visible solo admin en `Resumen`.

**Integración sin romper:** solo lectura; no toca pedidos ni caja. El pago de comisiones, si se quiere trazable, usa `egreso` de caja existente.

## NEG-08 — Rutas de entrega · AUSENTE · Prioridad 3

**Por qué:** `grep ruta` da 91 hits pero 100 % son rutas HTTP o `rutaSuave()` de gráfica SVG. Cero `zona/reparto/ordenEntrega`. Reparto sin orden = combustible y promesas incumplidas.

**Solución:** `rutasEntrega{id,nombre,vendedorId,fecha}` + `rutaParadas{pedidoId,orden,estado}`; `PATCH /pedidos/:id/estado` ya valida transiciones, solo añade `orden`. UI de lista ordenable sin cambiar la transacción de stock. A futuro, geocodificar `Cliente.direccion`.

**Integración sin romper:** tablas y UI nuevas; el cambio de estado sigue las reglas actuales.

## NEG-09 — Cotizaciones · AUSENTE · Prioridad 3

**Por qué:** `grep cotiz` = 0 en todo el repo. La venta consultiva pierde seguimiento pre-pedido.

**Solución:** reutilizar `Pedido` con nuevo valor `cotizacion` en el enum (primero Prisma, luego contrato, `contrato:verificar`) y `TRANSICIONES cotizacion→[pendiente,cancelado]`; conversión `cotizacion→pedido` en transacción que reserva stock. Excluir de ventas/cartera hasta la conversión (igual que cancelados).

**Integración sin romper:** exige actualizar el enum en las 3 capas a la vez (regla de oro); el resto del sistema ignora el nuevo estado por los filtros existentes (`<>cancelado` → revisar que incluyan `<>cotizacion` donde aplique: tablero, cartera, cierre).

## NEG-10 — Pedidos recurrentes / plantillas · AUSENTE · Prioridad 3

**Por qué:** `grep recurrente|suscrip|cron|schedule` = 0 en negocio. Clientes fijos (tienda semanal) se digitan cada vez.

**Solución:** `plantillasPedido{clienteId,lineas JSON,periodicidad,proximoEn}` + job diario (`node-cron` en contenedor lateral, no en `api`) que llama al mismo `crearPedido()` transaccional. Pausar si `saldoPendiente > cupo`.

**Integración sin romper:** reutiliza el servicio probado; el job solo automatiza la entrada. Contenedor lateral respeta "1 proceso por contenedor".

## NEG-11 — Múltiples bodegas/sedes · AUSENTE · Prioridad 3

**Por qué:** `grep bodega|sucursal` = 1 hit de texto ejemplo. `stockFisico/stockReservado` es global: con 2 puntos se vende lo que no está en sede y se "corrige" con ajuste manual.

**Solución:** `bodegas{id,codigo,nombre}` + `stockBodegas{bodegaId,productoId,fisico,reservado}` (unique), backfill: bodega principal = stock actual. `crear pedido` recibe `bodegaId` y hace `FOR UPDATE` sobre la fila de bodega. Mantener `stock` global como suma para compatibilidad con `ProductoDTO`.

**Integración sin romper:** migración con backfill en la misma transacción de deploy; sin `bodegaId` se usa la principal (comportamiento actual). Dashboard agrega por bodega en segunda fase.

## NEG-12 — Códigos de barras / QR · AUSENTE · Prioridad 3

**Por qué:** `grep barcode|QR` = 0 en negocio. `codigoInterno PROD-XXXX` es consecutivo, no EAN. Conteo y venta táctil son lentos y con error de captura (el motivo `error-captura` existe, pero sin prevención).

**Solución:** `Producto.codigoBarras unique nullable` (sin romper `codigoInterno`) + lector en `FlujoVenta` e `InventarioAdmin` vía `BarcodeDetector` + input fallback + `GET /productos?codigoBarras=` con índice.

**Integración sin romper:** campo nullable + índice aditivo; sin código de barras todo funciona como hoy.

## NEG-13 — Conciliación bancaria de pagos · PARCIAL (idempotencia sí, banco no) · Prioridad 3

**Por qué:** `idempotencyKey` evita el doble cobro por reintento, pero `grep concilia|extracto|banco` = 0: billetera/efectivo sin conciliar deja caja vs banco descuadrado.

**Solución:** `conciliaciones{id,medio,fecha,extractoTotal,sistemaTotal,diferencia}` + `movimientosCaja.conciliadoEn nullable`; importar CSV del banco y matchear por `monto+fechaContable`, marcando sin mutar `monto`. Filtro `conciliado/no` en `CajaAdmin`.

**Integración sin romper:** solo marca y lectura; los montos nunca se reescriben.

## NEG-14 — Facturación electrónica DIAN · AUSENTE (declarado) · Prioridad estratégica

**Por qué:** `EQUIVALENCIA_VARIABLES.txt:400` y `arquitectura-backend.md:82`: factura INTERNA sin CUFE/XML/firma. Sin esto, el negocio que supere el umbral DIAN no puede operar solo con `FAC-XXXX`. Riesgo de sanción al escalar.

**Solución:** NO tocar `facturas` actual. Crear `facturasElectronicas{facturaId unique, cufe, xml, qr, estadoDIAN, respuesta}` + `enum EstadoDIAN=[pendiente,validada,rechazada]` (Prisma → contrato → verificar). Servicio `facturacion-electronica/` que lee `FacturaDTO` y firma async fuera de la transacción del pedido (cola + reintento), sin bloquear `PED/FAC` interno. Feature-flag por instalación.

**Integración sin romper:** módulo lateral 100 % async; si la DIAN falla, la venta interna sigue válida. Requiere NEG-03 (IVA discriminado) antes.

## NEG-15 — PWA offline-first · AUSENTE (declarado) · Prioridad estratégica

**Por qué:** `arquitectura-backend.md:82` ("sin offline"), `PRUEBAS_CARGA.md:27` ("no se persisten pedidos offline"), sin `vite-plugin-pwa`/service-worker/IndexedDB. Zona sin señal = no venta.

**Solución:** fase 1 read-only (`vite-plugin-pwa` + manifest + caché shell + GET stale-while-revalidate); fase 2 escritura con cola `outbox` en IndexedDB + `idempotencyKey` ya existente para no duplicar al reconectar + banner offline. Ver FE-07.

**Integración sin romper:** fase 1 no cambia escrituras; fase 2 exige API-01. Nunca auto-reintentar a ciegas sin clave de idempotencia. Probar con red cortada en QA.

## NEG-16 — Respaldos programados desde la app · AUSENTE (solo manual) · Prioridad 2

**Por qué:** el respaldo solo ocurre al desplegar (`desplegar.ps1:20-31`); si nadie despliega, no hay copia. Cero botón UI, cero schedule. Ver INF-10/INF-11.

**Solución:** sin exponer PG al front: endpoint admin `POST /respaldos` que ejecuta `pg_dump -Fc` + espejo MinIO a `.local/backups/` + registro `respaldos{id,archivo,tamano,sha256}`; scheduler en contenedor `cron` lateral; retención 7/30; botón Descargar/Verificar + checklist de "restauración ensayada en QA".

**Integración sin romper:** endpoint admin nuevo + contenedor lateral; no toca el flujo de ventas. Nunca restaurar automáticamente sobre pedidos nuevos.

## NEG-17 — Auditoría 100 % transaccional + filtros/export · EXISTE (mejorable) · Prioridad 3

**Por qué:** el endpoint y la pantalla (`Auditoria.tsx`) ya existen (la `EQUIVALENCIA:14` que decía "sin endpoint" está superada), pero la auditoría genérica es best-effort post-commit (puede perderse) y le faltan filtros por usuario/fecha/acción y export.

**Solución:** pasar `tx` al interceptor o usar cola durable; filtros + export CSV de auditoría; completar `datosAntes/Despues` en pagos/caja (BE-15).

**Integración sin romper:** filtros/export son lectura; la transaccionalidad se prueba en QA con fallos inducidos post-commit.

---

# 7. Roadmap sugerido por fases

**Fase 0 — Quick wins (1-2 semanas, sin cambiar dominio):**
BE-02 (env/CORS/helmet), BE-03 (request-id+pino), INF-01/03/04/05/08/12, BD-01 (índices), BD-08 (tuning), FE-05 (Error Boundaries), FE-09 (zoom/focus), FE-10 (build), INF-09 (CI build+nginx -t).

**Fase 1 — Robustez de datos y API (2-4 semanas):**
API-01 (idempotencia) → FE-06 (fin del `disabled` global) → BE-11 (paginación) + FE-04 (paginación UI) → BE-06/BE-07 (batching, control optimista) → BE-14 + FE-12 (tests) → BE-10/BE-12/BE-13 → API-02/API-03.

**Fase 2 — Operación en producción (en paralelo a Fase 1):**
INF-10/INF-11 (respaldos + ensayo restore + cron) → BE-15 + BD-07 (retención auditoría) → BD-03/BD-06 (checks, triggers) → FE-16 (Sentry/version) → INF-02/INF-07/INF-13.

**Fase 3 — Valor de negocio (por prioridad):**
NEG-01 + NEG-02 (ticket + export) → NEG-03 (IVA/descuento/listas) → NEG-04 (devoluciones) → NEG-05 (CxP) → NEG-16 (respaldos en app) → NEG-06 (wa.me) → NEG-07/08/09/10/11/12/13.

**Fase 4 — Estratégico:**
NEG-14 (DIAN, requiere NEG-03) → NEG-15 fase 2 (offline con idempotencia) → FE-01/FE-02/FE-03 (re-arquitectura frontend, con tests ya en verde) → evaluar horizontal (INF-14).

# 8. Checklist de integración segura (usar en cada cambio)

- [ ] ¿Toca enum/campo? → Prisma → contrato → `contrato:verificar` → `EQUIVALENCIA_VARIABLES.txt`.
- [ ] ¿Toca dinero/stock/caja/cierre? → transacción + locks existentes + consecutivos en tx.
- [ ] ¿Cambia fórmula/agregado? → bump `FORMATO_CACHE` + comparar reportes antes/después.
- [ ] ¿Migración? → aditiva (`CONCURRENTLY`, `NOT VALID`, `ON CONFLICT DO NOTHING`), probada en QA con volumen.
- [ ] ¿Endpoint nuevo? → envelope `{data}`/`{data,meta}` + OpenAPI + rate-limit acorde.
- [ ] ¿Escritura nueva? → `Idempotency-Key` + auditoría con `requestId`.
- [ ] ¿Tabla operativa nueva? → agregarla a triggers `invalidar_dashboard` + `invalidar_sincronizacion`.
- [ ] Probado en `ambie-integracion` (8180/3100), nunca contra el negocio.
- [ ] `npm run verificar` verde + recorrido 390×844 y 1440 px si toca UI.
- [ ] Respaldo previo si toca datos; restore ensayado si toca respaldos.

---

*Documento generado a partir de la revisión completa del repositorio (código, migraciones, Compose, docs y auditoría del 30/09/2026). Cada ítem cita su evidencia para verificación directa.*
