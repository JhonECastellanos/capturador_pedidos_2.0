# Infraestructura de ABINOVA

Compila con `npm.cmd run verificar` y consulta el estado con `docker compose ps`.
Los scripts y los stacks de pruebas se retiraron. El contexto útil de los entornos
antiguos se conserva localmente en `.local/consolidacion-pruebas/`, asociado al
único contenedor detenido `abinova-qa-contexto`. No expone puertos ni ejecuta pruebas.
Los volúmenes históricos de QA permanecen conservados, separados del negocio.

## Una sola agrupación del negocio

```powershell
docker compose up -d --build --wait
docker compose ps
```

El negocio utiliza cinco servicios: frontend, API, PostgreSQL, Redis y MinIO. API, migración y semilla comparten imagen. La migración es una tarea puntual que debe terminar con código 0; las bases y los archivos conservan sus volúmenes.

Consultar [configuración Windows](windows/README.md) para almacenamiento en D: y límites globales WSL.

[Workflows Python](workflows/README.md): control del operador y worker aislado por empresa. Activación con npm run workflows:arriba; precios y créditos desde /operador. El administrador comercial usa /admin/workflows.

`docker-compose.produccion.yml` permite desplegar en un servidor de cualquier proveedor junto al Compose principal. Restringe el frontend a loopback, deja la API sin puertos publicados y fija las imágenes de almacenamiento y túnel. No cambia los puertos del entorno local. Para instalar y actualizar el servidor, consultar [despliegue continuo](../docs/info/DESPLIEGUE_CONTINUO.md).
