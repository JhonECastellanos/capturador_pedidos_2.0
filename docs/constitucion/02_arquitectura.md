# 02 · Arquitectura y estructura

> Constitución de AMBIÉ · Capturador de pedidos — archivo 2 de 4.
> Última revisión: 30/09/2026.
> Responde a: «¿dónde va cada cosa y cómo se conecta?». Todo lo aquí descrito existe hoy en el código.

## 1. Mapa del monorepo

```text
Capturador_pedidos_2.0/
├── Frontend/    SPA React + Vite (workspace `capturador-pedido`)
├── Backend/     API NestJS (workspace `ambie-backend`) + CLI + Prisma + scripts
├── Compartido/  Contrato (workspace `@ambie/contrato`): enums, DTO y esquemas
├── infra/       Despliegue (desplegar.ps1/.sh), voz (Vosk), guía Windows
├── scripts/     Verificadores: contrato, repositorio (seguridad), caché
├── docs/        constitucion/ (normas) + info/ (documentación técnica e histórica)
└── .github/     Workflow de verificación y despliegue continuo
```

Regla: **el contrato manda**. Todo tipo, enum o esquema que compartan las capas vive en `Compartido/`; no se duplica por copia.

## 2. Frontend: pantalla → fachada → dominio → repositorio

```text
pantalla → contexto/fachada → dominio → repositorios/API
```

- Las **pantallas no llevan reglas de negocio**. Si una regla afecta pedidos, stock, caja o créditos, pasa por el dominio.
- `Frontend/src/modules/<área>/screens/` — pantallas por módulo (`ventas`, `pedidos`, `inventario`, `caja`, `compras`, `precios`, `créditos`, `usuarios`, `administracion`, `asistente`…).
- `Frontend/src/components/` — componentes reutilizables. Revisar antes de crear uno nuevo.
- `Frontend/src/context/` — fachada de operaciones: `OperacionesContext.tsx` (modo local) y `OperacionesApiContext.tsx` (fachada remota). Los hooks y los proveedores viven en archivos separados (Fast Refresh).
- `Frontend/src/dominio/` — reglas puras (`servicios.ts`): construir pedidos, distribuir abonos, etc.
- `Frontend/src/data/` — repositorios, API, sincronización y paginación (`api.ts`, `usePaginaApi.ts`, `useSincronizacion.ts`).
- `Frontend/src/utils/` — fechas, estados, formato, paginación.
- Entrada explícita: `/` (acceso), `/admin`, `/vendedor`; `/administracion` redirige. `main.tsx` contiene raíz, router y `QueryClientProvider`; `App.tsx` compone `AuthProvider` por fuera de `OperacionesProvider`.
- Rutas de venta compartidas entre roles en `modules/ventas/screens/RutasVentas.tsx`.

## 3. Backend: un módulo por área

Cada módulo tiene **controlador** (valida con Zod y responde), **servicio** (lógica y transacciones) y **módulo** (registro):

| Pieza | Responsabilidad |
|---|---|
| `*.controller.ts` | Valida la entrada con esquemas Zod; devuelve `{ data }` o envelope paginado `{ data, meta }`. No contiene lógica de negocio. |
| `*.service.ts` | Lógica de negocio, transacciones, bloqueos, consecutivos. |
| `*.module.ts` | Registro Nest del módulo. |

Módulos actuales: `archivos`, `asistente`, `auditoria`, `auth`, `caja`, `catalogos`, `cierres`, `clientes`, `compras`, `dashboard`, `inventario`, `pagos`, `pedidos`, `productos`, `sincronizacion`, `usuarios`.

### `Backend/src/common/` (transversal)

- `PrismaService` (conexión; la API **no** aplica migraciones al arrancar).
- Guardas: `AuthGuard` global (cookie `ambie_access` o Bearer, salvo `@Public()`), `@Roles(...)` para administración.
- Errores: `ErrorDominio` + `FiltroErrores` → `{ code, message }`.
- `consecutivos.ts` — códigos visibles dentro de la transacción.
- `crypto.ts` — fechas locales (`hoyLocal`, conversión a `YYYY-MM-DD`).
- `paginacion.ts`, `roles.ts`, `tokens.ts`, `auditoria.interceptor.ts` (metadatos de escrituras; nunca cuerpos ni tokens).

