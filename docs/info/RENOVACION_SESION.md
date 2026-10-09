# Renovación de sesión y lectura de archivos

Un `401` en `GET /api/v1/archivos` significa que la API no aceptó la sesión. La ruta lista imágenes y comprobantes privados: se conserva su autenticación. El mensaje de consola, por sí solo, no permite distinguir una cookie vencida de una sesión revocada.

Antes del ajuste del 6 de octubre de 2026, el navegador renovaba únicamente después de recibir un 401. Las consultas paralelas compartían la renovación mientras estaba pendiente, pero una respuesta 401 tardía podía iniciar otra rotación después de que la primera hubiera terminado.

Ahora `/auth/me` devuelve `expiraEn`, la fecha del vencimiento del JWT verificado, junto a los datos existentes del usuario. Login y refresh ya devolvían esa fecha. El navegador conserva la fecha solo en RAM y renueva antes de una solicitud protegida si quedan 30 segundos o menos, también al volver de una pestaña suspendida. No se agregan temporizadores de renovación ni almacenamiento de tokens en JavaScript; las cookies siguen siendo HttpOnly.

Las solicitudes comparten la renovación pendiente. Si un 401 pertenece a una lectura enviada antes de una renovación ya completada, se reintenta con las cookies actuales sin volver a rotarlas. Una consulta cancelada no inicia renovación. Los reintentos de escritura conservan la misma clave de idempotencia.

Si refresh devuelve 401, se emite una sola notificación de sesión expirada, se limpia la caché mediante el flujo existente y se bloquean nuevas consultas protegidas hasta un nuevo ingreso. Si falla la red o el servidor de renovación, se informa el fallo y se permite reintentar: no se confunde con una revocación. Cerrar sesión también bloquea lecturas pendientes de esa sesión.

No se garantiza que nunca aparezca un 401: sigue siendo la respuesta correcta cuando alguien revoca una sesión, se pierde una cookie o vence el acceso antes de que se conozca su fecha al abrir la aplicación. El ajuste evita los rechazos habituales por vencimiento conocido y las renovaciones repetidas; no oculta errores ni permite leer archivos sin sesión.

## Pruebas

`node Backend/scripts/probar-sesion-ui.cjs` ejecuta Chrome y el transporte real del frontend contra respuestas controladas. Comprueba seis casos: renovación anticipada compartida, 401 tardíos con una sola renovación, revocación sin más solicitudes y posterior ingreso, recuperación de red sin expulsar al usuario, cancelación sin renovación y reintento de escritura con la misma clave. No escribe datos comerciales ni usa credenciales reales.

También se ejecutaron `npm.cmd run verificar`, `npm.cmd run prueba:cache` y `node --test scripts/probar-guardados.mjs`. La verificación completa aprobó con las advertencias de lint preexistentes.

En producción local, Chrome inició una sesión de diagnóstico y abrió Configuración. Se adelantó temporalmente el reloj del navegador hasta el margen de renovación y se restauró al iniciar refresh; no se cambió la fecha del servidor ni se esperaron quince minutos reales. La API y PostgreSQL fueron reales, sin respuestas simuladas: dos lecturas de `/archivos` respondieron 200, se completó una sola renovación, no hubo 401 ni errores de ejecución durante el recorrido y el cierre de sesión terminó correctamente. No se escribieron datos comerciales.

La actualización se desplegó con respaldo previo y los servicios saludables. Las pestañas abiertas deben recargarse para usar la compilación nueva.
