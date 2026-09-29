# AMBIÉ · Capturador de pedidos

Aplicación para llevar el día a día de un negocio de ventas: clientes, productos, pedidos, cobros, inventario, compras, precios y caja.

La interfaz está pensada como una app móvil dentro del navegador: pasos claros, botones grandes, scroll interno y acciones siempre accesibles.

## Cómo está organizado

El proyecto es un monorepo con tres piezas que comparten un mismo contrato.

```text
Frontend/     La aplicación. React, TypeScript y Vite.
Backend/      La API. NestJS, Prisma y PostgreSQL.
Compartido/   El contrato. Los tipos, enums y esquemas que usan los tres.
```

`Compartido/` es la pieza que evita que las capas se separen. Un enum de `Compartido/src/enums.ts` lo importan el frontend, la API y el script de verificación. Si alguien agrega un valor en la base de datos y olvida el contrato, la verificación falla en vez de romperse en producción.

```bash
npm run verificar   # Revisa contrato, API y frontend de una sola vez
```

`EQUIVALENCIA_VARIABLES.txt` documenta, campo por campo, cómo se llama la misma variable en el frontend, en la API y en la base de datos. Se lee de izquierda a derecha.

## Empezar

### Requisitos

- Docker Desktop (o Docker Engine con Compose v2).
- Node.js 24 o superior, solo si vas a trabajar con el código sin contenedores.

### 1. Variables de entorno

Desde la raíz del proyecto:

```bash
cp .env.example .env
```

Completa en `.env` las contraseñas y los secretos: `POSTGRES_PASSWORD`, `DATABASE_URL`, `SESSION_SECRET`, `JWT_SECRET`, `MINIO_ROOT_PASSWORD`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` y `BOOTSTRAP_*` (el usuario y la clave del primer administrador).

Para generar un secreto nuevo:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`.env` está ignorado por git, así que esos valores no salen del equipo.

### 2. Los cuatro contenedores, con un solo comando

```bash
docker compose up -d --build
```

Ese único comando construye las imágenes y deja el sistema completo en marcha:

| Servicio | Qué hace | Dónde queda |
|---|---|---|
| `postgres` | Base de datos | Red interna, puerto 5432 |
| `migrate` | Aplica las migraciones y los datos base, y termina | — |
| `api` | API NestJS, con prefijo `/api/v1` | `http://localhost:3000` |
| `minio` | Almacenamiento S3 para imágenes y comprobantes | Red interna, puerto 9000 |

`migrate` aparece como `Exited (0)`: eso es correcto, es un paso que se ejecuta una vez y termina.

### 3. Comprobar que quedó arriba

```bash
docker compose ps
curl http://localhost:3000/api/v1/salud
```

La sonda responde con `{"data":{"estado":"ok", ...}}` cuando la API y la base están sanas.

### 4. Primer administrador

La API arranca sin usuarios. El primero se crea una sola vez, tomando `BOOTSTRAP_EMAIL` y `BOOTSTRAP_PASSWORD` del `.env`:

```bash
docker compose --profile bootstrap run --rm bootstrap
```

Si vuelves a ejecutarlo, responde que ya existe un administrador y no cambia nada. Los demás usuarios se crean desde la aplicación, en **Usuarios**.

### 5. Aplicación

```bash
npm install
npm run front:dev
```

Queda en `http://localhost:5173`, que es el origen que espera `CORS_ALLOWED_ORIGIN`. Mientras termina la migración a la API, la SPA sigue guardando en `localStorage`.

### Comandos útiles

| Comando | Para qué |
|---|---|
| `docker compose logs -f api` | Ver la API en vivo |
| `docker compose run --rm cli ayuda` | Usar el CLI con IA sin dejarlo encendido |
| `docker compose down` | Detener sin perder datos |
| `docker compose down -v` | Detener y borrar los volúmenes |
| `npm run docker:arriba` / `docker:abajo` / `docker:limpiar` | Lo mismo, desde npm |

