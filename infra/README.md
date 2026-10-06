# Verificación y contenedor CLI

Desde la raíz, usando las variables existentes de `.env`:

```powershell
npm.cmd run verificar
docker compose -p ambie-integracion -f docker-compose.yml -f docker-compose.pruebas.yml --profile voz up -d --build --wait
npm.cmd run prueba:integracion
npm.cmd run prueba:asistente
npm.cmd run prueba:voz
docker compose -p ambie-integracion -f docker-compose.yml -f docker-compose.pruebas.yml build cli
docker compose -p ambie-integracion -f docker-compose.yml -f docker-compose.pruebas.yml run --rm --no-deps cli --help
docker compose -p ambie-integracion -f docker-compose.yml -f docker-compose.pruebas.yml run --rm --no-deps cli rutas
```

Las pruebas de integración se niegan a ejecutarse fuera de localhost:3100. PostgreSQL y MinIO de este proyecto Compose son independientes del negocio. Crean registros QA, no eliminan datos. No ejecutar `down -v` ni `docker:limpiar` sin autorización. Para retirar los contenedores temporales y liberar RAM al terminar, conservando sus volúmenes:

```powershell
docker compose -p ambie-integracion -f docker-compose.yml -f docker-compose.pruebas.yml --profile voz down
```

Para revisión visual contra esta base, iniciar Vite con `API_PROXY_TARGET=http://localhost:3100`. No guardar esa dirección de pruebas como valor de producción.

## Una sola agrupación del negocio

El Compose declara `name: capturador_pedidos_20`. Desde esta carpeta, sin `-p`, API, PostgreSQL, MinIO y **una sola instancia de voz** pertenecen a ese proyecto. No ejecutar `docker run` para crear otra voz independiente. La separación de API, BD y archivos es deliberada; no se mezclan procesos y datos en un contenedor único.

```powershell
docker compose --profile voz up -d --build --wait
docker compose --profile voz ps
```

API, migración y bootstrap reutilizan la misma imagen. Migración y bootstrap son tareas puntuales; CLI solo se crea con `run --rm`. El servicio de voz es interno, sin puertos expuestos, con 512 MB, una CPU y sonda HTTP que no crea sesiones de reconocimiento. La BD y los archivos siguen en sus volúmenes existentes. Guardar los respaldos locales en `.local/backups/`, excluido de Git y de las imágenes.

## Agente preparado, sin IA activada

El target `agente` reutiliza el CLI existente. Corre como usuario no root, con filesystem de solo lectura, tmpfs de 64 MB, capacidades eliminadas, 512 MB de RAM, 0.5 CPU y 128 procesos. El volumen `cli_data` conserva configuración y sesión; protegerlo como un secreto y no compartirlo entre clientes. Se conecta a la API por la red `agentes`, sin credenciales de PostgreSQL ni MinIO. No publica puertos.

`--help` y `rutas` no llaman a modelos. No hay proveedor habilitado durante esta preparación. `preguntar` y `probar` deben esperar a la configuración explícita posterior del proveedor y sus credenciales. Conservar las confirmaciones de escritura; no usar `--si` en producción sin revisión.

En un VPS se reutiliza `docker compose build cli` y `docker compose run --rm cli --help`. Antes de exponer la aplicación: TLS/proxy inverso, `COOKIE_SECURE=true`, origen CORS exacto, secretos exclusivos por entorno, copias verificadas de PostgreSQL/MinIO y acceso restringido al daemon Docker. El contenedor es una herramienta puntual, no un servicio autónomo permanente.

Consultar [configuración Windows](windows/README.md) para almacenamiento en D: y límites globales WSL.

Para Oracle y acceso remoto en `V5P3`, consultar [la preparación del VPS](oracle/README.md). `docker-compose.produccion.yml` se aplica únicamente en el servidor, junto al Compose principal; no cambia los puertos del entorno local.
