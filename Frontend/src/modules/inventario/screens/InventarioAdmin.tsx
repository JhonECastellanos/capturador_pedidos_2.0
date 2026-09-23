import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Boton } from "../../../components/Boton";
import { ConfirmarAccion } from "../../../components/ConfirmarAccion";
import { GuiaAyuda } from "../../../components/GuiaAyuda";
import { IconArrowLeft, IconChartBar, IconChevronRight, IconClipboard, IconPackage, IconPlus } from "../../../components/Icons";
import { Paginacion, POR_PAGINA, paginar } from "../../../components/Paginacion";
import { TiraToast } from "../../../components/TiraToast";
import { useAviso } from "../../../components/useAviso";
import { VistaImagenProducto } from "../../../components/VistaImagenProducto";
import { useOperaciones } from "../../../context/OperacionesContext";
import { categorias } from "../../../data/semilla";
import type { NuevoProducto } from "../../../types";
import { formatoMoneda } from "../../../utils/formato";

const campo = "rounded-lg border border-line bg-paper-raised px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none";
type VistaInv = "menu" | "general" | "conteo" | "descuadres" | "ajustes";
type FiltroEstadoInv = "todos" | "alerta" | "ok";

const motivosAjuste = ["pérdida", "robo", "corrección", "reversión compra", "vencimiento", "donación", "error captura", "otro"] as const;

