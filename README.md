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

Para este equipo Windows, consulta [almacenamiento en D: y límites de Docker](infra/windows/README.md).
El Compose declara límites de RAM y CPU por servicio; no elimina los volúmenes de datos.

### 1. Variables de entorno

Desde la raíz del proyecto:

```bash
test -f .env || cp .env.example .env
```

Completa en `.env` las contraseñas y los secretos: `POSTGRES_PASSWORD`, `DATABASE_URL`, `SESSION_SECRET`, `JWT_SECRET`, `MINIO_ROOT_PASSWORD`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` y `BOOTSTRAP_*` (el usuario y la clave del primer administrador).

Para generar un secreto nuevo:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

`.env` está ignorado por git, así que esos valores no salen del equipo.

Si ya existe `.env`, úsalo: no lo sobrescribas. En este equipo ya está configurado.

### 2. Servicios organizados, con un solo comando

```bash
docker compose up -d --build
```

Ese único comando construye las imágenes y deja el sistema completo en marcha:

| Servicio | Qué hace | Dónde queda |
|---|---|---|
| `frontend` | SPA compilada y Nginx con proxy a API/voz | `http://localhost:8080` |
| `postgres` | Base de datos | Red interna, puerto 5432 |
| `redis` | Caché efímera del tablero | Red interna, puerto 6379, sin publicar |
| `migrate` | Aplica las migraciones y los datos base, y termina | — |
| `api` | API NestJS, con prefijo `/api/v1` | `http://localhost:3000` |
| `minio` | Almacenamiento S3 para imágenes y comprobantes | Red interna, puerto 9000 |

`migrate` aparece como `Exited (0)`: eso es correcto, es un paso que se ejecuta una vez y termina.

El orden de arranque está declarado en `docker-compose.yml` con `depends_on`: primero `postgres` debe quedar sano; `migrate` aplica las migraciones y la semilla sobre esa base; la API sube cuando `migrate` termina con éxito (`service_completed_successfully`) y `redis` está iniciado; y `frontend` espera a que la API responda sano (`service_healthy`). El comando de arriba resuelve ese orden solo; no hay que levantar servicios a mano.

### 3. Comprobar que quedó arriba

```bash
docker compose ps
curl http://localhost:3000/api/v1/salud
```

La sonda responde con `{"data":{"estado":"ok", ...}}` cuando la API y la base están sanas.

### 4. Primer administrador

La semilla crea automáticamente **system**, un administrador de instalación para el desarrollador. Entra con usuario `system` y la contraseña privada `SYSTEM_PASSWORD`; si está vacía, la primera instalación reutiliza `BOOTSTRAP_PASSWORD` del `.env`. No hay contraseña universal. Usa una clave exclusiva y larga antes de exponer la instalación a Internet.

```bash
docker compose up -d --build
```

Desde **Usuarios**, system crea el primer administrador del negocio. Tiene todos los permisos y autenticación normal; API y BD impiden desactivarlo, degradarlo o eliminarlo. Repetir la semilla no cambia su contraseña ni reemplaza cuentas existentes. `SYSTEM_EMAIL` debe ser exclusivo. El bootstrap antiguo se conserva por compatibilidad, pero ya no es necesario. No compartas system para la operación cotidiana.

### 5. Aplicación

