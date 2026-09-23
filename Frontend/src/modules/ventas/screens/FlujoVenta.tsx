import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BarraInferior } from "../../../components/BarraInferior";
import { BarraSuperior } from "../../../components/BarraSuperior";
import { Boton } from "../../../components/Boton";
import { IconCheck, IconChevronRight, IconMapPin, IconSearch } from "../../../components/Icons";
import { SelectorCantidad } from "../../../components/SelectorCantidad";
import { TiraToast } from "../../../components/TiraToast";
import { useAviso } from "../../../components/useAviso";
import { VistaImagenProducto } from "../../../components/VistaImagenProducto";
import { useAuth } from "../../../context/AuthContext";
import { useOperaciones } from "../../../context/OperacionesContext";
import { categorias } from "../../../data/semilla";
import { SelectorPago } from "../../clientes-pedido/components/SelectorPago";
import type { EstadoPedido, LineaPedido, MetodoPago, Pedido } from "../../../types";
import { formatoMoneda } from "../../../utils/formato";

type Paso = 1 | 2 | 3 | 4;
type ModoEntrega = Extract<EstadoPedido, "entregado" | "pendiente">;

interface FlujoVentaProps {
  /** Pantalla inicial del rol (para volver / cancelar). */
  rutaInicio: string;
  /** Alta rápida de cliente. */
  rutaNuevoCliente: string;
  /** Pantalla de éxito tras confirmar. */
  rutaCompletado: string;
  /** Título mostrado en la barra superior del paso 1. */
  titulo?: string;
  /** Al confirmar, se entrega el pedido creado. */
  alConfirmar?: (pedido: Pedido) => void;
}

/**
 * Flujo de venta compartido (vendedor y administrador).
 * Pasos a pantalla completa: cliente → productos → entrega → pago.
 */
