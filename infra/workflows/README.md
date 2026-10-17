# Workflows de ABINOVA

Motor Python con FastAPI, SQLite y dos servicios: control del operador y worker de la empresa. El núcleo comercial conserva una empresa por instalación; el registro del operador permite administrar varias instalaciones separadas. No se mezclan sus documentos en una misma base.

## Configurar conocimiento y probar ABI

En Panel de mando > Workflows elige la empresa o **Landing comercial · ABINOVA**. Configura primero la conexión del modelo: API propia reutiliza las conexiones cifradas de esta instalación; Local requiere un modelo instalado y Créditos incluidos requiere el proveedor privado del operador. No se descargan modelos ni se activa un proveedor comercial público al instalar.

En **Conocimiento y prueba**, completa nombre, perfil, descripción, reglas y módulos. Los perfiles restaurante, tienda, supermercado y carnicería identifican el contexto; no añaden módulos sin código ni autorizan procesos. Carga documentos `.md` o edítalos directamente. Guarda el borrador, pruébalo y publica cuando lo hayas revisado. Guardar otro borrador conserva la versión publicada anterior. **Retirar publicación** corta su uso hasta republicar y conserva los documentos. Antes de la primera publicación el intérprete operativo existente sigue disponible; retirar una publicación ya usada no omite sus reglas mediante un respaldo.

Cada workflow muestra módulo, estado y recorrido. Borrador o Deshabilitado no ejecutan pasos. El catálogo comercial determina los módulos visibles y utilizables: el control vuelve a comprobar permisos al iniciar/continuar y los nodos del modelo verifican la licencia en la API. La caché de licencias puede tardar unos segundos en recibir una modificación. El acceso maestro conserva su identidad y auditoría; no se atribuye al cliente.

El simulador devuelve respuesta, versión, fuentes y pasos recorridos. No guarda ventas ni mueve inventario. Para probar: carga un MD con un horario, pregunta por él, cambia el borrador y comprueba la versión usada; publica, reinicia el worker y continúa la conversación. Prueba otra cuenta y otra conversación: no deben recordar la anterior. Retira un módulo y comprueba menú, llamada directa y ejecución pendiente. La voz y el chat operativos usan el conocimiento publicado mediante LangGraph y reutilizan el intérprete/revisión de la API existente. La confirmación y la transacción final siguen siendo las del aplicativo, sin SQL generado por el modelo.

LangGraph usa checkpoints SQLite dentro del volumen existente: `conocimiento/conocimiento.sqlite` guarda borrador y publicación, y `conocimiento/memoria.sqlite` conserva conversaciones. Se separan por instalación, usuario, rol, módulo, versión y conversación. Se limitan a ocho intercambios y al último checkpoint; las conversaciones sin actividad durante treinta días se retiran al volver a usar el worker. Una modificación del conocimiento abre otro contexto; no entrena pesos ni incorpora automáticamente lo que diga un usuario como regla permanente. No se activan trazas externas de LangSmith.

## Conectar datos sin exponer credenciales

Los MD contienen conocimiento autorizado para el personal del negocio. No incluyas contraseñas, tokens o información que no deba consultar ese personal. Los documentos y respuestas del modelo nunca conceden permisos.

El catálogo de la instalación se consulta por un puente privado que valida usuario activo y licencia; entrega como máximo treinta referencias con nombre, código, unidad y precio. La búsqueda operativa de productos continúa usando los servicios existentes. Para datos externos PostgreSQL, el administrador del servidor prepara `.local/workflows/fuentes.json`, montado solo en el worker, con esta estructura (valores ilustrativos):

```json
[{"id":"catalogo-externo","nombre":"Catálogo autorizado","dsn":"postgresql://<usuario_select>:<clave>@<servidor>:5432/<base>","schema":"public","tablas":{"productos":["codigo","nombre"]}}]
```

