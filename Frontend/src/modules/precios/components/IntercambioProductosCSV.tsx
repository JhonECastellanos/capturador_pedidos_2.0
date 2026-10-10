import { useRef, useState } from "react";
import type { ImportarProductosDTO, ProductoDTO, ResultadoImportacionProductosDTO } from "@ambie/contrato";
import { Boton } from "../../../components/Boton";
import { api, listaApi } from "../../../data/api";
import { COLUMNAS_PRODUCTOS_CSV, descargarCSV, exportarProductosCSV } from "../../../utils/exportar";
import { leerProductosCSV } from "../../../utils/productos-csv";

export function IntercambioProductosCSV() {
  const archivo = useRef<HTMLInputElement>(null);
  const [productos, setProductos] = useState<ImportarProductosDTO["productos"]>([]);
  const [prepararInicial, setPrepararInicial] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState<ResultadoImportacionProductosDTO | null>(null);
  async function exportar() {
    setOcupado(true); setError("");
    try { exportarProductosCSV(await listaApi<ProductoDTO>("/productos?orden=nombre")); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo exportar el catálogo."); }
    finally { setOcupado(false); }
  }
  async function importar() {
    if (ocupado) return;
    setOcupado(true); setError("");
    try {
      const guardado = await api<ResultadoImportacionProductosDTO>("/productos/importar", "POST", { prepararInicial, productos });
      setResultado(guardado); setProductos([]);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo confirmar la carga. Reintenta con el mismo archivo."); }
    finally { setOcupado(false); }
  }
  return <section aria-label="Lista de productos CSV" className="shrink-0 pt-2">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-semibold text-teal">
      <button type="button" disabled={ocupado} onClick={() => void exportar()}>Exportar CSV</button>
      <button type="button" disabled={ocupado} onClick={() => descargarCSV(COLUMNAS_PRODUCTOS_CSV, [], "plantilla-productos.csv")}>Plantilla CSV</button>
      <button type="button" disabled={ocupado} onClick={() => archivo.current?.click()}>Importar CSV</button>
      <input ref={archivo} type="file" accept=".csv,text/csv" aria-label="Archivo CSV de productos" className="sr-only" disabled={ocupado} onChange={async e => {
        const fichero = e.target.files?.[0]; e.target.value = "";
        if (!fichero) return;
        setProductos([]); setResultado(null); setError("");
        try {
          if (fichero.size > 2 * 1024 * 1024) throw new Error("El archivo debe ocupar menos de 2 MB.");
          setProductos(leerProductosCSV(await fichero.text()));
        } catch (err) { setError(err instanceof Error ? err.message : "No se pudo leer el archivo."); }
      }} />
    </div>
    {ocupado && <p role="status" className="mt-1 text-xs text-ink-soft">Procesando el archivo…</p>}
    {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
    {resultado && <p role="status" className="mt-2 text-xs text-success">Guardado: {resultado.creados} productos nuevos y {resultado.actualizados} actualizados.{resultado.conteoInicialId ? " Las cantidades están en Inventario → Inventario inicial, listas para revisar y confirmar." : " Se conservaron las existencias de los productos anteriores."}</p>}
    {!!productos.length && <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-line bg-paper-raised p-3 text-[12px]">
      <p className="font-semibold text-ink">Revisar {productos.length} productos antes de guardar</p>
      <p className="mt-1 text-ink-soft">Con código se actualiza ese producto. Sin código se busca por nombre; si es nuevo, recibe un código automático. Hasta 200 productos por archivo.</p>
      <ul className="my-2 space-y-1">{productos.slice(0, 5).map((p, i) => <li key={i}>{p.nombre} · precio {p.precioVenta} · cantidad {p.stock ?? "sin contar"}</li>)}</ul>
      <label className="flex items-center gap-2"><input type="checkbox" checked={prepararInicial} disabled={ocupado} onChange={e => setPrepararInicial(e.target.checked)} />Preparar inventario inicial con las cantidades</label>
      <p className="mt-1 text-ink-soft">Si ya confirmaste el inicio del negocio, desmarca esta opción. Las cantidades existentes se conservan; los productos nuevos se crean con la cantidad indicada.</p>
      <div className="mt-2 flex gap-2"><Boton ancho="auto" className="!px-3 !py-2 !text-xs" disabled={ocupado} onClick={() => void importar()}>Confirmar importación</Boton><Boton ancho="auto" variante="fantasma" className="!px-3 !py-2 !text-xs" disabled={ocupado} onClick={() => { setProductos([]); setError(""); }}>Cancelar</Boton></div>
    </div>}
  </section>;
}
