import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BarraInferior } from "../../../components/BarraInferior";
import { BarraSuperior } from "../../../components/BarraSuperior";
import { Boton } from "../../../components/Boton";
import { BuscadorInput } from "../../../components/BuscadorInput";
import { ConfirmarAccion } from "../../../components/ConfirmarAccion";
import { GuiaAyuda } from "../../../components/GuiaAyuda";
import { IconChevronRight } from "../../../components/Icons";
import { ListaVacia } from "../../../components/ListaVacia";
import { Paginacion } from "../../../components/Paginacion";
import { PantallaCompletaAdmin } from "../../../components/PantallaCompletaAdmin";
import { SegmentoControl } from "../../../components/SegmentoControl";
import { POR_PAGINA, paginar } from "../../../utils/paginacion";
import { TiraToast } from "../../../components/TiraToast";
import { useAviso } from "../../../components/useAviso";
import { useOperaciones } from "../../../context/operaciones";
import type { LineaRecepcion, RecepcionCompra } from "../../../types";
import { construirLineaRecepcion } from "../../../dominio/servicios";
import { ETIQUETA_PERIODO, PERIODOS, dentroDePeriodo, type Periodo } from "../../../utils/fechas";
import { formatoMoneda } from "../../../utils/formato";
import { FormularioGasto } from "../components/FormularioGasto";

type TabCompras = "compras" | "gastos";
type Vista = "historial" | "recepcion" | "detalle";
type PasoRecepcion = 1 | 2 | 3;

