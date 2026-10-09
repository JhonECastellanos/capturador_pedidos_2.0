# 04 · Roadmap y tareas

> Constitución de AMBIÉ · Capturador de pedidos — archivo 4 de 4.
> Última revisión: 30/09/2026, a partir de `docs/info/AUDITORIA_PROFESIONAL.md`, `docs/info/OPORTUNIDADES_MEJORA.md`, `README.md` y `AGENTS.md`.

## 1. Cómo se usa este archivo

- Es la **memoria de trabajo del proyecto**. Al pedir «trabaja en la siguiente tarea», se toma el primer `[ ]` pendiente en orden de fases.
- Cada tarea cita su fuente: los IDs (`FE-`, `BE-`, `API-`, `BD-`, `INF-`, `NEG-`) corresponden a [`docs/info/OPORTUNIDADES_MEJORA.md`](../info/OPORTUNIDADES_MEJORA.md), donde está el detalle y la evidencia de cada una.
- Al completar: marcar `[x]` y anotar fecha + evidencia ejecutada (comando, prueba o documento). **No marcar sin evidencia.**
- Los resultados de pruebas son una muestra: no se extrapolan a capacidad máxima ni a cero fallos.

## 2. Objetivo vigente

Consolidar la rama **V3** como versión estable desplegable (reglas, contrato, caché, sincronización y QA en verde) y avanzar el roadmap por fases sin romper las invariantes del negocio. El despliegue al VPS real sigue pendiente de verificación externa.

## 3. Completado (con evidencia al 30/09/2026)

- [x] Monorepo con contrato `@ambie/contrato`; verificación de contrato con 14 enums (`npm run contrato:verificar`).
- [x] API NestJS + Fastify + Prisma/PostgreSQL con módulos por área, `AuthGuard` global, roles, auditoría de metadatos y envelope `{data,meta}`.
- [x] Autenticación por sesión: access 15 min, refresh opaco 7 días hasheado y rotado; revocación y rol consultados en cada solicitud.
- [x] Cuenta **system** idempotente, con protecciones verificadas en API y PostgreSQL; creación del primer administrador desde Usuarios.
- [x] Operación completa: pedidos en 4 pasos, reservas/consumo de stock, abonos FIFO, cobro directo, caja reversible, cierres, inventario por conteos, compras, precios, usuarios y venta ocasional (sin cliente, solo efectivo/billetera).
- [x] React Query en RAM (30 s / 5 min) + caché Redis versionada por revisión transaccional + sincronización cada 2 s (`ambie:datos-actualizados`).
- [x] Paginación remota en pantallas principales con `POR_PAGINA=30`; UI validada a 390×844 y 1440 px (y login en poca altura).
- [x] Frontend compilado con Nginx en Docker (8080); QA aislada `ambie-integracion` (8180/3100) con los 12 paneles aprobados.
- [x] Migración a TypeScript 6 (Node16, `rootDir`, sin `baseUrl`, caché incremental dentro de `dist`).
- [x] Pruebas vigentes: `verificar`, `prueba:cache`, `prueba:integracion` (18 casos QA), `prueba:carga` (170 pedidos), `prueba:paneles`, `seguridad:repositorio`.
- [x] Catálogo demo **optativo** (`demo:catalogo`, 32 productos / 8 clientes ficticios) separado de la semilla; la semilla no carga datos comerciales.
- [x] Documentación constitucional (`docs/constitucion/`) y archivo de la documentación anterior en `docs/info/`.

## 4. Pendiente por fases

### Fase 0 — Quick wins (sin cambiar dominio)

- [ ] BE-02: validación de variables de entorno al arranque + CORS estricto + helmet.
- [ ] BE-03: request-id + logger estructurado.
- [ ] INF-01/03/04/05/08/12: pin de `cloudflared`, endurecer `api`/`postgres`, `redis` healthy, healthcheck de `api` en Compose, gzip/CSP en Nginx, rotación de logs.
- [ ] BD-01: índices faltantes; BD-08: tuning de PostgreSQL y `connection_limit` de Prisma.
- [ ] FE-05 (Error Boundaries), FE-09 (zoom/foco), FE-10 (splitting/compresión).
- [ ] INF-09: CI que construya imágenes y valide `nginx -t`.

