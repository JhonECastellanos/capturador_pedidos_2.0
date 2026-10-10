import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Envelope, InventarioInicialDTO } from "@ambie/contrato";
import type { ConteoInventario } from "../../../types";
import { respuestaRed, usaApi } from "../../../data/api";
import { claveConsulta } from "../../../data/query";
import { Boton } from "../../../components/Boton";
import { BuscadorInput } from "../../../components/BuscadorInput";
import { Paginacion } from "../../../components/Paginacion";
import { formatoMoneda } from "../../../utils/formato";
import { useTamanoPagina } from "../../../utils/paginacion";

export function InventarioInicial({ conteo, iniciar, abrir }: { conteo?: ConteoInventario; iniciar: () => void; abrir: (conteo: ConteoInventario) => void }) {
  const porPagina = useTamanoPagina();
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const ruta = `/inventario/inicial?page=${pagina}&pageSize=${porPagina}&q=${encodeURIComponent(busqueda)}`;
  const clave = claveConsulta(ruta);
  const consulta = useQuery({ queryKey: clave, queryFn: ({ signal }) => respuestaRed<Envelope<InventarioInicialDTO | null>>(ruta, "GET", undefined, signal), select: (respuesta) => respuesta.data, enabled: usaApi, refetchInterval: 30_000,
    placeholderData: (anterior, previa) => previa?.queryKey[1] === clave[1] && String(previa.queryKey[2]).startsWith("/inventario/inicial?") ? anterior : undefined });
  const inicial = consulta.data;
  return <div className="mt-3 min-h-0 flex-1 overflow-y-auto space-y-3 pb-3">
    <div className="max-w-3xl rounded-2xl border border-line bg-paper-raised p-4">
      <p className="font-semibold text-ink">El punto de partida del negocio</p>
      <p className="mt-2 text-[13px] text-ink-soft">Cuenta todos los productos, revisa las cantidades y confirma el inicio. Se conservarán los costos de ese momento para comparar el inventario con las ventas, compras y ajustes posteriores.</p>
      <p className="mt-2 text-[12px] text-ink-soft">Hazlo durante una pausa de las operaciones. Si el stock o el catálogo cambian mientras cuentas, tendrás que cancelar ese inicio y repetirlo. Los productos creados después no forman parte de esta comparación.</p>
      {!usaApi ? <p className="mt-3 text-sm text-ink-soft">El inventario inicial requiere la conexión a la base de datos del negocio.</p> : consulta.isPending ? <p role="status" className="mt-3">Consultando inventario inicial…</p> : consulta.error ? <p role="alert" className="mt-3 text-danger">{consulta.error.message} <button type="button" onClick={() => void consulta.refetch()}>Reintentar</button></p> : !inicial && <div className="mt-4">
        <Boton onClick={conteo ? () => abrir(conteo) : iniciar}>{conteo ? conteo.estado === "en-curso" ? "Continuar inventario inicial" : "Revisar y confirmar inicio" : "Contar inventario inicial"}</Boton>
        <p className="mt-2 text-[12px] text-ink-soft">Se registra una sola vez. Contar y finalizar todavía no cambian el stock; la confirmación final aplica las cantidades y guarda el punto de partida.</p>
      </div>}
    </div>
    {inicial && <>
      {consulta.isPlaceholderData && <p role="status" className="text-sm text-ink-soft">Actualizando comparación; se conserva la última lectura…</p>}
      {consulta.error && <p role="alert" className="text-sm text-danger">No se pudo actualizar la comparación; se muestra la última lectura.</p>}
      <p className="text-[12px] text-ink-soft">Inicio confirmado: {new Date(inicial.aplicadoEn).toLocaleString("es-CO")} · {inicial.productos} productos</p>
      <div className="grid max-w-3xl grid-cols-2 gap-3">
        {[ ["Unidades iniciales", String(inicial.unidadesIniciales)], ["Valor inicial al costo", formatoMoneda(inicial.valorInicial)], ["Unidades actuales de esos productos", String(inicial.unidadesActuales)], ["Valor actual al costo inicial", formatoMoneda(inicial.valorActualCostoInicial)] ].map(([etiqueta, valor]) => <div key={etiqueta} className="rounded-xl border border-line bg-paper-raised p-3"><p className="text-[12px] text-ink-soft">{etiqueta}</p><p className="mt-1 font-mono font-semibold text-ink">{valor}</p></div>)}
      </div>
      <p role="status" className={`text-[13px] font-semibold ${inicial.diferencias ? "text-danger" : "text-success"}`}>{inicial.diferencias ? `${inicial.diferencias} productos no coinciden con sus movimientos. Revisa el historial antes de ajustar.` : "El stock coincide con el inicio y los movimientos registrados."}</p>
      <p className="max-w-3xl text-[12px] text-ink-soft">Esperado = cantidad inicial + entradas − salidas posteriores. El valor actual usa el costo inicial para comparar las mismas cantidades; no es utilidad ni valoración al costo actual.</p>
      <div className="max-w-3xl"><BuscadorInput value={busqueda} onChange={(valor) => { setBusqueda(valor); setPagina(1); }} placeholder="Buscar producto del inventario inicial" /></div>
      <fieldset disabled={consulta.isPlaceholderData} className="max-w-3xl"><Paginacion pagina={inicial.pagina} totalPaginas={Math.max(1, Math.ceil(inicial.total / porPagina))} total={inicial.total} porPagina={porPagina} onChange={setPagina} /></fieldset>
      <ul className="max-w-3xl space-y-2">{inicial.lineas.map((linea) => <li key={linea.productoId} className="rounded-xl border border-line bg-paper-raised p-3 text-[12px]">
        <p className="font-semibold text-ink">{linea.nombre}</p>
        <p className="mt-1 text-ink-soft">Inicial {linea.stockInicial} · movimiento neto {linea.movimientoNeto > 0 ? "+" : ""}{linea.movimientoNeto} · esperado {linea.stockEsperado} · actual {linea.stockActual}</p>
        <p className={linea.diferencia ? "text-danger" : "text-success"}>Diferencia {linea.diferencia} · costo inicial {formatoMoneda(linea.costoUnitarioInicial)}</p>
      </li>)}</ul>
      {!inicial.lineas.length && <p className="text-sm text-ink-soft">No hay productos que coincidan con la búsqueda.</p>}

    </>}
  </div>;
}