Usa una cuenta **solo SELECT** y conexiones TLS cuando corresponda. La interfaz solo muestra alias y tablas aprobadas. La consulta usa identificadores escapados, transacción de lectura, máximo treinta filas y tres segundos de ejecución; no acepta SQL del usuario o del modelo. En el agente operativo las fuentes PostgreSQL externas están restringidas al administrador; vendedor e inventario no las reciben. Cambiar credenciales requiere actualizar el archivo privado del servidor. No apuntar dos empresas a la misma conexión comercial.

## ABI comercial público

El registro incluye una entrada comercial virtual, sin otro worker ni contenedor. Solo admite MD y el módulo comercial. Lee precios, descuentos y cálculos de la misma oferta que consume la landing. No consulta documentos de empresas ni ejecuta herramientas operativas. Para habilitar el modelo público, selecciona su conexión y publica expresamente el conocimiento comercial; hasta entonces la página conserva su orientación local sobre planes. Cada respuesta de un proveedor puede generar consumo: limita y supervisa el cupo antes de publicarlo. El endpoint limita solicitudes por IP y concurrencia en el proceso; escalar la API requiere trasladar este límite a un almacén compartido.

La landing y el cliente usan el mismo Nginx; el branding estático se empaqueta con sus imágenes. MinIO mantiene los archivos privados del negocio y no se hace público para el logo. La guía visual está en `marketing/branding_logo_abi/BRANDING.md`.

## Un único grafo de conocimiento

`conocimiento.py` define una sola secuencia LangGraph: fuentes y reglas → modelo → respuesta.
Voz, chat y orientación comercial reutilizan esa definición. No se crean grafos por
módulo ni por conversación. Cada negocio mantiene su documento de contexto; la
orientación comercial pública usa exclusivamente información pública y no puede
consultar el historial privado. Los workflows operativos conservan su ejecutor
secuencial existente, sin convertirse en otros grafos de conocimiento.

Se retiraron los scripts automatizados de pruebas y los stacks QA. La entrega se
comprueba mediante compilación y salud de los servicios, sin escribir operaciones
en la base del negocio. Audio físico y conexiones externas requieren sus dispositivos
y credenciales.

`npm.cmd run workflows:arriba` prepara secretos y arranca ambos servicios. Requiere la API actualizada. Ambos workers forman parte del despliegue normal. Panel del operador: `/operador`, con la cuenta técnica system. El administrador del negocio usa `/admin/workflows`; vendedores y colaboradores no tienen acceso.

`/operador/acceso` presenta el login técnico con la contraseña vigente de system; la API también comprueba `esSistema`. El panel agrupa empresas registradas, módulos por plan, excepciones por empresa, workflows, precios, condiciones y créditos. Reutiliza Usuarios y Agentes para la instalación propia. El alta automática de empresas y la administración remota de sus usuarios siguen pendientes; el registro de workers no constituye un SaaS de autoservicio completo.

## Frontends y aislamiento de empresas

Frontend y landing se sirven en el mismo Nginx, en / y /comercial/. La fuente de la landing sigue en marketing/12-landing-page y sus imágenes se empaquetan en esa imagen existente. El panel conserva su entrada independiente Control/src/main.tsx, su compilación dist-operador y su servicio operador en /operador/. Solo el cliente registra PWA. MinIO conserva archivos privados del negocio; no se publican para servir el branding.

El control federado mantiene un registro de instalaciones: una API, PostgreSQL, archivos, worker, volumen y secretos separados por empresa. `WORKFLOW_TENANT_ID` es una identidad fija de instalación, no un parámetro que envía el navegador. Un administrador de negocio nunca elige otra empresa. Para conectar otra instalación, provisiona sus servicios y conexiones privadas según Aislamiento y acceso; después registra el worker y reinicia el control. La creación automática de toda esta infraestructura no se simula con un formulario.

## Módulos por plan y módulos futuros

