import { useEffect, useMemo, useState } from "react";
import { ConfirmarAccion } from "../../../components/ConfirmarAccion";
import { GuiaAyuda } from "../../../components/GuiaAyuda";
import { Paginacion, POR_PAGINA, paginar } from "../../../components/Paginacion";
import { TiraToast } from "../../../components/TiraToast";
import { useAviso } from "../../../components/useAviso";
import { useOperaciones } from "../../../context/OperacionesContext";
import { calcularMargen } from "../../../dominio/servicios";
import { formatoMoneda } from "../../../utils/formato";

export function PreciosAdmin() {
  const { inventario, cambiosPrecio, actualizarPrecioProducto } = useOperaciones();
  const [busqueda, setBusqueda] = useState("");
  const [edicion, setEdicion] = useState<Record<string, string>>({});
  const [pagina, setPagina] = useState(1);
  const [confirmarPrecio, setConfirmarPrecio] = useState<{ id: string; nuevo: number } | null>(null);
  const { aviso, mostrarAviso, cerrarAviso } = useAviso();

  useEffect(() => { setPagina(1); }, [busqueda]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return inventario
      .filter((p) => !q || p.nombre.toLowerCase().includes(q) || p.codigoInterno.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [busqueda, inventario]);

  function margenPara(productoId: string) {
    const producto = inventario.find((p) => p.id === productoId);
    if (!producto) return { absoluto: 0, porcentaje: 0 };
    const valor = edicion[productoId] !== undefined && edicion[productoId] !== "" ? Number(edicion[productoId]) : producto.precioVenta;
    return calcularMargen(valor, producto.costoActual);
  }

  return (
    <div className="flex h-full flex-col min-h-0">
      <div className="flex-shrink-0 flex items-center justify-between gap-3 border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[18px] font-semibold text-ink">Precios y márgenes</h2>
          <GuiaAyuda
            pantalla="Precios y márgenes"
            pasos={[
              { titulo: "1 · Buscar", texto: "Filtra por nombre, código interno o categoría para ubicar rápido el producto." },
              { titulo: "2 · Margen en vivo", texto: "Edita el precio y ve al instante el margen en $ y % contra el último costo." },
              { titulo: "3 · Guardar auditado", texto: "Guardar pide confirmación con el antes y después. Queda registrado valor anterior, nuevo, usuario y fecha." },
            ]}
          />
        </div>
      </div>

      <div className="flex-shrink-0 pt-2.5">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, código o categoría"
          className="w-full rounded-xl border border-line bg-paper-raised px-3.5 py-2 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
        />
      </div>

      {/* Lista con scroll propio */}
      <div className="flex min-h-0 flex-1 flex-col px-0 py-2.5">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-paper-sunken/30">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-line bg-paper-raised px-3 py-2">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
              Productos ({filtrados.length})
            </p>
            <span className="text-[11px] text-ink-soft">Edita y revisa</span>
          </div>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
            <div className="space-y-2.5">
        {filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-paper-raised px-4 py-10 text-center text-[13px] text-ink-soft">
            No se encontraron productos para esta búsqueda.
          </div>
        ) : (
          paginar(filtrados, pagina, POR_PAGINA).items.map((producto) => {
            const enEdicion = edicion[producto.id] ?? String(producto.precioVenta);
            const margen = margenPara(producto.id);
            const haCambiado = Number(enEdicion) !== producto.precioVenta;
            return (
              <article key={producto.id} className="rounded-xl border border-line bg-paper-raised p-3.5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{producto.nombre}</p>
                    <p className="text-[11.5px] text-ink-soft">{producto.codigoInterno} · {producto.categoria} · costo {formatoMoneda(producto.costoActual)}</p>
                  </div>
                  <span className="flex-shrink-0 font-mono text-[13px] font-bold text-ink">{formatoMoneda(producto.precioVenta)}</span>
                </div>
                <div className="mt-2.5 grid grid-cols-[1fr_auto] gap-2">
                  <input
                    type="number"
                    min={0}
                    value={enEdicion}
                    onChange={(e) => setEdicion((prev) => ({ ...prev, [producto.id]: e.target.value }))}
                    className="rounded-lg border border-line bg-paper px-3 py-2 text-[13px] font-mono text-ink focus:border-ink focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!haCambiado}
                    onClick={() => setConfirmarPrecio({ id: producto.id, nuevo: Number(enEdicion) || 0 })}
                    className={`rounded-lg px-4 py-2 text-[12px] font-semibold transition-colors ${
                      haCambiado ? "bg-ink text-white active:bg-ink/90 shadow-sm" : "bg-paper-sunken text-ink-faint"
                    }`}
                  >
                    Revisar
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11.5px]">
                  <span className={`rounded-full px-2.5 py-0.5 font-semibold ${margen.absoluto >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
                    Margen {formatoMoneda(margen.absoluto)} · {margen.porcentaje.toFixed(1)}%
                  </span>
                  {haCambiado && <span className="text-ink-soft">nuevo: {formatoMoneda(Number(enEdicion) || 0)}</span>}
                </div>
                {cambiosPrecio.filter((c) => c.productoId === producto.id).slice(0, 2).map((cambio) => (
                  <p key={cambio.id} className="mt-2 text-[11px] text-ink-faint">
                    Historial: {formatoMoneda(cambio.valorAnterior)} → {formatoMoneda(cambio.valorNuevo)} · {cambio.usuarioId.slice(0, 8)} · {new Date(cambio.fecha).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                ))}
              </article>
            );
          })
        )}
            </div>
          </div>
        </div>
      </div>

      <TiraToast aviso={aviso} alCerrar={cerrarAviso} />

      <div className="flex-shrink-0 mt-2">
        <Paginacion pagina={pagina} totalPaginas={Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))} total={filtrados.length} porPagina={POR_PAGINA} onChange={setPagina} />
      </div>

      <ConfirmarAccion
        abierto={confirmarPrecio !== null}
        titulo="Confirmar nuevo precio"
        mensaje={(() => {
          const p = confirmarPrecio ? inventario.find((x) => x.id === confirmarPrecio.id) : null;
          if (!p || !confirmarPrecio) return "";
          const margen = calcularMargen(confirmarPrecio.nuevo, p.costoActual);
          return `${p.nombre}: ${formatoMoneda(p.precioVenta)} → ${formatoMoneda(confirmarPrecio.nuevo)} · margen ${formatoMoneda(margen.absoluto)} (${margen.porcentaje.toFixed(1)}%).`;
        })()}
        textoConfirmar="Guardar precio"
        tono="ink"
        alCancelar={() => setConfirmarPrecio(null)}
        alConfirmar={() => {
          if (confirmarPrecio) {
            const nombre = inventario.find((x) => x.id === confirmarPrecio.id)?.nombre ?? "Producto";
            actualizarPrecioProducto(confirmarPrecio.id, confirmarPrecio.nuevo);
            setEdicion((prev) => {
              const siguiente = { ...prev };
              delete siguiente[confirmarPrecio.id];
              return siguiente;
            });
            setConfirmarPrecio(null);
            mostrarAviso(`${nombre} → ${formatoMoneda(confirmarPrecio.nuevo)} guardado`, "exito");
          }
        }}
      />
    </div>
  );
}
