import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Boton } from "../../components/Boton";
import { IconClipboard, IconUser } from "../../components/Icons";
import { VistaImagenProducto } from "../../components/VistaImagenProducto";
import { useAuth } from "../../context/AuthContext";
import { useOperaciones } from "../../context/OperacionesContext";
import type { EstadoPedido, RolUsuario } from "../../modules/clientes-pedido/types";
import { formatoMoneda } from "../../utils/formato";

type Pestaña = "resumen" | "pedidos" | "inventario" | "caja" | "usuarios" | "cierre";
const pestañas: Array<{ id: Pestaña; etiqueta: string }> = [
  { id: "resumen", etiqueta: "Resumen" }, { id: "pedidos", etiqueta: "Pedidos" }, { id: "inventario", etiqueta: "Inventario" }, { id: "caja", etiqueta: "Caja" }, { id: "usuarios", etiqueta: "Usuarios" }, { id: "cierre", etiqueta: "Cierre" },
];

function EtiquetaPago({ metodo, pendiente }: { metodo: string; pendiente: boolean }) {
  const estilo = pendiente ? "bg-danger-soft text-danger" : metodo === "nequi" ? "bg-teal-soft text-teal" : "bg-success-soft text-success";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${estilo}`}>{pendiente ? "Crédito pendiente" : metodo}</span>;
}

export default function Administracion() {
  const navegar = useNavigate();
  const { usuario, cerrarSesion } = useAuth();
  const { pedidos, inventario, movimientosCaja, usuarios, obtenerCliente, actualizarEstadoPedido, adjuntarComprobante, actualizarImagenProducto, crearProducto, registrarEgresoCaja, crearUsuario } = useOperaciones();
  const [pestaña, setPestaña] = useState<Pestaña>("resumen");
  const [filtroPedido, setFiltroPedido] = useState("");
  const [mostrarProducto, setMostrarProducto] = useState(false);
  const [archivoProducto, setArchivoProducto] = useState<File | null>(null);
  const [productoNuevo, setProductoNuevo] = useState({ nombre: "", categoria: "Abarrotes", precio: "", unidad: "unidad", stock: "" });
  const [egreso, setEgreso] = useState({ concepto: "", monto: "" });
  const [usuarioNuevo, setUsuarioNuevo] = useState({ nombre: "", email: "", rol: "vendedor" as RolUsuario });
  const [conteos, setConteos] = useState<Record<string, string>>({});

  const ingresos = movimientosCaja.filter((movimiento) => movimiento.tipo === "ingreso").reduce((total, movimiento) => total + movimiento.monto, 0);
  const egresos = movimientosCaja.filter((movimiento) => movimiento.tipo === "egreso").reduce((total, movimiento) => total + movimiento.monto, 0);
  const pendientes = pedidos.filter((pedido) => pedido.pago.saldoPendiente > 0).reduce((total, pedido) => total + pedido.pago.saldoPendiente, 0);
  const pedidosFiltrados = useMemo(() => {
    const busqueda = filtroPedido.trim().toLowerCase();
    return pedidos.filter((pedido) => {
      const cliente = obtenerCliente(pedido.clienteId);
      return !busqueda || pedido.numero.toLowerCase().includes(busqueda) || cliente?.nombre.toLowerCase().includes(busqueda) || pedido.estado.includes(busqueda);
    });
  }, [filtroPedido, obtenerCliente, pedidos]);

  function cerrarSesionActual() {
    cerrarSesion();
    navegar("/");
  }

  function guardarProducto(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const producto = crearProducto({ nombre: productoNuevo.nombre, categoria: productoNuevo.categoria, precio: Number(productoNuevo.precio), unidad: productoNuevo.unidad, stock: Number(productoNuevo.stock) });
    if (archivoProducto) actualizarImagenProducto(producto.id, archivoProducto);
    setProductoNuevo({ nombre: "", categoria: "Abarrotes", precio: "", unidad: "unidad", stock: "" });
    setArchivoProducto(null);
    setMostrarProducto(false);
  }

  function guardarEgreso(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    registrarEgresoCaja(egreso.concepto, Number(egreso.monto));
    setEgreso({ concepto: "", monto: "" });
  }

  function guardarUsuario(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    crearUsuario(usuarioNuevo.nombre, usuarioNuevo.email, usuarioNuevo.rol);
    setUsuarioNuevo({ nombre: "", email: "", rol: "vendedor" });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex-shrink-0 bg-ink px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))] text-white md:px-6">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[12px] text-accent">Administrador</p><h1 className="mt-1 font-display text-[21px] font-semibold">Centro de control</h1><p className="mt-0.5 text-[12px] text-white/60">{usuario?.nombre}</p></div><button type="button" onClick={cerrarSesionActual} className="rounded-lg border border-white/20 px-3 py-2 text-[12px] font-semibold text-white/80">Salir</button></div>
        <nav className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-0.5">{pestañas.map((item) => <button key={item.id} type="button" onClick={() => setPestaña(item.id)} className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold ${pestaña === item.id ? "bg-accent text-ink" : "bg-white/10 text-white/70"}`}>{item.etiqueta}</button>)}</nav>
      </header>

      <main className="no-scrollbar flex-1 overflow-y-auto px-5 py-5 md:px-6">
        {pestaña === "resumen" && <section><p className="text-[13px] text-ink-soft">Controla ventas, cobros, inventario y equipo desde un solo lugar.</p><div className="mt-4 grid grid-cols-2 gap-3"><TarjetaMetrica etiqueta="Cobrado hoy" valor={formatoMoneda(ingresos)} tono="teal" /><TarjetaMetrica etiqueta="Pendiente crédito" valor={formatoMoneda(pendientes)} tono="danger" /><TarjetaMetrica etiqueta="Pedidos" valor={String(pedidos.length)} tono="ink" /><TarjetaMetrica etiqueta="Alertas stock" valor={String(inventario.filter((producto) => producto.stock <= 25).length)} tono="accent" /></div><div className="mt-6 rounded-2xl border border-line bg-paper-raised p-4"><p className="font-display text-[16px] font-semibold text-ink">Acciones prioritarias</p><div className="mt-3 space-y-2">{pendientes > 0 && <button type="button" onClick={() => setPestaña("pedidos")} className="flex w-full items-center justify-between rounded-xl bg-danger-soft px-3 py-3 text-left text-[13px] text-danger"><span>Revisar créditos pendientes</span><strong>{formatoMoneda(pendientes)}</strong></button>}<button type="button" onClick={() => setPestaña("cierre")} className="flex w-full items-center justify-between rounded-xl bg-paper-sunken px-3 py-3 text-left text-[13px] text-ink"><span>Validar inventario y cierre diario</span><span>→</span></button></div></div></section>}

        {pestaña === "pedidos" && <section><div className="flex items-center justify-between"><div><h2 className="font-display text-[18px] font-semibold text-ink">Seguimiento de pedidos</h2><p className="mt-1 text-[12.5px] text-ink-soft">Actualiza la entrega, revisa cobros y adjunta comprobantes.</p></div><IconClipboard className="text-ink-faint" /></div><input value={filtroPedido} onChange={(evento) => setFiltroPedido(evento.target.value)} placeholder="Buscar pedido, cliente o estado" className="mt-4 w-full rounded-xl border border-line bg-paper-raised px-3.5 py-3 text-[14px] focus:border-ink focus:outline-none" /><div className="mt-4 space-y-3">{pedidosFiltrados.map((pedido) => { const cliente = obtenerCliente(pedido.clienteId); return <article key={pedido.id} className="rounded-xl border border-line bg-paper-raised p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[12px] font-semibold text-ink-faint">{pedido.numero}</p><p className="mt-1 text-[14px] font-semibold text-ink">{cliente?.nombre ?? "Cliente"}</p><p className="text-[12px] text-ink-soft">{pedido.lineas.length} referencias · {formatoMoneda(pedido.total)}</p></div><EtiquetaPago metodo={pedido.pago.metodo} pendiente={pedido.pago.saldoPendiente > 0} /></div><div className="mt-3 grid grid-cols-[1fr_auto] gap-2"><select value={pedido.estado} onChange={(evento) => actualizarEstadoPedido(pedido.id, evento.target.value as EstadoPedido)} className="rounded-lg border border-line bg-paper px-2.5 py-2 text-[12px] font-medium text-ink"><option value="pendiente">Pendiente</option><option value="en-preparacion">En preparación</option><option value="entregado">Entregado</option><option value="cancelado">Cancelado</option></select><label className="cursor-pointer rounded-lg border border-dashed border-line px-3 py-2 text-[12px] font-semibold text-ink-soft"><input type="file" accept="image/*,.pdf" className="sr-only" onChange={(evento) => { const archivo = evento.target.files?.[0]; if (archivo) adjuntarComprobante(pedido.id, archivo); }} />{pedido.comprobantePagoUrl ? "Ver comprobante" : "Adjuntar pago"}</label></div>{pedido.comprobantePagoUrl && <a href={pedido.comprobantePagoUrl} target="_blank" rel="noreferrer" className="mt-2 block truncate text-[12px] text-teal underline">{pedido.comprobantePagoNombre}</a>}</article>; })}</div></section>}

        {pestaña === "inventario" && <section><div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-[18px] font-semibold text-ink">Inventario</h2><p className="mt-1 text-[12.5px] text-ink-soft">Fotos, existencias y productos nuevos.</p></div><button type="button" onClick={() => setMostrarProducto((actual) => !actual)} className="rounded-xl bg-ink px-3 py-2 text-[12px] font-semibold text-white">+ Producto</button></div>{mostrarProducto && <form onSubmit={guardarProducto} className="mt-4 rounded-xl border border-line bg-paper-raised p-4"><p className="font-semibold text-ink">Nuevo producto</p><div className="mt-3 grid grid-cols-2 gap-3"><input required value={productoNuevo.nombre} onChange={(evento) => setProductoNuevo((actual) => ({ ...actual, nombre: evento.target.value }))} placeholder="Nombre" className="col-span-2 rounded-lg border border-line px-3 py-2.5 text-[13px]" /><input required type="number" min="0" value={productoNuevo.precio} onChange={(evento) => setProductoNuevo((actual) => ({ ...actual, precio: evento.target.value }))} placeholder="Precio" className="rounded-lg border border-line px-3 py-2.5 text-[13px]" /><input required type="number" min="0" value={productoNuevo.stock} onChange={(evento) => setProductoNuevo((actual) => ({ ...actual, stock: evento.target.value }))} placeholder="Stock inicial" className="rounded-lg border border-line px-3 py-2.5 text-[13px]" /><input value={productoNuevo.categoria} onChange={(evento) => setProductoNuevo((actual) => ({ ...actual, categoria: evento.target.value }))} placeholder="Categoría" className="rounded-lg border border-line px-3 py-2.5 text-[13px]" /><input value={productoNuevo.unidad} onChange={(evento) => setProductoNuevo((actual) => ({ ...actual, unidad: evento.target.value }))} placeholder="Unidad" className="rounded-lg border border-line px-3 py-2.5 text-[13px]" /></div><label className="mt-3 flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-line px-3 py-2.5 text-[12px] text-ink-soft">Foto directa / subir imagen<input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(evento) => setArchivoProducto(evento.target.files?.[0] ?? null)} /><span>{archivoProducto?.name ?? "Seleccionar"}</span></label><Boton type="submit" className="mt-3">Guardar producto</Boton></form>}<div className="mt-4 space-y-2.5">{inventario.map((producto) => <article key={producto.id} className="flex items-center gap-3 rounded-xl border border-line bg-paper-raised p-3"><VistaImagenProducto producto={producto} tamano="sm" clickable /><div className="min-w-0 flex-1"><p className="truncate text-[13.5px] font-semibold text-ink">{producto.nombre}</p><p className="mt-0.5 text-[12px] text-ink-soft">{producto.categoria} · {formatoMoneda(producto.precio)}</p><p className={`mt-1 text-[12px] font-semibold ${producto.stock <= 25 ? "text-danger" : "text-success"}`}>{producto.stock} esperados</p></div><label className="cursor-pointer rounded-lg border border-line px-2.5 py-2 text-[11px] font-semibold text-ink-soft"><input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(evento) => { const archivo = evento.target.files?.[0]; if (archivo) actualizarImagenProducto(producto.id, archivo); }} />Foto</label></article>)}</div></section>}

        {pestaña === "caja" && <section><h2 className="font-display text-[18px] font-semibold text-ink">Cuadre de caja</h2><div className="mt-4 grid grid-cols-3 gap-2"><TarjetaMetrica etiqueta="Ingresos" valor={formatoMoneda(ingresos)} tono="teal" /><TarjetaMetrica etiqueta="Egresos" valor={formatoMoneda(egresos)} tono="danger" /><TarjetaMetrica etiqueta="Balance" valor={formatoMoneda(ingresos - egresos)} tono="ink" /></div><form onSubmit={guardarEgreso} className="mt-5 rounded-xl border border-line bg-paper-raised p-4"><p className="font-semibold text-ink">Registrar egreso</p><div className="mt-3 flex gap-2"><input required value={egreso.concepto} onChange={(evento) => setEgreso((actual) => ({ ...actual, concepto: evento.target.value }))} placeholder="Concepto" className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2.5 text-[13px]" /><input required type="number" min="1" value={egreso.monto} onChange={(evento) => setEgreso((actual) => ({ ...actual, monto: evento.target.value }))} placeholder="$" className="w-24 rounded-lg border border-line px-3 py-2.5 text-[13px]" /></div><Boton type="submit" variante="fantasma" className="mt-3">Guardar egreso</Boton></form><ul className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper-raised">{movimientosCaja.map((movimiento) => <li key={movimiento.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-[13px] font-medium text-ink">{movimiento.concepto}</p><p className="text-[11.5px] capitalize text-ink-soft">{movimiento.tipo} {movimiento.metodo ? `· ${movimiento.metodo}` : ""}</p></div><p className={`font-mono text-[13px] font-semibold ${movimiento.tipo === "ingreso" ? "text-success" : "text-danger"}`}>{movimiento.tipo === "ingreso" ? "+" : "−"}{formatoMoneda(movimiento.monto)}</p></li>)}</ul></section>}

        {pestaña === "usuarios" && <section><div className="flex items-center gap-2"><IconUser className="text-teal" /><div><h2 className="font-display text-[18px] font-semibold text-ink">Usuarios y permisos</h2><p className="text-[12.5px] text-ink-soft">Solo el administrador gestiona accesos.</p></div></div><form onSubmit={guardarUsuario} className="mt-4 rounded-xl border border-line bg-paper-raised p-4"><div className="grid grid-cols-2 gap-3"><input required value={usuarioNuevo.nombre} onChange={(evento) => setUsuarioNuevo((actual) => ({ ...actual, nombre: evento.target.value }))} placeholder="Nombre" className="col-span-2 rounded-lg border border-line px-3 py-2.5 text-[13px]" /><input required type="email" value={usuarioNuevo.email} onChange={(evento) => setUsuarioNuevo((actual) => ({ ...actual, email: evento.target.value }))} placeholder="correo@negocio.com" className="rounded-lg border border-line px-3 py-2.5 text-[13px]" /><select value={usuarioNuevo.rol} onChange={(evento) => setUsuarioNuevo((actual) => ({ ...actual, rol: evento.target.value as RolUsuario }))} className="rounded-lg border border-line px-3 py-2.5 text-[13px]"><option value="vendedor">Vendedor</option><option value="administrador">Administrador</option></select></div><Boton type="submit" className="mt-3">Crear usuario</Boton></form><div className="mt-4 space-y-2.5">{usuarios.map((item) => <article key={item.id} className="rounded-xl border border-line bg-paper-raised p-3.5"><div className="flex items-center justify-between"><div><p className="text-[13.5px] font-semibold text-ink">{item.nombre}</p><p className="text-[12px] text-ink-soft">{item.email}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.rol === "administrador" ? "bg-accent-soft text-accent-dark" : "bg-teal-soft text-teal"}`}>{item.rol}</span></div><p className="mt-2 text-[11.5px] text-ink-faint">{item.permisos.join(" · ")}</p></article>)}</div></section>}

        {pestaña === "cierre" && <section><h2 className="font-display text-[18px] font-semibold text-ink">Validación diaria</h2><p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">El sistema espera estas existencias después de los pedidos de la sesión. Registra el conteo físico para detectar diferencias.</p><div className="mt-4 rounded-xl bg-ink p-4 text-white"><p className="text-[12px] text-white/60">Balance de caja esperado</p><p className="mt-1 font-mono text-2xl font-semibold">{formatoMoneda(ingresos - egresos)}</p><p className="mt-1 text-[12px] text-white/60">Ingresos cobrados menos egresos registrados</p></div><div className="mt-4 space-y-2.5">{inventario.map((producto) => { const conteo = conteos[producto.id] ?? ""; const diferencia = conteo === "" ? null : Number(conteo) - producto.stock; return <div key={producto.id} className="grid grid-cols-[1fr_70px] items-center gap-3 rounded-xl border border-line bg-paper-raised p-3"><div className="min-w-0"><p className="truncate text-[13px] font-semibold text-ink">{producto.nombre}</p><p className="text-[11.5px] text-ink-soft">Sistema: {producto.stock} · {diferencia === null ? "Sin conteo" : diferencia === 0 ? "Cuadra" : `Diferencia: ${diferencia > 0 ? "+" : ""}${diferencia}`}</p></div><input type="number" min="0" value={conteo} onChange={(evento) => setConteos((actual) => ({ ...actual, [producto.id]: evento.target.value }))} placeholder="Físico" className="w-full rounded-lg border border-line px-2 py-2 text-center text-[12px]" /></div>; })}</div></section>}
      </main>
    </div>
  );
}

function TarjetaMetrica({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono: "teal" | "danger" | "ink" | "accent" }) {
  const clase = { teal: "bg-teal-soft text-teal", danger: "bg-danger-soft text-danger", ink: "bg-paper-raised text-ink", accent: "bg-accent-soft text-accent-dark" }[tono];
  return <div className={`rounded-xl border border-line p-3 ${clase}`}><p className="font-mono text-[15px] font-semibold">{valor}</p><p className="mt-1 text-[11px] opacity-75">{etiqueta}</p></div>;
}
