# Ajustes de navegación por voz — V4P1

Validación del 01/10/2026. V4P1 parte del commit e808513 de V3. No crea otra empresa, base de datos ni instalación Docker.

## Alcance

- Nombre exacto de cliente único: selección y avance a productos; corrección del cliente en el mismo borrador. Selección manual conserva confirmación de identidad.
- Confirmación de productos independiente del orden de líneas; respeta avance y retroceso explícitos sin regresar involuntariamente a productos.
- Dictado conjunto de productos, entrega y pago; la confirmación explícita valida y refleja los pasos en los formularios antes del guardado normal. Datos incompletos no guardan.
- Regreso al inicio de Ventas después del guardado por voz, con oferta de pedido/cliente/abono y acceso a factura. Guardado manual conserva la pantalla de éxito.
- Retroceso genérico y a campos existentes de cada operación; conserva borradores y permisos.

## Evidencia ejecutada

- `npm.cmd run verificar`: contrato de 14 enums, backend, tipos CLI/scripts, frontend y lint aprobados. Se conservan advertencias previas de React.
- `node --test Backend/scripts/probar-asistente.cjs`: 17 pruebas aprobadas, incluida selección directa y dictado conjunto; sin proveedores externos.
- `npm.cmd run prueba:cache`: 2 pruebas aprobadas.
- `node Backend/scripts/probar-asistente-ui.cjs`: vendedor y administrador aprobados en Chrome, con API y transcripciones simuladas. Tres pedidos por rol solo en el mock; consulta de factura no agrega escrituras. Verifica móvil 390×844 y escritorio 1440×900, sin modal del asistente, cliente directo/corrección, productos, entrega, pago, regreso al inicio y precios históricos.
- El recorrido administrativo verifica créditos/abonos, compras, inventario/conteos, cierre, caja, precios, usuarios y navegación de secciones, con retroceso/cancelación. No certifica todas las frases posibles ni todas las escrituras de cada módulo.
- `npm.cmd run seguridad:repositorio`: sin patrones sensibles detectados en archivos revisados; no sanea el historial anterior. Configuraciones de agentes, claves y respaldos excluidos.

No se usó micrófono físico ni inferencia remota. Las pruebas concretas no garantizan reconocimiento perfecto con ruido, acentos o dispositivos reales. La actualización de imágenes y la publicación en GitHub son pasos separados de estas pruebas; un commit local no equivale a un push confirmado.
