import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BarraInferior } from "../../../components/BarraInferior";
import { BarraSuperior } from "../../../components/BarraSuperior";
import { Boton } from "../../../components/Boton";
import { BuscadorInput } from "../../../components/BuscadorInput";
import { IconChevronRight, IconMapPin } from "../../../components/Icons";
import { ListaVacia } from "../../../components/ListaVacia";
import { SegmentoControl } from "../../../components/SegmentoControl";
import { SelectorOpciones } from "../../../components/SelectorOpciones";
import { TarjetaClicable } from "../../../components/TarjetaClicable";
import { TarjetaProducto } from "../../../components/TarjetaProducto";
import { TiraToast } from "../../../components/TiraToast";
import { useAviso } from "../../../components/useAviso";
import { useAuth } from "../../../context/auth";
import { useOperaciones } from "../../../context/operaciones";
import { categorias } from "../../../data/semilla";
import { construirPago } from "../../../dominio/servicios";
import { SelectorPago } from "../../clientes-pedido/components/SelectorPago";
import type { EstadoPedido, LineaPedido, MetodoPago, Pedido, Producto, Cliente } from "../../../types";
import { usaApi } from "../../../data/api";
import { usePaginaApi, useRegistroApi } from "../../../data/usePaginaApi";
import { formatoMoneda } from "../../../utils/formato";

