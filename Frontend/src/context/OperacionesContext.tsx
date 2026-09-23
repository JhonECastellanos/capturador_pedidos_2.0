import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type {
  AbonoCredito,
  AjusteInventario,
  CambioPrecio,
  Cliente,
  ConteoInventario,
  EstadoPedido,
  Gasto,
  LineaRecepcion,
  MovimientoCaja,
  NuevoCliente,
  NuevoPedido,
  NuevoProducto,
  NuevoUsuario,
  Pedido,
  Producto,
  Proveedor,
  RecepcionCompra,
  UsuarioSistema,
} from "../types";
import {
  actualizarLineaConteo,
  aplicarAbonoEnClientes,
  aplicarAbonoEnPedidos,
  aplicarAjusteEnInventario,
  aplicarCambioPrecioEnInventario,
  aplicarPagoDirectoEnPedido,
  aplicarPedidoEnClientes,
  aplicarPedidoEnInventario,
  aplicarRecepcionEnInventario,
  cancelarConteo,
  construirAbono,
  construirAjuste,
  construirAjusteManual,
  construirCambioPrecio,
  construirCliente,
  construirConteo,
  construirGasto,
  construirPedido,
  construirProducto,
  construirProveedor,
  construirRecepcion,
  construirUsuario,
  distribuirAbonoEnPedidos,
  egresoCajaDeGasto,
  egresoCajaDeRecepcion,
  finalizarConteo,
  ingresoCajaDeAbono,
  ingresoCajaDePedido,
  registrarCambioEstado,
  trasladarPedidoAHoy as trasladarPedidoAHoySrv,
} from "../dominio/servicios";
import { nuevoId } from "../data/repositorios/almacenamiento";
import { siguienteConsecutivo } from "../data/repositorios/consecutivos";
import { cargarClientes, guardarClientes } from "../data/repositorios/clientes";
import { cargarPedidos, guardarPedidos } from "../data/repositorios/pedidos";
import { cargarProductos, guardarProductos } from "../data/repositorios/productos";
import { cargarMovimientosCaja, guardarMovimientosCaja } from "../data/repositorios/caja";
import { cargarUsuarios, guardarUsuarios } from "../data/repositorios/usuarios";
import { cargarProveedores, guardarProveedores } from "../data/repositorios/proveedores";
import { cargarRecepciones, guardarRecepciones } from "../data/repositorios/recepciones";
import { cargarGastos, guardarGastos } from "../data/repositorios/gastos";
import { cargarConteos, guardarConteos } from "../data/repositorios/conteos";
import { cargarAjustes, guardarAjustes } from "../data/repositorios/ajustes";
import { cargarCambiosPrecio, guardarCambiosPrecio } from "../data/repositorios/cambiosPrecio";
import { cargarAbonos, guardarAbonos } from "../data/repositorios/abonos";
import { useAuth } from "./AuthContext";
import { archivoAImagenDataUrl } from "../utils/imagen";

const coloresEtiqueta = ["#e88f2a", "#3c6b3a", "#7d5a38", "#d97b96", "#304d25", "#b5442e"];

function archivoADataUrl(archivo: File): Promise<string> {
  if (archivo.type.startsWith("image/")) return archivoAImagenDataUrl(archivo);
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error("No se pudo leer el archivo"));
    lector.onload = () => resolver(String(lector.result));
    lector.readAsDataURL(archivo);
  });
}

