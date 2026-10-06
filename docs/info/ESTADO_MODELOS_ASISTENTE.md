# Estado comprobado de los modelos

En Configuración, **Consultar modelos disponibles** obtiene el catálogo con la conexión escrita o guardada y prueba sus modelos uno a uno. Cada solicitud envía una instrucción breve de diagnóstico, sin datos del negocio. La clave permanece privada y las pruebas no guardan configuración, pedidos, inventario ni auditoría comercial.

El desplegable y las sugerencias del campo Modelo muestran el icono y texto junto al nombre. El valor enviado sigue siendo el identificador original, sin iconos.

| Icono | Significado de la última prueba |
|---|---|
| 🟢 Respondió | El modelo confirmó la prueba con esta conexión en ese momento. |
| 🟡 Cuota diaria agotada | El proveedor devolvió 429 e identificó expresamente una cuota diaria. Puede ser una cuota de solicitudes o tokens; no se inventa una cantidad restante. |
| 🟡 Cuota o límite alcanzado | Hay un 429 sin información suficiente para distinguir día/minuto. |
| 🟡 Temporalmente no disponible | Saturación 503, límite por minuto, timeout o respuesta incompleta. No significa modelo inutilizable definitivamente. |
| 🔴 Sin acceso o incompatible | Clave/permisos rechazados, modelo/ruta inválidos, parámetros incompatibles, pago requerido o cuota asignada igual a cero. Describe esta conexión; su situación puede cambiar. |
| ⚪ Sin comprobar / ⏳ Comprobando | No hay un resultado válido todavía. |

El texto debajo del modelo seleccionado conserva el motivo y la hora de la prueba. Se puede elegir mientras continúa la revisión, detenerla o volver a probar el modelo seleccionado. Detener evita nuevas solicitudes; una que Google ya recibió puede terminar y consumir cuota. Cambiar clave, proveedor o URL descarta resultados de otra conexión. Recargar o salir del panel también los descarta: no hay un estado global compartido entre cuentas ni resultados privados en localStorage.

## Alcance de la comprobación

Una prueba verde **no garantiza disponibilidad futura**, cuota suficiente para cualquier pedido ni compatibilidad con toda instrucción larga. El catálogo de Google publica métodos y límites de contexto, no el saldo de cuota de tu cuenta ni una garantía de servicio. Un 429 puede ser por minuto, día o gasto; un 503 puede ser temporal. La clasificación solo muestra información comprobada, sin deducir que un modelo es gratuito por su nombre.

Las pruebas consumen cuota. En una cuenta con facturación activa pueden tener costo. El botón lo explica antes de ejecutarlas; no cambia planes, activa facturación ni cambia automáticamente de modelo. No hay reintentos externos automáticos, para evitar multiplicar el consumo. La revisión utiliza una solicitud a la vez y el servidor comparte el límite de dos solicitudes activas del asistente.

Se reutilizan las rutas existentes `/asistente/modelos` y `/asistente/conexion`, el contrato compartido y la conexión cifrada actual. El resultado normal de una prueba negativa se devuelve como `ComprobacionModeloAsistenteDTO` para pintar el estado; los fallos de autenticación, validación y transporte de la aplicación siguen siendo errores HTTP. Las órdenes del asistente conservan sus errores habituales cuando el proveedor falla.

No se agregan tablas, migraciones, proveedores ni una lista fija de modelos.

## Validación

`npm.cmd run prueba:asistente` comprueba cuota diaria, límite por minuto, cuota cero, 403/404, 503 y respuestas incompletas, incluyendo metadatos inesperados y ausencia de filtración del cuerpo remoto. La comprobación de conexión también utiliza el formato habitual de Groq/API compatible.

`node Backend/scripts/probar-modelos-ui.cjs` recorre Chrome con respuestas controladas: iconos por opción, nombre original al guardar, selección durante el progreso, detener sin aceptar respuestas tardías, invalidar al cambiar clave y 390×844 sin desborde. No usa claves reales ni proveedores externos.

### Comprobación real del 6 de octubre de 2026

Tras recompilar y desplegar en `http://localhost:8080`, Chrome consultó el catálogo con la conexión de Google ya guardada y completó las 45 pruebas: 7 modelos respondieron, 21 indicaron cuota diaria agotada, 8 tuvieron fallos temporales y 9 rechazaron el acceso o el formato de esta conexión. Son resultados puntuales de esa cuenta, no una lista fija ni una promesa de disponibilidad.

Entre los que respondieron estuvieron `gemini-2.5-flash-lite`, `gemini-3.1-flash-lite` y `gemini-3.5-flash-lite`. El seleccionado, `gemini-3.5-flash`, terminó por tiempo de espera y apareció amarillo. Se comprobó la selección de uno verde sin guardar ni reemplazar la configuración existente. No se modificaron datos comerciales.

Pasaron la verificación completa del proyecto, las 21 pruebas del asistente y los 6 recorridos de interfaz con respuestas controladas. Las pruebas reales anteriores complementan esos recorridos; no validan el micrófono físico ni todas las instrucciones que podría recibir un modelo.

Referencias del proveedor: [catálogo de modelos](https://ai.google.dev/api/models), [límites de uso](https://ai.google.dev/gemini-api/docs/rate-limits), [errores de GenerateContent](https://ai.google.dev/gemini-api/docs/generate-content/api-errors).
