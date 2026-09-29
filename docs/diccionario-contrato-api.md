# Contrato de API — AMBIÉ

Base URL: `/api/v1`. Respuesta estándar:

```json
{ "data": { }, "meta": { "pagina": 1, "porPagina": 20, "total": 0 } }
```

Errores: `{ "code": "CODIGO_ESTABLE", "message": "Mensaje legible" }`.

- Dinero: cadena decimal (`"12500.00"`), nunca `float`.
- Fechas operativas: `YYYY-MM-DD`. Marcas de auditoría: ISO-8601 UTC.
- Autenticación: cookie `HttpOnly` `ambie_session` (no se envían tokens en el cuerpo).
- `nequi` ya no existe como valor de negocio: el método es `billetera`.

## Auth

| Método | Ruta | Notas |
|---|---|---|
| `POST` | `/auth/bootstrap` | Crea el **primer** administrador (una sola vez). `{ email, password }` |
| `POST` | `/auth/login` | `{ identifier, password }`; identifier = correo o `USR-0001` |
| `POST` | `/auth/logout` | revoca la sesión |
| `GET` | `/auth/me` | usuario + `permisos` derivados del rol |

## Clientes

- `GET /clientes?q=&page=&pageSize=` — incluye `saldoPendiente` y `estadoCuenta` derivados.
- `GET /clientes/:clienteId`
- `GET /clientes/:clienteId/cartera` — saldo, pedidos abiertos, periodicidad.
- `POST /clientes` — `{ nombre, telefono, direccion, fechaNacimiento?, tipoCredito?, alias?, identificacion?, ciudad? }`

## Productos

- `GET /productos?q=&categoria=&stockEstado=alerta|ok&page=&pageSize=`
- `GET /productos/:productoId`
- `POST /productos` — `{ nombre, categoria?, unidad?, precioVenta, costoActual?, stock?, stockMinimo? }`
- `POST /productos/:productoId/precio` — `{ nuevoPrecio }`; audita en `cambiosPrecio`.

## Pedidos

- `GET /pedidos?segmento=hoy&estado=&q=&page=&pageSize=`
- `GET /pedidos/:pedidoId` — incluye `pago` derivado, `lineas`, `historialEstados`, `facturaNumero`.
- `POST /pedidos`:

```json
{
  "clienteId": "uuid",
  "lineas": [{ "productoId": "uuid", "cantidad": 2 }],
  "metodo": "efectivo | billetera | credito",
  "estadoInicial": "pendiente | entregado",
  "momentoCobro": "inmediato | al-entregar | segun-periodicidad"
}
```

  Efectos en una transacción: números `PED`/`FAC`, líneas con snapshot, factura interna,
  reserva de stock (+consumo si `entregado`), historial, pago inicial y caja si `inmediato`.
  Errores: `SOBREVENTA`, `PRODUCTO_INVALIDO`.
- `PATCH /pedidos/:pedidoId/estado` — `{ estado, comentario? }`.
  Transiciones: `pendiente → en-preparacion | entregado | cancelado`; `en-preparacion → entregado | cancelado`.
  No se cancela `entregado` ni se reactiva `cancelado` (v1). Errores: `TRANSICION_INVALIDA`.

## Pagos y créditos

- `POST /pedidos/:pedidoId/pagos` — cobro directo del pedido exacto.
  `{ monto?, metodo: "efectivo"|"billetera", comentario? }`; si se omite `monto`, cobra el saldo completo.
  Errores: `SIN_SALDO`, `MONTO_EXCEDE_SALDO`, `PEDIDO_CANCELADO`.
- `POST /clientes/:clienteId/abonos` — abono FIFO sobre la cartera del cliente.
  `{ monto, metodo, comentario? }`. Errores: `PAGO_EXCEDE_CARTERA`, `SIN_CARTERA`.
- `GET /abonos?clienteId=&page=&pageSize=` — historial con `pedidosAfectados`.

## Inventario

- `GET /inventario/conteos`, `GET /inventario/conteos/:conteoId`
- `POST /inventario/conteos` — `{ tipo: "general"|"aleatorio", cantidadAleatoria?, turno }`
- `PATCH /inventario/conteos/:conteoId/lineas/:productoId` — `{ stockFisico }`
- `POST /inventario/conteos/:conteoId/finalizar`
- `POST /inventario/conteos/:conteoId/cancelar`
- `POST /inventario/conteos/:conteoId/aplicar-ajuste` — errores: `CONTEO_NO_CONFIRMADO`, `AJUSTE_DUPLICADO`
- `POST /inventario/ajustes` — `{ productoId, stockFisico, motivo?, comentario? }`

## Compras y caja

- `GET /proveedores`, `POST /proveedores` — `{ nombre, telefono? }`
- `GET /recepciones-compra?page=&pageSize=`
- `POST /recepciones-compra` — `{ proveedorId, lineas: [{ productoId, cantidad, costoUnitario }], descontarCaja? }`
- `POST /gastos` — `{ concepto, monto, metodo? }`
- `GET /caja/movimientos?tipo=ingreso|egreso&metodo=&page=&pageSize=` — incluye totales en `meta`.
- `POST /caja/egresos` — egreso manual `{ concepto, monto, metodo? }`.

## Cierres

- `GET /cierres/:fecha/previsualizacion` — sin escritura: ventas, ingresos, egresos, esperado por medio y pendientes.
- `POST /cierres/:fecha` — `{ trasladar?: string[], cancelar?: string[], conteoEfectivo?, conteoBilletera? }`.
  Un solo cierre por fecha. Errores: `CIERRE_YA_EXISTE`.
- `GET /cierres?page=&pageSize=` — historial.

## Usuarios y dashboard

- `GET /usuarios`, `POST /usuarios` — `{ nombre, email, rol, password }` (Argon2id).
- `PATCH /usuarios/:usuarioId/estado` — activar/desactivar.
- `GET /dashboard/resumen` — `ventasHoy`, `gastosHoy`, `comprasHoy`, `ticketPromedio`,
  `creditoPendiente`, `alertasStock`, `topProductos`, `topClientes`.

## Compatibilidad con el frontend actual

Los DTO conservan la forma actual aunque la base sea relacional:
`pago { metodo, montoRecibido, saldoPendiente, estado, recordatorioWhatsApp }`,
`lineas`, `historialEstados`, `pedidosAfectados` y `stock`/`stockDisponible`.
El módulo `nequi → billetera` se aplicará en la Fase 4 del frontend.
