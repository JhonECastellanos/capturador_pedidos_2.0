import { useState } from "react";
import type { AuditoriaEventoDTO } from "@ambie/contrato";
import { usaApi } from "../../../data/api";
import { usePaginaApi } from "../../../data/usePaginaApi";
import { ListaVacia } from "../../../components/ListaVacia";
import { Paginacion } from "../../../components/Paginacion";
import { formatoFechaHora } from "../../../utils/fechas";

export function Auditoria() {
  const [pagina, setPagina] = useState(1);
  const [entidad, setEntidad] = useState("");
  const { items: eventos, total, error, cargando } = usePaginaApi<AuditoriaEventoDTO>(`/auditoria?page=${pagina}&pageSize=30${entidad ? `&entidad=${encodeURIComponent(entidad)}` : ""}`);
  return <div className="flex h-full min-h-0 flex-col">
    <header className="shrink-0 border-b border-line pb-3"><h2 className="font-display text-lg font-semibold text-ink">Auditoría del negocio</h2><p className="mt-1 text-xs text-ink-soft">Acciones confirmadas, responsables y fechas. Los accesos y credenciales no se muestran.</p>
      <label className="mt-3 flex items-center gap-3 text-sm text-ink-soft">Área<select value={entidad} className="min-h-11 rounded-xl border border-line bg-paper-raised px-3" onChange={(e) => { setEntidad(e.target.value); setPagina(1); }}>
        <option value="">Todas</option>{["pedidos", "clientes", "productos", "inventario", "usuarios", "usuario", "caja", "cierres", "gastos", "archivos"].map((v) => <option key={v} value={v}>{v}</option>)}
      </select></label>
    </header>
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-3">
      {!usaApi ? <p className="text-sm text-ink-soft">La auditoría compartida está disponible al conectarse al servidor.</p> : error ? <p role="alert" className="text-danger">{error}</p> : cargando ? <p role="status">Cargando auditoría…</p> : eventos.length === 0 ? <ListaVacia titulo="Todavía no hay eventos" texto="Las nuevas operaciones quedarán registradas aquí." /> : eventos.map((e) => <article key={e.id} className="rounded-xl border border-line bg-paper-raised p-4">
        <p className="break-all text-sm font-semibold text-ink">{e.accion}</p><p className="mt-1 text-xs text-ink-soft">{e.usuario} · {formatoFechaHora(e.creadoEn)}</p>
        <p className="mt-2 break-all text-xs text-ink-faint">{e.entidadTipo} · {e.entidadId}</p>
        {!!(e.datosAntes || e.datosDespues) && <details className="mt-2 text-xs text-ink-soft"><summary className="min-h-11 cursor-pointer py-3">Ver cambio</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify({ antes: e.datosAntes, despues: e.datosDespues }, null, 2)}</pre></details>}
      </article>)}
    </div>
    <Paginacion pagina={pagina} totalPaginas={Math.max(1, Math.ceil(total / 30))} total={total} porPagina={30} onChange={setPagina} />
  </div>;
}
