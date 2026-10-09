
Desde la raíz, usando las variables existentes de `.env`:

```powershell
npm.cmd run verificar
docker compose -p ambie-integracion -f docker-compose.yml -f docker-compose.pruebas.yml up -d --build --wait
npm.cmd run prueba:integracion
```

Las pruebas de integración se niegan a ejecutarse fuera de localhost:3100. PostgreSQL y MinIO de este proyecto Compose son independientes del negocio. Crean registros QA, no eliminan datos. No ejecutar `down -v` ni `docker:limpiar` sin autorización. Para retirar los contenedores temporales y liberar RAM al terminar, conservando sus volúmenes:

```powershell
docker compose -p ambie-integracion -f docker-compose.yml -f docker-compose.pruebas.yml down
```

Para revisión visual contra esta base, iniciar Vite con `API_PROXY_TARGET=http://localhost:3100`. No guardar esa dirección de pruebas como valor de producción.

## Una sola agrupación del negocio

```powershell
docker compose up -d --build --wait
docker compose ps
```

El negocio utiliza cinco servicios: frontend, API, PostgreSQL, Redis y MinIO. API, migración y semilla comparten imagen. La migración es una tarea puntual que debe terminar con código 0; las bases y los archivos conservan sus volúmenes.

Consultar [configuración Windows](windows/README.md) para almacenamiento en D: y límites globales WSL.

`docker-compose.produccion.yml` permite desplegar en un servidor de cualquier proveedor junto al Compose principal. Restringe el frontend a loopback, deja la API sin puertos publicados y fija las imágenes de almacenamiento y túnel. No cambia los puertos del entorno local. Para instalar y actualizar el servidor, consultar [despliegue continuo](../docs/info/DESPLIEGUE_CONTINUO.md).