### `Backend/src/dominio/` (lógica pura)

Cartera y saldos reutilizables (`aplicadoPorPedido`, `saldoDePedido`). Reutilizarlos en lugar de recalcular a mano. Es la misma idea que el dominio del frontend, del lado servidor.

### Agregaciones

El tablero, las series y los tops se calculan con **SQL parametrizado / `Prisma.sql`** dentro de `DashboardService`. Nunca traer el historial completo a Node para sumar en JavaScript.

## 4. Contrato compartido (`Compartido/src/`)

| Archivo | Contenido |
|---|---|
| `enums.ts` | Enums que viajan por las tres capas (hoy 14 en `schema.prisma`). |
| `tipos.ts` | DTO compartidos. |
| `esquemas.ts` | Esquemas Zod (API, frontend y CLI comparten reglas). |
| `asistente.ts`, `sincronizacion.ts` | Contratos de asistente y revisión de datos. |
| `index.ts` | Reexporta todo y declara `VERSION_CONTRATO`. |

Flujo obligatorio de un enum nuevo o modificado: `schema.prisma` → `enums.ts` → `npm run contrato:verificar` → `EQUIVALENCIA_VARIABLES.txt`.

## 5. Base de datos

- Fuente de verdad: `Backend/prisma/schema.prisma` (37 modelos, 14 enums al 30/09/2026) y migraciones versionadas en `Backend/prisma/migrations/`.
- Nombres **camelCase** en las tres capas; tablas plurales (`pedidos`, `pedidoLineas`); `id` es UUID interno y no se expone como código visible.
- Códigos visibles por consecutivo: `USR`, `CLI`, `PROD`, `PRV`, `TC`, `PED`, `REC`, `FAC`.
- No se borra información: `activo`, `estado`, `anuladoEn`, `revertidoEn`; la auditoría es append-only.
- Triggers diferidos actualizan `versionesCache.dashboard` y la revisión de sincronización **al confirmar** la transacción; un rollback no invalida caché.
- **Tabla operativa nueva → sumarla a los triggers de invalidación** (dashboard y sincronización) en la misma migración.
- Migraciones: aditivas y probadas primero en QA; `CREATE INDEX CONCURRENTLY`, `ADD CONSTRAINT ... NOT VALID` + `VALIDATE`, `INSERT ... ON CONFLICT` cuando aplique.

## 6. Caché y sincronización

- **TanStack Query**: claves por sesión/ruta/página/filtros; escrituras invalidan lecturas; login/logout/expiración cancelan y limpian; no persistir respuestas privadas en `localStorage`.
- **Redis** interno (TTL 5 min): la clave incluye la revisión de `versionesCache`; los resultados antiguos caducan solos, sin `FLUSHALL`. Fallos de Redis → PostgreSQL.
- **Sincronización**: `GET /api/v1/sincronizacion/revision` (autenticado, sin caché HTTP) cada 2 segundos con la pestaña visible; sin solicitudes superpuestas; reconexión y visibilidad reanudan. Un cambio confirmado dispara `ambie:datos-actualizados`.
- Una actualización **mantiene el snapshot de la misma sesión**, sin desmontar pantallas ni perder scroll/borradores. Los placeholders de consultas paginadas solo pertenecen a la misma sesión y recurso.
- Interpretar voz y emitir tickets **no** son escrituras de negocio: no auditan ni invalidan consultas.

## 7. Paginación y límites visuales

- Listas operativas: `POR_PAGINA=30`; los filtros se aplican sobre el conjunto completo antes de paginar.
- Selectores y pendientes extensos: máximo 30 con buscador.
- El límite visual **nunca** recorta saldos, totales, FIFO ni líneas de un documento.
- Panel administrativo: mínimo 600 px de contenido con scroll exterior; listas mínimo 160 px; tarjetas mínimo 64 px.

## 8. Runtime: un solo proyecto Compose

