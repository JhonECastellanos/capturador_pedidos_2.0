# Docker en este equipo Windows

El almacenamiento persistente se traslada a `D:\DockerDesktop\wsl`.
Un enlace de directorio en la ubicación original de Docker mantiene compatibles
sus rutas internas; los archivos grandes residen físicamente en D:.
No se borran bases de datos, volúmenes ni imágenes para realizar el traslado.

`wslconfig` se instala como `%USERPROFILE%\.wslconfig` cuando no existe una
configuración previa. Limita **todo WSL 2**, no solo este proyecto, a 6 GB de RAM,
4 procesadores y 1 GB de swap situado en D:. La reclamación gradual libera caché
de memoria. Los cambios necesitan que la máquina WSL esté detenida y vuelva a
iniciarse. No sobrescribir una configuración personal sin combinarla primero.

Los límites del Compose son por contenedor, no una cuota global por proyecto:

| Servicio | RAM máxima | CPU |
|---|---:|---:|
| PostgreSQL | 512 MB | 1 |
| API | 512 MB | 1 |
| MinIO | 384 MB | 0,5 |
| Voz local | 512 MB | 1 |
| Migración puntual | 768 MB | 1 |
| Bootstrap puntual | 256 MB | 0,5 |
| CLI puntual | 512 MB | 0,5 |

No se permite swap adicional a estos contenedores. El límite global de WSL
también incluye construcciones y otros proyectos. Cada proyecto nuevo debe
declarar sus propios límites: Docker no impone automáticamente una cuota por
proyecto. Los volúmenes nuevos del mismo motor usarán el disco trasladado;
montajes de carpetas Windows y cachés de otras herramientas conservan sus rutas.

En los proyectos existentes `saas_small` y `e-commerc-cam` se instala el archivo
`existing-project.compose.override.yml` como `docker-compose.override.yml`.
Sus servicios db/backend tienen 512 MB y 1 CPU cada uno; frontend tiene 128 MB
y 0,5 CPU. Los contenedores ya existentes también reciben estos límites con
`docker update`, sin iniciarlos ni recrearlos. Si se invoca Compose con `-f`,
incluir explícitamente ambos archivos: `-f docker-compose.yml -f docker-compose.override.yml`.

El traslado se verifica con SHA-256 antes de eliminar las dos copias originales
redundantes en C:. Docker Desktop y sus pequeños registros/configuraciones
siguen en C:; imágenes, volúmenes, capas, caché de construcción y swap están en D:.

Para revisar consumo y límites sin revelar variables de entorno:

```powershell
docker stats --no-stream
docker inspect --format '{{.Name}} RAM={{.HostConfig.Memory}} swap={{.HostConfig.MemorySwap}} CPU={{.HostConfig.NanoCpus}}' <contenedor>
```

La limpieza segura de caché de construcción no elimina los datos del negocio:

```powershell
docker builder prune --force --filter until=24h
```

No usar `docker system prune --volumes`, `docker volume prune` ni
`docker compose down -v` para liberar espacio sin una autorización específica y
una copia comprobada de las bases de datos.
