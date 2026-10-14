import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../data/api";
import { consultas } from "../data/query";
import { normalizarConteo } from "../utils/inventario";
import type { ConteoInventarioDTO } from "@synchronic-jo/contrato";
import { useRegistroApi } from "../data/usePaginaApi";
import { useSincronizacion } from "../data/useSincronizacion";
import { archivoAImagenDataUrl } from "../utils/imagen";
import { useAuth } from "./auth";
import { OperacionesContext, type OperacionesContextValue } from "./operaciones-context";
import type { Cliente, Pedido, Producto, Proveedor, RecepcionCompra, Gasto, AbonoCredito, CierreDia } from "../types";

type Datos = Pick<OperacionesContextValue, "clientes" | "pedidos" | "inventario" | "movimientosCaja" | "usuarios" | "proveedores" | "recepciones" | "gastos" | "conteos" | "ajustes" | "cambiosPrecio" | "abonos" | "cierres">;
const vacios: Datos = { clientes: [], pedidos: [], inventario: [], movimientosCaja: [], usuarios: [], proveedores: [], recepciones: [], gastos: [], conteos: [], ajustes: [], cambiosPrecio: [], abonos: [], cierres: [] };

export function OperacionesApiProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const conectado = useSincronizacion(usuario?.id);
  const [datos, setDatos] = useState<Datos>(vacios);
  const [clienteActivoId, setClienteActivoId] = useState<string | null>(null);
  const clienteRemoto=useRegistroApi<Cliente>(`/clientes/${clienteActivoId}`,!!clienteActivoId);
  const [cargadoPara, setCargadoPara] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const ocupado = useRef(false);
  const refrescoPendiente = useRef(false);

  useEffect(() => {
    const mostrarError = (evento: Event) => setError((evento as CustomEvent<string>).detail);
    window.addEventListener("synchronic:error-lectura", mostrarError);
    return () => window.removeEventListener("synchronic:error-lectura", mostrarError);
  }, []);

  const cargar = useCallback(async () => {
    if (!usuario) return;
    // Las pantallas ya consultan páginas y documentos. No fabricar snapshots vacíos por ruta.
    setDatos(actuales => actuales.usuarios[0] === usuario ? actuales : { ...vacios, usuarios: [usuario] });
    setCargadoPara(usuario.id);
  }, [usuario]);

  useEffect(() => {
    if (!usuario) { setDatos(vacios); setClienteActivoId(null); setCargadoPara(null); setError(""); return; }
    const refrescar = () => {
      if (ocupado.current) { refrescoPendiente.current = true; return; }
      void cargar().catch((e: Error) => setError(e.message));
    };
    refrescar();
    const intervalo = window.setInterval(refrescar, 30000);
    window.addEventListener("focus", refrescar);
    const forzar = () => { void consultas.invalidateQueries({ queryKey: ["api"] }, { cancelRefetch: false }).then(refrescar); };
    window.addEventListener("synchronic:datos-actualizados", forzar);
    return () => { window.clearInterval(intervalo); window.removeEventListener("focus", refrescar); window.removeEventListener("synchronic:datos-actualizados", forzar); };
  }, [usuario, cargar]);

  async function ejecutar<T>(ruta: string, metodo: string, cuerpo?: unknown): Promise<T | null> {
    if (ocupado.current) return null;
    ocupado.current = true; setGuardando(true); setError("");
    try {
      const resultado = await api<T>(ruta, metodo, cuerpo);
      // Si falla la lectura posterior, la escritura ya está confirmada: no inducir a duplicarla.
      await cargar().catch(() => setError("Guardado correctamente. No se pudo actualizar la lista; pulsa Reintentar."));
      window.dispatchEvent(new Event("synchronic:datos-actualizados"));
      return resultado;
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar"); return null; }
    finally {
      ocupado.current = false; setGuardando(false);
      if (refrescoPendiente.current) { refrescoPendiente.current = false; window.dispatchEvent(new Event("synchronic:datos-actualizados")); }
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
    clienteActivo: clienteRemoto.data ?? datos.clientes.find((c) => c.id === clienteActivoId) ?? null,
    seleccionarClienteActivo: setClienteActivoId,
    obtenerCliente: (id) => (id === clienteActivoId ? clienteRemoto.data : undefined) ?? datos.clientes.find((c) => c.id === id) ?? null,
    obtenerPedido: (id) => datos.pedidos.find((p) => p.id === id) ?? null,
    obtenerProveedor: (id) => datos.proveedores.find((p) => p.id === id) ?? null,
    nombreUsuario: (id) => datos.usuarios.find((u) => u.id === id)?.nombre ?? "Usuario",
    crearCliente: async (c) => { const creado = await ejecutar<Cliente>("/clientes", "POST", c); if (creado) setClienteActivoId(creado.id); return creado; },
    registrarPedido: (p) => ejecutar<Pedido>("/pedidos", "POST", { clienteId: p.clienteId, vendedorId: p.vendedorId, lineas: p.lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, precioEsperado: l.precioUnitario })), metodo: p.pago.metodo, estadoInicial: p.estadoInicial, momentoCobro: p.pago.metodo === "credito" ? "segun-periodicidad" : "inmediato" }),
    actualizarEstadoPedido: (id, estado) => accion(`/pedidos/${id}/estado`, { estado }, "PATCH"),
    adjuntarComprobante: (id, archivo) => adjuntar(`/archivos/pedidos/${id}`, archivo, false),
    actualizarImagenProducto: (id, archivo) => adjuntar(`/archivos/productos/${id}`, archivo, true),
    crearProducto: (p) => ejecutar<Producto>("/productos", "POST", p),
    registrarEgresoCaja: (concepto, monto, metodo = "efectivo") => accion("/caja/egresos", { concepto, monto, metodo }),
    crearUsuario: (u) => accion("/usuarios", u),
    retirarUsuario: (id) => accion(`/usuarios/${id}`, undefined, "DELETE"),
    cambiarPermisosUsuario: (id, permisosDenegados) => accion(`/usuarios/${id}/permisos`, { permisosDenegados }, "PATCH"),
    cambiarEstadoUsuario: (id) => accion(`/usuarios/${id}/estado`, undefined, "PATCH"),
    cambiarRolUsuario: (id, rol) => accion(`/usuarios/${id}/rol`, { rol }, "PATCH"),
    crearProveedor: (nombre, telefono) => ejecutar<Proveedor>("/proveedores", "POST", { nombre, telefono }),
    registrarRecepcion: (proveedorId, lineas, descontarCaja) => ejecutar<RecepcionCompra>("/recepciones-compra", "POST", { proveedorId, lineas, descontarCaja }),
    registrarGasto: (concepto, monto, metodo = "efectivo") => ejecutar<Gasto>("/gastos", "POST", { concepto, monto, metodo }),
    iniciarConteo: async (tipo, cantidadAleatoria, turno) => { const conteo = await ejecutar<ConteoInventarioDTO>("/inventario/conteos", "POST", { tipo, cantidadAleatoria: cantidadAleatoria ?? undefined, turno }); return conteo ? normalizarConteo(conteo) : null; },
    actualizarConteoLinea: (id, productoId, stockFisico) => accion(`/inventario/conteos/${id}/lineas/${productoId}`, { stockFisico }, "PATCH"),
    finalizarConteoActivo: (id) => accion(`/inventario/conteos/${id}/finalizar`),
    cancelarConteoActivo: (id) => accion(`/inventario/conteos/${id}/cancelar`),
    aplicarAjusteDeConteo: (id) => accion(`/inventario/conteos/${id}/aplicar-ajuste`),
    registrarAjusteManual: (productoId, stockFisico, motivo, comentario) => accion("/inventario/ajustes", { productoId, stockFisico, motivo, comentario }),
    actualizarPrecioProducto: (id, nuevoPrecio, parametros) => accion(`/productos/${id}/precio`, { nuevoPrecio, ...parametros }),
    trasladarPedidoAHoy: (id) => accion(`/pedidos/${id}/trasladar`),
    registrarCierre: (c) => ejecutar<CierreDia>(`/cierres/${c.fecha}`, "POST", { conteoEfectivo: c.conteoEfectivo, conteoBilletera: c.conteoBilletera }),
    registrarAbono: (id, monto, metodo, comentario) => ejecutar<AbonoCredito>(`/clientes/${id}/abonos`, "POST", { monto, metodo, comentario }),
    registrarPagoPedido: (id, metodo, comentario) => ejecutar<AbonoCredito>(`/pedidos/${id}/pagos`, "POST", { metodo, comentario }),
  };

  if (usuario && cargadoPara !== usuario.id) return <div className="p-6 text-ink-soft"><p role="status">Cargando datos del negocio…</p>{error && <p role="alert" className="mt-3 text-danger">{error}</p>}<button className="mt-4 rounded-xl border border-line px-4 py-3" onClick={() => void cargar().catch((e: Error) => setError(e.message))}>Reintentar</button></div>;
  return <OperacionesContext.Provider value={value}><div className="operaciones-remotas">
    {usuario && !conectado && <p role="status" className="shrink-0 bg-danger-soft px-4 py-2 text-xs text-danger">Sin conexión. Se muestra la última lectura; la sincronización se reanudará automáticamente.</p>}
    {error && <div role="alert" className="flex shrink-0 items-center gap-2 bg-danger-soft px-4 py-3 text-sm text-danger"><span className="flex-1">{error}</span><button type="button" disabled={guardando} className="min-h-11 px-2" onClick={() => { setError(""); window.dispatchEvent(new Event("synchronic:datos-actualizados")); }}>Reintentar</button><button type="button" className="min-h-11 px-2" onClick={() => setError("")}>Cerrar</button></div>}
    <fieldset disabled={guardando} className="contents">{children}</fieldset>
  </div></OperacionesContext.Provider>;
}
