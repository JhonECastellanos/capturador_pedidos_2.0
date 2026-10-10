# AMBIÉ · Capturador de pedidos

Aplicación para administrar un negocio desde computador o celular: pedidos, cobros, crédito, inventario, compras, gastos, precios y caja. Una empresa por instalación, con accesos de administrador y vendedor.

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

Las pruebas operativas se ejecutan en QA aislada, nunca sobre los datos reales. Esta versión no incluye un servicio de agente; Configuración conserva los accesos a Usuarios y Auditoría.

## Funcionamiento esperado

Cada formulario espera la confirmación de guardado en PostgreSQL. Pedidos, pagos, caja e inventario se actualizan mediante transacciones; la sincronización mantiene las pantallas al día. El historial conserva documentos y precios anteriores. Precios permite exportar/importar CSV; Inventario permite revisar el inicio del negocio y conteos. Inicio muestra ventas, compras, gastos y descuadres por período al costo guardado.

- [Guía completa de instalación y desarrollo](docs/info/GUIA_INSTALACION_Y_DESARROLLO.md).
- [Modelo, consultas y ejemplos de CSV](docs/info/GUARDADO_Y_CONCILIACION_V4P2.md).
- [Diccionario de tablas y campos](docs/info/DICCIONARIO_DATOS_V4P2.md).
- [Pruebas realizadas y alcance](docs/info/VALIDACION_FORMULARIOS_Y_BASE_DATOS.md).
- [Publicación y despliegue continuo](docs/info/DESPLIEGUE_CONTINUO.md).
