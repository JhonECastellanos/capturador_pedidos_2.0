import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, listaApi, baseApi } from "../data/api";
import { consultas } from "../data/query";
import { replaceEqualDeep } from "@tanstack/react-query";
import { useSincronizacion } from "../data/useSincronizacion";
import { archivoAImagenDataUrl } from "../utils/imagen";
import { useAuth } from "./auth";
import { useLocation } from "react-router-dom";
import { OperacionesContext, type OperacionesContextValue } from "./operaciones-context";
import type { Cliente, Pedido, Producto, MovimientoCaja, UsuarioSistema, Proveedor, RecepcionCompra, Gasto, ConteoInventario, AjusteInventario, CambioPrecio, AbonoCredito, CierreDia } from "../types";

type Datos = Pick<OperacionesContextValue, "clientes" | "pedidos" | "inventario" | "movimientosCaja" | "usuarios" | "proveedores" | "recepciones" | "gastos" | "conteos" | "ajustes" | "cambiosPrecio" | "abonos" | "cierres">;
const vacios: Datos = { clientes: [], pedidos: [], inventario: [], movimientosCaja: [], usuarios: [], proveedores: [], recepciones: [], gastos: [], conteos: [], ajustes: [], cambiosPrecio: [], abonos: [], cierres: [] };

