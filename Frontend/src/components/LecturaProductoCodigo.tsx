import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProductoDTO } from "@synchronic-jo/contrato";
import { api } from "../data/api";
import { usePaginaApi } from "../data/usePaginaApi";
import { BuscadorInput } from "./BuscadorInput";
import { EscanerCodigo } from "./EscanerCodigo";
import { Paginacion } from "./Paginacion";

/** Una etiqueta compartida nunca elige la presentación por el usuario. */
export function LecturaProductoCodigo({ onProducto, onCerrar }: { onProducto: (producto: ProductoDTO | null, codigo: string) => void; onCerrar: () => void }) {
  const [lectura, setLectura] = useState<{ producto: ProductoDTO; codigo: string } | null>(null);
  const [esperando, setEsperando] = useState(false);
  const [error, setError] = useState("");
  const [pagina, setPagina] = useState(1);
  const [busqueda, setBusqueda] = useState("");
  const abierta = useRef(true);
  useEffect(() => { abierta.current = true; return () => { abierta.current = false; }; }, []);
  useEffect(() => {
    if (!esperando && !error && !lectura) return;
    const teclado = (e: KeyboardEvent) => { if (e.key === "Escape") { abierta.current = false; onCerrar(); } };
    window.addEventListener("keydown", teclado);
    return () => window.removeEventListener("keydown", teclado);
  }, [esperando, error, lectura, onCerrar]);
  function cerrar() { abierta.current = false; onCerrar(); }
  const familia = usePaginaApi<ProductoDTO>(`/productos?familiaId=${lectura?.producto.familiaCompartidaId}&activo=true&orden=nombre&page=${pagina}&pageSize=30&q=${encodeURIComponent(busqueda)}`, !!lectura);
  async function leer(codigo: string) {
    setEsperando(true); setError("");
    try {
      const producto = await api<ProductoDTO | null>(`/productos/codigo/lectura?codigo=${encodeURIComponent(codigo)}`);
      if (!abierta.current) return;
      if (producto?.familiaCompartidaId) setLectura({ producto, codigo });
      else onProducto(producto, codigo);
    } catch (e) { if (abierta.current) setError(e instanceof Error ? e.message : "No se pudo consultar la etiqueta"); }
    finally { if (abierta.current) setEsperando(false); }
  }
  if (esperando || error || lectura) return createPortal(<section role="dialog" aria-modal="true" aria-label="Elegir presentación" className="fixed inset-0 z-[80] flex flex-col bg-paper p-3 sm:p-5">
    <header className="flex items-center justify-between gap-2"><h2 className="font-semibold">{lectura ? "Elige la presentación" : "Consultar producto"}</h2><button type="button" onClick={cerrar} className="min-h-10 px-3 text-teal">Volver</button></header>
    {esperando && <p role="status">Consultando etiqueta…</p>}
    {(error || familia.error) && <p role="alert" className="text-danger">{error || familia.error}</p>}
    {error && <button type="button" onClick={() => setError("")} className="min-h-10 text-teal">Volver a escanear</button>}
    {lectura && <>
      <p className="my-2 text-xs text-ink-soft">La etiqueta corresponde a varias presentaciones. Cada una conserva su código interno y sus cantidades.</p>
      <BuscadorInput value={busqueda} onChange={v => { setBusqueda(v); setPagina(1); }} placeholder="Buscar presentación" />
      <Paginacion pagina={pagina} totalPaginas={Math.max(1, Math.ceil(familia.total / 30))} total={familia.total} porPagina={30} onChange={setPagina} />
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto py-2" inert={familia.actualizando}>
        {familia.items.map(p => <button key={p.id} type="button" onClick={() => onProducto(p, lectura.codigo)} className="block min-h-14 w-full rounded-[10px] border border-line bg-paper-raised p-3 text-left"><span className="block font-semibold">{p.nombre}</span><span className="block text-xs text-ink-soft">{p.codigoInterno} · {p.unidad}</span></button>)}
        {!familia.cargando && !familia.items.length && <p>No hay presentaciones que coincidan.</p>}
      </div>
    </>}
  </section>, document.body);
  return <EscanerCodigo onCerrar={cerrar} onCodigo={codigo => { void leer(codigo); }} />;
}