interface OperacionesContextValue {
  clientes: Cliente[];
  pedidos: Pedido[];
  inventario: Producto[];
  movimientosCaja: MovimientoCaja[];
  usuarios: UsuarioSistema[];
  proveedores: Proveedor[];
  recepciones: RecepcionCompra[];
  gastos: Gasto[];
  conteos: ConteoInventario[];
  ajustes: AjusteInventario[];
  cambiosPrecio: CambioPrecio[];
  abonos: AbonoCredito[];
  clienteActivo: Cliente | null;
  crearCliente: (datos: NuevoCliente) => Cliente;
  seleccionarClienteActivo: (clienteId: string) => void;
  obtenerCliente: (clienteId: string) => Cliente | null;
  registrarPedido: (datos: NuevoPedido) => Pedido;
  obtenerPedido: (pedidoId: string) => Pedido | null;
  actualizarEstadoPedido: (pedidoId: string, estado: EstadoPedido) => void;
  adjuntarComprobante: (pedidoId: string, archivo: File) => Promise<void>;
  actualizarImagenProducto: (productoId: string, archivo: File) => Promise<void>;
  crearProducto: (datos: NuevoProducto) => Producto;
  registrarEgresoCaja: (concepto: string, monto: number) => void;
  crearUsuario: (datos: NuevoUsuario) => void;
  // Fase 3
  crearProveedor: (nombre: string, telefono?: string) => Proveedor;
  obtenerProveedor: (id: string) => Proveedor | null;
  registrarRecepcion: (proveedorId: string, lineas: LineaRecepcion[], descontarCaja: boolean) => RecepcionCompra;
  registrarGasto: (concepto: string, monto: number) => Gasto;
  // Fase 2
  iniciarConteo: (tipo: ConteoInventario["tipo"], cantidadAleatoria: number | null, turno: string) => ConteoInventario;
  actualizarConteoLinea: (conteoId: string, productoId: string, stockFisico: number) => void;
  finalizarConteoActivo: (conteoId: string) => void;
  cancelarConteoActivo: (conteoId: string) => void;
  aplicarAjusteDeConteo: (conteoId: string) => void;
  registrarAjusteManual: (productoId: string, stockFisico: number, motivo: string, comentario?: string) => void;
  // Fase 4
  actualizarPrecioProducto: (productoId: string, nuevoPrecio: number) => void;
  // Cierre del día
  trasladarPedidoAHoy: (pedidoId: string) => void;
  // Créditos
  registrarAbono: (clienteId: string, monto: number, metodo: AbonoCredito["metodo"], comentario?: string) => AbonoCredito | null;
  registrarPagoPedido: (pedidoId: string, metodo: AbonoCredito["metodo"], comentario?: string) => AbonoCredito | null;
}

const OperacionesContext = createContext<OperacionesContextValue | undefined>(undefined);

