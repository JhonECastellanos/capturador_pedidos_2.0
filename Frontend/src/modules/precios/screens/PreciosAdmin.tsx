import { useEffect, useMemo, useState } from "react";
import { BarraInferior } from "../../../components/BarraInferior";
import { BarraSuperior } from "../../../components/BarraSuperior";
import { Boton } from "../../../components/Boton";
import { BuscadorInput } from "../../../components/BuscadorInput";
import { GuiaAyuda } from "../../../components/GuiaAyuda";
import { ListaVacia } from "../../../components/ListaVacia";
import { Paginacion } from "../../../components/Paginacion";
import { PantallaCompletaAdmin } from "../../../components/PantallaCompletaAdmin";
import { POR_PAGINA, paginar } from "../../../utils/paginacion";
import { TiraToast } from "../../../components/TiraToast";
import { useAviso } from "../../../components/useAviso";
import { useOperaciones } from "../../../context/operaciones";
import { calcularMargen } from "../../../dominio/servicios";
import { formatoMoneda } from "../../../utils/formato";

/** Paso 1: nuevo precio · Paso 2: confirmar */
type Paso = 1 | 2;

export function PreciosAdmin() {
  const { inventario, cambiosPrecio, actualizarPrecioProducto, nombreUsuario } = useOperaciones();
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [productoId, setProductoId] = useState<string | null>(null);
  const [paso, setPaso] = useState<Paso>(1);
  const [precio, setPrecio] = useState("");
  const { aviso, mostrarAviso, cerrarAviso } = useAviso();

  useEffect(() => { setPagina(1); }, [busqueda]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return inventario
      .filter((p) => !q || p.nombre.toLowerCase().includes(q) || p.codigoInterno.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [busqueda, inventario]);

  const producto = productoId ? inventario.find((p) => p.id === productoId) ?? null : null;

  function abrirProducto(id: string) {
    const p = inventario.find((x) => x.id === id);
    setProductoId(id);
    setPrecio(p ? String(p.precioVenta) : "");
    setPaso(1);
  }

  function cerrarProceso() {
    setProductoId(null);
    setPrecio("");
    setPaso(1);
  }

  function guardarPrecio() {
    if (!producto) return;
    const nuevo = Number(precio) || 0;
    actualizarPrecioProducto(producto.id, nuevo);
    mostrarAviso(`${producto.nombre} → ${formatoMoneda(nuevo)} guardado`, "exito");
    cerrarProceso();
  }

  // ─── Proceso paso a paso: cambiar precio ───
  if (producto) {
    const nuevo = Number(precio) || 0;
    const margenAntes = calcularMargen(producto.precioVenta, producto.costoActual);
    const margenDespues = calcularMargen(nuevo, producto.costoActual);
    const cambia = nuevo !== producto.precioVenta;
    const historial = cambiosPrecio.filter((c) => c.productoId === producto.id).slice(0, 3);

    return (
      <PantallaCompletaAdmin>
        <BarraSuperior
          titulo={paso === 1 ? "Nuevo precio" : "Confirmar cambio"}
          subtitulo={`${producto.nombre} · Paso ${paso} de 2`}
          onVolver={() => (paso === 2 ? setPaso(1) : cerrarProceso())}
          paso={{ actual: paso, total: 2 }}
        />

        <main className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-6 lg:px-8">
          <div className="max-w-xl">
            {paso === 1 && (
              <>
                <div className="rounded-2xl border border-line bg-paper-raised p-4">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">Producto</p>
                  <p className="mt-0.5 truncate font-display text-[16px] font-semibold text-ink">{producto.nombre}</p>
                  <p className="text-[11.5px] text-ink-soft">{producto.codigoInterno} · {producto.categoria}</p>

                  <div className="ticket-edge -mx-4 my-3.5" />

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl bg-paper px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Costo actual</p>
                      <p className="font-mono text-[14px] font-semibold text-ink">{formatoMoneda(producto.costoActual)}</p>
                    </div>
                    <div className="rounded-xl bg-paper px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Precio actual</p>
                      <p className="font-mono text-[14px] font-semibold text-ink">{formatoMoneda(producto.precioVenta)}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-2xl border border-line bg-paper-raised p-4">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Precio de venta nuevo *</label>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    autoFocus
                    value={precio}
                    onChange={(e) => setPrecio(e.target.value)}
                    placeholder="0"
                    className="mt-1.5 w-full rounded-2xl border-2 border-ink bg-paper px-4 py-3.5 text-center font-mono text-[26px] font-bold tabular-nums text-ink focus:border-accent focus:outline-none"
                  />

                  {cambia && (
                    <div className="mt-3 flex items-center justify-between rounded-xl bg-paper-sunken px-3 py-2.5 text-[12.5px]">
                      <span className="text-ink-soft">
                        {formatoMoneda(producto.precioVenta)} → <strong className="font-mono text-ink">{formatoMoneda(nuevo)}</strong>
                      </span>
                      <span className={`rounded-full px-2.5 py-1 font-semibold ${margenDespues.absoluto >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
                        Margen {margenDespues.porcentaje.toFixed(1)}%
                      </span>
                    </div>
                  )}
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                    Margen actual: {formatoMoneda(margenAntes.absoluto)} ({margenAntes.porcentaje.toFixed(1)}%) contra el último costo.
                  </p>
                </div>

                {historial.length > 0 && (
                  <div className="mt-3 rounded-2xl border border-line bg-paper-raised p-3.5">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">Cambios recientes</p>
                    <ul className="mt-1.5 space-y-1">
                      {historial.map((cambio) => (
                        <li key={cambio.id} className="text-[11.5px] text-ink-soft">
                          {formatoMoneda(cambio.valorAnterior)} → <strong className="font-mono text-ink">{formatoMoneda(cambio.valorNuevo)}</strong> · {new Date(cambio.fecha).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })} · {nombreUsuario(cambio.usuarioId)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {paso === 2 && (
              <>
                <div className="rounded-2xl border border-line bg-paper-raised p-4">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">Resumen del cambio</p>
                  <p className="mt-0.5 truncate font-display text-[15.5px] font-semibold text-ink">{producto.nombre}</p>

                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between rounded-xl bg-paper px-3.5 py-2.5">
                      <span className="text-[12.5px] text-ink-soft">Antes</span>
                      <span className="font-mono text-[14px] font-semibold text-ink-soft line-through">{formatoMoneda(producto.precioVenta)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-ink/20 bg-accent-soft px-3.5 py-2.5">
                      <span className="text-[12.5px] font-semibold text-ink">Después</span>
                      <span className="font-mono text-[16px] font-bold text-ink">{formatoMoneda(nuevo)}</span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl bg-paper px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Margen antes</p>
                      <p className="font-mono text-[13px] font-semibold text-ink-soft">{margenAntes.porcentaje.toFixed(1)}%</p>
                    </div>
                    <div className="rounded-xl bg-paper px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">Margen después</p>
                      <p className={`font-mono text-[13px] font-bold ${margenDespues.absoluto >= 0 ? "text-success" : "text-danger"}`}>
                        {formatoMoneda(margenDespues.absoluto)} · {margenDespues.porcentaje.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
                    Queda auditado con valor anterior, nuevo, usuario y fecha.
                  </p>
                </div>
              </>
            )}
          </div>
        </main>

        <BarraInferior>
          {paso === 1 ? (
            <Boton disabled={!cambia} onClick={() => setPaso(2)}>
              Revisar y confirmar →
            </Boton>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaso(1)}
                className="rounded-xl border border-line bg-paper py-3 text-[13px] font-semibold text-ink"
              >
                ← Corregir
              </button>
              <Boton onClick={guardarPrecio}>Guardar precio</Boton>
            </div>
          )}
        </BarraInferior>
      </PantallaCompletaAdmin>
    );
  }

  // ─── Lista: elegir producto ───
  return (
    <div className="flex h-full flex-col min-h-0">
      <div className="flex-shrink-0 flex items-center justify-between gap-3 border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[18px] font-semibold text-ink">Precios y márgenes</h2>
          <GuiaAyuda
            pantalla="Precios y márgenes"
            pasos={[
              { titulo: "1 · Elegir producto", texto: "Busca por nombre, código o categoría y toca el producto que quieres actualizar." },
              { titulo: "2 · Nuevo precio", texto: "Escribe el precio nuevo y mira el margen en vivo contra el último costo, antes de continuar." },
              { titulo: "3 · Confirmar", texto: "Revisa el antes y el después con su margen y guarda. Queda auditado con usuario y fecha." },
            ]}
          />
        </div>
      </div>

      <div className="flex-shrink-0 pt-2.5">
        <BuscadorInput value={busqueda} onChange={setBusqueda} placeholder="Buscar por nombre, código o categoría" />
      </div>

      {/* Lista con scroll propio */}
      <div className="mt-2.5 flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-2.5 rounded-2xl border border-line bg-paper-sunken/30 p-2 sm:p-3">
        {filtrados.length === 0 ? (
          <ListaVacia
            titulo={inventario.length === 0 ? "Aún no hay productos." : "No se encontraron productos para esta búsqueda."}
            texto={inventario.length === 0 ? "Créalos desde Inventario para poder cambiar sus precios." : undefined}
          />
        ) : (
          paginar(filtrados, pagina, POR_PAGINA).items.map((p) => {
            const margen = calcularMargen(p.precioVenta, p.costoActual);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => abrirProducto(p.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-paper-raised p-3.5 text-left shadow-sm active:bg-paper-sunken"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-ink">{p.nombre}</p>
                  <p className="truncate text-[11.5px] text-ink-soft">{p.codigoInterno} · {p.categoria} · costo {formatoMoneda(p.costoActual)}</p>
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${margen.absoluto >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
                    Margen {margen.porcentaje.toFixed(1)}%
                  </span>
                </div>
                <span className="flex-shrink-0 text-right">
                  <span className="block font-mono text-[14px] font-bold text-ink">{formatoMoneda(p.precioVenta)}</span>
                  <span className="text-[10.5px] font-semibold text-teal">Editar →</span>
                </span>
              </button>
            );
          })
        )}
      </div>

      <TiraToast aviso={aviso} alCerrar={cerrarAviso} />

      <div className="flex-shrink-0 mt-2">
        <Paginacion pagina={pagina} totalPaginas={Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))} total={filtrados.length} porPagina={POR_PAGINA} onChange={setPagina} />
      </div>
    </div>
  );
}
