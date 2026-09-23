import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BarraInferior } from "../../components/BarraInferior";
import { BarraSuperior } from "../../components/BarraSuperior";
import { Boton } from "../../components/Boton";
import { IconCheck, IconChevronRight, IconMapPin, IconSearch } from "../../components/Icons";
import { SelectorCantidad } from "../../components/SelectorCantidad";
import { VistaImagenProducto } from "../../components/VistaImagenProducto";
import { useAuth } from "../../context/AuthContext";
import { useOperaciones } from "../../context/OperacionesContext";
import { categorias } from "../../data/semilla";
import { SelectorPago } from "../../modules/clientes-pedido/components/SelectorPago";
import type { LineaPedido, MetodoPago } from "../../modules/clientes-pedido/types";
import { formatoMoneda } from "../../utils/formato";

export default function PedidoRapido() {
  const navegar = useNavigate();
  const location = useLocation();
  const { clientes, clienteActivo, inventario, seleccionarClienteActivo, obtenerCliente, registrarPedido } = useOperaciones();
  const { usuario } = useAuth();
  const clienteIdDeRuta = (location.state as { clienteId?: string } | null)?.clienteId;
  const [paso, setPaso] = useState<1 | 2>(1);
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [categoria, setCategoria] = useState<string>("Todas");
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [entrega, setEntrega] = useState<"entregado" | "pendiente">("pendiente");
  const [cobrarAlEntregar, setCobrarAlEntregar] = useState(true);

  useEffect(() => {
    if (clienteIdDeRuta && obtenerCliente(clienteIdDeRuta)) seleccionarClienteActivo(clienteIdDeRuta);
  }, [clienteIdDeRuta, obtenerCliente, seleccionarClienteActivo]);

  const clienteSeleccionado = clienteIdDeRuta ? obtenerCliente(clienteIdDeRuta) : clienteActivo;
  const productosFiltrados = useMemo(() => {
    const query = busquedaProducto.trim().toLowerCase();
    return inventario.filter((producto) => {
      const coincideCategoria = categoria === "Todas" || producto.categoria === categoria;
      const coincideBusqueda = !query || producto.nombre.toLowerCase().includes(query);
      return coincideCategoria && coincideBusqueda;
    });
  }, [busquedaProducto, categoria, inventario]);
  const clientesFiltrados = useMemo(() => {
    const query = busquedaCliente.trim().toLowerCase();
    return clientes.filter((cliente) => !query || cliente.nombre.toLowerCase().includes(query) || cliente.alias.toLowerCase().includes(query));
  }, [busquedaCliente, clientes]);
  const lineas = useMemo<LineaPedido[]>(
    () => inventario.filter((producto) => cantidades[producto.id]).map((producto) => ({ productoId: producto.id, nombre: producto.nombre, cantidad: cantidades[producto.id], precioUnitario: producto.precioVenta, subtotal: producto.precioVenta * cantidades[producto.id] })),
    [cantidades, inventario],
  );
  const total = lineas.reduce((suma, linea) => suma + linea.subtotal, 0);

  function cambiarCantidad(productoId: string, cantidad: number) {
    const stock = inventario.find((p) => p.id === productoId)?.stock ?? 0;
    const tope = Math.max(0, Math.min(cantidad, stock));
    setCantidades((actuales) => {
      const siguiente = { ...actuales };
      if (tope <= 0) delete siguiente[productoId];
      else siguiente[productoId] = tope;
      return siguiente;
    });
  }

  const esEntregado = entrega === "entregado";
  const diferido = !esEntregado && cobrarAlEntregar;

  function confirmarPedido() {
    if (!clienteSeleccionado || lineas.length === 0) return;
    const credito = metodo === "credito" || diferido;
    const pedido = registrarPedido({
      clienteId: clienteSeleccionado.id,
      vendedorId: usuario?.id ?? "usuario-vendedor",
      lineas,
      total,
      pago: { metodo, montoRecibido: credito ? 0 : total, saldoPendiente: credito ? total : 0, estado: credito ? "pendiente" : "pagado", recordatorioWhatsApp: credito },
      estadoInicial: esEntregado ? "entregado" : "en-preparacion",
    });
    // Replace evita volver al pago con el botón atrás: el pedido ya está facturado.
    navegar("/vendedor/pedido/completado", { replace: true, state: { pedidoId: pedido.id } });
  }

  if (!clienteSeleccionado) {
    return (
      <div className="flex h-full flex-col">
        <BarraSuperior titulo="Crear pedido" subtitulo="Paso 1 de 3 · Cliente" onVolver={() => navegar("/vendedor")} paso={{ actual: 1, total: 3 }} />
        <div className="flex-shrink-0 px-5 pt-4 md:px-6"><div className="flex items-center gap-2.5 rounded-xl border border-line bg-paper-raised px-3.5 py-2.5"><IconSearch width={18} height={18} className="text-ink-faint" /><input autoFocus value={busquedaCliente} onChange={(e) => setBusquedaCliente(e.target.value)} placeholder="Buscar por nombre o alias" className="w-full bg-transparent text-[15px] text-ink placeholder:text-ink-faint focus:outline-none" /></div></div>
        <main className="no-scrollbar flex-1 overflow-y-auto px-5 py-4 md:px-6"><p className="mb-3 text-[12.5px] text-ink-soft">Elige a quién le vas a vender hoy.</p><ul className="space-y-2.5">{clientesFiltrados.map((cliente) => <li key={cliente.id}><button type="button" onClick={() => seleccionarClienteActivo(cliente.id)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-paper-raised p-3.5 text-left active:bg-paper-sunken"><div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-ink font-display text-[13px] font-semibold text-white">{cliente.nombre.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-[14.5px] font-medium text-ink">{cliente.nombre}</p><p className="truncate text-[12.5px] text-ink-soft">“{cliente.alias}” · {cliente.ciudad}</p></div><IconChevronRight width={18} height={18} className="text-ink-faint" /></button></li>)}</ul></main>
        <BarraInferior><Boton variante="fantasma" onClick={() => navegar("/vendedor/clientes/nuevo")}>Crear cliente nuevo</Boton></BarraInferior>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <BarraSuperior titulo={paso === 1 ? "Agregar productos" : "Registrar pago"} subtitulo={`${clienteSeleccionado.alias} · Paso ${paso + 1} de 3`} onVolver={() => paso === 1 ? navegar("/vendedor") : setPaso(1)} paso={{ actual: paso + 1, total: 3 }} />
      {paso === 1 ? (
        <>
          <div className="flex-shrink-0 space-y-3 px-5 pt-4 md:px-6"><div className="flex items-center gap-2.5 rounded-xl border border-line bg-paper-raised px-3.5 py-2.5"><IconSearch width={18} height={18} className="text-ink-faint" /><input value={busquedaProducto} onChange={(e) => setBusquedaProducto(e.target.value)} placeholder="Buscar producto" className="w-full bg-transparent text-[15px] text-ink placeholder:text-ink-faint focus:outline-none" /></div><div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:-mx-6 md:px-6">{["Todas", ...categorias].map((cat) => (<button key={cat} type="button" onClick={() => setCategoria(cat)} className={`flex-shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium ${categoria === cat ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink-soft"}`}>{cat}</button>))}</div><div className="flex items-center gap-2 rounded-xl bg-teal-soft px-3 py-2 text-[12.5px] text-teal"><IconMapPin width={15} height={15} /><span className="truncate">Pedido para <strong>{clienteSeleccionado.nombre}</strong></span></div></div>
           <main className="no-scrollbar flex-1 overflow-y-auto px-5 py-4 md:px-6"><ul className="space-y-2.5">{productosFiltrados.map((producto) => { const cantidad = cantidades[producto.id] ?? 0; return <li key={producto.id} className="flex items-center gap-3 rounded-xl border border-line bg-paper-raised p-3.5"><VistaImagenProducto producto={producto} tamano="sm" clickable productos={productosFiltrados} /><div className="min-w-0 flex-1"><p className="truncate text-[13.5px] font-medium text-ink">{producto.nombre}</p><p className="mt-0.5 font-mono text-[12px] text-ink-soft">{formatoMoneda(producto.precioVenta)} · {producto.stock} disponibles</p></div>{cantidad === 0 ? <button type="button" onClick={() => cambiarCantidad(producto.id, 1)} className="flex min-h-[44px] items-center rounded-lg bg-ink px-4 py-2 text-[12px] font-semibold text-white active:bg-ink/90">Agregar</button> : <SelectorCantidad cantidad={cantidad} onCambiar={(nueva) => cambiarCantidad(producto.id, nueva)} tamano="sm" />}</li>; })}</ul></main>
          <BarraInferior><div className="mb-3 flex items-center justify-between"><span className="text-[13.5px] text-ink-soft">Total provisional</span><span className="font-mono text-[18px] font-semibold text-ink">{formatoMoneda(total)}</span></div><Boton disabled={lineas.length === 0} onClick={() => setPaso(2)}>Continuar al pago <IconChevronRight width={17} height={17} /></Boton></BarraInferior>
        </>
      ) : (
        <>
          <main className="no-scrollbar flex-1 overflow-y-auto px-5 py-4 md:px-6"><section className="rounded-xl border border-line bg-paper-raised p-4"><div className="flex items-center justify-between"><div><p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Cliente</p><p className="mt-1 text-[15px] font-semibold text-ink">{clienteSeleccionado.nombre}</p><p className="text-[12.5px] text-ink-soft">“{clienteSeleccionado.alias}”</p></div><IconCheck width={20} height={20} className="text-success" /></div><div className="ticket-edge -mx-4 my-3" /><div className="flex items-center justify-between"><span className="text-[13.5px] text-ink-soft">{lineas.reduce((suma, linea) => suma + linea.cantidad, 0)} unidades</span><span className="font-mono text-[19px] font-semibold text-ink">{formatoMoneda(total)}</span></div></section><section className="mt-5"><p className="mb-3 text-[12.5px] font-semibold uppercase tracking-wide text-ink-soft">¿Ya entregaste el pedido?</p><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setEntrega("entregado")} className={`rounded-xl border px-3 py-3 text-left ${entrega === "entregado" ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink"}`}><span className="block text-[13px] font-semibold">Entregado ✓</span><span className={`mt-0.5 block text-[11.5px] ${entrega === "entregado" ? "text-white/70" : "text-ink-soft"}`}>Lo lleva el cliente ya</span></button><button type="button" onClick={() => setEntrega("pendiente")} className={`rounded-xl border px-3 py-3 text-left ${entrega === "pendiente" ? "border-ink bg-ink text-white" : "border-line bg-paper-raised text-ink"}`}><span className="block text-[13px] font-semibold">Pendiente</span><span className={`mt-0.5 block text-[11.5px] ${entrega === "pendiente" ? "text-white/70" : "text-ink-soft"}`}>Por preparar (jugos, sándwich)</span></button></div></section>{!esEntregado && <label className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-paper-raised px-3.5 py-3"><input type="checkbox" checked={cobrarAlEntregar} onChange={(e) => setCobrarAlEntregar(e.target.checked)} className="h-5 w-5 accent-ink" /><span><span className="block text-[13px] font-semibold text-ink">Cobrar al entregar</span><span className="block text-[11.5px] text-ink-soft">Queda pendiente y aparece en Créditos para cobrarlo</span></span></label>}<section className="mt-5"><p className="mb-3 text-[12.5px] font-semibold uppercase tracking-wide text-ink-soft">Forma de pago</p><SelectorPago metodo={metodo} onChange={setMetodo} /></section>{(metodo === "credito" || diferido) && <div className="mt-4 rounded-xl border border-danger/20 bg-danger-soft p-3.5"><p className="text-[13px] font-semibold text-danger">Saldo pendiente: {formatoMoneda(total)}</p><p className="mt-1 text-[12px] leading-relaxed text-ink-soft">{diferido ? "Se cobra al entregar desde el módulo Créditos." : "Quedará marcado para recordatorios y futuros envíos masivos por WhatsApp."}</p></div>}<section className="mt-5 rounded-xl border border-line bg-paper-raised p-4"><p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Resumen</p><ul className="mt-2 divide-y divide-line">{lineas.map((linea) => <li key={linea.productoId} className="flex justify-between gap-3 py-2 text-[13px]"><span className="truncate text-ink-soft">{linea.cantidad} × {linea.nombre}</span><span className="font-mono text-ink">{formatoMoneda(linea.subtotal)}</span></li>)}</ul></section></main>
          <BarraInferior><Boton onClick={confirmarPedido}>{diferido ? `Registrar (cobrar al entregar) · ${formatoMoneda(total)}` : metodo === "credito" ? `Registrar crédito · ${formatoMoneda(total)}` : `Confirmar pedido · ${formatoMoneda(total)}`}</Boton></BarraInferior>
        </>
      )}
    </div>
  );
}
