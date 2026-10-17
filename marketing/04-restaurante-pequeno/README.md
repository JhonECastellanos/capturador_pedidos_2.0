# P04 · Restaurante pequeño

Camilo, personaje hipotético; personaje hipotético, no testimonio.

Necesita pedidos, cobros, gastos e inventario de referencias definidas. Se excluyen cocina avanzada, mesas, recetas, ingredientes automáticos y domicilios integrados.

**Cargo:** Propietario de restaurante de operación sencilla. **Sector:** Pedidos sencillos de alimentos por unidad en un único local.

Ordenar la parte comercial del restaurante con pedidos y cobros revisables por voz o chat dentro de las funciones existentes.

## Contenido por red y ángulo

Tres ángulos, con copy A/B, STORYBOARD y PROMPTANIMACION en un único CONTENIDO.md por red. Instagram comparte una portada por perfil para sus tres propuestas de reels. TikTok incluye una copia local exacta de la foto original, sin MP4 exportados.

- Facebook: [Un encargo todavía por entregar](facebook/CONTENIDO.md#angulo-1-copy) · [No toda salida es mercancía](facebook/CONTENIDO.md#angulo-2-copy) · [La carta y el catálogo coinciden](facebook/CONTENIDO.md#angulo-3-copy)
- Instagram: [Un encargo todavía por entregar](instagram/CONTENIDO.md#angulo-1-copy) · [No toda salida es mercancía](instagram/CONTENIDO.md#angulo-2-copy) · [La carta y el catálogo coinciden](instagram/CONTENIDO.md#angulo-3-copy)
- TikTok: [Un encargo todavía por entregar](tiktok/CONTENIDO.md#angulo-1-copy) · [No toda salida es mercancía](tiktok/CONTENIDO.md#angulo-2-copy) · [La carta y el catálogo coinciden](tiktok/CONTENIDO.md#angulo-3-copy)

## Dolores propuestos para validar

### P04-D01 · Encargo sin estado de entrega

- causa: Se guarda una nota sin seguimiento
- consecuencia: No se sabe qué falta entregar
- frustracion: Yo pensé que ya salió
- impacto_administrativo: Revisar pedidos abiertos
- impacto_economico: Riesgo de entrega omitida
- workaround: Preguntar en el mostrador
- funcion: Estados de pedidos
- beneficio: Consultar el estado registrado

Hipótesis; impacto no medido.

### P04-D02 · Porciones mal anotadas

- causa: Corrección verbal no llega al registro
- consecuencia: El encargo no coincide
- frustracion: Faltó una unidad
- impacto_administrativo: Revisar detalle
- impacto_economico: Riesgo de reposición por error
- workaround: Tachar la nota
- funcion: Corrección de líneas
- beneficio: Revisar unidades finales

Hipótesis; impacto no medido.

### P04-D03 · Gastos mezclados con compras

- causa: Se anota toda salida igual
- consecuencia: No se explica qué salió de caja
- frustracion: No sé qué fue mercancía
- impacto_administrativo: Clasificar documentos
- impacto_economico: Riesgo de lectura de costos errada
- workaround: Lista general de salidas
- funcion: Compras, gastos y egresos separados
- beneficio: Consultar cada tipo de movimiento

Hipótesis; impacto no medido.

### P04-D04 · Cobro parcial olvidado

- causa: El dinero se recibe durante atención
- consecuencia: No se actualiza la deuda
- frustracion: Ya dejó un abono
- impacto_administrativo: Conciliar saldo
- impacto_economico: Riesgo de cobro repetido
- workaround: Nota al lado del nombre
- funcion: Abonos y cartera
- beneficio: Aplicar pago al cliente

Hipótesis; impacto no medido.

### P04-D05 · Pedido cancelado conserva reserva

- causa: Se elimina la nota física
- consecuencia: No se refleja la cancelación permitida
- frustracion: Eso ya no hay que entregarlo
- impacto_administrativo: Revisar efectos del pedido
- impacto_economico: Riesgo de disponibilidad mal leída
- workaround: Aviso verbal
- funcion: Cancelar pedidos abiertos
- beneficio: Revertir reserva y pago cuando corresponde

Hipótesis; impacto no medido.

### P04-D06 · Bebidas recibidas no registradas

- causa: Compra llega en hora de atención
- consecuencia: Existencias quedan atrasadas
- frustracion: Entraron más pero no aparecen
- impacto_administrativo: Conciliar recepción
- impacto_economico: Riesgo de compra innecesaria
- workaround: Dejar soporte en caja
- funcion: Recepciones por producto
- beneficio: Registrar entradas

Hipótesis; impacto no medido.

### P04-D07 · Expectativa de recetas automáticas

- causa: Se confunde pedido con consumo por ingrediente
- consecuencia: Se espera un inventario no implementado
- frustracion: El pedido no descuenta la receta
- impacto_administrativo: Delimitar catálogo
- impacto_economico: Riesgo de elección de software inadecuada
- workaround: Hoja de ingredientes aparte
- funcion: Catálogo y stock de referencias por unidad
- beneficio: Evaluar el encaje real sin prometer recetas

Hipótesis; impacto no medido.

### P04-D08 · Pago por otro medio sin corregir

- causa: Se conserva selección inicial
- consecuencia: El cierre compara medios distintos
- frustracion: No era efectivo
- impacto_administrativo: Conciliar cobros
- impacto_economico: Riesgo de descuadre
- workaround: Captura del pago
- funcion: Revisión del método
- beneficio: Registrar el medio confirmado

Hipótesis; impacto no medido.

### P04-D09 · Conteo al cierre incompleto

- causa: Solo se cuenta lo más visible
- consecuencia: Se ajustan líneas no revisadas en hoja manual
- frustracion: No conté todo eso
- impacto_administrativo: Delimitar conteo
- impacto_economico: Riesgo de ajuste indebido
- workaround: Marcar líneas con lápiz
- funcion: Conteos parciales aplican líneas digitadas
- beneficio: Respetar el alcance contado

Hipótesis; impacto no medido.

### P04-D10 · Confundir ventas con dinero disponible

- causa: Se mira solo total de pedidos
- consecuencia: Se ignoran créditos y salidas
- frustracion: La venta no coincide con caja
- impacto_administrativo: Conciliar operación y caja
- impacto_economico: Riesgo de disposición de fondos sin respaldo
- workaround: Sumar recibos
- funcion: Resumen, cartera y caja
- beneficio: Comparar conceptos distintos

Hipótesis; impacto no medido.

## Fuentes y alcance

Referencias DANE-EMICRON, LOYVERSE, ALEGRA en [fuentes](../datos/fuentes.json). Contexto secundario; sin entrevistas nuevas ni prueba de ejecución de estos guiones. [Ficha hipotética](../datos/fichas-hipoteticas.json).

Asistente de voz/chat configurado; catálogo y referencias existentes; permisos de la sesión. Revisar y aclarar antes de confirmar. La interpretación puede requerir correcciones. No se garantiza entender toda instrucción.

[Fotografía original](../recursos/originales/04.png) · [Índice](../datos/README.md)