export function OperacionesApiProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const conectado = useSincronizacion(usuario?.id);
  const { pathname } = useLocation();
  const esTablero = pathname === "/admin" || pathname === "/admin/" || (pathname === "/" && usuario?.rol === "administrador");
  const necesitaHistorialPedidos = pathname === "/admin/creditos" || pathname === "/admin/cierre" || pathname.startsWith("/admin/ventas") || pathname.startsWith("/vendedor");
  const [datos, setDatos] = useState<Datos>(vacios);
  const [clienteActivoId, setClienteActivoId] = useState<string | null>(null);
  const [cargadoPara, setCargadoPara] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const ocupado = useRef(false);
  const refrescoPendiente = useRef(false);
  const sesionId = useRef(usuario?.id);
  const revision = useRef(0);
  const datosSesion = useRef<string | undefined>(undefined);

  const cargar = useCallback(async () => {
    if (!usuario) return;
    if (esTablero) {
      if (datosSesion.current !== usuario.id) setDatos(vacios);
      datosSesion.current = usuario.id;
      setCargadoPara(usuario.id);
      return;
    }
    const claveSnapshot = ["operaciones", usuario.id, necesitaHistorialPedidos];
    const anterior = consultas.getQueryData<Datos>(claveSnapshot);
    // Un refresco no debe volver atrás a un snapshot de otra pantalla.
    if (anterior && datosSesion.current !== usuario.id) { setDatos(anterior); setCargadoPara(usuario.id); }
    const lectura = ++revision.current;
    const esAdmin = usuario.rol === "administrador";
    const [clientes, pedidos, inventario, abonos, movimientosCaja, usuarios, proveedores, recepciones, gastos, conteos, ajustes, cambiosPrecio, cierres, archivos] = await Promise.all([
      listaApi<Cliente>("/clientes"), necesitaHistorialPedidos ? listaApi<Pedido>("/pedidos") : Promise.resolve([] as Pedido[]), listaApi<Producto>("/productos"), listaApi<AbonoCredito>("/abonos"),
      esAdmin ? listaApi<MovimientoCaja>("/caja/movimientos") : Promise.resolve([]),
      esAdmin ? listaApi<UsuarioSistema>("/usuarios") : Promise.resolve([usuario]),
      esAdmin ? listaApi<Proveedor>("/proveedores") : Promise.resolve([]),
      esAdmin ? listaApi<RecepcionCompra>("/recepciones-compra") : Promise.resolve([]),
      esAdmin ? listaApi<Gasto>("/gastos") : Promise.resolve([]),
      esAdmin ? listaApi<ConteoInventario>("/inventario/conteos") : Promise.resolve([]),
      esAdmin ? listaApi<AjusteInventario>("/inventario/ajustes") : Promise.resolve([]),
      esAdmin ? listaApi<CambioPrecio>("/productos/cambios-precio") : Promise.resolve([]),
      esAdmin ? listaApi<CierreDia>("/cierres") : Promise.resolve([]),
      api<Array<{ id: string; productoId: string | null; pedidoId: string | null; nombre: string }>>("/archivos"),
    ]);
    if (sesionId.current !== usuario.id || lectura !== revision.current) return;
    const nuevosDatos: Datos = { ...vacios, clientes: clientes.map((c) => ({ ...c, identificacion: c.identificacion ?? "", alias: c.alias || c.nombre })), pedidos: pedidos.map((p) => { const archivo = archivos.find((a) => a.pedidoId === p.id); return { ...p, comprobantePagoUrl: archivo ? `${baseApi}/archivos/${archivo.id}` : undefined, comprobantePagoNombre: archivo?.nombre }; }),
      inventario: inventario.map((p: Producto & { stockDisponible?: number }) => { const archivo = archivos.find((a) => a.productoId === p.id); return { ...p, stock: p.stockDisponible ?? p.stock, imagenUrl: archivo ? `${baseApi}/archivos/${archivo.id}` : undefined }; }),
      abonos: abonos.map((a) => ({ ...a, pedidosAfectados: a.pedidosAfectados.map((p) => ({ ...p, numero: pedidos.find((pedido) => pedido.id === p.pedidoId)?.numero ?? "" })) })),
      movimientosCaja, usuarios, proveedores, recepciones, gastos, ajustes, cambiosPrecio, cierres: cierres.map((c) => ({ ...c, fecha: c.fecha.slice(0, 10) })),
      conteos: conteos.map((c) => ({ ...c, lineasContadas: c.lineas.filter((l) => l.stockFisico !== null).map((l) => l.productoId), lineas: c.lineas.map((l) => ({ ...l, nombre: l.nombreInicial ?? inventario.find((p) => p.id === l.productoId)?.nombre ?? "Producto", stockFisico: l.stockFisico ?? 0, diferencia: l.diferencia ?? 0 })) })),
    };
    consultas.setQueryData(claveSnapshot, nuevosDatos);
    const mismaSesion = datosSesion.current === usuario.id;
    setDatos((actuales) => mismaSesion ? replaceEqualDeep(actuales, nuevosDatos) : nuevosDatos);
    datosSesion.current = usuario.id;
    setCargadoPara(usuario.id);
  }, [usuario, necesitaHistorialPedidos, esTablero]);

  useEffect(() => {
    sesionId.current = usuario?.id;
    if (!usuario) { revision.current++; datosSesion.current = undefined; setDatos(vacios); setClienteActivoId(null); setCargadoPara(null); setError(""); return; }
    const refrescar = () => {
      if (ocupado.current) { refrescoPendiente.current = true; return; }
      void cargar().catch((e: Error) => setError(e.message));
    };
    refrescar();
    const intervalo = window.setInterval(refrescar, 30000);
    window.addEventListener("focus", refrescar);
    const forzar = () => { void consultas.invalidateQueries({ queryKey: ["api"] }).then(refrescar); };
    window.addEventListener("ambie:datos-actualizados", forzar);
    return () => { sesionId.current = undefined; window.clearInterval(intervalo); window.removeEventListener("focus", refrescar); window.removeEventListener("ambie:datos-actualizados", forzar); };
  }, [usuario, cargar]);

  async function ejecutar<T>(ruta: string, metodo: string, cuerpo?: unknown): Promise<T | null> {
    if (ocupado.current) return null;
    ocupado.current = true; revision.current++; setGuardando(true); setError("");
    try {
      const resultado = await api<T>(ruta, metodo, cuerpo);
      // Si falla la lectura posterior, la escritura ya está confirmada: no inducir a duplicarla.
      await cargar().catch(() => setError("Guardado correctamente. No se pudo actualizar la lista; pulsa Reintentar."));
      window.dispatchEvent(new Event("ambie:datos-actualizados"));
      return resultado;
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); return null; }
    finally {
      ocupado.current = false; setGuardando(false);
      if (refrescoPendiente.current) { refrescoPendiente.current = false; window.dispatchEvent(new Event("ambie:datos-actualizados")); }
    }
  }
  const accion = async (ruta: string, cuerpo?: unknown, metodo = "POST") => (await ejecutar(ruta, metodo, cuerpo)) !== null;
  async function adjuntar(ruta: string, archivo: File, imagen: boolean) {
    const dataUrl = imagen ? await archivoAImagenDataUrl(archivo) : await new Promise<string>((resolve, reject) => {
      const lector = new FileReader(); lector.onload = () => resolve(String(lector.result)); lector.onerror = reject; lector.readAsDataURL(archivo);
    });
    if (!await accion(ruta, { nombre: archivo.name, dataUrl })) throw new Error("No se pudo adjuntar el archivo");
  }
  const value: OperacionesContextValue = {
    ...datos,
    clienteActivo: datos.clientes.find((c) => c.id === clienteActivoId) ?? null,
    seleccionarClienteActivo: setClienteActivoId,
    obtenerCliente: (id) => datos.clientes.find((c) => c.id === id) ?? null,
    obtenerPedido: (id) => datos.pedidos.find((p) => p.id === id) ?? null,
    obtenerProveedor: (id) => datos.proveedores.find((p) => p.id === id) ?? null,
    nombreUsuario: (id) => datos.usuarios.find((u) => u.id === id)?.nombre ?? "Usuario",
    crearCliente: async (c) => { const creado = await ejecutar<Cliente>("/clientes", "POST", c); if (creado) setClienteActivoId(creado.id); return creado; },
    registrarPedido: (p) => ejecutar<Pedido>("/pedidos", "POST", { clienteId: p.clienteId, vendedorId: p.vendedorId, lineas: p.lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })), metodo: p.pago.metodo, estadoInicial: p.estadoInicial, momentoCobro: p.pago.metodo === "credito" ? "segun-periodicidad" : "inmediato" }),
    actualizarEstadoPedido: (id, estado) => accion(`/pedidos/${id}/estado`, { estado }, "PATCH"),
    adjuntarComprobante: (id, archivo) => adjuntar(`/archivos/pedidos/${id}`, archivo, false),
    actualizarImagenProducto: (id, archivo) => adjuntar(`/archivos/productos/${id}`, archivo, true),
    crearProducto: (p) => ejecutar<Producto>("/productos", "POST", p),
    registrarEgresoCaja: (concepto, monto, metodo = "efectivo") => accion("/caja/egresos", { concepto, monto, metodo }),
    crearUsuario: (u) => accion("/usuarios", u),
    cambiarEstadoUsuario: (id) => accion(`/usuarios/${id}/estado`, undefined, "PATCH"),
    cambiarRolUsuario: (id, rol) => accion(`/usuarios/${id}/rol`, { rol }, "PATCH"),
    crearProveedor: (nombre, telefono) => ejecutar<Proveedor>("/proveedores", "POST", { nombre, telefono }),
    registrarRecepcion: (proveedorId, lineas, descontarCaja) => ejecutar<RecepcionCompra>("/recepciones-compra", "POST", { proveedorId, lineas, descontarCaja }),
    registrarGasto: (concepto, monto) => ejecutar<Gasto>("/gastos", "POST", { concepto, monto }),
    iniciarConteo: (tipo, cantidadAleatoria, turno) => ejecutar<ConteoInventario>("/inventario/conteos", "POST", { tipo, cantidadAleatoria: cantidadAleatoria ?? undefined, turno }),
    actualizarConteoLinea: (id, productoId, stockFisico) => accion(`/inventario/conteos/${id}/lineas/${productoId}`, { stockFisico }, "PATCH"),
    finalizarConteoActivo: (id) => accion(`/inventario/conteos/${id}/finalizar`),
    cancelarConteoActivo: (id) => accion(`/inventario/conteos/${id}/cancelar`),
    aplicarAjusteDeConteo: (id) => accion(`/inventario/conteos/${id}/aplicar-ajuste`),
    registrarAjusteManual: (productoId, stockFisico, motivo, comentario) => accion("/inventario/ajustes", { productoId, stockFisico, motivo, comentario }),
    actualizarPrecioProducto: (id, nuevoPrecio) => accion(`/productos/${id}/precio`, { nuevoPrecio }),
    trasladarPedidoAHoy: (id) => accion(`/pedidos/${id}/trasladar`),
    registrarCierre: (c) => ejecutar<CierreDia>(`/cierres/${c.fecha}`, "POST", { conteoEfectivo: c.conteoEfectivo, conteoBilletera: c.conteoBilletera }),
    registrarAbono: (id, monto, metodo, comentario) => ejecutar<AbonoCredito>(`/clientes/${id}/abonos`, "POST", { monto, metodo, comentario }),
    registrarPagoPedido: (id, metodo, comentario) => ejecutar<AbonoCredito>(`/pedidos/${id}/pagos`, "POST", { metodo, comentario }),
  };

  if (usuario && cargadoPara !== usuario.id) return <div className="p-6 text-ink-soft"><p role="status">Cargando datos del negocio…</p>{error && <p role="alert" className="mt-3 text-danger">{error}</p>}<button className="mt-4 rounded-xl border border-line px-4 py-3" onClick={() => void cargar().catch((e: Error) => setError(e.message))}>Reintentar</button></div>;
  return <OperacionesContext.Provider value={value}><div className="operaciones-remotas">
    {usuario && !conectado && <p role="status" className="shrink-0 bg-danger-soft px-4 py-2 text-xs text-danger">Sin conexión. Se muestra la última lectura; la sincronización se reanudará automáticamente.</p>}
    {error && <div role="alert" className="flex shrink-0 items-center gap-2 bg-danger-soft px-4 py-3 text-sm text-danger"><span className="flex-1">{error}</span><button type="button" disabled={guardando} className="min-h-11 px-2" onClick={() => { setError(""); window.dispatchEvent(new Event("ambie:datos-actualizados")); }}>Reintentar</button><button type="button" className="min-h-11 px-2" onClick={() => setError("")}>Cerrar</button></div>}
    <fieldset disabled={guardando} className="contents">{children}</fieldset>
  </div></OperacionesContext.Provider>;
}