export function ComprasAdmin() {
  const { inventario, proveedores, recepciones, gastos, crearProveedor, crearProducto, registrarRecepcion, registrarGasto, obtenerProveedor, nombreUsuario } =
    useOperaciones();

  // Vistas del módulo: historial | recepción | detalle
  const [vista, setVista] = useState<Vista>("historial");
  const [tab, setTab] = useState<TabCompras>("compras");
  const [periodo, setPeriodo] = useState<Periodo>("todo");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [detalle, setDetalle] = useState<RecepcionCompra | null>(null);

  // Wizard recepción
  const [paso, setPaso] = useState<PasoRecepcion>(1);
  const [proveedorId, setProveedorId] = useState<string | null>(null);
  const [busquedaProveedor, setBusquedaProveedor] = useState("");
  const [mostrarCrearProv, setMostrarCrearProv] = useState(false);
  const [nombreProvNuevo, setNombreProvNuevo] = useState("");
  const [telProvNuevo, setTelProvNuevo] = useState("");
  const [busquedaProd, setBusquedaProd] = useState("");
  const [lineas, setLineas] = useState<LineaRecepcion[]>([]);
  const [cantidadTmp, setCantidadTmp] = useState<Record<string, string>>({});
  const [costoTmp, setCostoTmp] = useState<Record<string, string>>({});
  const [descontarCaja, setDescontarCaja] = useState(true);
  const [mostrarCrearProd, setMostrarCrearProd] = useState(false);
  const [prodNuevo, setProdNuevo] = useState({ nombre: "", precioVenta: "", costoActual: "" });

  // Confirmación de salida del wizard (modal propio, no del navegador)
  const [confirmarSalida, setConfirmarSalida] = useState(false);

  const { aviso, mostrarAviso: mostrarToast, cerrarAviso } = useAviso();

  const hoy = useMemo(() => new Date(), []);

  useEffect(() => {
    setPagina(1);
  }, [tab, periodo, busqueda]);

  const proveedoresFiltrados = useMemo(() => {
    const q = busquedaProveedor.trim().toLowerCase();
    return proveedores.filter((p) => !q || p.nombre.toLowerCase().includes(q) || (p.telefono ?? "").includes(q));
  }, [busquedaProveedor, proveedores]);

  const productosFiltrados = useMemo(() => {
    const q = busquedaProd.trim().toLowerCase();
    return inventario.filter((p) => !q || p.nombre.toLowerCase().includes(q) || p.codigoInterno.toLowerCase().includes(q));
  }, [busquedaProd, inventario]);

  const recepcionesFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return recepciones
      .filter((r) => {
        if (!dentroDePeriodo(r.creadoEn, periodo, hoy)) return false;
        if (!q) return true;
        const prov = obtenerProveedor(r.proveedorId);
        return r.numero.toLowerCase().includes(q) || (prov?.nombre.toLowerCase().includes(q) ?? false);
      })
      .sort((a, b) => (b.creadoEn < a.creadoEn ? -1 : b.creadoEn > a.creadoEn ? 1 : 0));
  }, [busqueda, hoy, obtenerProveedor, periodo, recepciones]);

  const gastosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return gastos
      .filter((g) => {
        if (!dentroDePeriodo(g.creadoEn, periodo, hoy)) return false;
        return !q || g.concepto.toLowerCase().includes(q);
      })
      .sort((a, b) => (b.creadoEn < a.creadoEn ? -1 : b.creadoEn > a.creadoEn ? 1 : 0));
  }, [busqueda, gastos, hoy, periodo]);

  const totalRecepcion = lineas.reduce((s, l) => s + l.subtotal, 0);
  const proveedorActual = proveedorId ? (obtenerProveedor(proveedorId) ?? proveedores.find((p) => p.id === proveedorId)) : null;
  const unidadesRecepcion = lineas.reduce((s, l) => s + l.cantidad, 0);

  function abrirRecepcion() {
    setPaso(1);
    setVista("recepcion");
  }

  function cancelarRecepcion() {
    setLineas([]);
    setProveedorId(null);
    setPaso(1);
    setBusquedaProd("");
    setBusquedaProveedor("");
    setCantidadTmp({});
    setCostoTmp({});
    setMostrarCrearProd(false);
    setMostrarCrearProv(false);
    setDescontarCaja(true);
    setVista("historial");
  }

  function volverWizard() {
    if (paso > 1) {
      setPaso((p) => (p === 1 ? 1 : ((p - 1) as PasoRecepcion)));
      return;
    }
    // Salir del paso 1 con líneas cargadas pide confirmación con el modal de la app.
    if (lineas.length > 0) {
      setConfirmarSalida(true);
      return;
    }
    cancelarRecepcion();
  }

  function abrirDetalle(r: RecepcionCompra) {
    setDetalle(r);
    setVista("detalle");
  }

  function cerrarDetalle() {
    setDetalle(null);
    setVista("historial");
  }

  function crearProveedorInline(e: FormEvent) {
    e.preventDefault();
    if (!nombreProvNuevo.trim()) return;
    const prov = crearProveedor(nombreProvNuevo, telProvNuevo);
    setProveedorId(prov.id);
    setNombreProvNuevo("");
    setTelProvNuevo("");
    setMostrarCrearProv(false);
    mostrarToast(`Proveedor ${prov.nombre} creado y seleccionado`, "exito");
  }

  function agregarLinea(productoId: string) {
    const producto = inventario.find((p) => p.id === productoId);
    if (!producto) return;
    const cantidad = Number(cantidadTmp[productoId] || "1") || 1;
    const costo = Number(costoTmp[productoId] || producto.costoActual || 0);
    const linea = construirLineaRecepcion(producto, cantidad, costo);
    setLineas((prev) => {
      const existe = prev.find((l) => l.productoId === productoId);
      if (existe) return prev.map((l) => (l.productoId === productoId ? linea : l));
      return [...prev, linea];
    });
  }

  function quitarLinea(productoId: string) {
    setLineas((prev) => prev.filter((l) => l.productoId !== productoId));
  }

  function agregarProductoConToast(productoId: string) {
    const producto = inventario.find((p) => p.id === productoId);
    if (!producto) return;
    const cantidad = Number(cantidadTmp[productoId] || "1") || 1;
    const previa = lineas.find((l) => l.productoId === productoId);
    agregarLinea(productoId);
    mostrarToast(
      previa ? `Actualizado: ${producto.nombre} ×${cantidad}` : `Agregado: ${producto.nombre} ×${cantidad}`,
      "exito",
      previa
        ? () => setLineas((prev) => prev.map((l) => (l.productoId === productoId ? previa : l)))
        : () => quitarLinea(productoId),
    );
    setCantidadTmp((a) => {
      const n = { ...a };
      delete n[productoId];
      return n;
    });
    setCostoTmp((a) => {
      const n = { ...a };
      delete n[productoId];
      return n;
    });
  }

  function confirmarRecepcion() {
    if (!proveedorId || lineas.length === 0) return;
    registrarRecepcion(proveedorId, lineas, descontarCaja);
    cancelarRecepcion();
    mostrarToast("Recepción registrada ✓ stock y costos actualizados", "exito");
  }

  function guardarProductoInline(e: FormEvent) {
    e.preventDefault();
    const prod = crearProducto({
      nombre: prodNuevo.nombre,
      categoria: "Abarrotes",
      unidad: "unidad",
      precioVenta: Number(prodNuevo.precioVenta) || 0,
      costoActual: Number(prodNuevo.costoActual) || 0,
      stock: 0,
      stockMinimo: 10,
    });
    setProdNuevo({ nombre: "", precioVenta: "", costoActual: "" });
    setMostrarCrearProd(false);
    setBusquedaProd(prod.nombre);
    mostrarToast(`Producto ${prod.nombre} creado · agrega cantidad y costo`, "exito");
  }

  const tiraToast = <TiraToast aviso={aviso} alCerrar={cerrarAviso} />;

  /* ─── Pantalla: Historial (inicio de compras) ─── */
  if (vista === "historial") {
    return (
      <div className="flex h-full flex-col min-h-0">
        {/* Zona fija: título, pestañas, periodo, buscador */}
        <div className="flex-shrink-0 border-b border-line pb-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-[18px] font-semibold text-ink">Compras y gastos</h2>
              <GuiaAyuda
                pantalla="Compras y gastos"
                pasos={[
                  { titulo: "1 · Historial", texto: "COMPRAS lista recepciones y GASTOS egresos. Filtros hoy/ayer/semana/mes/todo y buscador siempre visibles. Toca una compra para ver su detalle." },
                  { titulo: "2 · Nueva recepción", texto: "Botón + Recepción arriba. Paso 1 proveedor, paso 2 productos (cada uno confirma con toast y Deshacer), paso 3 confirmar. La flecha te lleva al paso anterior o al inicio." },
                  { titulo: "3 · Facturación", texto: "Lo que facturaste en la compra se ve en otra pantalla: toca cualquier recepción del historial para abrir su detalle con líneas y total." },
                  { titulo: "4 · Efecto", texto: "Al confirmar sube el stock, actualiza el último costo y, si marcas descontar, crea el egreso en caja. Los gastos se descuentan de caja automáticamente." },
                ]}
              />
            </div>
            {tab === "compras" && (
              <button
                type="button"
                onClick={abrirRecepcion}
                className="flex items-center gap-1.5 rounded-xl bg-ink px-3 py-1.5 text-[12px] font-semibold text-white active:bg-ink/90 shadow-sm"
              >
                <span>+ Nueva recepción</span>
              </button>
            )}
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2">
            <div className="inline-flex rounded-full border border-line bg-paper-raised p-1">
              <button
                type="button"
                onClick={() => setTab("compras")}
                className={`rounded-full px-3.5 py-1 text-[12px] font-semibold transition-colors ${tab === "compras" ? "bg-ink text-white" : "text-ink-soft hover:text-ink"}`}
              >
                COMPRAS ({recepciones.length})
              </button>
              <button
                type="button"
                onClick={() => setTab("gastos")}
                className={`rounded-full px-3.5 py-1 text-[12px] font-semibold transition-colors ${tab === "gastos" ? "bg-ink text-white" : "text-ink-soft hover:text-ink"}`}
              >
                GASTOS ({gastos.length})
              </button>
            </div>
          </div>

          <div className="mt-2">
            <SegmentoControl
              desborda
              valor={periodo}
              onChange={setPeriodo}
              opciones={PERIODOS.map((p) => ({ valor: p, etiqueta: ETIQUETA_PERIODO[p] }))}
            />
          </div>

          <div className="mt-2">
            <BuscadorInput
              value={busqueda}
              onChange={setBusqueda}
              placeholder={tab === "compras" ? "Buscar por consecutivo o proveedor" : "Buscar gasto por concepto"}
            />
          </div>

          {tab === "gastos" && (
            <FormularioGasto
              alGuardar={(concepto, monto) => {
                registrarGasto(concepto, monto);
                mostrarToast(`Gasto "${concepto}" descontado de caja`, "exito");
              }}
            />
          )}
        </div>

        {/* Contenedor de lista con scroll propio */}
        <div className="flex min-h-0 flex-1 flex-col px-5 py-3 md:px-6 lg:px-8">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-paper-sunken/30">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-line bg-paper-raised px-3 py-2">
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
                {tab === "compras" ? `Recepciones (${recepcionesFiltradas.length})` : `Gastos (${gastosFiltrados.length})`}
              </p>
              <span className="text-[11px] text-ink-soft">
                {tab === "compras" ? "Toca para ver el detalle" : "Se descuentan de caja"}
              </span>
            </div>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
              <div className="space-y-2.5">
          {tab === "compras" ? (
            recepcionesFiltradas.length === 0 ? (
              <ListaVacia titulo="Sin recepciones para este filtro." texto="Toca “+ Nueva recepción” para registrar compras." />
            ) : (
              paginar(recepcionesFiltradas, pagina, POR_PAGINA).items.map((r) => {
                const prov = obtenerProveedor(r.proveedorId);
                return (
                  <article key={r.id}>
                    <button
                      type="button"
                      onClick={() => abrirDetalle(r)}
                      className="flex w-full items-center gap-3 rounded-xl border border-line bg-paper-raised p-3.5 text-left shadow-sm transition-shadow hover:shadow active:bg-paper-sunken"
                      aria-label={`Ver detalle de ${r.numero}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-[11.5px] font-semibold text-ink-faint">
                          {r.numero} · {new Date(r.creadoEn).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                        <p className="mt-0.5 truncate text-[14px] font-semibold text-ink">{prov?.nombre ?? "Proveedor"}</p>
                        <p className="mt-0.5 text-[12px] text-ink-soft">
                          {r.lineas.length} línea(s) · {r.descontarCaja ? "descontado de caja" : "sin caja"}
                        </p>
                      </div>
                      <span className="flex-shrink-0 rounded-full bg-teal-soft px-2.5 py-1 font-mono text-[11.5px] font-semibold text-teal">
                        {formatoMoneda(r.total)}
                      </span>
                      <IconChevronRight width={18} height={18} className="flex-shrink-0 text-ink-faint" />
                    </button>
                  </article>
                );
              })
            )
          ) : gastosFiltrados.length === 0 ? (
            <ListaVacia titulo="Sin gastos para este filtro." texto="Registra un gasto para verlo aquí." />
          ) : (
            paginar(gastosFiltrados, pagina, POR_PAGINA).items.map((g) => (
              <article key={g.id} className="flex items-center justify-between rounded-xl border border-line bg-paper-raised px-4 py-3 shadow-sm">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">{g.concepto}</p>
                  <p className="text-[11.5px] text-ink-soft">
                    {new Date(g.creadoEn).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })} · registró {nombreUsuario(g.usuarioId)}
                  </p>
                </div>
                <span className="flex-shrink-0 font-mono text-[13px] font-semibold text-danger">−{formatoMoneda(g.monto)}</span>
              </article>
            ))
          )}
              </div>
            </div>
          </div>
        </div>

        {tiraToast}

        {/* Paginación fija */}
        <div className="flex-shrink-0 mt-2">
          <Paginacion
            pagina={pagina}
            totalPaginas={Math.max(1, Math.ceil((tab === "compras" ? recepcionesFiltradas.length : gastosFiltrados.length) / POR_PAGINA))}
            total={tab === "compras" ? recepcionesFiltradas.length : gastosFiltrados.length}
            porPagina={POR_PAGINA}
            onChange={setPagina}
          />
        </div>
      </div>
    );
  }

  /* ─── Pantalla: Detalle de compra (facturación) ─── */
  if (vista === "detalle") {
    if (!detalle) {
      return (
        <section className="flex h-[calc(100%+1.5rem)] min-h-0 flex-col -mb-6">
          <p className="p-6 text-center text-[13px] text-ink-soft">Compra no encontrada.</p>
          <BarraInferior>
            <Boton variante="fantasma" onClick={() => setVista("historial")}>
              ← Volver al historial
            </Boton>
          </BarraInferior>
        </section>
      );
    }
    const prov = obtenerProveedor(detalle.proveedorId);
    return (
      <section className="flex h-[calc(100%+1.5rem)] min-h-0 flex-col -mb-6">
        <div className="-mx-5 -mt-5 md:-mx-6 lg:-mx-8 lg:-mt-8">
          <BarraSuperior
            titulo="Detalle de compra"
            subtitulo={`${detalle.numero} · ${prov?.nombre ?? "Proveedor"}`}
            onVolver={cerrarDetalle}
          />
        </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-6 lg:px-8">
          <section className="rounded-xl border border-line bg-paper-raised p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Proveedor</p>
                <p className="mt-1 truncate text-[15px] font-semibold text-ink">{prov?.nombre ?? "Proveedor"}</p>
                {prov?.telefono && <p className="text-[12.5px] text-ink-soft">{prov.telefono}</p>}
              </div>
              <span
                className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  detalle.descontarCaja ? "bg-teal-soft text-teal" : "bg-paper-sunken text-ink-soft"
                }`}
              >
                {detalle.descontarCaja ? "Descontado de caja" : "Sin caja"}
              </span>
            </div>
            <div className="ticket-edge -mx-4 my-3" />
            <p className="text-[12px] text-ink-soft">
              {new Date(detalle.creadoEn).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })} · por{" "}
              {nombreUsuario(detalle.usuarioId)}
            </p>
          </section>

          <p className="mb-2 mt-5 text-[12.5px] font-semibold uppercase tracking-wide text-ink-soft">
            Líneas facturadas · {detalle.lineas.length}
          </p>
          <ul className="divide-y divide-line rounded-xl border border-line bg-paper-raised">
            {detalle.lineas.map((l) => (
              <li key={l.productoId} className="flex items-center justify-between gap-2 px-3.5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-ink">
                    {l.cantidad} × {l.nombre}
                  </p>
                  <p className="text-[11.5px] text-ink-soft">
                    {l.codigoInterno} · {formatoMoneda(l.costoUnitario)} c/u
                  </p>
                </div>
                <span className="flex-shrink-0 font-mono text-[13px] font-semibold text-ink">{formatoMoneda(l.subtotal)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center justify-between rounded-xl bg-teal-soft px-4 py-3">
            <span className="text-[13.5px] font-semibold text-teal">Total · {unidadesDeDetalle(detalle)} unidades</span>
            <span className="font-mono text-[18px] font-semibold text-teal">{formatoMoneda(detalle.total)}</span>
          </div>
        </div>
      </section>
    );
  }

  /* ─── Pantalla: Wizard recepción ─── */
  return (
    <PantallaCompletaAdmin>
      <BarraSuperior
        titulo={paso === 1 ? "Elegir proveedor" : paso === 2 ? "Agregar productos" : "Confirmar recepción"}
        subtitulo={`Paso ${paso} de 3${proveedorActual ? ` · ${proveedorActual.nombre}` : ""}`}
        onVolver={volverWizard}
        paso={{ actual: paso, total: 3 }}
      />

      {paso === 1 && (
        <>
          {/* Fijo: buscador + crear proveedor */}
          <div className="flex-shrink-0 space-y-2.5 px-5 pt-4 md:px-6 lg:px-8">
            <BuscadorInput autoFocus value={busquedaProveedor} onChange={setBusquedaProveedor} placeholder="Buscar por nombre o teléfono" />
            <button
              type="button"
              onClick={() => setMostrarCrearProv((v) => !v)}
              className="w-full rounded-xl border border-line bg-paper-raised py-2.5 text-[12.5px] font-semibold text-ink active:bg-paper-sunken"
            >
              {mostrarCrearProv ? "− Cerrar crear proveedor" : "+ Crear proveedor nuevo"}
            </button>
            {mostrarCrearProv && (
              <form onSubmit={crearProveedorInline} className="rounded-xl border border-line bg-paper-sunken p-3">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    required
                    value={nombreProvNuevo}
                    onChange={(e) => setNombreProvNuevo(e.target.value)}
                    placeholder="Nombre"
                    className="rounded-lg border border-line bg-paper-raised px-3 py-2.5 text-[13px] focus:border-ink focus:outline-none"
                  />
                  <input
                    value={telProvNuevo}
                    onChange={(e) => setTelProvNuevo(e.target.value)}
                    placeholder="Teléfono"
                    className="rounded-lg border border-line bg-paper-raised px-3 py-2.5 text-[13px] focus:border-ink focus:outline-none"
                  />
                </div>
                <Boton type="submit" variante="secundario" className="mt-2">
                  Crear y seleccionar
                </Boton>
              </form>
            )}
          </div>

          {/* Contenedor fijo: lista de proveedores con scroll propio */}
          <div className="flex min-h-0 flex-1 flex-col px-5 py-3 md:px-6 lg:px-8">
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-paper-sunken/30">
              <div className="flex flex-shrink-0 items-center justify-between border-b border-line bg-paper-raised px-3 py-2">
                <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
                  Proveedores ({proveedoresFiltrados.length})
                </p>
                <span className="text-[11px] text-ink-soft">Toca para elegir</span>
              </div>
              <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
                <ul className="space-y-1.5">
                  {proveedoresFiltrados.map((prov) => (
                    <li key={prov.id}>
                      <button
                        type="button"
                        onClick={() => setProveedorId(prov.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-[13.5px] active:opacity-90 ${
                          proveedorId === prov.id ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink"
                        }`}
                      >
                        <span className="min-w-0 truncate">
                          {prov.nombre} {prov.telefono ? `· ${prov.telefono}` : ""}
                        </span>
                        {proveedorId === prov.id && <span className="flex-shrink-0">✓</span>}
                      </button>
                    </li>
                  ))}
                  {proveedoresFiltrados.length === 0 && (
                    <li className="rounded-xl border border-dashed border-line bg-paper-raised p-6 text-center text-[12.5px] text-ink-soft">
                      Sin resultados · crea el proveedor arriba.
                    </li>
                  )}
                </ul>
              </div>
              <TiraToast aviso={aviso} alCerrar={cerrarAviso} />
            </div>
          </div>

          <BarraInferior>
            <Boton disabled={!proveedorId} onClick={() => setPaso(2)}>
              Continuar a productos →
            </Boton>
          </BarraInferior>
        </>
      )}

      {paso === 2 && (
        <>
          {/* Fijo: proveedor, buscador, crear producto */}
          <div className="flex-shrink-0 space-y-2.5 px-5 pt-4 md:px-6 lg:px-8">
            <div className="flex items-center justify-between gap-2 rounded-xl bg-teal-soft px-3 py-2 text-[12.5px] text-teal">
              <span className="min-w-0 truncate">
                Para <strong>{proveedorActual?.nombre}</strong>
              </span>
              <span className="flex flex-shrink-0 gap-3 text-[12px] font-semibold">
                <button type="button" onClick={() => setPaso(1)} className="underline">
                  Cambiar
                </button>
                <button type="button" onClick={cancelarRecepcion} className="text-danger underline">
                  Cancelar
                </button>
              </span>
            </div>

            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <BuscadorInput autoFocus value={busquedaProd} onChange={setBusquedaProd} placeholder="Filtrar por código o nombre" />
              </div>
              <button
                type="button"
                onClick={() => setMostrarCrearProd((v) => !v)}
                className="flex-shrink-0 rounded-xl border border-line bg-paper-raised px-3 text-[11.5px] font-semibold text-ink active:bg-paper-sunken"
              >
                + Producto
              </button>
            </div>

            {mostrarCrearProd && (
              <form onSubmit={guardarProductoInline} className="rounded-xl border border-line bg-paper-sunken p-3">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    required
                    value={prodNuevo.nombre}
                    onChange={(e) => setProdNuevo((a) => ({ ...a, nombre: e.target.value }))}
                    placeholder="Nombre producto"
                    className="col-span-2 rounded-lg border border-line bg-paper-raised px-3 py-2 text-[13px] focus:border-ink focus:outline-none"
                  />
                  <input
                    type="number"
                    value={prodNuevo.costoActual}
                    onChange={(e) => setProdNuevo((a) => ({ ...a, costoActual: e.target.value }))}
                    placeholder="Costo"
                    className="rounded-lg border border-line bg-paper-raised px-3 py-2 text-[13px]"
                  />
                  <input
                    type="number"
                    value={prodNuevo.precioVenta}
                    onChange={(e) => setProdNuevo((a) => ({ ...a, precioVenta: e.target.value }))}
                    placeholder="Precio venta"
                    className="rounded-lg border border-line bg-paper-raised px-3 py-2 text-[13px]"
                  />
                </div>
                <Boton type="submit" variante="secundario" className="mt-2">
                  Crear producto (código auto)
                </Boton>
              </form>
            )}
          </div>

          {/* Contenedor fijo: catálogo con scroll propio */}
          <div className="flex min-h-0 flex-1 flex-col px-5 py-3 md:px-6 lg:px-8">
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-paper-sunken/30">
              <div className="flex flex-shrink-0 items-center justify-between border-b border-line bg-paper-raised px-3 py-2">
                <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
                  Catálogo ({productosFiltrados.length})
                </p>
                <span className="text-[11px] text-ink-soft">Cant · $ · +</span>
              </div>
              <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
                <ul className="space-y-1.5">
                  {productosFiltrados.map((prod) => {
                    const enLinea = lineas.find((l) => l.productoId === prod.id);
                    return (
                      <li
                        key={prod.id}
                        className={`flex items-center gap-1.5 rounded-xl border bg-paper-raised px-2 py-1.5 ${
                          enLinea ? "border-success" : "border-line"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-ink">{prod.nombre}</p>
                          <p className="truncate text-[11px] text-ink-soft">
                            {prod.codigoInterno} · st {prod.stock} · {formatoMoneda(prod.costoActual)}
                            {enLinea && <span className="font-semibold text-success"> · ×{enLinea.cantidad}</span>}
                          </p>
                        </div>
                        <input
                          type="number"
                          min={1}
                          placeholder="Ct"
                          aria-label={`Cantidad de ${prod.nombre}`}
                          value={cantidadTmp[prod.id] ?? ""}
                          onChange={(e) => setCantidadTmp((a) => ({ ...a, [prod.id]: e.target.value }))}
                          className="w-11 flex-shrink-0 rounded-lg border border-line bg-paper-raised px-1 py-1.5 text-center text-[12px]"
                        />
                        <input
                          type="number"
                          min={0}
                          step={100}
                          placeholder="$"
                          aria-label={`Costo de ${prod.nombre}`}
                          value={costoTmp[prod.id] ?? ""}
                          onChange={(e) => setCostoTmp((a) => ({ ...a, [prod.id]: e.target.value }))}
                          className="w-14 flex-shrink-0 rounded-lg border border-line bg-paper-raised px-1 py-1.5 text-center text-[12px]"
                        />
                        <button
                          type="button"
                          onClick={() => agregarProductoConToast(prod.id)}
                          className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[18px] font-bold leading-none text-white active:opacity-90 ${
                            enLinea ? "bg-success" : "bg-ink"
                          }`}
                          aria-label={enLinea ? `Actualizar ${prod.nombre}` : `Agregar ${prod.nombre}`}
                        >
                          {enLinea ? "✓" : "+"}
                        </button>
                      </li>
                    );
                  })}
                  {productosFiltrados.length === 0 && (
                    <li className="rounded-xl border border-dashed border-line bg-paper-raised p-6 text-center text-[12.5px] text-ink-soft">
                      No existe · toca + Producto para crearlo sin salir del flujo.
                    </li>
                  )}
                </ul>
              </div>
              {/* Aviso flotante centrado */}
              <TiraToast aviso={aviso} alCerrar={cerrarAviso} />
            </div>
          </div>

          {/* Resumen y continuar */}
          <BarraInferior>
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[13px] text-ink-soft">
                {lineas.length} producto(s) · {unidadesRecepcion} und
              </span>
              <span className="font-mono text-[17px] font-semibold text-ink">{formatoMoneda(totalRecepcion)}</span>
            </div>
            <Boton disabled={lineas.length === 0} onClick={() => setPaso(3)}>
              Revisar y confirmar →
            </Boton>
          </BarraInferior>
        </>
      )}

      {paso === 3 && (
        <>
          {/* Scroll: resumen factura antes de confirmar */}
          <main className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-6 lg:px-8">
            <section className="rounded-xl border border-line bg-paper-raised p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Proveedor</p>
                  <p className="mt-1 truncate text-[15px] font-semibold text-ink">{proveedorActual?.nombre}</p>
                </div>
                <span className="flex-shrink-0 text-[13px] text-ink-soft">
                  {lineas.length} línea(s) · {unidadesRecepcion} und
                </span>
              </div>
              <div className="ticket-edge -mx-4 my-3" />
              <ul className="divide-y divide-line">
                {lineas.map((l) => (
                  <li key={l.productoId} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                    <span className="min-w-0 truncate text-ink">
                      {l.cantidad} × {l.nombre}
                    </span>
                    <span className="flex-shrink-0 font-mono text-ink">{formatoMoneda(l.subtotal)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
                <span className="text-[13px] font-semibold text-ink-soft">Total</span>
                <span className="font-mono text-[18px] font-semibold text-ink">{formatoMoneda(totalRecepcion)}</span>
              </div>
            </section>

            <label className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-paper-raised px-3.5 py-3.5 text-[13.5px] text-ink">
              <input
                type="checkbox"
                checked={descontarCaja}
                onChange={(e) => setDescontarCaja(e.target.checked)}
                className="h-4 w-4 accent-ink"
              />
              Descontar de caja ({formatoMoneda(totalRecepcion)})
            </label>
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink-soft">
              Al confirmar: stock incrementa, último costo se actualiza y se registra egreso opcional en caja.
            </p>
          </main>

          {tiraToast}

          <BarraInferior>
            <Boton onClick={confirmarRecepcion}>Confirmar recepción · {formatoMoneda(totalRecepcion)}</Boton>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaso(2)}
                className="rounded-xl border border-line bg-paper py-2.5 text-[13px] font-semibold text-ink active:bg-paper-sunken"
              >
                ← Editar
              </button>
              <button
                type="button"
                onClick={() => setConfirmarSalida(true)}
                className="rounded-xl border border-danger-soft bg-danger-soft py-2.5 text-[13px] font-semibold text-danger active:opacity-80"
              >
                Cancelar
              </button>
            </div>
          </BarraInferior>

          <ConfirmarAccion
            abierto={confirmarSalida}
            titulo="Cancelar la recepción"
            mensaje="Se perderán las líneas agregadas y no se modificará el stock ni la caja."
            textoConfirmar="Sí, cancelar"
            tono="peligro"
            alCancelar={() => setConfirmarSalida(false)}
            alConfirmar={() => {
              setConfirmarSalida(false);
              cancelarRecepcion();
            }}
          />
        </>
      )}
    </PantallaCompletaAdmin>
  );
}

function unidadesDeDetalle(detalle: RecepcionCompra): number {
  return detalle.lineas.reduce((s, l) => s + l.cantidad, 0);
}
