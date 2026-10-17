# Métricas editables y propuesta editorial

[Abrir modelo local](modelo.html). Sin dependencias, conexión, almacenamiento privado ni campaña activa. Los valores iniciales son simulados, elegidos para revisar aritmética; no son resultados, tarifas ni benchmarks. Unidad de costos: COP. Ventana inicial ilustrativa: 30 días en una sola red.

| Indicador | Fórmula | Interpretación y límite |
|---|---|---|
| CPM | gasto de medios / impresiones × 1.000 | Costo por mil exposiciones; excluye otros costos de adquisición. |
| Frecuencia | impresiones / alcance | Promedio de exposiciones por cuenta de la misma red y ventana. No sumar alcances entre redes. |
| CTR de enlace | clics de enlace / impresiones × 100 | No mezclar clics de enlace con todas las interacciones. No prueba conversión. |
| CAC atribuible | (medios + otros costos de adquisición) / clientes nuevos atribuibles | Clientes reales deduplicados; no conversaciones, registros ni pruebas. Documentar regla de atribución. |

Supuesto inicial: medios 240.000 COP; otros costos 60.000; impresiones 30.000; alcance 15.000; clics de enlace 600; clientes nuevos 12. Resultados **simulados**: CPM 8.000 COP; frecuencia 2; CTR 2 %; CAC 25.000 COP. Cambiar un dato recalcula; exportar conserva entradas, naturaleza y cálculos. No son precios del producto ni contenido para una publicación.

División por cero devuelve «No calculable», no cero ni infinito. Se rechazan vacíos, negativos, números no finitos, conteos fraccionarios y alcance mayor que impresiones. No se fuerzan clientes <= clics porque la atribución puede incluir otras vías; esas vías deben documentarse. Una adquisición no puede declararse gratis solo porque faltó registrar producción o gestión.

Para agregar piezas: CPM y CTR se recalculan con sumas de numeradores y denominadores de alcance comparable; CAC con costos y clientes deduplicados. La frecuencia agregada requiere alcance único deduplicado de la plataforma para la ventana; no usar la suma de alcances por pieza. No promediar porcentajes sin ponderar.

El modelo no define umbrales universales ni recomienda inversión. Comparar A/B exige mismo concepto y condiciones comparables. Las dos parejas del calendario son observación exploratoria; no se atribuye causalidad ni significancia estadística. Cambiar a «manuales» no verifica la fuente: la interfaz lo mantiene explícito.

## Archivos

- `matriz-contenidos.csv`: 216 enfoques textuales A/B de 108 conceptos, doce perfiles, tres redes y tres ángulos. Incluye rutas al STORYBOARD y PROMPTANIMACION separados. A/B no multiplica las exportaciones gráficas.
- `calendario-30-dias.csv` y `.md`: propuesta de 30 jornadas con 12 publicaciones, cuatro por red, y trabajo editorial intermedio. Sin programación ni presupuesto activado.
- `calculos.js`: funciones puras del modelo, sin dependencias ni red.
- `modelo.html`: entradas, resultados, controles y exportación CSV local.

Fuentes de las definiciones: fórmulas algebraicas declaradas arriba; no se usaron supuestos de rendimiento de proveedores ni cifras de campañas reales. Evidencia de la app y capturas en [datos](../datos/README.md). Los costos y clientes del ejemplo son hipotéticos; no se atribuyen a DANE ni a los competidores.
