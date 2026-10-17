# ABINOVA

Aplicación para administrar un negocio desde computador o celular: pedidos, cobros, crédito, inventario, compras, gastos, productos y caja. Una empresa por instalación, con accesos de administrador, vendedor y colaboradores de inventario.

Versión de producción: **V8P4**. Personaliza colores, fuente y portada desde Configuración. Puede instalarse como aplicación en un navegador compatible mediante HTTPS (localhost también permite probarla).

Dos servicios Nginx del mismo proyecto Docker: `frontend` sirve el cliente en `/` (responsive y PWA) y la landing en `/comercial/`; `operador` sirve el panel de mando en `/operador/`. No se necesita un contenedor de marketing. El panel de mando usa `system` con su contraseña vigente y permite gestionar planes, condiciones comerciales, módulos por plan, excepciones por empresa, créditos y workflows. Cada empresa conserva su instalación y sus datos; el alta automática de nuevas empresas sigue pendiente.

## Tecnología

React, TypeScript, Vite y Tailwind en el frontend; NestJS/Fastify, Prisma y PostgreSQL en la API. Docker Compose organiza Nginx, API, PostgreSQL, Redis y MinIO privado. Frontend y API comparten tipos y validaciones en `Compartido/`.

## Instalar en producción

Requiere Docker y Compose v2. Crea `.env` desde `.env.example` si no existe y configura secretos propios. La primera instalación crea el acceso técnico system con su contraseña privada; desde Usuarios crea las cuentas del negocio.

En Windows:

~~~powershell
powershell -ExecutionPolicy Bypass -File infra/desplegar.ps1
~~~

En Linux:

~~~bash
sh infra/desplegar.sh
~~~

El instalador construye, respalda antes de migrar y comprueba los servicios. Los datos permanecen en volúmenes. Abre [localhost:8080](http://localhost:8080); desde un celular en la misma red, usa la IP del servidor y el puerto 8080. El acceso externo requiere dominio y HTTPS; Cloudflare es optativo.

## Validar y consultar logs

~~~bash
docker compose ps
docker compose logs --tail 100 api frontend migrate
curl http://localhost:8080/api/v1/salud
npm run verificar
~~~

Las comprobaciones de entrega se limitan a compilación, auditoría y salud de servicios; no se incluyen ejecutores ni scripts de pruebas. V8P4 incorpora un servicio optativo de voz y ajustes en Configuración > Agentes IA. Primero se valida Híbrido; Local queda preparado sin modelos y API Live conserva sus ajustes para la siguiente etapa. La voz revisa operaciones en los formularios existentes; Chat presenta y confirma dentro de la conversación, usando las mismas acciones del negocio. Consulta la guía para activar audio, ver sus logs y conocer las pruebas pendientes.

## Funcionamiento esperado

Cada formulario espera la confirmación de guardado en PostgreSQL. Pedidos, pagos, caja e inventario se actualizan mediante transacciones; la sincronización mantiene las pantallas al día. El historial conserva documentos y valores de venta anteriores. Productos permite exportar/importar CSV; Inventario permite revisar el inicio del negocio y conteos. Inicio muestra ventas, compras, gastos y descuadres por período al costo guardado.

Notificaciones conserva avisos comerciales y abre su detalle. Chat usa la conexión configurada para consultar datos o preparar operaciones: se revisan y confirman dentro del chat, sin cambiar de pantalla. Los avisos del navegador requieren permiso y la aplicación abierta.

El operador usa `/operador` para precios, créditos y workflows Python por empresa; el administrador comercial accede a sus flujos desde `/admin/workflows`. La landing está en `/comercial/`; la pasarela de pago sigue pendiente.

- [Guía completa de instalación y desarrollo](docs/info/GUIA_INSTALACION_Y_DESARROLLO.md).
- [Modelo, consultas y ejemplos de CSV](docs/info/GUARDADO_Y_CONCILIACION_V4P2.md).
- [Diccionario de tablas y campos](docs/info/DICCIONARIO_DATOS_V4P2.md).
- [Pruebas realizadas y alcance](docs/info/VALIDACION_FORMULARIOS_Y_BASE_DATOS.md).
- [Publicación y despliegue continuo](docs/info/DESPLIEGUE_CONTINUO.md).
- [Workflows Python y panel del operador](infra/workflows/README.md), con workers separados por empresa.

### Enlace temporal de validación con Cloudflare

Con la aplicación ya instalada, ejecutar `iniciar_cloudflare_validacion.cmd`. Renueva el túnel dentro de `abinova`, actualiza APP_ORIGIN/CORS y espera la salud de API/frontend, sin ejecutar migraciones ni modificar operaciones del negocio. La dirección vigente se guarda en `.local/cloudflare-url-actual.txt`. Usa tu cuenta normal para acceder.

El enlace cambia al crear otro túnel y es para pruebas; para un hostname estable se requiere un túnel administrado. [Documentación de Cloudflare](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).
