# 03 · Estándares de código

> Constitución de AMBIÉ · Capturador de pedidos — archivo 3 de 4.
> Última revisión: 30/09/2026.
> Objetivo: que el código nuevo se lea como el existente. Las convenciones descritas se tomaron del código real, no de preferencias externas.

## 1. Idioma

- **Identificadores del dominio, comentarios y mensajes de error en español**: `pedidos`, `clienteId`, `ErrorDominio`, `saldoPendiente`, `hoyLocal`. Es la convención de todo el monorepo.
- **Textos visibles al usuario: español** (Colombia). Aún no hay i18n (mejora pendiente FE-08); no inventar claves en inglés para textos de interfaz.
- El vocabulario sigue al negocio: pedido, abono, cartera, conteo, cierre, reserva, egreso, gasto.

## 2. Convenciones de nombres

| Elemento | Convención | Ejemplo real |
|---|---|---|
| Archivos y carpetas (Backend, CLI, utils) | kebab-case | `pedidos.service.ts`, `cliente-api.ts`, `utils/fechas.ts` |
| Componentes y pantallas | PascalCase `.tsx` | `BuscadorInput.tsx`, `RutasVentas.tsx` |
| Archivos intermedios de contexto/hooks | guion entre palabras | `auth-context.ts` (Windows no distingue mayúsculas) |
| Hooks | `useAlgo`, en archivo separado del proveedor | `useSincronizacion`, `useAviso`, `usePaginaApi` |
| Tipos y DTO | nombre del dominio + sufijo `DTO` | `PedidoDTO`, `RevisionDatosDTO` |
| Esquemas Zod | sufijo `Esquema`/`Schema` | `LoginEsquema`, `NuevoPedidoSchema` |
| Enums | MAYÚSCULAS en código; `@map` en minúsculas en base | `EstadoPedido.CANCELADO` ↔ `'cancelado'` |
| Constantes | MAYÚSCULAS | `POR_PAGINA` |
| Claves y eventos del navegador | prefijo `ambie:` | `ambie:v2:*`, `ambie:datos-actualizados`, `ambie:voz-paso`, `ambie:voz-cliente`, `ambie:voz-detenida` |
| Scripts npm (raíz) | `área:acción` | `prueba:cache`, `api:verificar`, `front:build` |

Ojo con los enums: el cliente Prisma expone `EstadoPedido.CANCELADO`, pero la base guarda `'cancelado'`. En SQL crudo usar el valor `@map`; para traducir rol a `codigo` existe `Backend/src/common/roles.ts` (`codigoDeRol`).

## 3. TypeScript

