# Publicar correcciones desde el repositorio

La versión preparada para producción se trabaja en `V5P3`. Revisa y fusiona sus cambios mediante un pull request a la rama principal configurada en GitHub. Designar `V5P3` como predeterminada requiere confirmación; no se cambia esa configuración automáticamente. El workflow detecta la rama predeterminada, sin asumir que se llama `main`. La instalación puede realizarse en un servidor local o VPS de cualquier proveedor siguiendo los pasos siguientes.

## Preparación única del servidor

1. Instala Git, Docker con Compose v2 y clona el repositorio en una carpeta persistente. Cambia a la rama principal y configura allí `.env` con secretos propios. Nunca guardes secretos en Git ni copies la base de datos en el repositorio.
2. Ejecuta `sh infra/desplegar.sh` en Linux o `powershell -ExecutionPolicy Bypass -File infra/desplegar.ps1` en Windows. Valida la aplicación y las copias de seguridad antes de activar automatizaciones.
3. En GitHub, **Settings → Actions → Runners → New self-hosted runner**, sigue las instrucciones del sistema operativo del servidor. Añade la etiqueta `ambie-produccion` y ejecútalo como servicio, con un usuario dedicado. Necesita acceso al repositorio y al daemon Docker. Usa un runner exclusivo para este repositorio; no permitas ejecutar pull requests ni código no revisado en el servidor de producción.
4. La copia persistente debe poder ejecutar `git fetch origin` de forma no interactiva. Para un repositorio privado usa una deploy key de solo lectura, guardada únicamente en el servidor. No pongas tokens en la URL del remoto. La carpeta del runner debe ser distinta de la instalación del negocio.
5. Crea el environment **produccion** y limita sus ramas de despliegue a la principal. Protege esa rama mediante revisión y el check `verificar`. Configura las variables de repositorio **AMBIE_DEPLOY_PATH** (ruta absoluta de la instalación) y **DEPLOY_ENABLED=true**. Estas variables no son contraseñas. No copies `.env` en variables ni logs del workflow.

El workflow `.github/workflows/verificar-desplegar.yml` comprueba compilación, contrato, patrones sensibles, caché y asistente. Solo tras aprobarlos, un push a la rama principal despliega la revisión correspondiente. No despliega PRs ni `V3` salvo que la designes expresamente como principal. Serializa despliegues, conserva cambios locales y genera un respaldo antes de migrar. Si llega un commit posterior, omite el anterior pendiente. Si falla una migración, revisa logs y compatibilidad antes de intervenir; no restaures automáticamente datos antiguos.

El runner puede estar en una PC local o VPS: establece conexión saliente con GitHub. No necesitas publicar SSH ni abrir PostgreSQL. Docker Desktop y el servicio del runner deben permanecer iniciados en Windows. DNS, HTTPS y Cloudflare se configuran como indica README; todavía requieren comprobarse en tu VPS.

## Uso cotidiano

Publica la rama de desarrollo, abre un PR a la principal y fusiónalo después de revisar sus verificaciones. En **Actions → Verificar y desplegar** observa el resultado. Comprueba `/salud`, `/api/v1/salud`, inicio de sesión y una lectura del negocio. La actualización tarda lo que duren las pruebas, construcción y arranque; no es instantánea ni garantiza cero interrupciones. Recarga las pestañas abiertas para cargar el nuevo frontend; no forzamos recargas que descarten pedidos en edición.

Para suspender despliegues automáticos configura `DEPLOY_ENABLED=false`. El despliegue manual sigue disponible con `infra/desplegar.ps1 -Actualizar` o `sh infra/desplegar.sh --actualizar`. Antes de volver a una versión anterior revisa sus migraciones y respalda datos/archivos. Nunca uses `down -v` como parte de una actualización.

## Alcance de seguridad

`.env`, `.local`, respaldos, claves, datos de Docker y configuración personal están excluidos. `npm run seguridad:repositorio` revisa archivos versionados, rutas privadas y patrones de secretos sin imprimir sus valores. Complementa con revisión del diff y secret scanning de GitHub: un patrón no demuestra ausencia absoluta de información sensible ni limpia el historial previo. Si una clave fue publicada, revócala y trata el historial por separado.

Referencias oficiales: [entornos y restricciones de despliegue](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments), [control de despliegues](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments).
