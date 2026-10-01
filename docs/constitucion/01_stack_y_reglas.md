# 01 · Stack y reglas no negociables

> Constitución de AMBIÉ · Capturador de pedidos — archivo 1 de 4.
> Última revisión: 30/09/2026, basada en `README.md`, `AGENTS.md`, `docs/info/` y verificación directa del código.
> Este archivo es normativo: si algo del código contradice una regla de aquí, se corrige el código (o se actualiza este documento con evidencia, nunca «porque sí»).

## 1. Qué es AMBIÉ

Aplicación para el día a día de un negocio de ventas: clientes, productos, pedidos, cobros, inventario, compras, precios y caja. Interfaz pensada como app móvil dentro del navegador: pasos claros, botones grandes, scroll interno y acciones siempre accesibles.

**Una instalación sirve a una sola empresa.** No hay tenants ni administración multiempresa; no se deben introducir.

## 2. Stack exacto (verificado el 30/09/2026)

| Capa | Tecnología | Detalle |
|---|---|---|
| Runtime | Node.js | 24 o superior (`engines`). En PowerShell usar `npm.cmd`/`npx.cmd`. |
| Frontend | React 19 + TypeScript 6 + Vite 8 | SPA con React Router 7. |
| Estilos | Tailwind CSS 4 | Tokens globales en `Frontend/src/index.css`; conservarlos. |
| Datos en cliente | TanStack Query 5 | Caché en RAM: frescura 30 s, caducidad 5 min. |
| Backend | NestJS 11 + Fastify 5 | CommonJS con `module/moduleResolution: Node16`; prefijo `/api/v1`. |
| Base de datos | PostgreSQL 17 + Prisma 6 | `Backend/prisma/schema.prisma` es la fuente de verdad. |
| Validación | Zod 3 | Esquemas compartidos en `Compartido/src/esquemas.ts`. |
| Contraseñas | Argon2id | |
| Contrato | `@ambie/contrato` | Workspace npm con DTO, enums y esquemas. |
| CLI | tsx | `Backend/cli/`; fuera de `nest build`, se revisa con `tsconfig.cli.json`. |
| Caché | Redis 7 interno | TTL 5 min, expulsión LRU; sin puerto publicado. |
| Archivos | MinIO privado | Imágenes y comprobantes con autenticación; máximo 5 MB. |
| Voz | Vosk local (español) | Un único contenedor interno, sin puerto. |
| Servidor web | Nginx en el contenedor `frontend` | SPA + proxy de API y WebSocket. |
| Orquestación | Docker Compose | Proyecto único `capturador_pedidos_20`. |
| Lint frontend | oxlint | `npm run front:lint`. |

## 3. Reglas no negociables

### 3.1 Negocio y datos

1. **Una empresa por instalación.** NUNCA introducir tenants, administración multiempresa ni columnas de «empresa».
2. **PostgreSQL es la fuente de verdad** en modo API. El modo local (`VITE_DATOS_ORIGEN=local`, claves `ambie:v2:`) es compatibilidad explícita; NUNCA borrar ni importar automáticamente esos datos a PostgreSQL. Las claves `ambie:v1:` se ignoran.
3. **Los cancelados no cuentan**: quedan fuera de cartera, no admiten cobros y no aparecen en ventas. El tablero debe cuadrar con la caja, que sí revierte el cancelado.
4. **Nada se borra**: documentos y auditoría usan `activo`, `estado`, `anuladoEn`, `revertidoEn`. La auditoría guarda **metadatos, nunca cuerpos, contraseñas ni tokens**.
5. Dinero: `numeric(18,2)` en base, **cadena decimal** en JSON, nunca `float`; cantidades enteras; los saldos son **derivados** de las aplicaciones (no se guardan duplicados).
6. Fechas: ISO 8601; filtros y cierres con `YYYY-MM-DD` y calendario local `America/Bogota`.
7. **Consecutivos** (`USR`, `CLI`, `PROD`, `PRV`, `TC`, `PED`, `REC`, `FAC`): globales, sin reinicio anual y sin huecos. SIEMPRE dentro de la transacción, mediante `Backend/src/common/consecutivos.ts`. Si la transacción falla, el número no se consume.

### 3.2 Transacciones e invariantes

8. Pedidos, stock, reservas, saldos, abonos y caja cambian **coherentemente dentro de una sola transacción**, con los bloqueos existentes (`FOR UPDATE`, `pg_advisory_xact_lock`).
9. Cancelar un pedido abierto revierte reservas, aplicaciones de pagos y caja. La API **no cancela entregados ni reactiva cancelados**; la reactivación histórica solo existe en el modo local.
10. Abonos generales: **FIFO** por antigüedad. Cobro directo: únicamente al pedido seleccionado.
11. **Crédito exige cliente** (también en API y base de datos). La venta abierta sin cliente solo admite **efectivo o billetera**.
12. Conteos parciales ajustan únicamente las líneas digitadas; el conteo no toca stock hasta aplicar el ajuste.
13. La venta es el pedido (no hay tabla `ventas` paralela); la factura es **interna** (`FAC`), no DIAN.

