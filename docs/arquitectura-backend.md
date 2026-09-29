# Arquitectura backend — AMBIÉ

## Stack

- **Node.js LTS + TypeScript + NestJS (adaptador Fastify)** — misma lenguaje que el frontend.
- **Prisma 6 + PostgreSQL 17** — esquema tipado y migraciones versionadas.
- **Zod** — validación de entradas en cada endpoint.
- **Argon2id** — hash de contraseñas.
- **MinIO** — almacenamiento privado de imágenes de producto y comprobantes de pago.
- **Docker Compose** — `postgres`, `migrate`, `api`, `minio` en el servidor propio.
- **Nginx** (opcional) como servidor estático y proxy inverso de `/api`.

## Estructura

```
Backend/
  prisma/schema.prisma        # modelo de datos (fuente de verdad)
  prisma/seed.ts              # roles, permisos, categorías, tipos de crédito
  prisma/bootstrap.ts         # primer administrador (se ejecuta una vez)
  prisma/migrations/          # SQL versionado
  src/common/                 # PrismaService, guardas de sesión/roles, errores, consecutivos
  src/dominio/                # lógica pura compartida (cartera, saldos)
  src/auth/                   # login/logout/me, sesiones en cookie
  src/{clientes,productos,pedidos,pagos,inventario,compras,caja,usuarios,cierres,dashboard}/
```

`OperacionesContext` del frontend sigue siendo la fachada; cada método se delegará a un endpoint.

## Puesta en marcha (servidor propio)

```bash
cp .env.example .env
# Edita .env: POSTGRES_PASSWORD, SESSION_SECRET, MINIO_*, BOOTSTRAP_*

docker compose up -d --build          # postgres + migrate (migraciones y seed) + api + minio
docker compose exec api node dist/../node_modules/tsx/dist/cli.mjs prisma/bootstrap.ts
# o, desde el host con el backend instalado:
cd Backend && npm run bootstrap
```

- `migrate` corre `prisma migrate deploy` y `prisma db seed` antes de levantar `api`.
- `bootstrap` crea el primer administrador usando `BOOTSTRAP_EMAIL`/`BOOTSTRAP_PASSWORD` y falla si ya existe.
- Frontend: `cd Frontend && npm run dev`; la SPA consumirá `/api/v1` (proxy o `VITE_API_BASE_URL`).

## Credenciales y secretos

- **Solo en `.env` o Docker Secrets**, nunca en el repositorio, el bundle ni `VITE_*`.
- `POSTGRES_*` y `DATABASE_URL` → solo infraestructura y backend.
- `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` → solo backend.
- `SESSION_SECRET` → firma/rotación de sesiones.
- `BOOTSTRAP_EMAIL`/`BOOTSTRAP_PASSWORD` → solo el primer arranque; elimínalos después.
- El frontend no recibe ningún secreto; solo `VITE_API_BASE_URL` (público).
- No se siembran usuarios con contraseñas conocidas (se eliminan `admin@ambie.local/admin123` y
  `vendedor@ambie.local/vendedor123` del frontend en la Fase 4).

## Sesiones y autorización

- Cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción, expiración 7 días.
- `AuthGuard` global valida el hash SHA-256 del token contra `sesiones`; revoca y caduca.
- Roles `administrador` y `vendedor`; permisos actuales (`pedidos`, `inventario`, `caja`,
  `usuarios`, `cierre-diario`, `clientes`, `cobros`) se aplican en el servidor, no en la UI.
- `RutaProtegida` del frontend es solo navegación; la autorización real es la API.

## Transacciones críticas

- **Crear pedido**: bloqueo de productos (`FOR UPDATE`), validar disponibilidad, `PED`/`FAC`,
  líneas con snapshot, factura interna, reserva (y consumo si se entrega), historial,
  pago inicial + caja si `inmediato`.
- **Cobro directo / abono FIFO**: `pg_advisory_xact_lock` por pedido o cliente;
  aplicación + saldo + caja en una transacción; se rechaza el excedente.
- **Conteos**: el conteo no toca stock; el ajuste mueve stock y ledger con bloqueo.
- **Cierre**: previsualización sin escritura; el cierre es transaccional y único por fecha.

## Backups y operación

- `pg_dump` diario del volumen `postgres_data` y del bucket de MinIO; probar restauración.
- Logs en `docker compose logs -f api`; healthcheck del `api` vía `/api/v1/auth/me`.
- Migraciones: solo el servicio `migrate` las aplica; la API no migra al arrancar.

## Límites de la v1

Sin offline, sin DIAN/CUFE/XML, sin notas crédito, sin anticipos, sin pago mixto inicial,
sin entregas parciales, sin cancelación de pedidos entregados y sin `tabla ventas` duplicada
(el pedido es la venta). Se conservan tablas preparadas: `facturas` (factura interna) y
`tiposCredito` (periodicidad).