export function InventarioAdmin() {
  const {
    inventario,
    conteos,
    ajustes,
    actualizarImagenProducto,
    crearProducto,
    iniciarConteo,
    actualizarConteoLinea,
    finalizarConteoActivo,
    cancelarConteoActivo,
    aplicarAjusteDeConteo,
    registrarAjusteManual,
  } = useOperaciones();

  // Cada proceso empresarial en su propia pantalla (sin scroll de página)
  const [vista, setVista] = useState<VistaInv>("menu");
  const [mostrarProducto, setMostrarProducto] = useState(false);
  const [archivoProducto, setArchivoProducto] = useState<File | null>(null);
  const [productoNuevo, setProductoNuevo] = useState({
    nombre: "",
    categoria: "Abarrotes",
    precioVenta: "",
    costoActual: "",
    unidad: "unidad",
    stock: "",
    stockMinimo: "20",
  });
  const [cantidadAleatoria, setCantidadAleatoria] = useState("5");
  const [turno, setTurno] = useState("mañana");
  const [conteoActivoId, setConteoActivoId] = useState<string | null>(null);
  const [indice, setIndice] = useState(0);
  // General filtros
  const [busquedaGeneral, setBusquedaGeneral] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstadoInv>("todos");
  // Ajuste manual
  const [mostrarAjusteManual, setMostrarAjusteManual] = useState(false);
  const [busquedaAjuste, setBusquedaAjuste] = useState("");
  const [productoAjusteId, setProductoAjusteId] = useState<string | null>(null);
  const [stockFisicoAjuste, setStockFisicoAjuste] = useState("");
  const [motivoAjuste, setMotivoAjuste] = useState<string>("corrección");
  const [comentarioAjuste, setComentarioAjuste] = useState("");
  const [pagina, setPagina] = useState(1);
  // Confirmaciones críticas
  const [confirmarCancelarConteo, setConfirmarCancelarConteo] = useState(false);
  const [confirmarAplicarConteoId, setConfirmarAplicarConteoId] = useState<string | null>(null);
  const [confirmarAjusteManual, setConfirmarAjusteManual] = useState(false);
  const { aviso, mostrarAviso, cerrarAviso } = useAviso();

  useEffect(() => { setPagina(1); }, [busquedaGeneral, filtroEstado, vista]);

  const conteoEnCurso = useMemo(() => conteos.find((c) => c.id === conteoActivoId) ?? conteos.find((c) => c.estado === "en-curso") ?? null, [conteoActivoId, conteos]);
  const lineasConDiferencia = useMemo(() => {
    const confirmados = conteos.filter((c) => c.estado === "confirmado");
    return confirmados.flatMap((conteo) =>
      conteo.lineas.filter((l) => l.diferencia !== 0).map((l) => ({ ...l, conteoId: conteo.id, turno: conteo.turno, usuarioId: conteo.usuarioId, finalizadoEn: conteo.finalizadoEn ?? conteo.iniciadoEn })),
    );
  }, [conteos]);

  const alertasStock = inventario.filter((p) => p.stock <= p.stockMinimo).length;
  const conteosEnCurso = conteos.filter((c) => c.estado === "en-curso").length;

  const inventarioFiltradoGeneral = useMemo(() => {
    const q = busquedaGeneral.trim().toLowerCase();
    return inventario
      .filter((p) => {
        const coincideBusqueda = !q || p.nombre.toLowerCase().includes(q) || p.codigoInterno.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q);
        if (!coincideBusqueda) return false;
        if (filtroEstado === "alerta") return p.stock <= p.stockMinimo;
        if (filtroEstado === "ok") return p.stock > p.stockMinimo;
        return true;
      })
      .sort((a, b) => {
        const aAlerta = a.stock <= a.stockMinimo;
        const bAlerta = b.stock <= b.stockMinimo;
        if (aAlerta !== bAlerta) return aAlerta ? -1 : 1;
        return a.nombre.localeCompare(b.nombre);
      });
  }, [busquedaGeneral, filtroEstado, inventario]);

  const productosFiltradosAjuste = useMemo(() => {
    const q = busquedaAjuste.trim().toLowerCase();
    return inventario.filter((p) => !q || p.nombre.toLowerCase().includes(q) || p.codigoInterno.toLowerCase().includes(q));
  }, [busquedaAjuste, inventario]);

  function guardarProducto(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos: NuevoProducto = {
      nombre: productoNuevo.nombre,
      categoria: productoNuevo.categoria,
      unidad: productoNuevo.unidad,
      precioVenta: Number(productoNuevo.precioVenta),
      costoActual: Number(productoNuevo.costoActual || 0),
      stock: Number(productoNuevo.stock),
      stockMinimo: Number(productoNuevo.stockMinimo || 0),
    };
    const producto = crearProducto(datos);
    if (archivoProducto) void actualizarImagenProducto(producto.id, archivoProducto);
    setProductoNuevo({ nombre: "", categoria: "Abarrotes", precioVenta: "", costoActual: "", unidad: "unidad", stock: "", stockMinimo: "20" });
    setArchivoProducto(null);
    setMostrarProducto(false);
    mostrarAviso(`Producto ${producto.nombre} creado`, "exito");
  }

  function handleIniciar(tipo: "general" | "aleatorio") {
    const cantidad = tipo === "aleatorio" ? Number(cantidadAleatoria) || 5 : null;
    const conteo = iniciarConteo(tipo, cantidad, turno);
    setConteoActivoId(conteo.id);
    setIndice(0);
    mostrarAviso(`Conteo ${tipo} iniciado · turno ${turno}`, "exito");
  }

  function handleAjusteManual() {
    if (!productoAjusteId) return;
    const stockFisico = Number(stockFisicoAjuste);
    if (Number.isNaN(stockFisico) || stockFisico < 0) return;
    const producto = inventario.find((p) => p.id === productoAjusteId);
    registrarAjusteManual(productoAjusteId, stockFisico, motivoAjuste, comentarioAjuste || undefined);
    mostrarAviso(`Ajuste en ${producto?.nombre ?? "producto"}: ${producto?.stock ?? 0} → ${stockFisico}`, "exito");
    setProductoAjusteId(null);
    setStockFisicoAjuste("");
    setComentarioAjuste("");
    setMotivoAjuste("corrección");
    setMostrarAjusteManual(false);
  }

  const productoAjuste = productoAjusteId ? inventario.find((p) => p.id === productoAjusteId) : null;
  const lineaActual = conteoEnCurso ? conteoEnCurso.lineas[indice] : null;

  function volverAlMenu() {
    setMostrarProducto(false);
    setMostrarAjusteManual(false);
    setVista("menu");
  }

  /* ─── Pantalla: menú de procesos ─── */
  if (vista === "menu") {
    const procesos = [
      {
        id: "general" as VistaInv,
        titulo: "Stock general",
        descripcion: "Niveles, alertas y crear productos",
        detalle: `${alertasStock} alerta(s) · ${inventario.length} productos`,
        icono: <IconPackage width={24} height={24} />,
        tono: "bg-teal-soft text-teal",
      },
      {
        id: "conteo" as VistaInv,
        titulo: "Conteo guiado",
        descripcion: "Contar producto a producto por turno",
        detalle: conteoEnCurso ? `En curso ${indice + 1}/${conteoEnCurso.lineas.length}` : `${conteosEnCurso} en curso`,
        icono: <IconClipboard width={24} height={24} />,
        tono: "bg-accent-soft text-accent-dark",
      },
      {
        id: "descuadres" as VistaInv,
        titulo: "Descuadres",
        descripcion: "Faltantes y sobrantes por aplicar",
        detalle: `${lineasConDiferencia.length} por resolver`,
        icono: <IconChartBar width={24} height={24} />,
        tono: "bg-danger-soft text-danger",
      },
      {
        id: "ajustes" as VistaInv,
        titulo: "Ajuste manual",
        descripcion: "Corregir stock con motivo auditado",
        detalle: `${ajustes.length} ajuste(s)`,
        icono: <IconPlus width={24} height={24} />,
        tono: "bg-paper-sunken text-ink",
      },
    ];
    return (
      <div className="flex h-full flex-col min-h-0">
        <div className="flex-shrink-0 flex items-center gap-2 border-b border-line pb-2.5">
          <h2 className="font-display text-[18px] font-semibold text-ink">Inventario</h2>
          <GuiaAyuda
            pantalla="Inventario"
            pasos={[
              { titulo: "1 · Elige el proceso", texto: "Cada tarjeta es un proceso completo: stock, conteo, descuadres o ajuste. Toca una para entrar." },
              { titulo: "2 · Completa de principio a fin", texto: "Dentro del proceso solo ves lo necesario del paso actual. La flecha te devuelve al menú sin perder lo avanzado." },
              { titulo: "3 · Confirma lo crítico", texto: "Aplicar ajustes, finalizar o cancelar conteos piden confirmación. Todo queda auditado con usuario y turno." },
            ]}
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar py-3">
          <p className="mb-2.5 text-[12.5px] text-ink-soft">¿Qué quieres hacer hoy?</p>
          <ul className="space-y-2.5 max-w-xl">
            {procesos.map((proceso) => (
              <li key={proceso.id}>
                <button
                  type="button"
                  onClick={() => setVista(proceso.id)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-line bg-paper-raised p-4 text-left active:bg-paper-sunken"
                >
                  <span className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${proceso.tono}`}>
                    {proceso.icono}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-ink">{proceso.titulo}</span>
                    <span className="block truncate text-[12.5px] text-ink-soft">{proceso.descripcion}</span>
                    <span className="mt-0.5 block text-[11.5px] font-semibold text-ink-faint">{proceso.detalle}</span>
                  </span>
                  <IconChevronRight width={20} height={20} className="flex-shrink-0 text-ink-faint" />
                </button>
              </li>
            ))}
          </ul>
        </div>
        <TiraToast aviso={aviso} alCerrar={cerrarAviso} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col min-h-0">
      <div className="flex-shrink-0 flex items-center justify-between gap-3 border-b border-line pb-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={volverAlMenu}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-paper-raised text-ink active:bg-paper-sunken shadow-sm"
            aria-label="Volver al menú de inventario"
          >
            <IconArrowLeft width={18} height={18} />
          </button>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Inventario</p>
            <h2 className="font-display text-[17px] font-semibold text-ink">
              {vista === "general" ? "Stock general" : vista === "conteo" ? "Conteo guiado" : vista === "descuadres" ? "Descuadres" : "Ajuste manual"}
            </h2>
          </div>
        </div>
        {vista === "general" && (
          <button
            type="button"
            onClick={() => setMostrarProducto((actual) => !actual)}
            className="rounded-xl bg-ink px-3 py-1.5 text-[12px] font-semibold text-white active:bg-ink/90 shadow-sm"
          >
            {mostrarProducto ? "Volver" : "+ Producto"}
          </button>
        )}
      </div>

      {vista === "general" && (
        <div className="flex flex-1 flex-col min-h-0 mt-2.5">
          {mostrarProducto ? (
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar py-2">
              <form onSubmit={guardarProducto} className="rounded-2xl border border-line bg-paper-raised p-4 max-w-lg">
                <div className="flex items-center justify-between border-b border-line pb-2.5">
                  <p className="font-display text-[15px] font-semibold text-ink">Nuevo producto</p>
                  <button type="button" onClick={() => setMostrarProducto(false)} className="text-[12px] font-semibold text-ink-soft">Cancelar</button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <input required value={productoNuevo.nombre} onChange={(evento) => setProductoNuevo((actual) => ({ ...actual, nombre: evento.target.value }))} placeholder="Nombre del producto" className={`${campo} col-span-2`} autoFocus />
                  <input required type="number" min="0" value={productoNuevo.precioVenta} onChange={(evento) => setProductoNuevo((actual) => ({ ...actual, precioVenta: evento.target.value }))} placeholder="Precio venta ($)" className={campo} />
                  <input type="number" min="0" value={productoNuevo.costoActual} onChange={(evento) => setProductoNuevo((actual) => ({ ...actual, costoActual: evento.target.value }))} placeholder="Costo compra ($)" className={campo} />
                  <input required type="number" min="0" value={productoNuevo.stock} onChange={(evento) => setProductoNuevo((actual) => ({ ...actual, stock: evento.target.value }))} placeholder="Stock inicial" className={campo} />
                  <input type="number" min="0" value={productoNuevo.stockMinimo} onChange={(evento) => setProductoNuevo((actual) => ({ ...actual, stockMinimo: evento.target.value }))} placeholder="Stock mínimo alerta" className={campo} />
                  <input list="categorias-inventario" value={productoNuevo.categoria} onChange={(evento) => setProductoNuevo((actual) => ({ ...actual, categoria: evento.target.value }))} placeholder="Categoría" className={campo} />
                  <datalist id="categorias-inventario">
                    {categorias.map((categoria) => (
                      <option key={categoria} value={categoria} />
                    ))}
                  </datalist>
                  <input value={productoNuevo.unidad} onChange={(evento) => setProductoNuevo((actual) => ({ ...actual, unidad: evento.target.value }))} placeholder="Unidad (ej. unidad, pack)" className={campo} />
                </div>
                <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-line px-3 py-2.5 text-[12px] text-ink-soft bg-paper">
                  Foto directa / subir imagen
                  <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(evento) => setArchivoProducto(evento.target.files?.[0] ?? null)} />
                  <span className="font-semibold text-ink">{archivoProducto?.name ?? "Seleccionar foto"}</span>
                </label>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setMostrarProducto(false)} className="rounded-xl border border-line bg-paper py-3 text-[13px] font-semibold text-ink">Volver</button>
                  <Boton type="submit">Guardar producto</Boton>
                </div>
              </form>
            </div>
          ) : (
            <>
              <div className="flex-shrink-0 space-y-2">
                <input
                  value={busquedaGeneral}
                  onChange={(e) => setBusquedaGeneral(e.target.value)}
                  placeholder="Buscar por nombre, código o categoría"
                  className="w-full rounded-xl border border-line bg-paper-raised px-3.5 py-2 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-1.5 flex-1">
                    {(["todos", "alerta", "ok"] as FiltroEstadoInv[]).map((estado) => (
                      <button
                        key={estado}
                        type="button"
                        onClick={() => setFiltroEstado(estado)}
                        className={`flex-1 rounded-full border px-3 py-1 text-[11.5px] font-semibold capitalize transition-colors ${filtroEstado === estado ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink-soft"}`}
                      >
                        {estado === "todos" ? "Todos" : estado === "alerta" ? "Alertas" : "En stock"}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-ink-faint flex-shrink-0">{inventarioFiltradoGeneral.length} productos</p>
                </div>
              </div>

              {/* Lista con scroll propio */}
              <div className="flex min-h-0 flex-1 flex-col py-2.5">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-paper-sunken/30">
                  <div className="flex flex-shrink-0 items-center justify-between border-b border-line bg-paper-raised px-3 py-2">
                    <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
                      Productos ({inventarioFiltradoGeneral.length})
                    </p>
                    <span className="text-[11px] text-ink-soft">Alertas primero</span>
                  </div>
                  <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
                    <div className="space-y-2.5 lg:grid lg:grid-cols-2 lg:space-y-0 lg:gap-2.5">
                {paginar(inventarioFiltradoGeneral, pagina, POR_PAGINA).items.map((producto) => (
                  <article key={producto.id} className="flex items-center gap-3 rounded-xl border border-line bg-paper-raised p-3 shadow-sm lg:col-span-1">
                    <VistaImagenProducto producto={producto} tamano="sm" clickable productos={inventarioFiltradoGeneral} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-ink">{producto.nombre}</p>
                      <p className="mt-0.5 text-[12px] text-ink-soft">{producto.categoria} · {formatoMoneda(producto.precioVenta)} · {producto.codigoInterno}</p>
                      <p className={`mt-1 text-[12px] font-semibold ${producto.stock <= producto.stockMinimo ? "text-danger" : "text-success"}`}>
                        {producto.stock} en stock {producto.stock <= producto.stockMinimo && "· alerta"} · mín {producto.stockMinimo}
                      </p>
                    </div>
                    <label className="cursor-pointer rounded-lg border border-line px-2.5 py-2 text-[11px] font-semibold text-ink-soft active:bg-paper-sunken">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="sr-only"
                        onChange={(evento) => {
                          const archivo = evento.target.files?.[0];
                          if (archivo) void actualizarImagenProducto(producto.id, archivo);
                        }}
                      />
                      Foto
                    </label>
                  </article>
                ))}
                {inventarioFiltradoGeneral.length === 0 && (
                  <div className="col-span-2 rounded-xl border border-dashed border-line p-8 text-center text-[13px] text-ink-soft">
                    No hay productos que coincidan con la búsqueda.
                  </div>
                )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-shrink-0 mt-2">
                <Paginacion pagina={pagina} totalPaginas={Math.max(1, Math.ceil(inventarioFiltradoGeneral.length / POR_PAGINA))} total={inventarioFiltradoGeneral.length} porPagina={POR_PAGINA} onChange={setPagina} />
              </div>
            </>
          )}
        </div>
      )}

      {vista === "conteo" && (
        <div className="mt-3 flex-1 min-h-0 overflow-y-auto no-scrollbar rounded-xl border border-line bg-paper-raised p-4 max-w-xl">
          {!conteoEnCurso || conteoEnCurso.estado !== "en-curso" ? (
            <>
              <p className="font-semibold text-ink">Iniciar conteo</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">Captura producto a producto con input grande. El sistema guarda fecha-hora, usuario y turno para auditoría.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <select value={turno} onChange={(e) => setTurno(e.target.value)} className={campo}>
                  <option value="mañana">Turno mañana</option>
                  <option value="tarde">Turno tarde</option>
                  <option value="noche">Turno noche</option>
                </select>
                <input type="number" min={1} max={inventario.length} value={cantidadAleatoria} onChange={(e) => setCantidadAleatoria(e.target.value)} placeholder="N aleatorio" className={campo} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => handleIniciar("general")} className="rounded-xl bg-ink py-3 text-[13px] font-semibold text-white active:bg-ink/90">General ({inventario.length})</button>
                <button type="button" onClick={() => handleIniciar("aleatorio")} className="rounded-xl border border-line bg-paper py-3 text-[13px] font-semibold text-ink active:bg-paper-sunken">Aleatorio ({cantidadAleatoria})</button>
              </div>
              {conteos.filter((c) => c.estado === "confirmado").length > 0 && (
                <div className="mt-4">
                  <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Historial conteos</p>
                  <ul className="mt-2 space-y-2">
                    {conteos.filter((c) => c.estado === "confirmado").slice(0, 5).map((conteo) => (
                      <li key={conteo.id} className="flex items-center justify-between rounded-lg bg-paper-sunken px-3 py-2.5 text-[12.5px]">
                        <span className="text-ink font-medium capitalize">{conteo.tipo} · {conteo.turno}</span>
                        <span className="text-ink-soft">{new Date(conteo.finalizadoEn ?? conteo.iniciadoEn).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Conteo {conteoEnCurso.tipo} · {conteoEnCurso.turno} · {indice + 1} / {conteoEnCurso.lineas.length}</p>
                <button type="button" onClick={() => setConfirmarCancelarConteo(true)} className="text-[12px] font-semibold text-danger">Cancelar</button>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-paper-sunken">
                <div className="h-full bg-ink transition-all" style={{ width: `${((indice + 1) / conteoEnCurso.lineas.length) * 100}%` }} />
              </div>
              {lineaActual && (() => {
                const producto = inventario.find((p) => p.id === lineaActual.productoId);
                return (
                  <div className="mt-4 text-center">
                    {producto && <div className="mx-auto flex justify-center"><VistaImagenProducto producto={producto} tamano="sm" clickable productos={inventario} /></div>}
                    <p className="mt-3 truncate text-[16px] font-semibold text-ink">{lineaActual.nombre}</p>
                    <p className="text-[12.5px] text-ink-soft">Teórico: {lineaActual.stockTeorico} · físico</p>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={String(lineaActual.stockFisico)}
                      onChange={(e) => actualizarConteoLinea(conteoEnCurso.id, lineaActual.productoId, Number(e.target.value) || 0)}
                      className="mt-3 w-full rounded-2xl border-2 border-ink bg-paper px-4 py-6 text-center text-[36px] font-semibold tabular-nums text-ink focus:border-accent focus:outline-none"
                      autoFocus
                    />
                    <p className={`mt-2 text-[13px] font-semibold ${lineaActual.diferencia === 0 ? "text-success" : "text-danger"}`}>
                      {lineaActual.diferencia === 0 ? "Cuadra" : `Diferencia: ${lineaActual.diferencia > 0 ? "+" : ""}${lineaActual.diferencia}`}
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button type="button" disabled={indice === 0} onClick={() => setIndice((i) => Math.max(0, i - 1))} className="rounded-xl border border-line bg-paper py-3 text-[13px] font-semibold text-ink disabled:opacity-40">← Anterior</button>
                      {indice < conteoEnCurso.lineas.length - 1 ? (
                        <button type="button" onClick={() => setIndice((i) => i + 1)} className="rounded-xl bg-ink py-3 text-[13px] font-semibold text-white active:bg-ink/90">Siguiente →</button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            finalizarConteoActivo(conteoEnCurso.id);
                            setIndice(0);
                            mostrarAviso("Conteo finalizado · revisa Descuadres", "exito");
                          }}
                          className="rounded-xl bg-success py-3 text-[13px] font-semibold text-white active:opacity-90"
                        >
                          Finalizar conteo
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {vista === "descuadres" && (
        <div className="flex min-h-0 flex-1 flex-col py-2.5">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-paper-sunken/30">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-line bg-paper-raised px-3 py-2">
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
                Descuadres ({lineasConDiferencia.length})
              </p>
              <span className="text-[11px] text-ink-soft">Falta / sobra</span>
            </div>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
              <div className="space-y-2.5">
          {lineasConDiferencia.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-paper-raised p-8 text-center text-[13px] text-ink-soft">Sin descuadres confirmados. Inicia un conteo y registra faltantes/sobrantes.</div>
          ) : (
            lineasConDiferencia.map((linea) => {
              const yaAjustado = ajustes.some((a) => a.conteoId === linea.conteoId);
              const conteo = conteos.find((c) => c.id === linea.conteoId);
              return (
                <article key={`${linea.conteoId}-${linea.productoId}`} className="rounded-xl border border-line bg-paper-raised p-3.5 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{linea.nombre}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${linea.diferencia < 0 ? "bg-danger-soft text-danger" : "bg-success-soft text-success"}`}>
                      {linea.diferencia > 0 ? `+${linea.diferencia} sobra` : `${linea.diferencia} falta`}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-ink-soft">Teórico {linea.stockTeorico} · Físico {linea.stockFisico} · {linea.turno} · {linea.usuarioId}</p>
                  <p className="text-[11.5px] text-ink-faint">{conteo?.finalizadoEn ? new Date(conteo.finalizadoEn).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : ""}</p>
                  {!yaAjustado && conteo?.estado === "confirmado" && (
                    <button type="button" onClick={() => setConfirmarAplicarConteoId(linea.conteoId)} className="mt-3 w-full rounded-lg bg-ink py-2.5 text-[12px] font-semibold text-white active:bg-ink/90">Revisar y aplicar al stock</button>
                  )}
                  {yaAjustado && <p className="mt-2 text-[11.5px] font-semibold text-success">✓ Ajuste aplicado</p>}
                </article>
              );
            })
          )}
              </div>
            </div>
          </div>
        </div>
      )}

      {vista === "ajustes" && (
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-3 mt-3">
          {!mostrarAjusteManual ? (
            <>
              <button
                type="button"
                onClick={() => setMostrarAjusteManual(true)}
                className="w-full rounded-xl bg-ink py-3 text-[13px] font-semibold text-white active:bg-ink/90"
              >
                + Nuevo ajuste manual
              </button>
              <div className="space-y-2.5">
                {ajustes.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line bg-paper-raised p-8 text-center text-[13px] text-ink-soft">Sin ajustes registrados.</p>
                ) : (
                  ajustes.map((ajuste) => (
                    <article key={ajuste.id} className="rounded-xl border border-line bg-paper-raised p-3.5 shadow-sm">
                      <p className="text-[12px] font-semibold text-ink-faint">{new Date(ajuste.creadoEn).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })} · {ajuste.usuarioId} {ajuste.motivo ? `· ${ajuste.motivo}` : ""} {ajuste.conteoId === "manual" ? "· manual" : ""}</p>
                      {ajuste.comentario && <p className="mt-1 text-[12px] italic text-ink-soft">“{ajuste.comentario}”</p>}
                      <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                        {ajuste.lineas.map((l) => (
                          <li key={l.productoId} className="flex justify-between px-3 py-2 text-[12px]">
                            <span className="truncate text-ink">{l.nombre} · {l.stockTeorico} → {l.stockFisico}</span>
                            <span className={`font-mono font-semibold ${l.diferencia < 0 ? "text-danger" : l.diferencia > 0 ? "text-success" : "text-ink-faint"}`}>{l.diferencia > 0 ? "+" : ""}{l.diferencia}</span>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-line bg-paper-raised p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-ink">Paso 1 · Elige producto</p>
                <button type="button" onClick={() => setMostrarAjusteManual(false)} className="text-[12px] font-semibold text-danger">Cancelar</button>
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">Corrige stock por pérdida, robo, reversión de compra o error. Queda auditado con producto, motivo y usuario.</p>
              <div className="mt-3">
                <input
                  value={busquedaAjuste}
                  onChange={(e) => setBusquedaAjuste(e.target.value)}
                  placeholder="Buscar producto por nombre o código"
                  className="w-full rounded-xl border border-line bg-paper px-3.5 py-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
                />
                <div className="mt-2 overflow-hidden rounded-xl border border-line bg-paper-sunken/40">
                  <div className="border-b border-line bg-paper-raised px-3 py-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                      Resultados ({productosFiltradosAjuste.length})
                    </p>
                  </div>
                  <div className="no-scrollbar max-h-32 space-y-1.5 overflow-y-auto p-1.5">
                    {productosFiltradosAjuste.slice(0, 6).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setProductoAjusteId(p.id)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-[13px] ${productoAjusteId === p.id ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink"}`}
                      >
                        <span className="truncate">{p.nombre} · stock {p.stock}</span>
                        {productoAjusteId === p.id && <span>✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {productoAjuste && (
                <div className="mt-3 rounded-xl bg-paper-sunken p-3">
                  <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Paso 2 · Físico y motivo</p>
                  <p className="mt-1 text-[14px] font-semibold text-ink">{productoAjuste.nombre} · {productoAjuste.codigoInterno}</p>
                  <p className="text-[12px] text-ink-soft">Teórico: {productoAjuste.stock} · stock mínimo {productoAjuste.stockMinimo}</p>
                  <label className="mt-3 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Stock físico corregido</label>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={stockFisicoAjuste}
                    onChange={(e) => setStockFisicoAjuste(e.target.value)}
                    placeholder="Ej. 45"
                    className="mt-1.5 w-full rounded-2xl border-2 border-ink bg-paper px-4 py-5 text-center text-[28px] font-semibold tabular-nums text-ink focus:border-accent focus:outline-none"
                  />
                  {stockFisicoAjuste !== "" && (
                    <p className={`mt-2 text-center text-[12px] font-semibold ${Number(stockFisicoAjuste) - productoAjuste.stock === 0 ? "text-success" : "text-danger"}`}>
                      Diferencia: {Number(stockFisicoAjuste) - productoAjuste.stock > 0 ? "+" : ""}{Number(stockFisicoAjuste) - productoAjuste.stock}
                    </p>
                  )}
                  <p className="mt-3 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Motivo</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {motivosAjuste.map((mot) => (
                      <button
                        key={mot}
                        type="button"
                        onClick={() => setMotivoAjuste(mot)}
                        className={`rounded-full border px-3 py-1.5 text-[11.5px] font-semibold capitalize ${motivoAjuste === mot ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink-soft"}`}
                      >
                        {mot}
                      </button>
                    ))}
                  </div>
                  <label className="mt-3 block text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Comentario (opcional)</label>
                  <textarea value={comentarioAjuste} onChange={(e) => setComentarioAjuste(e.target.value)} placeholder="Ej. Faltante en bodega, factura 123 revertida..." rows={2} className="mt-1.5 w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none" />
                  <Boton onClick={() => setConfirmarAjusteManual(true)} disabled={!productoAjusteId || stockFisicoAjuste === ""} className="mt-3">Revisar ajuste</Boton>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <TiraToast aviso={aviso} alCerrar={cerrarAviso} />

      <ConfirmarAccion
        abierto={confirmarCancelarConteo}
        titulo="Cancelar conteo"
        mensaje="Se descartará el avance del conteo en curso. El stock no se modifica."
        textoConfirmar="Sí, cancelar"
        tono="peligro"
        alCancelar={() => setConfirmarCancelarConteo(false)}
        alConfirmar={() => {
          if (conteoEnCurso) cancelarConteoActivo(conteoEnCurso.id);
          setConteoActivoId(null);
          setIndice(0);
          setConfirmarCancelarConteo(false);
          mostrarAviso("Conteo cancelado · sin cambios al stock", "info");
        }}
      />

      <ConfirmarAccion
        abierto={confirmarAplicarConteoId !== null}
        titulo="Aplicar ajuste al stock"
        mensaje="Se llevará el stock al físico contado en este conteo. Queda auditado con turno y usuario."
        textoConfirmar="Aplicar ajuste"
        tono="ink"
        alCancelar={() => setConfirmarAplicarConteoId(null)}
        alConfirmar={() => {
          if (confirmarAplicarConteoId) {
            aplicarAjusteDeConteo(confirmarAplicarConteoId);
            setConfirmarAplicarConteoId(null);
            mostrarAviso("Ajuste de conteo aplicado al stock", "exito");
          }
        }}
      />

      <ConfirmarAccion
        abierto={confirmarAjusteManual}
        titulo="Confirmar ajuste manual"
        mensaje={
          productoAjuste
            ? `${productoAjuste.nombre}: ${productoAjuste.stock} → ${stockFisicoAjuste || "?"} · motivo: ${motivoAjuste}.`
            : ""
        }
        textoConfirmar="Aplicar ajuste"
        tono="ink"
        alCancelar={() => setConfirmarAjusteManual(false)}
        alConfirmar={() => {
          setConfirmarAjusteManual(false);
          handleAjusteManual();
        }}
      />
    </div>
  );
}
