import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Cliente, ItemCarrito, Producto } from "../types";

interface PedidoContextValue {
  cliente: Cliente | null;
  items: ItemCarrito[];
  totalItems: number;
  subtotal: number;
  seleccionarCliente: (cliente: Cliente) => void;
  agregarProducto: (producto: Producto) => void;
  actualizarCantidad: (productoId: string, cantidad: number) => void;
  quitarProducto: (productoId: string) => void;
  cantidadDe: (productoId: string) => number;
  reiniciarPedido: () => void;
}

const PedidoContext = createContext<PedidoContextValue | undefined>(
  undefined,
);

export function PedidoProvider({ children }: { children: ReactNode }) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [items, setItems] = useState<ItemCarrito[]>([]);

  const seleccionarCliente = useCallback((nuevoCliente: Cliente) => {
    setCliente(nuevoCliente);
  }, []);

  const agregarProducto = useCallback((producto: Producto) => {
    setItems((actual) => {
      const existente = actual.find((i) => i.producto.id === producto.id);
      if (existente) {
        return actual.map((i) =>
          i.producto.id === producto.id
            ? { ...i, cantidad: i.cantidad + 1 }
            : i,
        );
      }
      return [...actual, { producto, cantidad: 1 }];
    });
  }, []);

  const actualizarCantidad = useCallback(
    (productoId: string, cantidad: number) => {
      setItems((actual) => {
        if (cantidad <= 0) {
          return actual.filter((i) => i.producto.id !== productoId);
        }
        return actual.map((i) =>
          i.producto.id === productoId ? { ...i, cantidad } : i,
        );
      });
    },
    [],
  );

  const quitarProducto = useCallback((productoId: string) => {
    setItems((actual) => actual.filter((i) => i.producto.id !== productoId));
  }, []);

  const cantidadDe = useCallback(
    (productoId: string) =>
      items.find((i) => i.producto.id === productoId)?.cantidad ?? 0,
    [items],
  );

  const reiniciarPedido = useCallback(() => {
    setCliente(null);
    setItems([]);
  }, []);

  const totalItems = useMemo(
    () => items.reduce((acc, i) => acc + i.cantidad, 0),
    [items],
  );

  const subtotal = useMemo(
    () => items.reduce((acc, i) => acc + i.cantidad * i.producto.precio, 0),
    [items],
  );

  const value: PedidoContextValue = {
    cliente,
    items,
    totalItems,
    subtotal,
    seleccionarCliente,
    agregarProducto,
    actualizarCantidad,
    quitarProducto,
    cantidadDe,
    reiniciarPedido,
  };

  return (
    <PedidoContext.Provider value={value}>{children}</PedidoContext.Provider>
  );
}

export function usePedido() {
  const ctx = useContext(PedidoContext);
  if (!ctx) {
    throw new Error("usePedido debe usarse dentro de <PedidoProvider>");
  }
  return ctx;
}
