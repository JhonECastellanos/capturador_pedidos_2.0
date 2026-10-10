# Guía completa de instalación y desarrollo

Contenido trasladado del README el 10/10/2026. Se conserva íntegro como referencia; las cifras y pendientes históricos corresponden a las fechas de sus secciones. Las novedades de CSV y descuadres se explican en [guardado y conciliación](GUARDADO_Y_CONCILIACION_V4P2.md).

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

Para este equipo Windows, consulta [almacenamiento en D: y límites de Docker](../../infra/windows/README.md).
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
| `frontend` | SPA compilada y Nginx con proxy a API | `http://localhost:8080` |
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
| `npm run docker:abajo` / `docker compose down` | Detener sin perder datos |
| `npm run docker:limpiar` / `docker compose down -v` | Detener y borrar los volúmenes |

Los datos viven en los volúmenes `postgres_data` y `minio_data`, así que sobreviven a `docker compose down`.

### Dos detalles que conviene saber

- **MinIO**: la imagen oficial dejó de publicarse, así que el compose usa la última imagen archivada de Bitnami (`bitnamilegacy/minio`). Si tu equipo tiene un registro propio, cambia solo esa línea. Para abrir la consola desde el navegador, descomenta el mapeo de puertos del servicio y entra a `http://localhost:9001`.

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

El backend usa `rootDir: ./src` y `module/moduleResolution: Node16`. `Backend/tsconfig.scripts.json` comprueba los scripts fuera de `src`, sin emitir archivos. Si VS Code muestra diagnósticos antiguos, ejecutar **TypeScript: Restart TS Server** y comprobar la carpeta abierta.

### Autenticación

El acceso usa dos tokens:

| Token | Vida | Dónde vive |
|---|---|---|
| Acceso | 15 minutos | Cookie `ambie_access` o Bearer para integraciones |
| Refresco | 7 días | Cookie `ambie_refresh`; registro hasheado en PostgreSQL |

La firma del JWT se verifica localmente; además, cada solicitud consulta sesión y usuario para aplicar revocaciones, actividad y rol actual. El token de refresco es opaco, se almacena hasheado y se rota en cada uso.

Las rutas de administración exigen rol de administrador: usuarios, cierre del día, egresos, ajustes de inventario, cambio de precios, compras y gastos.

## Probar la API

```bash
npm run prueba:humo -- --url http://localhost:3100/api/v1
```

Recorre el camino completo: entrar, crear cliente, crear producto, registrar pedido, cobrar, contar inventario y previsualizar el cierre. Cada paso dice si pasó y por qué falló si no pasó.

```bash
npm run prueba:humo -- --url http://localhost:3100/api/v1 --email admin@ambie.local --password tu-clave
```

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
- Consultar ventas, gastos, compras, compras más gastos y ticket promedio del mes calendario en Inicio. El detalle de los gráficos aparece al pasar el mouse o enfocar un punto.
- Registrar una sola vez el inventario inicial desde Inventario, usando el conteo guiado y la confirmación existentes; comparar cantidades y costos de partida con el stock y sus movimientos.
- Administrar pedidos, créditos, inventario, compras, precios, caja, cierre y usuarios.

El [diccionario de datos](DICCIONARIO_DATOS_V4P2.md) describe cada tabla y campo. El [flujo de guardado y conciliación](GUARDADO_Y_CONCILIACION_V4P2.md) explica los reintentos sin duplicar documentos, las transacciones y las consultas SQL para contrastar la información visible con PostgreSQL.

La [guía de validación de formularios](VALIDACION_FORMULARIOS_Y_BASE_DATOS.md) permite comprobar los datos digitados, las líneas, pagos, caja, inventario y las tarjetas del mes mediante consultas de lectura.

La [validación de V4P2](VALIDACION_CAMBIOS_V4P2.md) reúne los ejercicios realizados, tiempos de confirmación y sincronización, carga concurrente y comprobaciones para repetir el recorrido.


## Instalación local y traslado al VPS

Cada instalación sirve a **una sola empresa** y a sus usuarios internos. Se usa la misma arquitectura en PC, servidor local o VPS; no hay tenants ni administración multiempresa. Para más usuarios se amplían recursos del servidor, manteniendo consultas acotadas y respaldos.

Desde la raíz, con Docker Desktop iniciado y el `.env` existente:

```powershell
powershell -ExecutionPolicy Bypass -File infra/desplegar.ps1
```