Los datos viven en los volúmenes `postgres_data` y `minio_data`, así que sobreviven a `docker compose down`.

### Dos detalles que conviene saber

- **MinIO**: la imagen oficial dejó de publicarse, así que el compose usa la última imagen archivada de Bitnami (`bitnamilegacy/minio`). Si tu equipo tiene un registro propio, cambia solo esa línea. Para abrir la consola desde el navegador, descomenta el mapeo de puertos del servicio y entra a `http://localhost:9001`.
- **CLI con IA**: no está siempre encendido, para no consumir recursos ni una clave cuando nadie lo usa. Se levanta solo cuando se invoca, con el perfil `cli`.

### Desarrollo local, sin contenedores para API y SPA

```bash
docker compose up -d postgres           # solo la base de datos
docker compose run --rm migrate         # aplica migraciones y datos base
npm install
npm run api:dev                         # http://localhost:3000
npm run front:dev                       # http://localhost:5173
```

Dos cosas que conviene tener presentes:

- La API no aplica migraciones al arrancar: se aplican con el paso `migrate` de arriba (o `npm run prisma:deploy --workspace ambie-backend`).
- Al correr la API fuera de Docker necesita sus propias variables: crea `Backend/.env` con `DATABASE_URL` apuntando a `localhost` (`postgresql://ambie:<clave>@localhost:5432/ambie?schema=public`), no al nombre del servicio del compose, y con el resto de secretos del `.env` de la raíz.

## Autenticación

El acceso usa dos tokens:

| Token | Vida | Dónde vive |
|---|---|---|
| Acceso | 15 minutos | Cookie `ambie_access` (navegador) o `Authorization: Bearer` (CLI) |
| Refresco | 7 días | Cookie `ambie_refresh`, o en el archivo del CLI |

El token de acceso es un JWT firmado, así que validarlo no toca la base de datos. El de refresco es opaco y se guarda hasheado: si alguien lee la base, no puede reconstruirlo. Y como se rota en cada uso, un token robado sirve una sola vez.

Las rutas de administración exigen rol de administrador: usuarios, cierre del día, egresos, ajustes de inventario, cambio de precios, compras y gastos.

## Probar la API

```bash
npm run prueba:humo
```

Recorre el camino completo: entrar, crear cliente, crear producto, registrar pedido, cobrar, contar inventario y previsualizar el cierre. Cada paso dice si pasó y por qué falló si no pasó.

```bash
npm run prueba:humo -- --url http://localhost:3000 --email admin@ambie.local --password tu-clave
```

## CLI con IA

El CLI habla con la API en lenguaje natural. El modelo consulta y registra datos mediante herramientas, y tú confirmas antes de que se escriba algo.

```bash
npm run api:cli -- preguntar "¿cuánto debe María?"
npm run api:cli -- rutas
npm run api:cli -- proveedores
```

Funciona con cualquier proveedor. Los gratuitos ya vienen configurados:

| Proveedor | Clave | Dónde se consigue |
|---|---|---|
| `ollama` | No hace falta | Corre en tu equipo, no sale nada a internet |
| `gemini` | Sí | console.ai.google.dev |
| `groq` | Sí | console.groq.com/keys |
| `openai` | Sí, de pago | platform.openai.com |
| `personalizado` | Según el caso | Cualquier API compatible con OpenAI |

Para usar uno:

```bash
npm run api:cli -- config proveedor=gemini
npm run api:cli -- preguntar "muéstrame los pedidos de hoy"
```

La clave se guarda en `~/.ambie/cli.json`, con permisos solo tuyos. También puedes pasarla por el entorno (`GEMINI_API_KEY`) o de paso (`--clave`), si prefieres no dejarla en el disco.

Si tienes tu propia conexión, se conecta por URL:

```bash
npm run api:cli -- config api="https://tu-servidor/v1" modelo="tu-modelo" clave_personalizado="tu-clave"
```

El CLI también genera pruebas:

```bash
npm run api:cli -- probar --proveedor gemini
```

