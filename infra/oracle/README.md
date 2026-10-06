# Oracle y desarrollo remoto

Rama de trabajo: `V5P3`. Esta preparación no crea recursos ni activa despliegues automáticos.

## Instancia gratuita

Crear únicamente una instancia marcada **Always Free**, en la región principal de la cuenta. Comprobar cuota disponible, arquitectura y costo antes de confirmar. No actualizar a una cuenta de pago ni usar recursos cubiertos solamente por créditos promocionales. Si no hay capacidad gratuita, detener la creación.

Preferir Ubuntu LTS y Ampere A1 si la cuenta permite suficiente memoria para los servicios y las compilaciones. No asumir las cuotas históricas de otras cuentas. Las instancias gratuitas pueden recuperarse por inactividad: conservar respaldos externos y no considerar el nivel gratuito una garantía de disponibilidad de producción.

## SSH y VS Code

1. Generar una clave SSH con contraseña en el PC. Subir a Oracle únicamente el archivo público `.pub`.
2. Guardar la clave privada fuera del repositorio, con permisos exclusivos del usuario, y una copia protegida de su contraseña. Nunca enviar la clave privada por Telegram ni guardarla en GitHub.
3. Adaptar [ssh-config.example](ssh-config.example) en el archivo personal `~/.ssh/config`, conservando las otras entradas. Sustituir IP y ruta de la clave.
4. Verificar la huella del servidor mediante la consola de Oracle antes de aceptar la primera conexión. Probar `ssh ambie-produccion`.
5. En VS Code, usar Remote-SSH → Connect to Host → `ambie-produccion`. VS Code permanece en el PC; no hace falta un escritorio gráfico en el VPS.

Restringir el puerto 22 a las IP autorizadas en Oracle y en el firewall del servidor. No abrir PostgreSQL, Redis, MinIO, voz ni el daemon Docker a Internet. No habilitar acceso SSH por contraseña ni reenvío del agente.

## Instalación del aplicativo

Instalar Git y Docker Engine con Compose 2.24.4 o superior. Clonar el repositorio, seleccionar `V5P3` y configurar `.env` privado con credenciales nuevas del servidor. No copiar automáticamente los datos comerciales del PC.

El archivo adicional conserva los servicios y límites existentes, restringe el frontend a loopback y elimina el puerto publicado de la API. Desde la raíz de la copia del servidor:

```sh
export COMPOSE_FILE=docker-compose.yml:docker-compose.produccion.yml
export COMPOSE_PROFILES=voz
docker compose config --quiet
sh infra/desplegar.sh
curl --fail http://127.0.0.1:8080/salud
curl --fail http://127.0.0.1:8080/api/v1/salud
```

Para inspección sin publicar, usar `ssh -L 8080:127.0.0.1:8080 ambie-produccion` desde el PC. Las variables exportadas deben conservarse también al actualizar con `sh infra/desplegar.sh --actualizar`. Git debe estar limpio. Nunca ejecutar `down -v` durante actualizaciones.

Mantener producción y pruebas en carpetas y proyectos Compose distintos; no levantar QA permanentemente. Compilar consume más memoria que los límites de los contenedores en ejecución. Verificar las imágenes y Vosk en ARM64 sobre la instancia real antes de dar por terminado el despliegue.

## Cloudflare

El servicio `cloudflared` existente usa un túnel administrado y un archivo secreto. No crear otro contenedor de voz o de túnel.

1. En Cloudflare, crear un túnel y un hostname del dominio autorizado con origen `http://frontend:8080`.
2. Guardar solamente el token en `.local/cloudflare-token`, excluido de Git, con permiso `600`. No pegarlo en comandos, capturas o documentación.
3. En `.env`, establecer `APP_ORIGIN=https://HOSTNAME`, `CORS_ALLOWED_ORIGIN=https://HOSTNAME` y `COOKIE_SECURE=true`. No incluir orígenes de desarrollo en producción.
4. Ejecutar el despliegue con `COMPOSE_FILE` anterior y `COMPOSE_PROFILES=voz,cloudflare`.
5. Comprobar HTTPS, ambos endpoints de salud, cookies seguras, inicio de sesión y micrófono/WebSocket desde un celular. No publicar la aplicación antes de estas comprobaciones.

El túnel establece conexiones salientes; no requiere abrir 8080 a Internet. La configuración de confianza de Nginx corresponde a la IP interna fija del servicio existente. El hostname, token y DNS siguen pendientes hasta configurarlos en la cuenta real.

## Hermes y Telegram

ABI es una referencia de empaquetado, no una configuración lista para controlar este VPS. El control completo requiere un bot exclusivo del servidor, lista cerrada de IDs numéricos autorizados, credenciales privadas y un canal administrativo autenticado. No reutilizar simultáneamente un bot que ya recibe mensajes en el PC.

Antes de activar: acordar proveedor/modelo gratuito, registrar los secretos fuera de Git, configurar autorización antes de arrancar y verificar que un usuario no autorizado no pueda ejecutar comandos. No trasladar el puente Windows de ABI al VPS. No montar el socket Docker ni todo el filesystem por defecto.

El acceso administrativo completo permite borrar datos, leer secretos y detener servicios; proteger Telegram y conservar respaldos fuera del VPS. La instalación y prueba del agente quedan pendientes de la instancia, bot, ID autorizado y proveedor. No hay garantía de gratuidad de un modelo por su nombre: comprobar cuota y condiciones del proveedor.

## Validación de producción pendiente

Verificar arranque y consumo real, persistencia tras reiniciar, restauración de PostgreSQL y archivos en QA, permisos por rol, voz con micrófono físico y HTTPS, y conexión SSH. Guardar IP/OCID, huella SSH, clave privada protegida, configuración privada y respaldos. No activar el runner de despliegue hasta completar estas verificaciones.
