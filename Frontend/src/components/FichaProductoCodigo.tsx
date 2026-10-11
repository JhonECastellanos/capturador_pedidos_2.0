import { useState } from "react";
import type { ProductoDTO, LineaCompartidaDTO } from "@synchronic-jo/contrato";
import { api } from "../data/api";
import { usePaginaApi } from "../data/usePaginaApi";
import { Boton } from "./Boton";
import { BotonEscaner } from "./BotonEscaner";
import { EscanerCodigo } from "./EscanerCodigo";

type Resultado = { yaContado?: boolean; producto: ProductoDTO; asignacion?: Pick<LineaCompartidaDTO, "productoId" | "nombre" | "codigo" | "unidad" | "asignadoHasta"> | null };
export function FichaProductoCodigo({ codigoInicial = "", productoInicial, conteoId, onGuardado, onCerrar }: { codigoInicial?: string; productoInicial?: ProductoDTO; conteoId?: string; onGuardado: (r: Resultado) => void; onCerrar: () => void }) {
  const [codigo, setCodigo] = useState(codigoInicial);
  const [nombre, setNombre] = useState(productoInicial?.nombre ?? "");
  const [unidad, setUnidad] = useState(productoInicial?.unidad ?? "unidad");
  const [existente, setExistente] = useState<ProductoDTO | null>(productoInicial ?? null);
  const [precio, setPrecio] = useState(""); const [costo, setCosto] = useState(""); const [minimo, setMinimo] = useState("0");
  const [ocupado, setOcupado] = useState(false); const [error, setError] = useState(""); const [camara, setCamara] = useState(false);
  const coincidencias = usePaginaApi<ProductoDTO>(`/productos?activo=true&orden=nombre&pageSize=30&q=${encodeURIComponent(nombre)}`, nombre.trim().length >= 2 && !existente);
  async function guardar() {
    if (ocupado) return; setOcupado(true); setError("");
    try {
      let resultado: Resultado;
      if (conteoId) resultado = await api<Resultado>(`/productos/inicial/${conteoId}`, "POST", { nombre, unidad, ...(codigo.trim() ? { codigo: codigo.trim() } : {}), ...(existente ? { productoId: existente.id } : {}) });
      else if (existente) {
        if (!codigo.trim()) throw new Error("Escribe o escanea el nuevo código que quieres vincular.");
        await api(`/productos/${existente.id}/codigos`, "POST", { codigo: codigo.trim() });
        resultado = { producto: existente };
      } else {
        if (precio.trim() === "" || costo.trim() === "") throw new Error("Indica costo y precio, incluyendo 0 cuando corresponda.");
        resultado = { producto: await api<ProductoDTO>("/productos", "POST", { nombre, unidad, precioVenta: Number(precio), costoActual: Number(costo), stockMinimo: Number(minimo), stock: 0, ...(codigo.trim() ? { codigosLectura: [codigo.trim()] } : {}) }) };
      }
      window.dispatchEvent(new Event("synchronic:datos-actualizados")); onGuardado(resultado);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar el producto."); } finally { setOcupado(false); }
  }
  const campo = "mt-1 w-full rounded-lg border border-line bg-paper-raised px-3 py-2";
  return <section aria-label="Registrar producto" className="space-y-3 rounded-xl border border-line bg-paper p-3">
    <header className="flex items-center justify-between gap-2"><h2 className="font-semibold">{conteoId ? "Producto del inventario inicial" : "Crear producto o vincular código"}</h2><button type="button" disabled={ocupado} onClick={onCerrar} className="min-h-10 px-2 text-sm text-teal">Volver</button></header>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <form onSubmit={e => { e.preventDefault(); void guardar(); }} className="space-y-3">
      <label className="block text-sm">Código de barras o QR <span className="text-ink-soft">(opcional)</span><div className="mt-1 flex items-center rounded-lg border border-line bg-paper-raised px-2"><input aria-label="Código de barras o QR" value={codigo} disabled={ocupado} maxLength={128} onChange={e => setCodigo(e.target.value)} className="min-w-0 flex-1 bg-transparent py-2 focus:outline-none" /><BotonEscaner disabled={ocupado} onClick={() => setCamara(true)} /></div></label>
      <label className="block text-sm">Nombre<input aria-label="Nombre del producto" required minLength={2} maxLength={200} value={nombre} disabled={ocupado} onChange={e => { setNombre(e.target.value); setExistente(null); }} className={campo} /></label>
      {!existente && !!coincidencias.items.length && <div className="max-h-40 overflow-y-auto rounded-lg border border-line p-2"><p className="text-xs text-ink-soft">¿Ya existe? Elígelo para conservar su inventario e historial.</p>{coincidencias.items.map(p => <button type="button" key={p.id} disabled={ocupado} className="block min-h-10 w-full border-b border-line py-1 text-left text-sm text-teal" onClick={() => { setExistente(p); setNombre(p.nombre); setUnidad(p.unidad); }}>{p.nombre} · {p.codigoInterno}</button>)}</div>}
      {existente && <p className="text-sm text-success">Usar {existente.codigoInterno} · se conserva el mismo producto.</p>}
      {coincidencias.error && !existente && <p role="alert" className="text-xs text-danger">No se pudieron consultar las coincidencias. Reintenta antes de crear.</p>}
      <label className="block text-sm">Unidad o presentación<input aria-label="Unidad o presentación" required maxLength={40} value={unidad} disabled={ocupado || !!existente} onChange={e => setUnidad(e.target.value)} list="unidades-producto" className={campo} /><datalist id="unidades-producto"><option value="unidad"/><option value="bolsa"/><option value="frasco"/><option value="botella"/><option value="paquete"/><option value="kilogramo"/></datalist></label>
      {!conteoId && !existente && <div className="grid grid-cols-2 gap-3"><label className="text-sm">Costo<input aria-label="Costo del producto" type="number" min="0" step="0.01" required value={costo} onChange={e => setCosto(e.target.value)} className={campo} /></label><label className="text-sm">Precio de venta<input aria-label="Precio de venta" type="number" min="0" step="0.01" required value={precio} onChange={e => setPrecio(e.target.value)} className={campo} /></label><label className="col-span-2 text-sm">Stock mínimo<input aria-label="Stock mínimo" type="number" min="0" step="1" required value={minimo} onChange={e => setMinimo(e.target.value)} className={campo} /></label></div>}
      <p className="text-xs text-ink-soft">{conteoId ? "Aquí registras el producto. En el siguiente paso ingresas la cantidad contada; su precio se configura en Precios." : "Las cantidades ingresan mediante Compras o el inventario inicial. Vincular un código conserva los precios y las existencias."}</p>
      <Boton type="submit" disabled={ocupado || !!coincidencias.error}> {ocupado ? "Guardando…" : existente ? "Usar producto existente" : "Crear producto"}</Boton>
    </form>
    {camara && <EscanerCodigo onCerrar={() => setCamara(false)} onCodigo={valor => { setCodigo(valor); setCamara(false); void api<ProductoDTO | null>(`/productos/codigo/lectura?codigo=${encodeURIComponent(valor)}`).then(p => { if (p) { setExistente(p); setNombre(p.nombre); setUnidad(p.unidad); } }).catch(e => setError(e instanceof Error ? e.message : "No se pudo consultar el código")); }} />}
  </section>;
}