Le da al modelo los endpoints reales de la API, este propone casos —casos felices, límites, reglas de negocio y permisos— y los ejecuta de verdad. Lo que no se puede comprobar queda marcado como fallido, sin adornos.

Más detalle en [docs/CLI.md](docs/CLI.md).

## Accesos

El negocio arranca vacío. Los primeros usuarios se crean a mano desde **Usuarios** en la aplicación, o con el bootstrap. No hay datos de demostración precargados.

## Qué se puede hacer

### Vendedor

- Crear clientes con los datos esenciales.
- Tomar un pedido en cuatro pasos: cliente, productos, entrega y pago.
- Consultar los pedidos del día.
- Cambiar el estado de un pedido y cobrarlo al entregarlo.
- Recibir abonos y ver los pedidos que debe cada cliente.

### Administración

- Ver ventas, compras, gastos, utilidad, crédito pendiente y alertas de stock, con filtro por fechas, cliente y vendedor.
- Consultar la serie diaria y los productos y clientes con más movimiento.
- Administrar pedidos, créditos, inventario, compras, precios, caja, cierre y usuarios.

## Cómo está organizada la aplicación

```text
Frontend/src/
├── components/   Componentes visuales reutilizables
├── context/      Estado compartido y operaciones del negocio
├── data/         Repositorios y almacenamiento local
├── dominio/      Reglas de negocio puras
├── modules/      Pantallas organizadas por módulo
├── screens/      Pantallas generales y acceso
├── types/        Tipos compartidos del dominio
└── utils/        Fechas, formato, paginación y otras utilidades
```

La separación es:

```text
pantalla → contexto/fachada → dominio → repositorios
```

Las pantallas no llevan reglas de negocio. Si una regla afecta pedidos, stock, caja o créditos, pasa por el dominio.

Mientras la migración a la API no termine, el frontend sigue leyendo y escribiendo en `localStorage` con el prefijo `ambie:v2:`. Los datos son locales a cada navegador: no se comparten entre equipos.

## Reglas importantes

- Cancelar un pedido revierte stock, cartera y caja. Reactivarlo vuelve a aplicar esos efectos; la reactivación se hace desde el detalle del pedido y lo devuelve al estado que tenía antes de cancelarse.
- Los pedidos cancelados quedan fuera de la cartera: no aparecen en Créditos ni en Abonos, y no admiten cobros.
- Los abonos generales se distribuyen al pedido más antiguo primero (FIFO). El cobro al entregar se aplica únicamente al pedido seleccionado.
- En un conteo parcial solo se ajustan los productos que se digitaron.
- El tablero excluye los pedidos cancelados de las ventas, para que la suma cuadre con la caja, que sí los revierte.
- Las fechas viajan como texto ISO. Los filtros de día usan `aaaa-mm-dd` y la fecha local es `America/Bogota`.
- Los saldos son derivados: se calculan con los abonos aplicados, no se guardan duplicados.
- Los consecutivos son globales, sin reinicio anual y sin huecos. Si una transacción falla, el número no se consume.
- Las imágenes y comprobantes ocupan espacio en `localStorage`; su capacidad es limitada.
- No se deben borrar ni reiniciar datos durante una prueba sin autorización explícita.

## Antes de hacer cambios

Consulta `AGENTS.md` para las convenciones del proyecto. En resumen:

- Reutiliza los componentes y utilidades existentes.
- Mantén las reglas de negocio fuera de los componentes visuales.
- Respeta el diseño mobile-first y el scroll interno.
- No cambies un enum sin actualizar `Compartido/` y correr `npm run contrato:verificar`.
- Ejecuta `npm run verificar` desde la raíz.
- Revisa también el resultado a 390×844 y 1440 px cuando cambies la interfaz.

## Documentos relacionados

- [Equivalencia de variables](EQUIVALENCIA_VARIABLES.txt)
- [CLI con IA](docs/CLI.md)
- [Imágenes de productos](Frontend/public/assets/productos/README.md)
- [Comprobantes](Frontend/public/assets/comprobantes/README.md)