export function OperacionesProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>(cargarClientes);
  const [pedidos, setPedidos] = useState<Pedido[]>(cargarPedidos);
  const [inventario, setInventario] = useState<Producto[]>(cargarProductos);
  const [clienteActivoId, setClienteActivoId] = useState<string | null>(null);
  const [movimientosCaja, setMovimientosCaja] = useState<MovimientoCaja[]>(cargarMovimientosCaja);
  const [usuarios, setUsuarios] = useState<UsuarioSistema[]>(cargarUsuarios);
  const [proveedores, setProveedores] = useState<Proveedor[]>(cargarProveedores);
  const [recepciones, setRecepciones] = useState<RecepcionCompra[]>(cargarRecepciones);
  const [gastos, setGastos] = useState<Gasto[]>(cargarGastos);
  const [conteos, setConteos] = useState<ConteoInventario[]>(cargarConteos);
  const [ajustes, setAjustes] = useState<AjusteInventario[]>(cargarAjustes);
  const [cambiosPrecio, setCambiosPrecio] = useState<CambioPrecio[]>(cargarCambiosPrecio);
  const [abonos, setAbonos] = useState<AbonoCredito[]>(cargarAbonos);

  const crearCliente = useCallback((datos: NuevoCliente) => {
    const nuevoCliente = construirCliente(datos, nuevoId(), new Date().toISOString());
    setClientes((actuales) => {
      const siguientes = [nuevoCliente, ...actuales];
      guardarClientes(siguientes);
      return siguientes;
    });
    setClienteActivoId(nuevoCliente.id);
    return nuevoCliente;
  }, []);

  const seleccionarClienteActivo = useCallback((clienteId: string) => setClienteActivoId(clienteId), []);
  const obtenerCliente = useCallback((clienteId: string) => clientes.find((cliente) => cliente.id === clienteId) ?? null, [clientes]);
  const obtenerProveedor = useCallback((id: string) => proveedores.find((p) => p.id === id) ?? null, [proveedores]);

  const registrarPedido = useCallback((datos: NuevoPedido) => {
    const pedido = construirPedido(datos, nuevoId(), siguienteConsecutivo("PED"), new Date().toISOString());
    setPedidos((actuales) => {
      const siguientes = [pedido, ...actuales];
      guardarPedidos(siguientes);
      return siguientes;
    });
    setInventario((actuales) => {
      const siguientes = aplicarPedidoEnInventario(actuales, pedido.lineas);
      guardarProductos(siguientes);
      return siguientes;
    });
    if (pedido.pago.montoRecibido > 0) {
      const movimiento = ingresoCajaDePedido(pedido, nuevoId());
      setMovimientosCaja((actuales) => {
        const siguientes = [movimiento, ...actuales];
        guardarMovimientosCaja(siguientes);
        return siguientes;
      });
    }
    setClientes((actuales) => {
      const siguientes = aplicarPedidoEnClientes(actuales, pedido);
      guardarClientes(siguientes);
      return siguientes;
    });
    setClienteActivoId(datos.clienteId);
    return pedido;
  }, []);

  const obtenerPedido = useCallback((pedidoId: string) => pedidos.find((pedido) => pedido.id === pedidoId) ?? null, [pedidos]);

  const actualizarEstadoPedido = useCallback(
    (pedidoId: string, estado: EstadoPedido) => {
      const usuarioId = usuario?.id ?? "sistema";
      const fecha = new Date().toISOString();
      const pedidoActual = pedidos.find((p) => p.id === pedidoId);
      const esCancelacion = pedidoActual && pedidoActual.estado !== "cancelado" && estado === "cancelado";
      const esReactivacion = pedidoActual && pedidoActual.estado === "cancelado" && estado !== "cancelado";
      setPedidos((actuales) => {
        const siguientes = actuales.map((pedido) =>
          pedido.id === pedidoId ? registrarCambioEstado(pedido, estado, usuarioId, fecha) : pedido,
        );
        guardarPedidos(siguientes);
        return siguientes;
      });
      // Cancelar reversa stock, cartera y caja; revivir el pedido vuelve a aplicarlos.
      if (pedidoActual && (esCancelacion || esReactivacion)) {
        setInventario((actuales) => {
          const siguientes = actuales.map((producto) => {
            const linea = pedidoActual.lineas.find((l) => l.productoId === producto.id);
            if (!linea) return producto;
            const stock = esCancelacion
              ? producto.stock + linea.cantidad
              : Math.max(0, producto.stock - linea.cantidad);
            return { ...producto, stock };
          });
          guardarProductos(siguientes);
          return siguientes;
        });
        if (pedidoActual.pago.saldoPendiente > 0) {
          setClientes((actuales) => {
            const siguientes = actuales.map((cliente) => {
              if (cliente.id !== pedidoActual.clienteId) return cliente;
              const saldo = esCancelacion
                ? Math.max(0, cliente.saldoPendiente - pedidoActual.pago.saldoPendiente)
                : cliente.saldoPendiente + pedidoActual.pago.saldoPendiente;
              return { ...cliente, saldoPendiente: saldo, estadoCuenta: (saldo > 0 ? "pendiente" : "al-dia") as Cliente["estadoCuenta"] };
            });
            guardarClientes(siguientes);
            return siguientes;
          });
        }
        if (pedidoActual.pago.montoRecibido > 0) {
          const movimiento: MovimientoCaja = esCancelacion
            ? {
                id: nuevoId(),
                tipo: "egreso",
                concepto: `Reverso ${pedidoActual.numero}`,
                monto: pedidoActual.pago.montoRecibido,
                usuarioId,
                referenciaId: pedidoActual.id,
                creadoEn: fecha,
              }
            : { ...ingresoCajaDePedido(pedidoActual, nuevoId()), creadoEn: fecha };
          setMovimientosCaja((actuales) => {
            const siguientes = [movimiento, ...actuales];
            guardarMovimientosCaja(siguientes);
            return siguientes;
          });
        }
      }
    },
    [pedidos, usuario],
  );

  const adjuntarComprobante = useCallback(async (pedidoId: string, archivo: File) => {
    const comprobantePagoUrl = await archivoADataUrl(archivo);
    setPedidos((actuales) => {
      const siguientes = actuales.map((pedido) =>
        pedido.id === pedidoId ? { ...pedido, comprobantePagoUrl, comprobantePagoNombre: archivo.name } : pedido,
      );
      guardarPedidos(siguientes);
      return siguientes;
    });
  }, []);

  const actualizarImagenProducto = useCallback(async (productoId: string, archivo: File) => {
    const imagenUrl = await archivoAImagenDataUrl(archivo);
    setInventario((actuales) => {
      const siguientes = actuales.map((producto) => (producto.id === productoId ? { ...producto, imagenUrl } : producto));
      guardarProductos(siguientes);
      return siguientes;
    });
  }, []);

  const crearProducto = useCallback((datos: NuevoProducto) => {
    const total = inventario.length;
    const producto = construirProducto(
      datos,
      nuevoId(),
      siguienteConsecutivo("PROD"),
      coloresEtiqueta[total % coloresEtiqueta.length],
    );
    setInventario((actuales) => {
      const siguientes = [producto, ...actuales];
      guardarProductos(siguientes);
      return siguientes;
    });
    return producto;
  }, [inventario.length]);

  const registrarEgresoCaja = useCallback(
    (concepto: string, monto: number) => {
      const movimiento: MovimientoCaja = {
        id: nuevoId(),
        tipo: "egreso",
        concepto,
        monto,
        usuarioId: usuario?.id,
        creadoEn: new Date().toISOString(),
      };
      setMovimientosCaja((actuales) => {
        const siguientes = [movimiento, ...actuales];
        guardarMovimientosCaja(siguientes);
        return siguientes;
      });
    },
    [usuario],
  );

  const crearUsuario = useCallback((datos: NuevoUsuario) => {
    const nuevoUsuario = construirUsuario(datos.nombre, datos.email, datos.rol, nuevoId(), datos.password);
    setUsuarios((actuales) => {
      const siguientes = [nuevoUsuario, ...actuales];
      guardarUsuarios(siguientes);
      return siguientes;
    });
  }, []);

  const crearProveedor = useCallback((nombre: string, telefono?: string) => {
    const proveedor = construirProveedor(nombre, telefono, nuevoId(), new Date().toISOString());
    setProveedores((actuales) => {
      const siguientes = [proveedor, ...actuales];
      guardarProveedores(siguientes);
      return siguientes;
    });
    return proveedor;
  }, []);

  const registrarRecepcion = useCallback((proveedorId: string, lineas: LineaRecepcion[], descontarCaja: boolean) => {
    const id = nuevoId();
    const numero = siguienteConsecutivo("REC");
    const creadoEn = new Date().toISOString();
    const usuarioId = usuario?.id ?? "sistema";
    const recepcion = construirRecepcion(proveedorId, usuarioId, lineas, descontarCaja, id, numero, creadoEn);
    setRecepciones((actuales) => {
      const siguientes = [recepcion, ...actuales];
      guardarRecepciones(siguientes);
      return siguientes;
    });
    setInventario((actuales) => {
      const siguientes = aplicarRecepcionEnInventario(actuales, lineas);
      guardarProductos(siguientes);
      return siguientes;
    });
    if (descontarCaja) {
      const movimiento = egresoCajaDeRecepcion(recepcion, nuevoId());
      setMovimientosCaja((actuales) => {
        const siguientes = [movimiento, ...actuales];
        guardarMovimientosCaja(siguientes);
        return siguientes;
      });
    }
    return recepcion;
  }, [usuario]);

  const registrarGasto = useCallback((concepto: string, monto: number) => {
    const id = nuevoId();
    const creadoEn = new Date().toISOString();
    const usuarioId = usuario?.id ?? "sistema";
    const gasto = construirGasto(concepto, monto, usuarioId, id, creadoEn);
    setGastos((actuales) => {
      const siguientes = [gasto, ...actuales];
      guardarGastos(siguientes);
      return siguientes;
    });
    const movimiento = egresoCajaDeGasto(gasto, nuevoId());
    setMovimientosCaja((actuales) => {
      const siguientes = [movimiento, ...actuales];
      guardarMovimientosCaja(siguientes);
      return siguientes;
    });
    return gasto;
  }, [usuario]);

  const iniciarConteo = useCallback((tipo: ConteoInventario["tipo"], cantidadAleatoria: number | null, turno: string) => {
    const id = nuevoId();
    const iniciadoEn = new Date().toISOString();
    const usuarioId = usuario?.id ?? "sistema";
    const conteo = construirConteo(tipo, inventario, cantidadAleatoria, usuarioId, turno, id, iniciadoEn);
    setConteos((actuales) => {
      const siguientes = [conteo, ...actuales];
      guardarConteos(siguientes);
      return siguientes;
    });
    return conteo;
  }, [inventario, usuario]);

  const actualizarConteoLinea = useCallback((conteoId: string, productoId: string, stockFisico: number) => {
    setConteos((actuales) => {
      const siguientes = actuales.map((conteo) => conteo.id === conteoId ? actualizarLineaConteo(conteo, productoId, stockFisico) : conteo);
      guardarConteos(siguientes);
      return siguientes;
    });
  }, []);

  const finalizarConteoActivo = useCallback((conteoId: string) => {
    const finalizadoEn = new Date().toISOString();
    setConteos((actuales) => {
      const siguientes = actuales.map((conteo) => conteo.id === conteoId ? finalizarConteo(conteo, finalizadoEn) : conteo);
      guardarConteos(siguientes);
      return siguientes;
    });
  }, []);

  const cancelarConteoActivo = useCallback((conteoId: string) => {
    setConteos((actuales) => {
      const siguientes = actuales.map((conteo) => conteo.id === conteoId ? cancelarConteo(conteo) : conteo);
      guardarConteos(siguientes);
      return siguientes;
    });
  }, []);

  const aplicarAjusteDeConteo = useCallback((conteoId: string) => {
    const conteo = conteos.find((c) => c.id === conteoId);
    if (!conteo || conteo.estado !== "confirmado") return;
    const yaAjustado = ajustes.some((a) => a.conteoId === conteoId);
    if (yaAjustado) return;
    const id = nuevoId();
    const creadoEn = new Date().toISOString();
    const usuarioId = usuario?.id ?? "sistema";
    const ajuste = construirAjuste(conteo, usuarioId, id, creadoEn);
    setAjustes((actuales) => {
      const siguientes = [ajuste, ...actuales];
      guardarAjustes(siguientes);
      return siguientes;
    });
    setInventario((actuales) => {
      const siguientes = aplicarAjusteEnInventario(actuales, ajuste);
      guardarProductos(siguientes);
      return siguientes;
    });
  }, [conteos, ajustes, usuario]);

  const registrarAjusteManual = useCallback((productoId: string, stockFisico: number, motivo: string, comentario?: string) => {
    const producto = inventario.find((p) => p.id === productoId);
    if (!producto) return;
    const id = nuevoId();
    const creadoEn = new Date().toISOString();
    const usuarioId = usuario?.id ?? "sistema";
    const ajuste = construirAjusteManual(productoId, producto.nombre, producto.stock, stockFisico, motivo, comentario, usuarioId, id, creadoEn);
    setAjustes((actuales) => {
      const siguientes = [ajuste, ...actuales];
      guardarAjustes(siguientes);
      return siguientes;
    });
    setInventario((actuales) => {
      const siguientes = aplicarAjusteEnInventario(actuales, ajuste);
      guardarProductos(siguientes);
      return siguientes;
    });
  }, [inventario, usuario]);

  const actualizarPrecioProducto = useCallback((productoId: string, nuevoPrecio: number) => {
    const producto = inventario.find((p) => p.id === productoId);
    if (!producto || producto.precioVenta === nuevoPrecio) return;
    const id = nuevoId();
    const fecha = new Date().toISOString();
    const usuarioId = usuario?.id ?? "sistema";
    const cambio = construirCambioPrecio(productoId, producto.precioVenta, nuevoPrecio, usuarioId, id, fecha);
    setCambiosPrecio((actuales) => {
      const siguientes = [cambio, ...actuales];
      guardarCambiosPrecio(siguientes);
      return siguientes;
    });
    setInventario((actuales) => {
      const siguientes = aplicarCambioPrecioEnInventario(actuales, productoId, nuevoPrecio);
      guardarProductos(siguientes);
      return siguientes;
    });
  }, [inventario, usuario]);

  const trasladarPedidoAHoy = useCallback((pedidoId: string) => {
    const nuevaFecha = new Date().toISOString();
    setPedidos((actuales) => {
      const siguientes = actuales.map((p) => (p.id === pedidoId ? trasladarPedidoAHoySrv(p, nuevaFecha) : p));
      guardarPedidos(siguientes);
      return siguientes;
    });
  }, []);

  const registrarAbono = useCallback((clienteId: string, monto: number, metodo: AbonoCredito["metodo"], comentario?: string) => {
    if (monto <= 0) return null;
    const pendientes = pedidos.filter((p) => p.clienteId === clienteId && p.pago.saldoPendiente > 0);
    if (pendientes.length === 0) return null;
    const { actualizados, parciales } = distribuirAbonoEnPedidos(pendientes, monto);
    if (parciales.length === 0) return null;
    const montoAplicado = parciales.reduce((s, p) => s + p.montoAplicado, 0);
    const creadoEn = new Date().toISOString();
    const usuarioId = usuario?.id ?? "sistema";
    const abono = construirAbono(clienteId, montoAplicado, metodo, usuarioId, parciales, comentario, nuevoId(), creadoEn);
    setAbonos((actuales) => {
      const siguientes = [abono, ...actuales];
      guardarAbonos(siguientes);
      return siguientes;
    });
    setPedidos((actuales) => {
      const siguientes = aplicarAbonoEnPedidos(actuales, actualizados);
      guardarPedidos(siguientes);
      return siguientes;
    });
    setClientes((actuales) => {
      const siguientes = aplicarAbonoEnClientes(actuales, clienteId, montoAplicado, creadoEn);
      guardarClientes(siguientes);
      return siguientes;
    });
    const cliente = clientes.find((c) => c.id === clienteId);
    const movimiento = ingresoCajaDeAbono(abono, cliente?.nombre ?? "Cliente", nuevoId());
    setMovimientosCaja((actuales) => {
      const siguientes = [movimiento, ...actuales];
      guardarMovimientosCaja(siguientes);
      return siguientes;
    });
    return abono;
  }, [clientes, pedidos, usuario]);

  /**
   * Cobra el saldo de un pedido puntual y lo deja pagado.
   * Queda como abono en el historial de créditos, así el cuadre de caja
   * y la cartera del cliente cuadran sin repartir el dinero en otras deudas.
   */
  const registrarPagoPedido = useCallback(
    (pedidoId: string, metodo: AbonoCredito["metodo"], comentario?: string) => {
      const pedido = pedidos.find((p) => p.id === pedidoId);
      if (!pedido || pedido.pago.saldoPendiente <= 0) return null;
      const montoAplicado = pedido.pago.saldoPendiente;
      const creadoEn = new Date().toISOString();
      const usuarioId = usuario?.id ?? "sistema";
      const abono = construirAbono(
        pedido.clienteId,
        montoAplicado,
        metodo,
        usuarioId,
        [{ pedidoId: pedido.id, numero: pedido.numero, montoAplicado }],
        comentario,
        nuevoId(),
        creadoEn,
      );
      setAbonos((actuales) => {
        const siguientes = [abono, ...actuales];
        guardarAbonos(siguientes);
        return siguientes;
      });
      setPedidos((actuales) => {
        const siguientes = actuales.map((p) => (p.id === pedidoId ? aplicarPagoDirectoEnPedido(p, montoAplicado) : p));
        guardarPedidos(siguientes);
        return siguientes;
      });
      setClientes((actuales) => {
        const siguientes = aplicarAbonoEnClientes(actuales, pedido.clienteId, montoAplicado, creadoEn);
        guardarClientes(siguientes);
        return siguientes;
      });
      const cliente = clientes.find((c) => c.id === pedido.clienteId);
      const movimiento = ingresoCajaDeAbono(abono, cliente?.nombre ?? "Cliente", nuevoId());
      setMovimientosCaja((actuales) => {
        const siguientes = [movimiento, ...actuales];
        guardarMovimientosCaja(siguientes);
        return siguientes;
      });
      return abono;
    },
    [clientes, pedidos, usuario],
  );

  const clienteActivo = useMemo(
    () => (clienteActivoId ? clientes.find((cliente) => cliente.id === clienteActivoId) ?? null : null),
    [clienteActivoId, clientes],
  );
  const value: OperacionesContextValue = {
    clientes,
    pedidos,
    inventario,
    movimientosCaja,
    usuarios,
    proveedores,
    recepciones,
    gastos,
    conteos,
    ajustes,
    cambiosPrecio,
    abonos,
    clienteActivo,
    crearCliente,
    seleccionarClienteActivo,
    obtenerCliente,
    registrarPedido,
    obtenerPedido,
    actualizarEstadoPedido,
    adjuntarComprobante,
    actualizarImagenProducto,
    crearProducto,
    registrarEgresoCaja,
    crearUsuario,
    crearProveedor,
    obtenerProveedor,
    registrarRecepcion,
    registrarGasto,
    iniciarConteo,
    actualizarConteoLinea,
    finalizarConteoActivo,
    cancelarConteoActivo,
    aplicarAjusteDeConteo,
    registrarAjusteManual,
    actualizarPrecioProducto,
    trasladarPedidoAHoy,
    registrarAbono,
    registrarPagoPedido,
  };
  return <OperacionesContext.Provider value={value}>{children}</OperacionesContext.Provider>;
}

export function useOperaciones() {
  const context = useContext(OperacionesContext);
  if (!context) throw new Error("useOperaciones debe usarse dentro de <OperacionesProvider>");
  return context;
}