export function FlujoVenta({ rutaInicio, rutaNuevoCliente, rutaCompletado, titulo = "Crear pedido", alConfirmar }: FlujoVentaProps) {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const { usuario } = useAuth();
  const { clientes, inventario, clienteActivo, seleccionarClienteActivo, obtenerCliente, registrarPedido } = useOperaciones();
  const { aviso, mostrarAviso, cerrarAviso } = useAviso();

  const clienteIdDeRuta = (ubicacion.state as { clienteId?: string } | null)?.clienteId;
  const clienteReciénCreado = (ubicacion.state as { clienteCreado?: string } | null)?.clienteCreado;
  const [paso, setPaso] = useState<Paso>(1);
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [categoria, setCategoria] = useState<string>("Todas");
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [entrega, setEntrega] = useState<ModoEntrega>("entregado");
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");

  useEffect(() => {
    if (clienteIdDeRuta && obtenerCliente(clienteIdDeRuta)) {
      seleccionarClienteActivo(clienteIdDeRuta);
      setPaso(2);
    }
  }, [clienteIdDeRuta, obtenerCliente, seleccionarClienteActivo]);

  const clienteSeleccionado = clienteActivo;

  /** Elige cliente y avanza al paso de productos. */
  function elegirCliente(id: string) {
    seleccionarClienteActivo(id);
    setPaso(2);
  }

  const clientesFiltrados = useMemo(() => {
    const q = busquedaCliente.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        c.alias.toLowerCase().includes(q) ||
        c.telefono.toLowerCase().includes(q) ||
        c.direccion.toLowerCase().includes(q),
    );
  }, [busquedaCliente, clientes]);

  const productosFiltrados = useMemo(() => {
    const q = busquedaProducto.trim().toLowerCase();
    return inventario.filter((p) => {
      if (!p.activo) return false;
      if (categoria !== "Todas" && p.categoria !== categoria) return false;
      return !q || p.nombre.toLowerCase().includes(q) || p.codigoInterno.toLowerCase().includes(q);
    });
  }, [busquedaProducto, categoria, inventario]);

  const lineas = useMemo<LineaPedido[]>(
    () =>
      inventario
        .filter((producto) => cantidades[producto.id])
        .map((producto) => ({
          productoId: producto.id,
          nombre: producto.nombre,
          cantidad: cantidades[producto.id],
          precioUnitario: producto.precioVenta,
          subtotal: producto.precioVenta * cantidades[producto.id],
        })),
    [cantidades, inventario],
  );
  const total = lineas.reduce((suma, linea) => suma + linea.subtotal, 0);
  const unidades = lineas.reduce((suma, linea) => suma + linea.cantidad, 0);

  function cambiarCantidad(productoId: string, delta: number) {
    const producto = inventario.find((p) => p.id === productoId);
    const tope = producto?.stock ?? 0;
    setCantidades((actuales) => {
      const siguienteCantidad = Math.max(0, Math.min(tope, (actuales[productoId] ?? 0) + delta));
      const siguiente = { ...actuales };
      if (siguienteCantidad === 0) delete siguiente[productoId];
      else siguiente[productoId] = siguienteCantidad;
      if (delta > 0 && siguienteCantidad === tope && tope > 0) {
        mostrarAviso(`Tope de stock: ${producto?.nombre} (${tope})`, "info");
      }
      return siguiente;
    });
  }

  function confirmarPedido() {
    if (!clienteSeleccionado || lineas.length === 0) return;
    const esCredito = metodo === "credito";
    const pedido = registrarPedido({
      clienteId: clienteSeleccionado.id,
      vendedorId: usuario?.id ?? "usuario-vendedor",
      lineas,
      total,
      estadoInicial: entrega,
      pago: {
        metodo,
        montoRecibido: esCredito ? 0 : total,
        saldoPendiente: esCredito ? total : 0,
        estado: esCredito ? "pendiente" : "pagado",
        recordatorioWhatsApp: esCredito,
      },
    });
    setCantidades({});
    if (alConfirmar) alConfirmar(pedido);
    navegar(rutaCompletado, { state: { pedidoId: pedido.id }, replace: true });
  }

  function volver() {
    if (paso === 1) {
      navegar(rutaInicio);
      return;
    }
    setPaso((p) => (p - 1) as Paso);
  }

  // ─── Paso 1 · Cliente ───
  if (!clienteSeleccionado || paso === 1) {
    return (
      <div className="flex h-full flex-col min-h-0">
        <BarraSuperior
          titulo={titulo}
          subtitulo="Paso 1 de 4 · Cliente"
          onVolver={() => navegar(rutaInicio)}
          paso={{ actual: 1, total: 4 }}
        />
        <div className="flex-shrink-0 px-5 pt-3 md:px-6">
          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-paper-raised px-3.5 py-2.5">
            <IconSearch width={18} height={18} className="flex-shrink-0 text-ink-faint" />
            <input
              autoFocus
              value={busquedaCliente}
              onChange={(e) => setBusquedaCliente(e.target.value)}
              placeholder="Buscar por nombre, alias o teléfono"
              className="w-full bg-transparent text-[15px] text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </div>
        </div>
        <main className="no-scrollbar flex-1 min-h-0 overflow-y-auto px-5 py-3 md:px-6">
          {clienteReciénCreado && (
            <div role="status" className="mb-2.5 rounded-xl bg-success-soft px-3 py-2.5 text-[12.5px] font-semibold text-success">
              Cliente “{clienteReciénCreado}” creado ✓ Búscalo en la lista para continuar
            </div>
          )}
          <p className="mb-2.5 text-[12.5px] text-ink-soft">Elige a quién le vas a vender hoy.</p>
          {clientesFiltrados.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-paper-raised px-4 py-8 text-center">
              <p className="text-[13px] font-medium text-ink">No se encontró el cliente</p>
              <p className="mt-1 text-[12px] text-ink-soft">Créalo sin salir del flujo y quedará seleccionado.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {clientesFiltrados.map((cliente) => (
                <li key={cliente.id}>
                  <button
                    type="button"
                    onClick={() => elegirCliente(cliente.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-paper-raised p-3 text-left active:bg-paper-sunken"
                  >
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-ink font-display text-[12.5px] font-semibold text-white">
                      {cliente.nombre.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">{cliente.nombre}</span>
                      <span className="block truncate text-[12px] text-ink-soft">
                        {cliente.alias !== cliente.nombre ? `“${cliente.alias}” · ` : ""}
                        {cliente.telefono || "sin teléfono"}
                      </span>
                    </span>
                    {cliente.saldoPendiente > 0 ? (
                      <span className="flex-shrink-0 rounded-full bg-danger-soft px-2 py-0.5 font-mono text-[10.5px] font-semibold text-danger">
                        {formatoMoneda(cliente.saldoPendiente)}
                      </span>
                    ) : (
                      <IconChevronRight width={18} height={18} className="flex-shrink-0 text-ink-faint" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </main>
        <BarraInferior>
          <Boton variante="fantasma" onClick={() => navegar(rutaNuevoCliente, { state: { volverA: "pedido" } })}>
            + Crear cliente nuevo
          </Boton>
        </BarraInferior>
      </div>
    );
  }

  // ─── Pasos 2, 3 y 4 ───
  const titulos: Record<Paso, string> = {
    1: "Cliente",
    2: "Agregar productos",
    3: "Entrega del pedido",
    4: "Registrar pago",
  };

  return (
    <div className="flex h-full flex-col min-h-0">
      <BarraSuperior
        titulo={titulos[paso]}
        subtitulo={`${clienteSeleccionado.alias} · Paso ${paso} de 4`}
        onVolver={volver}
        paso={{ actual: paso, total: 4 }}
      />

      {paso === 2 && (
        <>
          <div className="flex-shrink-0 space-y-2 px-5 pt-3 md:px-6">
            <div className="flex items-center gap-2.5 rounded-xl border border-line bg-paper-raised px-3.5 py-2.5">
              <IconSearch width={18} height={18} className="flex-shrink-0 text-ink-faint" />
              <input
                value={busquedaProducto}
                onChange={(e) => setBusquedaProducto(e.target.value)}
                placeholder="Buscar producto o código"
                className="w-full bg-transparent text-[15px] text-ink placeholder:text-ink-faint focus:outline-none"
              />
            </div>
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
              {["Todas", ...categorias].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoria(cat)}
                  className={`flex-shrink-0 rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors ${
                    categoria === cat ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink-soft"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-teal-soft px-3 py-2 text-[12px] text-teal">
              <IconMapPin width={14} height={14} className="flex-shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Pedido para <strong>{clienteSeleccionado.nombre}</strong>
              </span>
              <button type="button" onClick={() => setPaso(1)} className="flex-shrink-0 font-semibold underline">
                Cambiar
              </button>
            </div>
          </div>

          <main className="no-scrollbar flex-1 min-h-0 overflow-y-auto px-5 py-3 md:px-6">
            <ul className="space-y-2">
              {productosFiltrados.map((producto) => {
                const cantidad = cantidades[producto.id] ?? 0;
                const sinStock = producto.stock <= 0;
                return (
                  <li key={producto.id} className="flex items-center gap-3 rounded-xl border border-line bg-paper-raised p-3">
                    <VistaImagenProducto producto={producto} tamano="sm" clickable productos={productosFiltrados} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium text-ink">{producto.nombre}</p>
                      <p className="mt-0.5 font-mono text-[12px] text-ink-soft">
                        {formatoMoneda(producto.precioVenta)} · {producto.stock} disp.
                      </p>
                    </div>
                    {sinStock ? (
                      <span className="flex-shrink-0 rounded-full bg-danger-soft px-2.5 py-1 text-[10.5px] font-semibold text-danger">Sin stock</span>
                    ) : cantidad === 0 ? (
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(producto.id, 1)}
                        className="flex-shrink-0 rounded-lg bg-ink px-3 py-2 text-[12px] font-semibold text-white active:bg-ink/90"
                      >
                        Agregar
                      </button>
                    ) : (
                      <SelectorCantidad cantidad={cantidad} onCambiar={(c) => cambiarCantidad(producto.id, c - cantidad)} tamano="sm" />
                    )}
                  </li>
                );
              })}
              {productosFiltrados.length === 0 && (
                <li className="rounded-xl border border-dashed border-line bg-paper-raised p-8 text-center text-[13px] text-ink-soft">
                  No hay productos con ese filtro.
                </li>
              )}
            </ul>
          </main>

          <TiraToast aviso={aviso} alCerrar={cerrarAviso} />
          <BarraInferior>
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-[13px] text-ink-soft">{unidades} unidad(es)</span>
              <span className="font-mono text-[17px] font-semibold text-ink">{formatoMoneda(total)}</span>
            </div>
            <Boton disabled={lineas.length === 0} onClick={() => setPaso(3)}>
              Continuar a entrega <IconChevronRight width={17} height={17} />
            </Boton>
          </BarraInferior>
        </>
      )}

      {paso === 3 && (
        <>
          <main className="no-scrollbar flex-1 min-h-0 overflow-y-auto px-5 py-4 md:px-6">
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              Indica si el pedido ya se entregó o si queda por preparar (jugos, sándwiches, etc.). El administrador verá este estado en su panel de Pedidos.
            </p>
            <div className="mt-3 space-y-2.5">
              <button
                type="button"
                onClick={() => setEntrega("entregado")}
                className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
                  entrega === "entregado" ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink active:bg-paper-sunken"
                }`}
              >
                <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-bold ${entrega === "entregado" ? "bg-success text-white" : "bg-success-soft text-success"}`}>
                  <IconCheck width={17} height={17} />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-[15px] font-semibold">Entregado ahora</span>
                  <span className={`mt-0.5 block text-[12px] leading-relaxed ${entrega === "entregado" ? "text-white/70" : "text-ink-soft"}`}>
                    El cliente ya recibió el pedido. Continúa al cobro.
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => setEntrega("pendiente")}
                className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors ${
                  entrega === "pendiente" ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink active:bg-paper-sunken"
                }`}
              >
                <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full font-display text-[15px] font-bold ${entrega === "pendiente" ? "bg-accent text-ink" : "bg-accent-soft text-accent-dark"}`}>
                  ⏳
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-[15px] font-semibold">Pendiente por preparar</span>
                  <span className={`mt-0.5 block text-[12px] leading-relaxed ${entrega === "pendiente" ? "text-white/70" : "text-ink-soft"}`}>
                    Queda pendiente. Podrás marcarlo como entregado y cobrar después desde el detalle del pedido o en Abonos.
                  </span>
                </span>
              </button>
            </div>
          </main>
          <BarraInferior>
            <Boton onClick={() => setPaso(4)}>
              Continuar al pago <IconChevronRight width={17} height={17} />
            </Boton>
          </BarraInferior>
        </>
      )}

      {paso === 4 && (
        <>
          <main className="no-scrollbar flex-1 min-h-0 overflow-y-auto px-5 py-4 md:px-6">
            <section className="rounded-xl border border-line bg-paper-raised p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Cliente</p>
                  <p className="mt-0.5 truncate text-[15px] font-semibold text-ink">{clienteSeleccionado.nombre}</p>
                  <p className="truncate text-[12.5px] text-ink-soft">“{clienteSeleccionado.alias}”</p>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  entrega === "entregado" ? "bg-success-soft text-success" : "bg-accent-soft text-accent-dark"
                }`}>
                  {entrega === "entregado" ? "Entregado" : "Por preparar"}
                </span>
              </div>
              <div className="ticket-edge -mx-4 my-3" />
              <div className="flex items-center justify-between">
                <span className="text-[13.5px] text-ink-soft">{unidades} unidades</span>
                <span className="font-mono text-[19px] font-semibold text-ink">{formatoMoneda(total)}</span>
              </div>
            </section>

            <section className="mt-4">
              <p className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-ink-soft">Forma de pago</p>
              <SelectorPago metodo={metodo} onChange={setMetodo} />
              {metodo === "credito" && (
                <div className="mt-3 rounded-xl border border-danger/20 bg-danger-soft p-3">
                  <p className="text-[13px] font-semibold text-danger">Saldo pendiente: {formatoMoneda(total)}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
                    Queda en cartera del cliente y aparece en Créditos y Abonos para su cobro.
                  </p>
                </div>
              )}
              {metodo !== "credito" && entrega === "pendiente" && (
                <p className="mt-3 rounded-xl bg-paper-sunken px-3 py-2.5 text-[12px] leading-relaxed text-ink-soft">
                  Estás cobrando un pedido aún no entregado. Si prefieres cobrarlo al entregar, elige <strong>Crédito</strong> y usa Abonos.
                </p>
              )}
            </section>

            <section className="mt-4 rounded-xl border border-line bg-paper-raised p-4">
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Resumen</p>
              <ul className="mt-2 divide-y divide-line">
                {lineas.map((linea) => (
                  <li key={linea.productoId} className="flex justify-between gap-3 py-2 text-[13px]">
                    <span className="truncate text-ink-soft">{linea.cantidad} × {linea.nombre}</span>
                    <span className="font-mono text-ink">{formatoMoneda(linea.subtotal)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </main>
          <BarraInferior>
            <Boton onClick={confirmarPedido}>
              {metodo === "credito" ? "Registrar crédito" : "Confirmar pedido"} · {formatoMoneda(total)}
            </Boton>
          </BarraInferior>
        </>
      )}
    </div>
  );
}