1. En el panel de mando abre **Módulos por plan > Catálogo y planes**. Registra un código estable (por ejemplo `servicio-tecnico`) y su nombre; marca los planes que lo incluyen. Guarda el catálogo. La X lo retira de la oferta y de los planes sin borrar registros comerciales. Resumen y Configuración siempre conservan acceso básico.
2. En **Asignar a empresa**, selecciona una instalación registrada y su plan. Cada módulo puede heredar, incluirse o excluirse expresamente. Las excepciones se conservan al cambiar de plan; Restaurar herencia las elimina del borrador y Guardar confirma la asignación.
3. Un módulo nuevo aparece **En desarrollo** y no activa una pantalla vacía. Para desarrollarlo reutiliza la estructura de un módulo existente; registra su ID en `Compartido/src/modulos-iniciales.json` dentro de `implementados`, crea la ruta React y su navegación, y actualiza `moduloPantalla` y `LicenciasService.exigirRuta/exigirOperacion`. No basta con ocultar el menú. Las operaciones del agente también deben pasar por la licencia antes de leer o guardar.
4. Si el módulo incorpora datos, agrega su modelo Prisma y migración no destructiva; actualiza contrato, equivalencias, auditoría y triggers de sincronización. Prueba permisos, persistencia y concurrencia en QA; despliega API, ambos frontends y worker/control. La asignación comercial ya registrada pasará a habilitar el módulo cuando la versión instalada realmente lo implemente.

El catálogo y las asignaciones viven en las tablas SQLite `catalogo_modulos` y `accesos_empresa` del control. Cada escritura verifica versión y rechaza conflictos con 409. PostgreSQL conserva `configuracionesAccesoComercial`: la última política recibida por la instalación; no replica documentos de otras empresas. La API comparte la consulta de licencia, la actualiza periódicamente y mantiene la última política si la central se desconecta. El navegador consulta `/licencia` por sesión y aplica menú y rutas. Una modificación tarda normalmente unos segundos entre dispositivos. Los permisos por rol y usuario siguen aplicándose además del plan; system mantiene su acceso técnico.

Los planes iniciales son configurables: Esencial mantiene ventas, pedidos, inventario, productos, caja, usuarios, chat y agentes; Negocios añade compras, créditos, cierres y notificaciones; Profesional incluye también auditoría y workflows. Empresarial permite un acuerdo personalizado. La actualización deja la instalación existente con acceso completo hasta asignar otro plan. El plan de módulos no altera por sí solo el cupo de tokens: el operador ajusta el cupo y la ponderación en Workflows > Configurar conexión y cupo.

## Aislamiento y acceso

Cada empresa necesita su propio contenedor worker, volumen, token, API y puente de modelos. `.local/workflows/registro.json` contiene únicamente el identificador, nombre, URL fija del worker y token. Para otra empresa se provisiona otro worker y se agrega su conexión al registro; reiniciar solo `workflow-control` carga el registro actualizado. No apuntar dos empresas a la misma API, volumen o token. El registro no recibe URLs desde solicitudes públicas.

El control no conserva credenciales PostgreSQL comerciales. Cada worker puede consultar únicamente las fuentes de lectura preaprobadas de su instalación. Los agentes operativos conservan sus servicios, formularios y confirmaciones. El propietario administra su empresa; la cuenta maestra del operador tiene acceso técnico a las instalaciones registradas y conserva su identidad y marca de prueba en auditoría. Un administrador comercial no puede atribuirse ese acceso mediante cabeceras ni elegir otra empresa.

No se monta Docker socket ni se ejecutan comandos o Python suministrados por usuarios. «Reiniciar» crea otra ejecución del workflow y conserva la anterior; no reinicia contenedores del negocio. Este motor no envía WhatsApp ni confirma transacciones comerciales automáticamente.

## Nodos y persistencia

Salud, condición, aviso, revisión y agente. El editor guarda nombre, ámbito, orden y configuración del nodo. Las ejecuciones conservan la versión de sus pasos; editar un flujo no cambia ejecuciones anteriores. Se puede avanzar un paso, ejecutar hasta la siguiente revisión, pausar, cancelar y reiniciar. El inicio usa UUID idempotente. Un paso simultáneo no se repite. Tras un reinicio, un nodo interrumpido requiere revisión y no vuelve a llamar al proveedor automáticamente.

