import { useState } from "react";
import type { CodigoProductoDTO } from "@synchronic-jo/contrato";
import { api } from "../../../data/api";
import { useRegistroApi } from "../../../data/usePaginaApi";
import { BotonEscaner } from "../../../components/BotonEscaner";
import { EscanerCodigo } from "../../../components/EscanerCodigo";
export function CodigosProducto({ productoId }: { productoId: string }) {
  const lista = useRegistroApi<CodigoProductoDTO[]>(`/productos/${productoId}/codigos`, true);
  const [codigo, setCodigo] = useState(""); const [camara, setCamara] = useState(false); const [ocupado, setOcupado] = useState(false); const [error, setError] = useState(""); const [retirar, setRetirar] = useState<CodigoProductoDTO | null>(null);
  async function guardar(id?: string) {
    if (ocupado) return; setOcupado(true); setError("");
    try { await api(`/productos/${productoId}/codigos${id ? `/${id}/retirar` : ""}`, "POST", id ? {} : { codigo }); setCodigo(""); setRetirar(null); window.dispatchEvent(new Event("synchronic:datos-actualizados")); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar el código"); } finally { setOcupado(false); }
  }
  return <details className="mt-3 rounded-xl border border-line p-3 text-xs"><summary className="min-h-8 cursor-pointer font-semibold">Códigos de barras y QR</summary>
    <p className="my-2 text-ink-soft">Varios códigos identifican el mismo producto. Retira una etiqueta antigua cuando ya no se use; su registro se conserva.</p>
    {(error || lista.error) && <p role="alert" className="text-danger">{error || lista.error?.message}</p>}
    <div className="max-h-40 overflow-y-auto">{lista.data?.map(c => <div key={c.id} className="flex min-h-10 items-center justify-between gap-2 border-b border-line"><span className="break-all">{c.codigo} · {new Date(c.creadoEn).toLocaleDateString("es-CO")}{c.retiradoEn ? " · retirado" : ""}</span>{!c.retiradoEn && <button type="button" disabled={ocupado} className="min-h-9 px-2 text-danger" onClick={() => setRetirar(c)}>Retirar</button>}</div>)}</div>
    {retirar && <div role="dialog" aria-label="Confirmar retiro de código" className="my-2 rounded-lg bg-paper-sunken p-2"><p>¿Retirar {retirar.codigo}? Ya no se podrá escanear, pero el producto y sus documentos se conservan.</p><button type="button" disabled={ocupado} onClick={() => void guardar(retirar.id)} className="min-h-10 pr-4 text-danger">Confirmar retiro</button><button type="button" disabled={ocupado} onClick={() => setRetirar(null)} className="min-h-10 text-teal">Volver</button></div>}
    <form className="mt-2 flex items-center gap-2" onSubmit={e => { e.preventDefault(); void guardar(); }}><input aria-label="Nuevo código de producto" value={codigo} maxLength={128} onChange={e => setCodigo(e.target.value)} placeholder="Nuevo código" className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-2 py-2"/><BotonEscaner disabled={ocupado} onClick={() => setCamara(true)}/><button type="submit" disabled={ocupado || !codigo.trim()} className="min-h-9 text-teal">Vincular</button></form>
    {camara && <EscanerCodigo onCerrar={() => setCamara(false)} onCodigo={valor => { setCamara(false); setCodigo(valor); }}/>}
  </details>;
}
