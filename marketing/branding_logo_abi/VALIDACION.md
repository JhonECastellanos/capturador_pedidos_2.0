# Validación focal ABI — 2026-10-17

- React: guía vercel-react-best-practices; decoración estática, referencias para arrastre, listeners con limpieza, sin librería de animación.
- TypeScript focal de RobotAsistente y última ejecución completa de Frontend/tsconfig.app.json (incluye Control): aprobados. Lint de RobotAsistente y Control/src/main.tsx: aprobado. Sintaxis de landing/js/abi.js: aprobada.
- Chrome local / Playwright: componente visual cliente aislado y landing en 390x844, 1440x900 y 320x320; capturas inspeccionadas. Estados, foco de formulario y teclado después de arrastrar, límites de ventana, reduced motion y callbacks de toque/doble toque aprobados. Touch emulado aprobado; no equivale a dispositivo físico.
- Operador real, ruta /operador/acceso: ABI visible, guía abre/cierra en los tres tamaños, sin llamadas a endpoints de agente ni errores JavaScript. No se autenticó ni se probaron operaciones del negocio.
- Assets: SVG nativo transparente, copias de originales, favicon y sello idénticos; PNG 192/512 rasterizados en Chrome con margen maskable.
- Sin API build, Docker ni commits. Sin pruebas de micrófono físico. No se cambia configuración de modelos ni se añade consumo.
- Durante el trabajo paralelo apareció temporalmente TS2345 en SimuladorConocimiento.tsx:23, fuera del alcance; la última repetición completa terminó con código 0. No se modificó ese archivo desde esta tarea.

Evidencia local (no versionada): .local/abi-branding-qa/check.cjs, operador.cjs, harness.tsx, tsconfig.json y capturas cliente-*, landing-* y operador-*.png. agent-browser falló al iniciar CDP; se usó Chrome local vía Playwright.

## Coordinación

Landing/js/abi.js: cambios limitados a manejo de teclado tras arrastre, filtro de puntero primario, bloqueo de evasión con nube abierta/foco interno/reduced motion y apartarse de formularios enfocados. La función responder y su fallback quedan bajo propiedad del responsable del conector; no se modificaron aquí. Planes, oferta, FAQ y lógica de chat preservados.

## Revisión final de redes — 2026-10-17

- Detectados y sustituidos 48 sellos A antiguos en 36 publicaciones Facebook y 12 portadas Instagram de los 12 perfiles. Sustitución limitada al SVG interno del símbolo; el nombre de marca y el resto del XML quedan idénticos.
- PNG regenerados con Chrome mediante el generador existente producir-recursos.cjs y el modo --solo-renderizar. Se conservan nombres, rutas y tamaños: Facebook 1080×1080; Instagram 1080×1350.
- Comparación de las 48 parejas PNG antes/después: todos cambian dentro del sello y presentan **cero píxeles diferentes fuera del sello**. Se comprobaron también dimensiones y ausencia del trazado A antiguo en las fuentes activas. Inspección visual de Facebook perfil 01 e Instagram perfil 12.
- 96 originales SVG/PNG respaldados en branding_logo_abi/originales-pre-nova/redes/. Las 12 fotografías originales y los manifiestos de recursos/videos conservan sus hashes. recursos/exportaciones/ sigue vacío; no se añaden exportaciones paralelas ni documentos MD nuevos.
- Frontend y Control (fuentes y configuración), y 12-landing-page/js/abi.js verificados por hash sin cambios en esta revisión. No se ejecutaron builds, API, Docker, publicación ni commits.
- Evidencia local: .local/abi-branding-qa/redes-validacion.json; comparación reproducible en revisar-redes.cjs con inventario previo redes-antes.json. Sintaxis Node del generador aprobada.
