import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/auth";
import { api } from "../../../data/api";
import { usePaginaApi } from "../../../data/usePaginaApi";
import { Paginacion } from "../../../components/Paginacion";
import { useTamanoPagina } from "../../../utils/paginacion";
import { activarAvisos, silenciarAvisos, sonidoAvisosActivo, type AvisoNegocio } from "../notificaciones";
export default function Notificaciones() {
  const POR_PAGINA = useTamanoPagina();
  const [pagina, setPagina] = useState(1), [mensaje, setMensaje] = useState("");
  const { usuario } = useAuth(), navegar = useNavigate();
  const [activos, setActivos] = useState(sonidoAvisosActivo);
  const lista = usePaginaApi<AvisoNegocio>(`/notificaciones?page=${pagina}&pageSize=${POR_PAGINA}`);
  async function abrir(n: AvisoNegocio) {
    try { await api(`/notificaciones/${n.id}/leer`, "POST", {}); navegar(n.ruta); } catch (e) { setMensaje(e instanceof Error ? e.message : "No se pudo abrir el aviso"); }
  }
  return <section className="space-y-3">
    <p className="text-sm text-ink-soft">Pedidos, cambios de estado y compras recibidas. Los avisos se conservan aunque recargues.</p>
    <button type="button" className="min-h-11 rounded-xl border border-line px-3 text-sm font-semibold" onClick={async () => {
      if (activos) { localStorage.setItem(`ambie:ui:avisos:${usuario!.id}`, "false"); silenciarAvisos(); setActivos(false); setMensaje("Avisos del navegador silenciados. El historial sigue disponible."); return; }
      const permitido = await activarAvisos().catch(() => false);
      localStorage.setItem(`ambie:ui:avisos:${usuario!.id}`, String(permitido)); setActivos(permitido);
      setMensaje(permitido ? "Avisos con sonido habilitados mientras la aplicación está abierta." : "Puedes consultar los avisos aquí. El navegador no autorizó las notificaciones.");
    }}>{activos ? "Silenciar avisos y sonido" : "Activar avisos y sonido"}</button>
    {mensaje && <p role="status" className="text-sm text-ink-soft">{mensaje}</p>}
    <Paginacion pagina={pagina} totalPaginas={Math.max(1, Math.ceil(lista.total / POR_PAGINA))} total={lista.total} porPagina={POR_PAGINA} onChange={setPagina} />
    <div className="lista-datos space-y-2" inert={lista.actualizando}>
      {lista.items.map(n => <button key={n.id} type="button" onClick={() => void abrir(n)} className="w-full rounded-xl border border-line bg-paper-raised p-3 text-left"><p className={`text-sm ${n.leida ? "" : "font-semibold"}`}>{n.titulo}</p><p className="mt-1 text-xs text-ink-soft">{new Date(n.creadoEn).toLocaleString("es-CO")} · {n.leida ? "Leído" : "Nuevo"}</p></button>)}
      {!lista.cargando && !lista.items.length && <p className="p-3 text-sm text-ink-soft">Todavía no hay avisos.</p>}
    </div>
  </section>;
}