| Servicio | Función | Exposición |
|---|---|---|
| `frontend` | SPA compilada + Nginx (proxy API/WebSocket) | 8080 |
| `api` | API NestJS | 127.0.0.1:3000 |
| `postgres` | Base de datos | Red interna (5432) |
| `redis` | Caché | Red interna, sin publicar |
| `minio` | Imágenes y comprobantes | Red interna (9000) |
| `migrate` | Migraciones + semilla; **termina con código 0** | — |
| `voz` | Vosk local (perfil `voz`) | Interno, sin puerto |
| `cli`, `cloudflared` | Optativos (perfiles) | — |

- Orden de arranque con `depends_on` y salud (`migrate` → `api` → `frontend`). No levantar servicios a mano ni duplicar contenedores de voz.
- Recursos por límites `*_MEMORY`/`*_CPUS` en `.env`; escalar es vertical, sin editar Compose. La API no migra al arrancar.
- QA aislada: proyecto `ambie-integracion` con `docker-compose.pruebas.yml` (8180/3100, volúmenes separados). Al terminar, `down` **sin `-v`**.
- MinIO usa la última imagen archivada de Bitnami (la oficial dejó de publicarse); ver README antes de cambiar esa línea.
- Cloudflare está preparado pero desactivado: token privado en `.local/cloudflare-token`, origen interno `http://frontend:8080`, cookies seguras. No activarlo por iniciativa propia.

## 9. CLI (`Backend/cli/`)

- Corre con `tsx`; fuera de `nest build` (tipos con `tsconfig.cli.json`).
- Los proveedores implementan `ProveedorIA` y se registran sin duplicar el bucle de conversación.
- Las herramientas se declaran una vez en `herramientas.ts` con esquema Zod; las escrituras piden confirmación (salvo `--si`, solo para pruebas).
- El generador de pruebas descubre endpoints leyendo los controladores; no hay lista paralela que mantener.

## 10. Voz

- Un único servicio local (Vosk, español) dentro de la agrupación; el audio no se guarda.
- WebSocket `/api/v1/asistente/voz` con tickets de un solo uso; permiso y origen verificados.
- Separación estricta: transcripción → interpretación → confirmación → escritura.
- Pedido por voz: cliente real seleccionado y confirmado antes de productos; «Confirmar cliente» no guarda; «Volver»/«continuar» conservan el borrador; solo «confirmar operación» puede guardar. El micrófono detenido restaura la navegación manual.

## 11. Dónde va cada cosa nueva

| Necesidad | Ubicación |
|---|---|
| Endpoint nuevo | `Backend/src/<área>/` (controller + service + module); validar con Zod; envelope `{data}`/`{data,meta}` |
| Regla de negocio pura | `Backend/src/dominio/` o `Frontend/src/dominio/` |
| Pantalla nueva | `Frontend/src/modules/<área>/screens/` (sin reglas de negocio) |
| Componente reutilizable | `Frontend/src/components/` (revisar los existentes primero) |
| Hook compartido | `Frontend/src/data/` o `utils/`, en archivo separado del proveedor |
| Validación compartida | `Compartido/src/esquemas.ts` |
| Enum o DTO | `Backend/prisma/schema.prisma` → `Compartido/src/enums.ts`/`tipos.ts` → `contrato:verificar` |
| Script de prueba | `Backend/scripts/` o `scripts/`; solo contra QA |
| Migración | `Backend/prisma/migrations/`; aditiva y probada en QA |
| Voz | `infra/voz/` + `Backend/src/asistente/` (un solo contenedor de voz) |

## 12. Referencias

- [`01_stack_y_reglas.md`](01_stack_y_reglas.md) — qué es obligatorio.
- [`03_estandares_codigo.md`](03_estandares_codigo.md) — nombres, errores y estilo.
- [`docs/info/arquitectura-backend.md`](../info/arquitectura-backend.md) — diseño original y límites de la v1.
- [`docs/info/modelo-datos.md`](../info/modelo-datos.md) — mapeo frontend → base de datos.
- [`docs/info/diccionario-contrato-api.md`](../info/diccionario-contrato-api.md) — contrato por ruta.
