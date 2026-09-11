export interface Cliente {
  id: string;
  nombre: string;
  identificacion: string;
  ciudad: string;
  direccion: string;
  telefono: string;
  cupoDisponible: number;
  iniciales: string;
}

export interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precio: number;
  unidad: string;
  stock: number;
  colorEtiqueta: string;
  imagenUrl?: string;
}

export interface ItemCarrito {
  producto: Producto;
  cantidad: number;
}

export interface Pedido {
  numero: string;
  cliente: Cliente;
  items: ItemCarrito[];
  total: number;
  fecha: string;
}