Abre [http://localhost:8080](http://localhost:8080). El frontend ya está dentro de su contenedor; no necesita Node/Vite en el equipo para funcionar.

Solo para desarrollar la interfaz fuera de Docker:

```bash
npm install
npm run front:dev
```

Vite queda en `http://localhost:5173`. La SPA usa la API existente por defecto; lee el `.env` raíz y aproxima `/api` al servidor mediante proxy. La versión desplegable usa Nginx en 8080, no Vite.

### Comandos útiles

| Comando | Para qué |
|---|---|
| `npm run docker:arriba` | Levantar y reconstruir todo el stack |
| `docker compose ps` / `npm run docker:estado` | Ver el estado de los servicios |
| `docker compose logs -f api` | Seguir los logs de la API en vivo |
| `docker compose logs -f api frontend` | Seguir API y frontend a la vez |
| `docker compose logs --tail 200 migrate` | Últimas 200 líneas de un servicio concreto |
| `npm run docker:logs` | Seguir los logs de todo el stack |
| `docker compose restart api` | Reiniciar solo la API (conserva los datos) |
| `docker compose run --rm cli --help` | Comprobar el CLI sin llamar a IA |
| `npm run docker:abajo` / `docker compose down` | Detener sin perder datos |
| `npm run docker:limpiar` / `docker compose down -v` | Detener y borrar los volúmenes |

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

### Caché y consistencia

React Query guarda lecturas en RAM durante cinco minutos, con frescura de 30 segundos y actualización en segundo plano. Cada página/filtro tiene su clave; las escrituras invalidan lecturas y cerrar/expirar una sesión cancela y vacía la caché. No se guardan estas respuestas en localStorage.

El tablero consume agregados SQL, no todo el historial de pedidos. Redis es interno, sin puerto publicado, con límite de 128 MB/0,5 CPU y hasta 64 MB de datos efímeros. `REDIS_MEMORY/CPUS` permiten ampliar recursos. No es una copia de respaldo ni almacena pedidos originales.

Los resultados duran cinco minutos. Las transacciones de pedidos, líneas, pagos, clientes, productos, compras y gastos actualizan `versionesCache` al confirmar; un rollback no cambia la versión. La clave incorpora esa revisión: los resultados antiguos dejan de ser utilizables y caducan solos, sin `FLUSHALL`. El cálculo usa una instantánea RepeatableRead; no puede guardar un resultado anterior bajo una revisión nueva. Si Redis no responde, se consulta PostgreSQL. Las rutas conservan autenticación y rol administrativo antes de acceder a caché.

`GET /api/v1/dashboard/totales` y `/dashboard/resumen` comparten el servicio. `data.cache.estado` indica `hit`/`miss`; `version` permite comprobar la invalidación. `soloTops=true` evita series enormes al consultar todo el histórico. Las series normales aceptan hasta 2000 días. Sin `CACHE_REDIS_URL` fuera de Docker se usa caché en memoria, no Redis.

Pruebas: `npm run prueba:cache`, `npm run prueba:integracion` y `npm run prueba:carga` contra QA. Las pestañas visibles consultan `/sincronizacion/revision` cada dos segundos e invalidan lecturas al cambiar una revisión confirmada en PostgreSQL. Las ocultas reanudan al volver. Es actualización casi en tiempo real (intervalo más latencia), no entrega instantánea garantizada. La banda «Datos compartidos / Actualizar» se retiró para recuperar espacio: la sincronización continúa y solo se muestra desconexión con **Reintentar** si falla. Las pantallas heredadas aún necesitan optimizar snapshots; estas pruebas no equivalen a validar 100.000 pedidos.

### Diagnósticos de TypeScript en VS Code

El backend declara `rootDir: ./src`, usa `module/moduleResolution: Node16` y no necesita `baseUrl`. El CLI redefine `rootDir: .` porque también incluye scripts fuera de `src`. TypeScript 6 cambió la inferencia de la raíz y dejó en desuso `baseUrl` y resolución `node10`; se migraron las opciones, sin ocultar avisos con `ignoreDeprecations`. Si VS Code sigue mostrando la configuración antigua, guarda el archivo y ejecuta **TypeScript: Restart TS Server**; si persiste, **Developer: Reload Window**. Comprueba que abriste esta carpeta y no otra copia del proyecto.

El acceso usa dos tokens:

| Token | Vida | Dónde vive |
|---|---|---|
| Acceso | 15 minutos | Cookie `ambie_access` (navegador) o `Authorization: Bearer` (CLI) |
| Refresco | 7 días | Cookie `ambie_refresh`, o en el archivo del CLI |

La firma del JWT se verifica localmente; además, cada solicitud consulta sesión y usuario para aplicar revocaciones, actividad y rol actual. El token de refresco es opaco, se almacena hasheado y se rota en cada uso.

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

Más detalle en [docs/info/CLI.md](docs/info/CLI.md).

## Accesos

Una instalación nueva arranca vacía, con el acceso técnico system y los catálogos base. Los usuarios del negocio se crean desde **Usuarios**. La semilla no precarga pedidos, productos ni clientes de demostración. El catálogo ficticio optativo y su preparación QA se explican a continuación.

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

## Instalación local y traslado al VPS

Cada instalación sirve a **una sola empresa** y a sus usuarios internos. Se usa la misma arquitectura en PC, servidor local o VPS; no hay tenants ni administración multiempresa. Para más usuarios se amplían recursos del servidor, manteniendo consultas acotadas y respaldos.

Desde la raíz, con Docker Desktop iniciado y el `.env` existente:

```powershell
powershell -ExecutionPolicy Bypass -File infra/desplegar.ps1
```

El script construye las imágenes, respalda PostgreSQL si ya está funcionando, aplica las migraciones existentes y espera la salud de los servicios. No elimina volúmenes ni llama proveedores de IA. Todos quedan en el proyecto `capturador_pedidos_20`: frontend/Nginx, API, PostgreSQL, Redis, MinIO y una sola voz local. CLI y Cloudflare son optativos.

Enlaces para validar:

- [Aplicación / acceso Administrador y Vendedor](http://localhost:8080/)
- [Administrador](http://localhost:8080/admin)
- [Vendedor](http://localhost:8080/vendedor)
- [Salud del frontend](http://localhost:8080/salud)
- [Salud de API y PostgreSQL a través de Nginx](http://localhost:8080/api/v1/salud)
- [Diagnóstico directo de API, solo en este servidor](http://localhost:3000/api/v1/salud)

Usa tus accesos existentes; no se publican contraseñas en esta guía. Los puertos cambian si defines `FRONTEND_PORT` o `PORT`. No hace falta ejecutar Vite para usar esta versión. `npm run front:dev` es solo desarrollo ([localhost:5173](http://localhost:5173/)).

Desde el celular en la **misma red**, abre `http://IP_DEL_PC:8080`. Puedes consultar la IPv4 con `ipconfig`. Si Windows bloquea la conexión, permite TCP 8080 únicamente en la red privada; no desactives el firewall ni publiques PostgreSQL/MinIO. No se abre el firewall automáticamente. Los pedidos funcionan por HTTP local; el micrófono del navegador en el celular necesita HTTPS, salvo excepciones de desarrollo del dispositivo.

En el VPS instala Docker Engine y Compose v2 compatible con `!override` (2.24.4 o posterior), clona el repositorio y crea un `.env` propio desde `.env.example`, con secretos nuevos y direcciones internas Docker. No subas `.env` ni `.local` al repositorio. Ejecuta:

```bash
sh infra/desplegar.sh
# Después de publicar correcciones en tu repositorio:
sh infra/desplegar.sh --actualizar
```

`--actualizar` exige un árbol limpio y usa `git pull --ff-only`; nunca descarta cambios locales. En Windows el equivalente es `infra/desplegar.ps1 -Actualizar`. Revisa `docker compose ps` y la sonda `/api/v1/salud` después de cada actualización. Los respaldos quedan en `.local/backups/`; copia también fuera del servidor los volúmenes de MinIO/configuración y conserva los secretos de cifrado. Un respaldo creado no sustituye ensayar su restauración. Antes de revertir una versión, revisa la compatibilidad de sus migraciones; nunca restaures automáticamente una BD con pedidos nuevos.

### Cloudflare opcional, sin modificar el entorno local

El servicio `cloudflared` está preparado pero no se inicia por defecto. Cuando dispongas de dominio administrado en Cloudflare y un túnel:

1. Guarda **solo el token del túnel** en `.local/cloudflare-token`, sin compartirlo ni subirlo a Git. En Linux restringe `.local` a tu usuario (`chmod 700 .local`) y permite lectura del archivo montado al usuario no privilegiado de cloudflared; no pongas el token como argumento visible en la consola.
2. Publica el hostname elegido con servicio interno `http://frontend:8080`, no `localhost` dentro del contenedor.
3. En `.env` configura `APP_ORIGIN=https://pedidos.tudominio.com`, `CORS_ALLOWED_ORIGIN=https://pedidos.tudominio.com`, `COOKIE_SECURE=true` y `FRONTEND_BIND=127.0.0.1`. En este modo el acceso es HTTPS por el dominio, no HTTP local con cookies seguras.
4. Ejecuta `docker compose --profile voz --profile cloudflare up -d --wait`. No abras 3000, 5432 ni 9000 hacia Internet. Verifica sesión, archivos y WebSocket `/api/v1/asistente/voz` por el dominio.

El registro del dominio y la creación del túnel requieren tu cuenta y configuración; no se compró ni publicó nada. Cloudflare ofrece registro para dominios admitidos; comprueba disponibilidad y precio antes de adquirirlo. Referencias: [crear el túnel](https://developers.cloudflare.com/tunnel/get-started/), [parámetros de ejecución](https://developers.cloudflare.com/tunnel/reference/run-parameters/) y [Cloudflare Registrar](https://developers.cloudflare.com/registrar/).

### Recursos y pruebas

Redis añade un límite de 128 MB y 0,5 CPU (`REDIS_MEMORY/CPUS`); permite hasta 64 MB de caché con expulsión LRU. PostgreSQL sigue siendo la fuente de verdad.

Frontend: 128 MB/0,5 CPU; API, PostgreSQL y voz: 512 MB/1 CPU por servicio; MinIO: 384 MB/0,5 CPU. Los límites son por contenedor, no reservas de memoria. En un VPS con más capacidad ajústalos en `.env`: `FRONTEND_MEMORY/CPUS`, `API_MEMORY/CPUS`, `POSTGRES_MEMORY/CPUS`, `MINIO_MEMORY/CPUS`, `VOZ_MEMORY/CPUS`; aplica con `docker compose --profile voz up -d`. No hace falta editar el código ni Compose para ampliar recursos. Conserva RAM disponible para el sistema operativo. Los volúmenes utilizan el almacenamiento de Docker: en este PC está trasladado a D:, en Linux configura el disco de Docker antes de importar datos.

```bash
npm run verificar
npm run prueba:cache
docker compose -p ambie-integracion -f docker-compose.yml -f docker-compose.pruebas.yml up -d --wait
npm run prueba:integracion
```

La instancia QA usa otro proyecto/volúmenes y puerto [8180](http://localhost:8180/) para el frontend, 3100 para API. Termina con `docker compose -p ambie-integracion -f docker-compose.yml -f docker-compose.pruebas.yml --profile voz down` **sin `-v`**, incluyendo el servicio opcional de voz. No ejecutes pruebas que escriben contra la base del negocio. La configuración portátil queda lista para el VPS, pero una prueba local no acredita conectividad, firewall, DNS ni HTTPS del servidor remoto.

En Windows, con QA arriba, `node --env-file=.env Backend/scripts/probar-cache-caida.cjs` detiene únicamente Redis de `ambie-integracion`, escribe un gasto QA, verifica los totales y restaura Redis en `finally`. No ejecutes esa prueba contra producción. Al actualizar el frontend, recarga las pestañas abiertas para usar la nueva compilación.

## Organización del código

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

El modo predeterminado usa la API: sesión con cookies, datos compartidos entre dispositivos y escrituras confirmadas antes de cerrar formularios. `VITE_API_BASE_URL=/api` se normaliza a `/api/v1`; `API_PROXY_TARGET` apunta por defecto a `http://localhost:3000`. Para conservar el modo local explícito usa `VITE_DATOS_ORIGEN=local`. Las claves existentes `ambie:v2:` no se borran ni se importan automáticamente a PostgreSQL.

## Reglas importantes

- Cancelar un pedido abierto revierte reservas, aplicaciones de pagos y caja en una transacción. La API no permite cancelar entregados ni reactivar cancelados; la interfaz respeta sus transiciones. La reactivación histórica solo sigue disponible en el modo local.
- Los pedidos cancelados quedan fuera de la cartera: no aparecen en Créditos ni en Abonos, y no admiten cobros.
- Los abonos generales se distribuyen al pedido más antiguo primero (FIFO). El cobro al entregar se aplica únicamente al pedido seleccionado.
- En un conteo parcial solo se ajustan los productos que se digitaron.
- El tablero excluye los pedidos cancelados de las ventas, para que la suma cuadre con la caja, que sí los revierte.
- Las fechas viajan como texto ISO. Los filtros de día usan `aaaa-mm-dd` y la fecha local es `America/Bogota`.
- Los saldos son derivados: se calculan con los abonos aplicados, no se guardan duplicados.
- Los consecutivos son globales, sin reinicio anual y sin huecos. Si una transacción falla, el número no se consume.
- En modo API, imágenes y comprobantes viven en MinIO privado y se descargan con autenticación. Se validan firma, formato y máximo de 5 MB. En modo local todavía ocupan espacio limitado en `localStorage`.
- No se deben borrar ni reiniciar datos durante una prueba sin autorización explícita.

## Antes de hacer cambios

Resultados y límites de concurrencia: [pruebas de carga y sincronización](docs/info/PRUEBAS_CARGA.md). QA eleva su límite antiabuso para medir persistencia; producción conserva el configurado en `.env`.

Para publicar desde la rama principal hacia un servidor local o VPS, consulta [despliegue continuo](docs/info/DESPLIEGUE_CONTINUO.md). Queda desactivado hasta configurar el runner y `DEPLOY_ENABLED` en GitHub.

Si una corrección cambia fórmulas o la estructura de los agregados, incrementa el prefijo de formato `v1` de las claves en `DashboardService` junto con el contrato. Así no se reutilizan resultados de la implementación anterior durante sus cinco minutos de vida.

Consulta `AGENTS.md` para las convenciones del proyecto; la [constitución](docs/constitucion/01_stack_y_reglas.md) fija las reglas vigentes, la arquitectura, los estándares y el roadmap. En resumen:

- Reutiliza los componentes y utilidades existentes.
- Mantén las reglas de negocio fuera de los componentes visuales.
- Respeta el diseño mobile-first y el scroll interno.
- No cambies un enum sin actualizar `Compartido/` y correr `npm run contrato:verificar`.
- Ejecuta `npm run verificar` desde la raíz.
- Revisa también el resultado a 390×844 y 1440 px cuando cambies la interfaz.

## Documentos relacionados

La documentación vive en `docs/` en dos zonas:

**`docs/constitucion/` — reglas vigentes (normativo).** Las lee cualquier persona o agente **antes** de tocar el proyecto.

| Archivo | Contenido |
|---|---|
| [01_stack_y_reglas.md](docs/constitucion/01_stack_y_reglas.md) | Tecnologías exactas y reglas no negociables (negocio, datos, seguridad, pruebas). |
| [02_arquitectura.md](docs/constitucion/02_arquitectura.md) | Estructura del monorepo, patrones por capa, caché, sincronización y runtime. |
| [03_estandares_codigo.md](docs/constitucion/03_estandares_codigo.md) | Nombres, TypeScript, manejo de errores, fechas/dinero, UI y Git. |
| [04_roadmap_y_tareas.md](docs/constitucion/04_roadmap_y_tareas.md) | Objetivo vigente, tareas completadas y pendientes por fases. |

**`docs/info/` — documentación técnica e histórica (referencia).** Documentos preservados tal cual; citan rutas antiguas del estilo `docs/X.md`, que desde esta reorganización equivalen a `docs/info/X.md`.

| Documento | Contenido |
|---|---|
| [arquitectura-backend.md](docs/info/arquitectura-backend.md) | Diseño original del backend y límites de la v1. |
| [AUDITORIA_PROFESIONAL.md](docs/info/AUDITORIA_PROFESIONAL.md) | Evidencia ejecutada de las validaciones (con fechas). |
| [CLI.md](docs/info/CLI.md) | Manual del CLI con IA. |
| [DESPLIEGUE_CONTINUO.md](docs/info/DESPLIEGUE_CONTINUO.md) | Publicación desde el repositorio hacia el servidor. |
| [diccionario-contrato-api.md](docs/info/diccionario-contrato-api.md) | Contrato de la API por ruta. |
| [modelo-datos.md](docs/info/modelo-datos.md) | Mapeo frontend → base de datos. |
| [OPORTUNIDADES_MEJORA.md](docs/info/OPORTUNIDADES_MEJORA.md) | Revisión completa con IDs (FE-/BE-/API-/BD-/INF-/NEG-) y roadmap detallado. |
| [PRUEBAS_CARGA.md](docs/info/PRUEBAS_CARGA.md) | Resultados de carga y límites antiabuso. |

> Regla de convivencia: si un documento de `info/` contradice a `constitucion/`, gana `constitucion/`; el documento histórico se conserva como evidencia, no como norma.

### Validación de paneles y catálogo ficticio

Los paneles conservan los registros y formularios durante el refresco en segundo plano, sin recargar el navegador. Las listas muestran hasta 30 registros por página; los selectores y pendientes extensos se acotan a 30 y ofrecen búsqueda. El límite es visual: los saldos, totales y abonos FIFO siguen incluyendo todos los registros. Al reducir la altura se desplaza el panel exterior, sin aplastar las tarjetas ni el área de registros.

Pruebas de navegador requieren Chrome instalado y las dependencias de desarrollo (`npm install` desde la raíz). En PowerShell usar `npm.cmd`:

```powershell
npm.cmd run prueba:asistente:ui
docker compose -p ambie-integracion -f docker-compose.yml -f docker-compose.pruebas.yml --profile voz up -d --build --wait
$env:BASE_PRUEBAS_API='http://localhost:3100/api/v1'
npm.cmd run prueba:integracion
npm.cmd run demo:catalogo
npm.cmd run prueba:paneles
npm.cmd run prueba:voz
docker compose -p ambie-integracion -f docker-compose.yml -f docker-compose.pruebas.yml --profile voz down
```

`prueba:asistente:ui` usa respuestas de API/transcripciones simuladas, micrófono artificial y los componentes compilados reales. `prueba:paneles` usa Chrome y Nginx/API/PostgreSQL QA reales; verifica todos los módulos, filtros, retroceso de formularios, scroll y estabilidad ante sincronizaciones a 390×844, 390×320 y 1440×320. También crea dos productos y una venta exclusivamente QA, cambia sus precios y comprueba la factura histórica después de recargar. Conserva esos registros. Capturas privadas en `.local/pruebas-ui`. No sustituye probar micrófono físico, acentos y ruido reales.

`demo:catalogo` carga 32 productos (Coca-Cola, Pepsi, papas, Doritos, De Todito, jugos naturales, sándwiches, entre otros), 8 clientes **ficticios** y pedidos con cantidades, estados y pagos variados. No contactes sus teléfonos ni trates esas ventas como reales. Repetirlo reutiliza nombres/teléfonos y las combinaciones de pedido ya existentes. `--solo-catalogo` omite los pedidos. No borra ejemplos anteriores ni se ejecuta automáticamente. Si se autoriza una instalación local de demostración, desde el host: `BASE_PRUEBAS_API=http://localhost:8080/api/v1` y `npm run demo:catalogo -- --demo-local-autorizado`. No usar en una empresa con datos reales para hacer pruebas.

### Venta abierta y voz local

Consulta la [guía de pruebas de dictado y configuración de Google Gemini](docs/info/PRUEBAS_VOZ_Y_GEMINI.md). El catálogo se puede consultar antes de guardar y sin escribir primero un modelo. El diagnóstico del micrófono permite ver la transcripción local sin crear pedidos.

La venta abierta registra un pedido y una factura sin crear un cliente. Solo admite efectivo o billetera; el crédito se bloquea también en la API y PostgreSQL.

Para activar el reconocimiento de voz en Docker:

```bash
docker compose --profile voz up -d --build
```

Todos estos servicios quedan agrupados bajo `capturador_pedidos_20` (nombre fijo en Compose). Solo se necesita una instancia de `voz`; no crear contenedores de reconocimiento independientes con `docker run`. API, BD y archivos permanecen separados dentro del mismo proyecto. Ver [organización y pruebas aisladas](infra/README.md).

El administrador configura el asistente desde **Configuración**. El modo básico funciona sin clave ni consumo externo; también puede elegir proveedor, modelo y su propia clave. Vosk transcribe español localmente, con un límite de 512 MB y un núcleo. El audio no se guarda. La voz de respuesta utiliza una voz española local instalada en el dispositivo; si no existe, se muestra el texto.

Tocar el micrófono activa la escucha; tocarlo de nuevo la detiene. Se mueve arrastrándolo o con las flechas del teclado. La conversación pregunta los datos por pasos y completa los controles de las pantallas existentes, sin formularios ni modal propios del asistente. Se puede quitar y volver a agregar productos. **Confirmar operación** utiliza el mismo guardado de la pantalla después de revisar los datos; **cancelar operación** descarta el borrador. Los sonidos diferencian procesamiento, revisión lista y guardado exitoso. Los cambios de estado usan las mismas reglas de Pedidos: no se borra una factura emitida ni se anula una venta entregada fuera de esas reglas.

En pedidos puedes decir directamente el nombre exacto de un cliente único, sin responder primero habitual u ocasional: se selecciona y avanza a productos. La selección manual conserva **confirmar cliente**, que no guarda. Puedes corregir diciendo **cambiar cliente a Isabel Rojas**, **volver**, **volver a cliente**, **volver a productos**, **volver al pago** y **continuar**, o usar los botones normales; se conserva el borrador. Un nombre inexistente o ambiguo no selecciona un registro al azar. La venta ocasional sigue sin admitir crédito.

En productos puedes dictar **dos Pepsi cuatrocientos mililitros y tres Doritos queso**, o **quiero cinco yogures de durazno y uno de fresa**. Se admiten plurales y nombres parciales cuando identifican un solo producto. Si hay varias presentaciones, pregunta cuál quieres y conserva las cantidades mientras aclaras; nunca elige una al azar ni modifica medidas numéricas. La escucha agrupa segmentos y espera 2,2 segundos sin nuevas transcripciones antes de responder; una pausa más larga inicia otro turno, que puede agregar más productos. El asistente confirma brevemente los cambios, sin leer toda la lista, y espera **confirmar productos** para pasar a entrega. **Quita Pepsi 400 ml** elimina esa línea; **reemplaza por dos Pepsi 400 ml** sustituye la lista completa. Cantidades inválidas, productos desconocidos o stock insuficiente no reemplazan el borrador. La confirmación final sigue siendo **confirmar operación**.

Antes del pago se muestran todas las líneas con cantidad, precio unitario y subtotal en la misma tarjeta del pedido. Las listas de pedidos incluyen una vista breve de productos; al abrir un pedido se ve el detalle completo con sus precios históricos. Los avisos del asistente ocupan como máximo dos líneas, tienen fondo semitransparente, no bloquean controles y desaparecen después de 3,5 segundos.

Si indicas productos, preparación y pago juntos, conserva esos datos; **confirmar operación** revisa y muestra los pasos completos antes de usar el guardado normal. Si falta algo, lo pregunta y no guarda. Después de guardar por voz vuelve al inicio de Ventas y ofrece otro pedido, crear cliente o recibir abono; **Ver factura del pedido confirmado** conserva el acceso al detalle. El guardado manual mantiene su pantalla de éxito. V4P1 es la rama de estos ajustes, creada desde V3; no implica otra base de datos ni otra instalación del negocio.

La pantalla final y el detalle del pedido muestran todas las líneas, cantidades, precios unitarios y subtotales guardados en PostgreSQL. No recalculan facturas históricas con precios nuevos del catálogo. La venta ocasional también muestra su detalle; si falla la lectura posterior al guardado, permite reintentar sin volver a registrar el pedido.

En VPS se necesita HTTPS y un proxy que permita WebSocket para `/api/v1/asistente/voz`. El contenedor de voz no publica un puerto. En desarrollo sin Docker para la API, `VOZ_STT_URL` debe apuntar al servicio local de voz. La configuración cifrada se conserva en el volumen `asistente_config`; respalda ese volumen y conserva `ASISTENTE_CONFIG_SECRET` (o `JWT_SECRET` si no se configuró otro secreto). El CLI sigue independiente.

```bash
npm run prueba:asistente
npm run verificar
```

- [Equivalencia de variables](EQUIVALENCIA_VARIABLES.txt)
- [Pruebas aisladas y contenedor CLI/VPS](infra/README.md)
- [Imágenes de productos](Frontend/public/assets/productos/README.md)
- [Comprobantes](Frontend/public/assets/comprobantes/README.md)