- **Backend** (`Backend/tsconfig.json`): `strict`, `rootDir ./src`, `module`/`moduleResolution: Node16`, `target ES2022`, sin `baseUrl`. `tsconfig.build.json` deja el `tsBuildInfoFile` **dentro de `dist`** (Nest borra `dist` al compilar; fuera de allí puede parecer que compiló sin emitir).
- **CLI** (`tsconfig.cli.json`): `rootDir .`, `noEmit`; se revisa con `npm run api:verificar`, no con `nest build`.
- **Frontend**: TypeScript 6 con `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `noFallthroughCasesInSwitch`, `moduleResolution: bundler`, `noEmit`.
- Reglas duras:
  - NUNCA tapar errores con `ignoreDeprecations` ni convertir el proyecto a ESM para resolver una dependencia.
  - Si el cliente Prisma está desactualizado tras instalar dependencias o tocar el esquema: `npx prisma generate --schema Backend/prisma/schema.prisma`. No disimular con cambios de configuración.
  - Ignorar `*.tsbuildinfo` en Git y Docker.

## 4. Manejo de errores

- El backend lanza `ErrorDominio(codigo, mensaje, status)`; `FiltroErrores` responde siempre `{ code, message }`.
- Códigos estables en uso (documentados en el diccionario del contrato):

| Código | Significado |
|---|---|
| `VALIDACION` | Entrada inválida (Zod; 400). |
| `SOBREVENTA`, `PRODUCTO_INVALIDO` | Creación de pedido. |
| `TRANSICION_INVALIDA` | Cambio de estado no permitido. |
| `SIN_SALDO`, `MONTO_EXCEDE_SALDO`, `PEDIDO_CANCELADO` | Cobros directos. |
| `PAGO_EXCECE_CARTERA`, `SIN_CARTERA` | Abonos. |
| `CONTEO_NO_CONFIRMADO`, `AJUSTE_DUPLICADO` | Inventario. |
| `CIERRE_YA_EXISTE` | Cierre del día duplicado. |
| `HTTP_ERROR`, `INTERNAL_ERROR` | Fallback; el 500 es genérico y se registra en el servidor. |

- Mensajes legibles en español; **no filtrar detalles internos** al cliente en errores 5xx.
- Validación con Zod: esquemas compartidos en `Compartido/src/esquemas.ts` (reutilizados por API, frontend y CLI). En controladores conviven `safeParse` y `parse` puntuales; la unificación es una mejora pendiente (BE-02), no un permiso para agregar variantes nuevas.
- Frontend: mostrar el mensaje del error; **no cerrar un formulario antes de confirmar la escritura**; si la lectura posterior falla, avisar que ya se guardó (evitar duplicados).

## 5. Fechas, dinero y cantidades

- Fechas: viajan ISO 8601; filtros y cierres con `YYYY-MM-DD`; cálculo de día con calendario local `America/Bogota`. Usar las utilidades existentes (frontend: `utils/fechas.ts`; backend: `common/crypto.ts`) antes de escribir otra variante.
- Dinero: `numeric(18,2)` en base y **cadena decimal** en JSON. No introducir `float`/`Number` en sumas de dinero; hay castings `::float8` heredados catalogados como pendiente (BE-08): no ampliarlos y corregirlos al tocar esas consultas.
- Cantidades: enteros.
- Paginación: `POR_PAGINA=30`; filtros antes de paginar; el límite visual nunca recorta saldos, totales, FIFO ni líneas de documentos.
- Consecutivos: solo con `Backend/src/common/consecutivos.ts`, dentro de la transacción.

## 6. Interfaz (React + Tailwind)

- Reutilizar antes de crear. Componentes disponibles en `Frontend/src/components/`: `Boton`, `BuscadorInput`, `SegmentoControl`, `ListaVacia`, `TarjetaClicable`, `TarjetaProducto`, `SelectorOpciones`, `SelectorCantidad`, `TarjetaAccion`, `Paginacion`, `ConfirmarAccion`, `TiraToast` (+ `useAviso`), `PantallaCompletaAdmin`, `VistaImagenProducto`, `BarraInferior`, `BarraSuperior`, `GuiaAyuda`. También `MetricaFiltro` en `modules/administracion/components/`.
- `Boton` usa `type="button"` por defecto; los formularios que guardan deben indicar `type="submit"`.
- Diseño mobile-first: áreas táctiles, pies fijos, scroll interno; conservar los tokens de `index.css` y el lenguaje visual.
- Login: conservar `overflow-y-auto`, contenido sin encogimiento y márgenes automáticos (evitar centrado que recorte con poca altura).
- Actualizaciones remotas: mantener snapshot, filtros, borradores y scroll; no desmontar pantallas; bloquear acciones sobre páginas anteriores con aviso de actualización.
- Esperar la confirmación de escritura antes de cerrar formularios.

## 7. Estilo observado (mantener)

- `async/await` es la forma principal. `.then()` se reserva para casos concretos: mapeo de export en `React.lazy` y cadenas puntuales dentro de efectos.
- Comentarios breves `/** … */` en español sobre clases y funciones del backend (servicios, guardas, utilidades). El proyecto no exige JSDoc general.
- Imports del contrato siempre desde `@ambie/contrato`; nunca copiar tipos a mano.
- No duplicar funciones existentes (búsqueda, fechas, series, formato): extraer utilidad compartida y migrar los usos.

## 8. Git y revisión

- Rama de trabajo: **V4P1**, creada desde el estado consolidado de V3 por solicitud del usuario el 01/10/2026. La entrega hacia la rama principal se hace por pull request; el workflow detecta la rama principal de GitHub (no asumir que se llama `main`).
- Mensajes descriptivos, sin atribuciones automáticas.
- Antes de commit: revisar diff, archivos nuevos y secretos; **no versionar** `.env`, tokens, dumps, volúmenes, `.local`, sesiones del CLI ni datos reales. `.env.example` solo con placeholders.
- `npm run seguridad:repositorio` complementa la revisión (no sanea el historial de Git).
- No hacer push ni cambiar la rama principal remota sin petición expresa.

## 9. Antes de cerrar un cambio

1. `npm run verificar` en verde (contrato + API + frontend).
2. Si toca interfaz: revisar 390×844 y 1440 px (y 320×320 en login).
3. Si toca datos: probar en QA (`ambie-integracion`), nunca contra el negocio.
4. Checklist completo por tipo de cambio en [`04_roadmap_y_tareas.md`](04_roadmap_y_tareas.md).

## 10. Referencias

- [`01_stack_y_reglas.md`](01_stack_y_reglas.md) — reglas no negociables.
- [`02_arquitectura.md`](02_arquitectura.md) — estructura y ubicaciones.
- [`docs/info/diccionario-contrato-api.md`](../info/diccionario-contrato-api.md) — contrato de la API.
- [`docs/info/OPORTUNIDADES_MEJORA.md`](../info/OPORTUNIDADES_MEJORA.md) — mejoras citadas por ID.