El script construye las imágenes, respalda PostgreSQL si ya está funcionando, aplica las migraciones existentes y espera la salud de los servicios. No elimina volúmenes y conserva los datos existentes. Todos quedan en el proyecto `capturador_pedidos_20`: frontend/Nginx, API, PostgreSQL, Redis y MinIO. Cloudflare es optativo.

Enlaces para validar:

- [Aplicación / acceso Administrador y Vendedor](http://localhost:8080/)
- [Administrador](http://localhost:8080/admin)
- [Vendedor](http://localhost:8080/vendedor)
- [Salud del frontend](http://localhost:8080/salud)
- [Salud de API y PostgreSQL a través de Nginx](http://localhost:8080/api/v1/salud)
- [Diagnóstico directo de API, solo en este servidor](http://localhost:3000/api/v1/salud)

Usa tus accesos existentes; no se publican contraseñas en esta guía. Los puertos cambian si defines `FRONTEND_PORT` o `PORT`. No hace falta ejecutar Vite para usar esta versión. `npm run front:dev` es solo desarrollo ([localhost:5173](http://localhost:5173/)).

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

El registro del dominio y la creación del túnel requieren tu cuenta y configuración; no se compró ni publicó nada. Cloudflare ofrece registro para dominios admitidos; comprueba disponibilidad y precio antes de adquirirlo. Referencias: [crear el túnel](https://developers.cloudflare.com/tunnel/get-started/), [parámetros de ejecución](https://developers.cloudflare.com/tunnel/reference/run-parameters/) y [Cloudflare Registrar](https://developers.cloudflare.com/registrar/).

### Recursos y pruebas

Redis añade un límite de 128 MB y 0,5 CPU (`REDIS_MEMORY/CPUS`); permite hasta 64 MB de caché con expulsión LRU. PostgreSQL sigue siendo la fuente de verdad.

Frontend: 128 MB/0,5 CPU; API y PostgreSQL: 512 MB/1 CPU por servicio; MinIO: 384 MB/0,5 CPU. Los límites son por contenedor, no reservas de memoria. En un servidor con más capacidad ajústalos en `.env`: `FRONTEND_MEMORY/CPUS`, `API_MEMORY/CPUS`, `POSTGRES_MEMORY/CPUS`, `MINIO_MEMORY/CPUS`; aplica con `docker compose up -d`. No hace falta editar el código ni Compose para ampliar recursos. Conserva RAM disponible para el sistema operativo. Los volúmenes utilizan el almacenamiento de Docker: en este PC está trasladado a D:, en Linux configura el disco de Docker antes de importar datos.

```bash
npm run verificar
npm run prueba:cache
docker compose -p ambie-integracion -f docker-compose.yml -f docker-compose.pruebas.yml up -d --wait
npm run prueba:integracion
```

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

Resultados y límites de concurrencia: [pruebas de carga y sincronización](PRUEBAS_CARGA.md). QA eleva su límite antiabuso para medir persistencia; producción conserva el configurado en `.env`.

La [validación de guardado V4P2](VALIDACION_GUARDADO_V4P2.md) reúne tiempos de respuesta, comprobaciones directas en PostgreSQL y aparición automática en otra sesión. También documenta un pendiente: reenviar la misma solicitud puede duplicar una venta. Ante una respuesta dudosa, consulta el pedido antes de confirmarlo nuevamente.

Para publicar desde la rama principal hacia un servidor local o VPS, consulta [despliegue continuo](DESPLIEGUE_CONTINUO.md). Queda desactivado hasta configurar el runner y `DEPLOY_ENABLED` en GitHub.

Si una corrección cambia fórmulas o la estructura de los agregados, incrementa el prefijo de formato `v1` de las claves en `DashboardService` junto con el contrato. Así no se reutilizan resultados de la implementación anterior durante sus cinco minutos de vida.

Consulta `AGENTS.md` para las convenciones del proyecto; la [constitución](../constitucion/01_stack_y_reglas.md) fija las reglas vigentes, la arquitectura, los estándares y el roadmap. En resumen:

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
| [01_stack_y_reglas.md](../constitucion/01_stack_y_reglas.md) | Tecnologías exactas y reglas no negociables (negocio, datos, seguridad, pruebas). |
| [02_arquitectura.md](../constitucion/02_arquitectura.md) | Estructura del monorepo, patrones por capa, caché, sincronización y runtime. |
| [03_estandares_codigo.md](../constitucion/03_estandares_codigo.md) | Nombres, TypeScript, manejo de errores, fechas/dinero, UI y Git. |
| [04_roadmap_y_tareas.md](../constitucion/04_roadmap_y_tareas.md) | Objetivo vigente, tareas completadas y pendientes por fases. |

**`docs/info/` — documentación técnica e histórica (referencia).** Documentos preservados tal cual; citan rutas antiguas del estilo `docs/X.md`, que desde esta reorganización equivalen a `docs/info/X.md`.

| Documento | Contenido |
|---|---|
| [arquitectura-backend.md](arquitectura-backend.md) | Diseño original del backend y límites de la v1. |
| [AUDITORIA_PROFESIONAL.md](AUDITORIA_PROFESIONAL.md) | Evidencia ejecutada de las validaciones (con fechas). |
| [DESPLIEGUE_CONTINUO.md](DESPLIEGUE_CONTINUO.md) | Publicación desde el repositorio hacia el servidor. |
| [diccionario-contrato-api.md](diccionario-contrato-api.md) | Contrato de la API por ruta. |
| [modelo-datos.md](modelo-datos.md) | Mapeo frontend → base de datos. |
| [OPORTUNIDADES_MEJORA.md](OPORTUNIDADES_MEJORA.md) | Revisión completa con IDs (FE-/BE-/API-/BD-/INF-/NEG-) y roadmap detallado. |
| [PRUEBAS_CARGA.md](PRUEBAS_CARGA.md) | Resultados de carga y límites antiabuso. |

> Regla de convivencia: si un documento de `info/` contradice a `constitucion/`, gana `constitucion/`; el documento histórico se conserva como evidencia, no como norma.

### Validación de paneles y catálogo ficticio

Los paneles conservan los registros y formularios durante el refresco en segundo plano, sin recargar el navegador. Las listas muestran hasta 30 registros por página; los selectores y pendientes extensos se acotan a 30 y ofrecen búsqueda. El límite es visual: los saldos, totales y abonos FIFO siguen incluyendo todos los registros. Al reducir la altura se desplaza el panel exterior, sin aplastar las tarjetas ni el área de registros.

Pruebas de navegador requieren Chrome instalado y las dependencias de desarrollo (`npm install` desde la raíz). En PowerShell usar `npm.cmd`:

```powershell
docker compose -p ambie-integracion -f docker-compose.yml -f docker-compose.pruebas.yml up -d --build --wait
$env:BASE_PRUEBAS_API='http://localhost:3100/api/v1'
npm.cmd run prueba:integracion
npm.cmd run demo:catalogo
npm.cmd run prueba:paneles
docker compose -p ambie-integracion -f docker-compose.yml -f docker-compose.pruebas.yml down
```

`demo:catalogo` carga 32 productos (Coca-Cola, Pepsi, papas, Doritos, De Todito, jugos naturales, sándwiches, entre otros), 8 clientes **ficticios** y pedidos con cantidades, estados y pagos variados. No contactes sus teléfonos ni trates esas ventas como reales. Repetirlo reutiliza nombres/teléfonos y las combinaciones de pedido ya existentes. `--solo-catalogo` omite los pedidos. No borra ejemplos anteriores ni se ejecuta automáticamente. Si se autoriza una instalación local de demostración, desde el host: `BASE_PRUEBAS_API=http://localhost:8080/api/v1` y `npm run demo:catalogo -- --demo-local-autorizado`. No usar en una empresa con datos reales para hacer pruebas.

### Venta ocasional y detalle del pedido

La venta ocasional registra un pedido y una factura sin crear un cliente. Solo admite efectivo o billetera; el crédito se bloquea en la API y PostgreSQL.

La pantalla final y el detalle muestran todas las líneas, cantidades, precios unitarios y subtotales guardados. No recalculan facturas históricas con precios nuevos del catálogo. Si falla la lectura posterior al guardado, se reintenta sin registrar otro pedido.

Configuración conserva su ruta administrativa y permite acceder a Usuarios y Auditoría.

- [Equivalencia de variables](../../EQUIVALENCIA_VARIABLES.txt)
- [Imágenes de productos](../../Frontend/public/assets/productos/README.md)
- [Comprobantes](../../Frontend/public/assets/comprobantes/README.md)

## Agentes V6P4: implementación y pruebas por etapas

La primera etapa utiliza Híbrido: reconocimiento local de audio y un proveedor remoto para interpretar la instrucción. Local y API Live tienen su configuración separada. No se descarga ningún modelo de Ollama al construir, iniciar o guardar ajustes. API Live todavía no inicia una conversación nativa; se valida después del circuito Híbrido.

Configuración > Agentes IA permite agregar proveedores, conservar o retirar claves, consultar modelos, probar llamadas con herramientas, seleccionar voz del navegador, transcribir archivos y ensayar instrucciones sin crear documentos comerciales. Las claves se cifran en el servidor y no regresan al navegador. El asistente solo solicita el micrófono al pulsar Hablar; cerrar el panel o terminar la sesión detiene la captura.

El texto interpretado abre el detalle de los formularios existentes. Las correcciones mantienen el borrador y la confirmación utiliza sus mismos guardados. La API vuelve a resolver productos, permisos y precios antes de confirmar. Si un precio cambia entre revisión y escritura, devuelve 409 sin registrar el pedido; debe revisarse nuevamente. Los pedidos manuales también aprovechan esta comprobación.

### Orden de validación

1. Ejecutar `npm run verificar` y `npm run prueba:agentes`. Las pruebas aisladas utilizan catálogo en memoria y proveedor simulado; no demuestran funcionamiento de una API real.
2. Ejecutar `python Agentes/voz/probar_autorizacion.py`: firma, expiración, límite de conexiones y autorización de un solo uso, sin descargar modelos.
3. En QA, aplicar la migración aditiva de configuración. Configurar `VOICE_AGENT_TOKEN` privado y `AGENT_CONFIG_SECRET` estable, ambos con al menos 32 caracteres. Conservarlos fuera del repositorio. La voz es un perfil optativo de Docker; los formularios manuales funcionan sin él.
4. Preparar únicamente Whisper tiny desde Configuración si se va a probar audio. Este modelo es de transcripción, independiente de Ollama. Moonshine español permanece deshabilitado hasta verificar la licencia comercial aplicable.
5. Agregar una API desde la pantalla, guardar y probar un modelo con herramientas. Un modelo listado no equivale a un modelo probado. Verde confirma la respuesta de esa prueba; amarillo indica límite temporal, no acredita agotamiento diario; rojo indica fallo de la prueba y no una indisponibilidad permanente.
6. Dictar: «Cliente ocasional, una arepa de queso, una empanada de pollo y dos Coca-Colas pequeñas; efectivo y para preparar». Debe abrir directamente el detalle del pedido. Corregir «paga con billetera» y comprobar que conserva cliente, productos y preparación. Confirmar una vez y conciliar pedido, factura, pagos y caja en PostgreSQL QA.
7. Repetir con productos inexistentes, cantidades superiores al disponible, datos faltantes, pérdida de red y doble confirmación. Debe conservar el detalle; no crear documentos incompletos ni repetir cobros. Probar también permisos de vendedor e inventario.
8. Validar micrófono físico en celular mediante HTTPS, suspensión de pestaña y cierre de sesión. La conexión de audio usa WebSocket con una autorización de 30 segundos, de un solo uso; la captura se limita a dos minutos. No se guardan audios ni transcripciones en el navegador.
9. Después del circuito Híbrido real, instalar voluntariamente un modelo Ollama con herramientas y repetir los mismos ejercicios. Después validar API Live con su proveedor y audio nativo.

### Estado comprobado y pendientes

Se comprobó visualmente Configuración a 390 px y 1440 px, y una instrucción completa abrió la revisión existente de venta con tres líneas, cuatro unidades y total de $14.000. Este recorrido usó respuestas simuladas y no guardó una venta. Las pruebas actuales no equivalen a pruebas con micrófono físico, proveedores reales ni producción.

Están pendientes la conversación nativa API Live, los canales WhatsApp y Hermes/Telegram, y sus pruebas de aislamiento, permisos y aprobación. La construcción del servicio híbrido y la conciliación de configuración y borradores con PostgreSQL QA ya se comprobaron. Todavía falta transcribir audio y conversar con un proveedor real antes de publicar. Producción permanece en su versión anterior.

Referencias: [Pipecat Whisper](https://github.com/pipecat-ai/pipecat/blob/v1.12.0/src/pipecat/services/whisper/stt.py), [licencias de modelos Moonshine por idioma](https://github.com/moonshine-ai/moonshine/blob/main/language-bindings/python/src/moonshine_voice/download.py).

La construcción inicial usa `VOICE_BUILD_TARGET=voz-hibrida`. La etapa posterior usa `VOICE_BUILD_TARGET=voz-local` para incorporar el motor Ollama al mismo servicio de voz; requiere reconstruir únicamente ese servicio. Ninguna etapa ejecuta `ollama pull`. Hasta activar esa etapa, consultar modelos locales informa que la conexión no está disponible; no se presenta como prueba aprobada.

### Comprobaciones actuales adicionales

Se aplicaron las migraciones pendientes únicamente en `ambie_test`. Una configuración de prueba se confirmó, se releyó tras desconectar/reconectar PostgreSQL, conservó la clave cifrada y rechazó una versión antigua. Pedidos y productos mantuvieron sus cantidades de registros; la configuración ficticia se retiró al terminar. El ejercicio completo tomó 4.906 ms; esta cifra incluye varias lecturas y una reconexión y no representa la latencia de un solo guardado.

El servicio de voz QA confirmó salud HTTP 200, rechazo 401 sin autorización privada, estado 200 y aviso 409 al intentar transcribir sin preparar el reconocimiento. El WebSocket validó el ticket y devolvió el aviso de preparación. Estas pruebas no transcribieron un audio ni descargaron modelos.

Scripts adicionales: `node Backend/scripts/probar-configuracion-agentes-db.cjs` usa exclusivamente PostgreSQL QA en 127.0.0.1:5433; `node Backend/scripts/probar-audio-agentes.cjs` usa exclusivamente audio QA en 127.0.0.1:7861 y un token privado dentro de `.local/`. No ejecutarlos contra producción ni reutilizar sus claves de pruebas para el negocio.

La prueba HTTP QA confirmó que la revisión usa los identificadores y precios reales del catálogo PostgreSQL; cambiar efectivo por billetera mantuvo las líneas y el total, sin crear pedidos. La regresión de guardados realizó 23 solicitudes de QA: confirmó cuatro intenciones legítimas y un solo pedido/cobro por clave. La inicialización real de Pipecat, Silero, Smart Turn y su agregador terminó correctamente a 16 kHz; todavía no equivale a transcripción de un audio ni a conversación con un proveedor real.

Se comprobó además el arranque del motor Ollama CPU en un contenedor temporal: respondió con una lista vacía de modelos. Se retiró el contenedor sin descargar modelos. Esto comprueba el motor preparado, no su capacidad de interpretar órdenes; esa prueba requiere instalar voluntariamente un modelo después del circuito Híbrido.

Un borrador con datos pendientes no se confirma ni por voz ni por botón. Primero se aclara por texto o voz el dato que falta. Esto evita que los valores predeterminados del formulario completen un pago por intuición o que desaparezca un producto no reconocido al volver a validar. Un borrador completo sí permite corregir los campos manualmente y revisar el cambio antes de confirmar.

En Chrome QA se intentó confirmar un borrador con un producto inexistente dos veces desde el formulario y una desde el asistente: permaneció en la vista de detalle, conservó el aviso del producto pendiente y no envió solicitudes de creación de pedidos. PostgreSQL conservó la cantidad de pedidos. En este ejercicio se simuló exclusivamente la interpretación; la revisión previa procedía de la API y del catálogo QA reales.

En conteos, abre el inventario y toma un producto antes de dictar «Conté cinco». La pantalla aporta únicamente el identificador del conteo y el producto asignado; la cantidad debe indicarse. La API vuelve a comprobar propietario y vencimiento de la asignación. Un colaborador no puede cerrar ni aplicar el conteo. Prueba adicional: contar cero, omitir la cantidad y repetir tras vencer o perder la asignación; solo el primer caso completo debe permitir confirmar.

Comprobación final de esta etapa V6P4: verificar completó compilación, tipos y revisión del frontend sin errores (mantiene advertencias de efectos/render). Pasaron 13 pruebas aisladas del asistente, seis de autorización de audio y la revisión HTTP real contra PostgreSQL QA. La repetición del ejercicio de configuración confirmó persistencia tras reconexión en 162 ms para el ejercicio completo; no es una medición de una escritura individual. No se descargaron modelos y no se modificó producción. El entorno de revisión está en http://127.0.0.1:8180/admin/configuracion, separado del negocio en 8080.

### Configurar un proveedor externo y probarlo en desarrollo

El frontend de trabajo conserva la dirección `http://127.0.0.1:8180/admin/configuracion`, ahora con Vite en desarrollo y actualización automática. La API de pruebas sigue en 3100 y utiliza `ambie_test`; producción en 8080 permanece independiente. No se crea otro túnel público en esta etapa.

| Campo | Qué debes colocar |
|---|---|
| Nombre | Una etiqueta para reconocer la conexión, por ejemplo OpenCode Zen. |
| Protocolo | El formato admitido por el modelo: Chat Completions, Responses, Gemini o Anthropic. No se identifica por la marca de la clave. |
| URL base | Dirección oficial del servicio, sin la ruta de modelos o conversación, sin claves ni parámetros. Para Zen: `https://opencode.ai/zen/v1`. |
| Clave de acceso | La clave de esa misma conexión, sin el prefijo Bearer. Vacía conserva la guardada. Nunca va en documentos, URL ni frontend compilado. |
| Modelo | Identificador exacto del catálogo. En Zen se usa el ID sin el prefijo `opencode/` de su cliente. |
| Máximo de tokens de respuesta | Límite de salida por solicitud, entre 256 y 8192; predeterminado 2000. No limita los tokens de entrada ni el saldo mensual. |
| Proveedor alternativo autorizado | Otra conexión con modelo, optativa. Autoriza enviar la misma instrucción al respaldo ante desconexión, límite temporal o fallo del proveedor. No se usa para ocultar una clave rechazada ni un formato inválido. |

Consulta la [tabla oficial de OpenCode Zen](https://opencode.ai/docs/zen/#endpoints) para elegir protocolo: los modelos que usan `/chat/completions` corresponden a Chat Completions; `/responses` a Responses; `/messages` a Anthropic y `/models/<id>` a Gemini. Las rutas especializadas como `/systemone` no tienen adaptador comercial y no deben tratarse como Chat Completions. La lista del proveedor informa existencia, pero solo una prueba de herramientas válida demuestra disponibilidad para esta operación y esta clave, en ese momento.

Ejercicio inicial: elegir Zen, conservar su URL base, escoger `big-pickle` si sigue en el catálogo y utilizar Chat Completions. Guardar y probar conexión. Una marca blanca significa sin probar; verde significa que respondió con una herramienta válida; amarillo indica límite temporal y rojo una prueba fallida. El proveedor puede cambiar sus modelos, precios, permisos y cuotas. Las mediciones de tokens solo se muestran cuando el proveedor las informa; no se estiman costos ni saldo disponible.

Para una URL incorrecta, la pantalla muestra el campo que debe corregirse antes del PUT. La API también valida formato y combinación conocida de protocolo/host. Si otro administrador guardó cambios, «Recargar ajustes guardados» recupera la versión actual y descarta las ediciones no guardadas. Durante un guardado o prueba se bloquean los controles para evitar sobrescribir ediciones hechas a mitad de la solicitud.

Pruebas actuales: 18 regresiones aisladas pasaron, con Responses, privacidad de errores, asignaciones de conteo, cifras reportadas y respaldo autorizado. La consulta real de Zen devolvió 82 modelos. La prueba real de Big Pickle rechazó la clave o sus permisos: no se presenta como conversación aprobada. Se corrigió la conexión que había recibido una clave Zen bajo el nombre y URL de Google, conservando la clave cifrada. En navegador se comprobó que una URL terminada en `/chat/completions` produce un aviso y no envía PUT. Los documentos comerciales no se modificaron por estas pruebas de configuración.

Después de reemplazar la clave en la pantalla y obtener una prueba verde, habilitar el asistente y repetir el pedido completo, la corrección del pago y la confirmación única en QA. Preparar Whisper tiny únicamente si se va a probar audio: no descarga modelos Ollama. Repetir las pruebas de caída del proveedor y preservación del borrador antes de avanzar a conversación Live y canales externos.


### Corrección de proveedores y selector · V6P4, 10 de octubre de 2026

La pantalla utiliza un único selector de proveedor, clave y catálogo buscable. URL, protocolo y límites quedan en Ajustes avanzados; audio y respaldo también se pliegan. Seleccionar un proveedor completa su conexión oficial y evita crear otra conexión idéntica. Una clave guardada no se muestra ni se sustituye al dejar el campo vacío.

- Gemini: se corrigió la declaración de herramientas para enviar `parametersJsonSchema`. El campo anterior `parameters` rechazaba `additionalProperties` con HTTP 400. El catálogo híbrido excluye modelos que únicamente admiten audio Live.
- OpenCode Go: es distinto de Zen; base `https://opencode.ai/zen/go/v1`. Envía identificación real `AMBIE/1.0` y `x-opencode-session`, estable al corregir el mismo borrador. La conexión QA conserva su clave cifrada y utiliza `mimo-v2.6-pro`, que completó un gasto ficticio y corrigió su pago. `glm-5.3-flash` respondió al transporte, pero omitió datos del ejercicio completo; no se considera validado para ese ejercicio.
- Zen: base `https://opencode.ai/zen/v1`. La clave probada corresponde a Go y Zen rechazó su acceso; el catálogo público no demuestra autorización. No se cambian claves entre servicios automáticamente.
- OpenRouter: el filtro inicial muestra modelos gratuitos según precios publicados de entrada, salida y solicitud; la búsqueda permite encontrar los demás. Se consultaron 458 modelos, 19 gratuitos en ese momento. Los que declaran no admitir herramientas quedan deshabilitados. La prueba real aprobó `apodex/apodex-1.1-mini:free`.
- OpenCode complementa el catálogo con metadatos públicos de Models.dev, sin enviar claves ni datos comerciales. Caché de cinco minutos, límite de ocho MB y diez segundos; si falla, el catálogo principal sigue disponible y los ajustes avanzados permiten revisar el protocolo. Solo se marca incluido en Go si figura en sus metadatos. Las cuotas, modelos y precios pueden cambiar.

La lista muestra hasta 30 coincidencias; busca por nombre o identificador. Blanco significa sin probar, verde significa ejercicio estructurado completo, amarillo significa límite de uso y rojo significa prueba fallida. Rojo no afirma una falla permanente; amarillo no afirma que la cuota diaria se agotó. La prueba exige concepto, importe y forma de pago del ejercicio, no solo una respuesta HTTP exitosa.

Ejercicio rápido en `http://127.0.0.1:8180/admin/configuracion`: seleccionar proveedor, cargar modelos, elegir uno y Guardar y probar conexión. Para probar instrucciones, marcar Habilitar asistente, escribir «Prepara un gasto de transporte por un peso en efectivo» y Guardar y probar conversación. No confirma ningún gasto. Corregir desde el asistente con «Cambia solamente el pago a billetera» debe conservar concepto e importe. Los campos opcionales nulos o vacíos se tratan como faltantes; se conservan ceros, false y todas las líneas. Un dato inválido no vacío sigue siendo rechazado.

Evidencia actual: Gemini, OpenRouter y Go completaron un borrador ficticio y la corrección del pago mediante la API real. Una repetición de Gemini recibió HTTP 503 temporal del proveedor; una respuesta previa exitosa no garantiza disponibilidad continua. Las pruebas no enviaron productos ni datos del negocio a servicios externos y no llamaron rutas de guardado comercial. Producción permanece sin cambios y Ollama sin modelos descargados. Las pruebas de audio real y API Live continúan pendientes de sus etapas.


Comprobación posterior en navegador: OpenRouter completó el ejercicio mediante Guardar y probar conversación. Go con `mimo-v2.6-pro` aprobó un borrador y una corrección por API, pero algunas repeticiones desde la pantalla no devolvieron herramienta; no se afirma estabilidad de ese modelo. La alternativa `mimo-v2.6-flash` sí completó el ejercicio desde el frontend y queda como selección inicial para una conexión Go nueva. El límite configurado de Go en QA se amplió a 8192; es un máximo por respuesta, no una garantía de disponibilidad. Si el proveedor indica `finish_reason=length`, ahora se muestra el límite de salida en lugar de atribuirlo a una clave inválida. Las 23 regresiones actuales aprobaron, incluyendo precios gratuitos explícitos, conservación de campos y respuestas truncadas. Interfaz comprobada a 390×844 y 1440×900, sin desbordamiento horizontal y con ajustes avanzados plegados.


Límite observado: una repetición posterior de Go Flash por API tampoco devolvió herramienta. Su prueba visible aprobada no garantiza todas las instrucciones ni correcciones; Go sigue sujeto a esa irregularidad y no se presenta como integración estable. Gemini también repitió HTTP 503 del proveedor después de una prueba aprobada. OpenRouter queda como conexión principal de QA para continuar la validación; no se autoriza un respaldo automático ni se alteran datos comerciales. Conviene comprobar cada modelo con el ejercicio antes de usarlo y confirmar siempre el detalle.