El volumen del worker guarda `configuracion`, `flujos`, `ejecuciones` y `consumo`. El de control contiene `oferta`: precios y créditos publicados. Las escrituras usan transacciones y versiones para impedir sobreescrituras concurrentes. No son tablas duplicadas del negocio.

## Planes y créditos

Desde Panel de mando > Planes y créditos se editan precios mensuales y créditos sugeridos: Esencial 1.000, Negocios 4.000 y Profesional 12.000; Empresarial se acuerda. No se alteran cupos de usuarios ni agentes. La landing lee `GET /api/v1/comercial/planes` sin caché; cambiar la oferta no cobra ni modifica contratos vigentes. La asignación de plan y cupo a cada empresa se hace explícitamente en su configuración del panel.

Crédito base: 1.000 tokens totales, redondeados hacia arriba y ponderados por el multiplicador asignado al modelo. Es una unidad interna, no un mensaje, dinero ni un costo garantizado del proveedor. Se reserva un máximo conservador antes de consultar y se concilia con el uso informado; sin metadatos queda estimado y visible. El cupo se cuenta por mes en America/Bogota. Un error libera la reserva; un corte con consumo incierto la mantiene pendiente para revisión, sin repetir el cobro. Ajustar la ponderación según el modelo contratado antes de ofrecer uso incluido.

API propia reutiliza la conexión protegida en Configuración > Agentes IA; su proveedor cobra al cliente y no se descuentan créditos incluidos. Local usa Ollama configurado, sin descargar modelos automáticamente. La capacidad depende del hardware. API Live continúa disponible en el agente de audio; un nodo de texto utiliza el proveedor de texto elegido.

La conexión incluida debe ser suministrada por el operador en `.local/workflows/proveedor-incluido.json`, montado solo en la API de esa empresa: `id`, `nombre`, `protocolo` (`openai`, `responses`, `gemini` o `anthropic`), `url` HTTPS, `modelo`, `apiKey` y opcionalmente `maxTokens` (256–8192). El archivo inicial está vacío y no se usa una clave del cliente como si fuera un servicio incluido. El cliente no puede leerlo ni editarlo desde Configuración. Cada instalación conserva su archivo privado. Las credenciales nunca se envían al control ni al navegador.

En el aplicativo del cliente, Configuración > Agentes IA > Híbrido permite elegir **Mi propia API** o **Créditos incluidos de ABINOVA**. Local y API Live conservan conexión propia. El asistente por voz y chat usa el mismo cupo del worker cuando se eligen créditos: reserva antes de consultar, concilia con tokens reportados y no llama al proveedor si no hay cupo. Una solicitud repetida con el mismo ID/versión no se vuelve a consumir. Un rechazo explícito de credenciales/campos/cuota devuelve su reserva; un fallo incierto conserva una estimación y no se reintenta silenciosamente. Si falta el proveedor incluido, se informa antes de reservar. La API propia y el modelo local no descuentan créditos incluidos. Los cambios inequívocos que no llaman al modelo tampoco consumen créditos.

Precios, descripciones, beneficios y promoción se editan en **Precios y condiciones**. La landing consume la oferta guardada al abrirse. Descuento y meses adicionales son configurables; los nombres de planes y sus cupos de usuarios/agentes no se cambian por esa ruta. No se activa una pasarela ni se capturan tarjetas.

## Comprobar la instalación

Usa `npm.cmd run verificar` y consulta `docker compose ps` y los logs de los workers.
Los scripts y stacks automatizados de QA se retiraron. El contexto histórico se
conserva localmente en el único contenedor inactivo `abinova-qa-contexto`.
El despliegue prepara los archivos privados y arranca ambos workers sin depender
de un perfil omitido en archivos `.env` antiguos.