import { DetalleProductosPedido } from "../components/DetalleProductosPedido";
import { Paginacion } from "../../../components/Paginacion";
import { useTamanoPagina, paginar } from "../../../utils/paginacion";

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
  const POR_PAGINA = useTamanoPagina();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const { usuario } = useAuth();
  const { clientes, inventario, clienteActivo, seleccionarClienteActivo, obtenerCliente, registrarPedido } = useOperaciones();
  const { aviso, mostrarAviso, cerrarAviso } = useAviso();

  const clienteIdDeRuta = (ubicacion.state as { clienteId?: string } | null)?.clienteId;
  const clienteReciénCreado = (ubicacion.state as { clienteCreado?: string } | null)?.clienteCreado;
  const [paginaCliente,setPaginaCliente]=useState(1);
  const [paginaProducto,setPaginaProducto]=useState(1);
  const [paso, setPaso] = useState<Paso>(1);
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [categoria, setCategoria] = useState<string>("Todas");
  const [productosElegidos, setProductosElegidos] = useState<Record<string, Producto>>({});
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [entrega, setEntrega] = useState<ModoEntrega>("entregado");
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [ocasional, setOcasional] = useState(false);
  useEffect(()=>setPaginaCliente(1),[busquedaCliente]);
  useEffect(()=>setPaginaProducto(1),[busquedaProducto,categoria]);
  const clientesRemotos=usePaginaApi<Cliente>(`/clientes?page=${paginaCliente}&pageSize=${POR_PAGINA}&q=${encodeURIComponent(busquedaCliente)}`,paso === 1);
  const productosRemotos = usePaginaApi<Producto>(`/productos?page=${paginaProducto}&pageSize=${POR_PAGINA}&orden=nombre&activo=true&q=${encodeURIComponent(busquedaProducto)}&categoria=${encodeURIComponent(categoria)}`,paso === 2);
  const clienteDeRuta=useRegistroApi<Cliente>(`/clientes/${clienteIdDeRuta}`,!!clienteIdDeRuta);
  const clienteRutaAplicado = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (clienteIdDeRuta && clienteRutaAplicado.current !== clienteIdDeRuta && (clienteDeRuta.data || obtenerCliente(clienteIdDeRuta))) {
      clienteRutaAplicado.current = clienteIdDeRuta;
      seleccionarClienteActivo(clienteIdDeRuta);
      setPaso(2);
    }
  }, [clienteIdDeRuta, clienteDeRuta.data, obtenerCliente, seleccionarClienteActivo]);

  const clienteSeleccionado = ocasional ? { id: null, nombre: "Venta ocasional", alias: "Sin registro de cliente" } : clienteActivo;

  /** Elige cliente y avanza al paso de productos. */
  function elegirCliente(id: string) {
    if (clientesRemotos.actualizando) return;
    setOcasional(false);
    seleccionarClienteActivo(id);
    setPaso(2);
  }

  const clientesFiltrados = useMemo(() => {
    if(usaApi) return clientesRemotos.items;
    const q = busquedaCliente.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        c.alias.toLowerCase().includes(q) ||
        c.telefono.toLowerCase().includes(q) ||
        c.direccion.toLowerCase().includes(q),
    );
  }, [busquedaCliente, clientes, clientesRemotos.items]);

  const productosFiltrados = useMemo(() => {
    if (usaApi) return productosRemotos.items.map(p => ({...p, stock: (p as Producto & {stockDisponible?:number}).stockDisponible ?? p.stock}));
    const q = busquedaProducto.trim().toLowerCase();
    return inventario.filter((p) => {
      if (!p.activo) return false;
      if (categoria !== "Todas" && p.categoria !== categoria) return false;
      return !q || p.nombre.toLowerCase().includes(q) || p.codigoInterno.toLowerCase().includes(q);
    });
  }, [busquedaProducto, categoria, inventario, productosRemotos.items]);

  const lineas = useMemo<LineaPedido[]>(
    () =>
      (usaApi ? Object.values(productosElegidos) : inventario)
        .filter((producto) => cantidades[producto.id])
        .map((producto) => ({
          productoId: producto.id,
          nombre: producto.nombre,
          cantidad: cantidades[producto.id],
          precioUnitario: producto.precioVenta,
          subtotal: producto.precioVenta * cantidades[producto.id],
          costoUnitario: producto.costoActual,
        })),
    [cantidades, inventario, productosElegidos],
  );
  const total = lineas.reduce((suma, linea) => suma + linea.subtotal, 0);
  const unidades = lineas.reduce((suma, linea) => suma + linea.cantidad, 0);

  function cambiarCantidad(productoId: string, delta: number) {
    const producto = productosFiltrados.find((p) => p.id === productoId) ?? productosElegidos[productoId];
    if (producto) setProductosElegidos(actuales => ({...actuales,[productoId]:producto}));
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

  async function confirmarPedido() {
    if (!clienteSeleccionado || lineas.length === 0) return false;
    if (ocasional && metodo === "credito") { mostrarAviso("La venta ocasional no admite crédito", "info"); return false; }
    const pedido = await registrarPedido({
      clienteId: clienteSeleccionado.id,
      vendedorId: usuario?.id ?? "usuario-vendedor",
      lineas,
      total,
      estadoInicial: entrega,
      pago: construirPago(metodo, total),
    });
    if (!pedido) return false;
    setCantidades({});
    if (alConfirmar) alConfirmar(pedido);
    navegar(rutaCompletado, { state: { pedidoId: pedido.id }, replace: true });
    return true;
  }

  function volver() {
    if (paso === 1) {
      navegar(rutaInicio);
      return;
    }
    cambiarPaso((paso - 1) as Paso);
  }
  function cambiarPaso(nuevo: Paso) {
    setPaso(nuevo);
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
          <BuscadorInput autoFocus value={busquedaCliente} onChange={setBusquedaCliente} placeholder="Buscar por nombre, alias o teléfono" />
          <Paginacion pagina={paginaCliente} totalPaginas={Math.max(1,Math.ceil((usaApi ? clientesRemotos.total : clientesFiltrados.length)/POR_PAGINA))} total={usaApi ? clientesRemotos.total : clientesFiltrados.length} porPagina={POR_PAGINA} onChange={setPaginaCliente} />
        </div>
        <main className="no-scrollbar flex-1 min-h-0 overflow-y-auto px-5 py-3 md:px-6">
          {clienteReciénCreado && (
            <div role="status" className="mb-2.5 rounded-xl bg-success-soft px-3 py-2.5 text-[12.5px] font-semibold text-success">
              Cliente “{clienteReciénCreado}” creado ✓ Búscalo en la lista para continuar
            </div>
          )}
          <p className="mb-2.5 text-[12.5px] text-ink-soft">Elige a quién le vas a vender hoy.</p>
          <TarjetaClicable className="mb-3 p-4" onClick={() => { setOcasional(true); seleccionarClienteActivo(null); if (metodo === "credito") setMetodo("efectivo"); setPaso(2); }}><span className="block font-semibold">Venta abierta · cliente ocasional</span><span className="block text-sm text-ink-soft">Sin registrar un cliente. Efectivo o billetera, sin crédito.</span></TarjetaClicable>
          {clientesFiltrados.length === 0 ? (
            <ListaVacia
              titulo={clientes.length === 0 ? "Aún no hay clientes registrados" : "No se encontró el cliente"}
              texto="Créalo sin salir del flujo y quedará seleccionado."
            />
          ) : (
            <ul className="space-y-2">
              {(usaApi ? clientesFiltrados : paginar(clientesFiltrados,paginaCliente,POR_PAGINA).items).map((cliente) => (
                <li key={cliente.id}>
                  <TarjetaClicable onClick={() => elegirCliente(cliente.id)} ariaLabel={`${cliente.nombre}${clienteActivo?.id === cliente.id ? ", seleccionado" : ""}`} className="flex items-center gap-3">
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
                  </TarjetaClicable>
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
    <div className={`flex h-full min-h-0 flex-col ${paso === 2 ? "overflow-y-auto" : ""}`}>
      <BarraSuperior
        titulo={titulos[paso]}
        subtitulo={`${clienteSeleccionado.alias} · Paso ${paso} de 4`}
        onVolver={volver}
        paso={{ actual: paso, total: 4 }}
      />

      {paso === 2 && (
        <>
          <div className="flex-shrink-0 space-y-2 px-5 pt-3 md:px-6">
            <BuscadorInput value={busquedaProducto} onChange={setBusquedaProducto} placeholder="Buscar producto o código" />
            <SegmentoControl
              desborda
              valor={categoria}
              onChange={setCategoria}
              opciones={["Todas", ...categorias].map((cat) => ({ valor: cat, etiqueta: cat }))}
            />
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

          <Paginacion pagina={paginaProducto} totalPaginas={Math.max(1,Math.ceil((usaApi ? productosRemotos.total : productosFiltrados.length)/POR_PAGINA))} total={usaApi ? productosRemotos.total : productosFiltrados.length} porPagina={POR_PAGINA} onChange={setPaginaProducto} />
          {productosRemotos.error && <p role="alert" className="px-4 text-danger">{productosRemotos.error}<button type="button" onClick={productosRemotos.actualizar}>Reintentar</button></p>}
          {productosRemotos.cargando && <p role="status" className="px-4">Cargando productos…</p>}
          <main inert={usaApi && productosRemotos.actualizando} className="lista-productos no-scrollbar mx-2 my-3 overflow-y-auto rounded-xl border border-line px-2 py-2 md:mx-4">
            <ul className="space-y-2">
              {(usaApi ? productosFiltrados : paginar(productosFiltrados,paginaProducto,POR_PAGINA).items).map((producto) => {
                const cantidad = cantidades[producto.id] ?? 0;
                const sinStock = producto.stock <= 0 || productosRemotos.actualizando;
                if (sinStock) {
                  return (
                    <li key={producto.id}>
                      <TarjetaProducto
                        producto={producto}
                        cantidad={0}
                        onAgregar={() => cambiarCantidad(producto.id, 1)}
                        onCambiarCantidad={() => undefined}
                        detalle="Sin stock"
                        productos={productosFiltrados}
                      />
                    </li>
                  );
                }
                return (
                  <li key={producto.id}>
                    <TarjetaProducto
                      producto={producto}
                      cantidad={cantidad}
                      onAgregar={() => cambiarCantidad(producto.id, 1)}
                      onCambiarCantidad={(c) => cambiarCantidad(producto.id, c - cantidad)}
                      detalle={`${producto.stock} disp.`}
                      productos={productosFiltrados}
                    />
                  </li>
                );
              })}
              {productosFiltrados.length === 0 && (
                <li>
                  <ListaVacia
                    titulo={inventario.length === 0 ? "Aún no hay productos registrados." : "No hay productos con ese filtro."}
                    texto={inventario.length === 0 ? "Créalos desde Inventario en el panel del administrador." : undefined}
                  />
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
            <Boton disabled={lineas.length === 0} onClick={() => cambiarPaso(3)}>
              Continuar a entrega <IconChevronRight width={17} height={17} />
            </Boton>
          </BarraInferior>
        </>
      )}

      {paso === 3 && (
        <>
          <main className="no-scrollbar flex-1 min-h-0 overflow-y-auto px-5 py-4 md:px-6">
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              Indica si el pedido ya se entregó o si queda por preparar (jugos, sándwiches, etc.). El estado queda visible en Pedidos para su seguimiento.
            </p>
            <div className="mt-3">
              <SelectorOpciones
                columnas={1}
                valor={entrega}
                onChange={setEntrega}
                opciones={[
                  {
                    valor: "entregado",
                    titulo: "Entregado ahora",
                    descripcion: "El cliente ya recibió el pedido. Continúa al cobro.",
                    etiqueta: "✓",
                  },
                  {
                    valor: "pendiente",
                    titulo: "Pendiente por preparar",
                    descripcion: "Queda pendiente. Podrás marcarlo como entregado y cobrar después desde el detalle del pedido o en Abonos.",
                    etiqueta: "⏳",
                  },
                ]}
              />
            </div>
          </main>
          <BarraInferior>
            <Boton onClick={() => cambiarPaso(4)}>
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
              <DetalleProductosPedido lineas={lineas} />
              <div className="ticket-edge -mx-4 my-3" />
              <div className="flex items-center justify-between">
                <span className="text-[13.5px] text-ink-soft">{unidades} unidades</span>
                <span className="font-mono text-[19px] font-semibold text-ink">{formatoMoneda(total)}</span>
              </div>
            </section>

            <section className="mt-4">
              <p className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-ink-soft">Forma de pago</p>
              <SelectorPago metodo={metodo} onChange={setMetodo} permitirCredito={!ocasional} />
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
                  El pago queda registrado ahora y el pedido permanece por preparar. Podrás marcarlo como entregado desde el detalle sin cobrarlo nuevamente.
                </p>
              )}
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