### Fase 1 — Robustez de datos y API

- [ ] API-01: idempotencia en POST críticos → FE-06: fin del `disabled` global de UI → BE-11 + FE-04: paginación servidor en productos/usuarios/conteos → BE-06/BE-07 (batching, control optimista) → BE-14/FE-12 (tests unitarios) → BE-10/BE-12/BE-13 → API-02/API-03.

### Fase 2 — Operación en producción

- [ ] INF-10/INF-11: respaldos de PostgreSQL + MinIO/config, retención y **ensayo de restauración en QA** → BE-15/BD-07 (retención de auditoría y tablas de crecimiento) → BD-03/BD-06 (CHECKs y triggers de invalidación) → FE-16 (versión/observabilidad) → INF-02/INF-07/INF-13.

### Fase 3 — Valor de negocio

- [ ] NEG-01 (ticket 80 mm) → NEG-02 (exportación completa xlsx/pdf) → NEG-03 (IVA/descuentos/listas) → NEG-04 (devoluciones) → NEG-05 (cuentas por pagar) → NEG-16 (respaldos desde la app) → NEG-06 (notificaciones) → NEG-07…NEG-13.

### Fase 4 — Estratégico

- [ ] NEG-14 (DIAN electrónica; requiere NEG-03) → NEG-15 fase 2 (offline con idempotencia) → FE-01/FE-02/FE-03 (re-arquitectura del frontend, con tests ya en verde) → evaluar escalado horizontal (INF-14).

## 5. Pendientes explícitos de la última auditoría (30/09/2026)

- [ ] VPS/HTTPS real: DNS, túnel y firewall externos (la configuración local no acredita el servidor remoto).
- [ ] Actualización de dependencias vulnerables (la revisión reportó 7 alertas en Prisma/MinIO; reverificar al abordarlo).
- [ ] Paginación remota de snapshots heredados: pantallas que aún descargan historial completo hacia el cliente.
- [ ] Restauración completa ensayada (los dumps se verificaron con `pg_restore --list`, no restaurados en otra base).
- [ ] Carga sostenida, 100.000 pedidos históricos y multi-instancia (la prueba de carga fue una muestra local).

## 6. Checklist obligatorio por cambio

- [ ] ¿Toca enum o campo? → `schema.prisma` → `Compartido/` → `npm run contrato:verificar` → `EQUIVALENCIA_VARIABLES.txt`.
- [ ] ¿Toca dinero, stock, caja o cierre? → transacción + bloqueos existentes + consecutivos dentro de la transacción.
- [ ] ¿Cambia fórmula o agregado? → subir prefijo de formato de caché del tablero + comparar reportes antes/después.
- [ ] ¿Trae migración? → aditiva (`CONCURRENTLY`, `NOT VALID`, `ON CONFLICT`), probada en QA con volumen.
- [ ] ¿Endpoint nuevo? → envelope `{data}`/`{data,meta}` + rate-limit acorde + documentar en el diccionario.
- [ ] ¿Escritura nueva? → idempotencia (API-01) + auditoría de metadatos con `requestId` cuando exista.
- [ ] ¿Tabla operativa nueva? → agregarla a los triggers de invalidación (dashboard y sincronización).
- [ ] Probado en `ambie-integracion` (8180/3100), nunca contra el negocio.
- [ ] `npm run verificar` en verde + recorrido 390×844 / 1440 px si toca UI.
- [ ] ¿Toca datos? → respaldo previo; si toca respaldos, ensayo de restauración en QA.

## 7. Fuentes

- [`docs/info/OPORTUNIDADES_MEJORA.md`](../info/OPORTUNIDADES_MEJORA.md) — detalle y evidencia de cada ID.
- [`docs/info/AUDITORIA_PROFESIONAL.md`](../info/AUDITORIA_PROFESIONAL.md) — resultados ejecutados y fechas.
- [`docs/info/PRUEBAS_CARGA.md`](../info/PRUEBAS_CARGA.md) — cifras de carga y límites antiabuso.
- [`docs/info/DESPLIEGUE_CONTINUO.md`](../info/DESPLIEGUE_CONTINUO.md) — publicación y runner.
- [`README.md`](../../README.md) y [`AGENTS.md`](../../AGENTS.md) — comandos y convenciones.