### 3.3 Seguridad y cuentas

14. La autorización real vive en el servidor (`AuthGuard` global + `@Roles(RolUsuario.ADMINISTRADOR)`) para: usuarios, cierres, egresos, ajustes de inventario, precios, compras y gastos. Ocultar un control en la UI **no** autoriza nada.
15. Cuenta **system**: única, técnica, con autenticación normal (sin bypass). NUNCA desactivarla, degradarla, eliminarla ni convertir otra cuenta por coincidencia de correo; API y PostgreSQL lo bloquean. Desde Usuarios se crea el primer administrador del negocio.
16. Secretos solo en `.env` (nunca versionado) y en `.env.example` como placeholders. NUNCA en Git, en el bundle ni en variables `VITE_*` (son públicas). `SYSTEM_PASSWORD` y `BOOTSTRAP_*` pertenecen a migración/semilla, jamás al frontend; editar `.env` no rota una contraseña ya guardada.

### 3.4 Pruebas y operación

17. Pruebas que escriben: SOLO contra QA (`ambie-integracion`: frontend 8180, API 3100; `BASE_PRUEBAS_API` limitada a `localhost:3100` o `localhost:8180`). NUNCA contra la base del negocio.
18. NUNCA `docker:limpiar`, `docker compose down -v`, podas de volúmenes ni restauraciones sobre el negocio sin autorización específica. No borrar respaldos ni datos QA.
19. `npm run verificar` (contrato + API + frontend) es la puerta de salida de todo cambio de código. Revisión de interfaz a 390×844 y 1440 px; el login también a 320×320 / poca altura.
20. NUNCA activar proveedores de IA ni Cloudflare por iniciativa propia ni consumir claves. El CLI y el asistente respetan la configuración existente; `--help` y `rutas` no llaman modelos.
21. Distinguir resultados históricos de pruebas actuales. Una prueba concreta no garantiza ausencia de fallos ni capacidad para 100.000 pedidos.

### 3.5 Contrato, TypeScript y caché

22. Un enum nuevo o modificado: PRIMERO `Backend/prisma/schema.prisma`, DESPUÉS `Compartido/src/enums.ts`, luego `npm run contrato:verificar` (compara los `@map`; hoy son 14 enums) y actualizar `EQUIVALENCIA_VARIABLES.txt`.
23. NUNCA ocultar tipos con `ignoreDeprecations` ni cambios de configuración: si el cliente Prisma está desactualizado, regenerarlo con `npx prisma generate --schema Backend/prisma/schema.prisma`. Backend: `rootDir ./src`, sin `baseUrl`.
24. Si cambia una fórmula o la estructura de los agregados del tablero: subir el prefijo de formato de la caché (`v1`) junto con el contrato. NUNCA `FLUSHALL`; si Redis falla, se consulta PostgreSQL y las escrituras no se bloquean.
25. No reintroducir la banda blanca «Datos compartidos / Actualizar»: se conserva el indicador de desconexión con Reintentar y el refresco periódico de respaldo.

## 4. Límites declarados de la versión actual

La v1 **no incluye**: offline real, facturación electrónica DIAN (CUFE/XML/firma), notas crédito o devoluciones, anticipos, pago mixto inicial, entregas parciales ni cancelación de pedidos entregados. La factura es interna.

Estos límites son de diseño, no fallos. Los pendientes con prioridad viven en [`04_roadmap_y_tareas.md`](04_roadmap_y_tareas.md) y su detalle con evidencia en [`docs/info/OPORTUNIDADES_MEJORA.md`](../info/OPORTUNIDADES_MEJORA.md).

## 5. Referencias

- [`README.md`](../../README.md) — flujos, comandos y catálogo de entidades.
- [`AGENTS.md`](../../AGENTS.md) — guía operativa para agentes.
- [`EQUIVALENCIA_VARIABLES.txt`](../../EQUIVALENCIA_VARIABLES.txt) — nombre de cada variable por capa.
- [`docs/info/AUDITORIA_PROFESIONAL.md`](../info/AUDITORIA_PROFESIONAL.md) — evidencia ejecutada de las validaciones.
- [`docs/info/OPORTUNIDADES_MEJORA.md`](../info/OPORTUNIDADES_MEJORA.md) — riesgos y oportunidades con IDs.
