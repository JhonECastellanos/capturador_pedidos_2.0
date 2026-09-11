import type { Producto } from "../types";

export const categorias = [
  "Todas",
  "Bebidas",
  "Lacteos",
  "Aseo",
  "Snacks",
  "Abarrotes",
] as const;

export const productos: Producto[] = [
  { id: "p1", nombre: "Gaseosa Cola 1.5L", categoria: "Bebidas", precio: 5200, unidad: "unidad", stock: 120, colorEtiqueta: "#b5442e" },
  { id: "p2", nombre: "Agua Sin Gas 600ml x12", categoria: "Bebidas", precio: 18900, unidad: "paca", stock: 40, colorEtiqueta: "#2f7a6c" },
  { id: "p3", nombre: "Jugo de Naranja 1L", categoria: "Bebidas", precio: 6100, unidad: "unidad", stock: 65, colorEtiqueta: "#e29b2b" },
  { id: "p4", nombre: "Cerveza Lager x6", categoria: "Bebidas", precio: 21400, unidad: "six pack", stock: 30, colorEtiqueta: "#b87c17" },
  { id: "p5", nombre: "Leche Entera 1L", categoria: "Lacteos", precio: 4300, unidad: "unidad", stock: 90, colorEtiqueta: "#52607a" },
  { id: "p6", nombre: "Yogurt Fresa 200g x4", categoria: "Lacteos", precio: 9800, unidad: "pack", stock: 55, colorEtiqueta: "#e29b2b" },
  { id: "p7", nombre: "Queso Campesino 500g", categoria: "Lacteos", precio: 12600, unidad: "unidad", stock: 22, colorEtiqueta: "#8b95a8" },
  { id: "p8", nombre: "Detergente en Polvo 3kg", categoria: "Aseo", precio: 24500, unidad: "bolsa", stock: 18, colorEtiqueta: "#2f7a6c" },
  { id: "p9", nombre: "Jabon de Bano x3", categoria: "Aseo", precio: 7200, unidad: "pack", stock: 48, colorEtiqueta: "#2f7a6c" },
  { id: "p10", nombre: "Limpiador Multiusos 1L", categoria: "Aseo", precio: 8600, unidad: "unidad", stock: 33, colorEtiqueta: "#3c7a4d" },
  { id: "p11", nombre: "Papel Higienico x12", categoria: "Aseo", precio: 19900, unidad: "paca", stock: 26, colorEtiqueta: "#52607a" },
  { id: "p12", nombre: "Papas Fritas 150g", categoria: "Snacks", precio: 4700, unidad: "unidad", stock: 70, colorEtiqueta: "#e29b2b" },
  { id: "p13", nombre: "Galletas Surtidas x6", categoria: "Snacks", precio: 11200, unidad: "pack", stock: 44, colorEtiqueta: "#b87c17" },
  { id: "p14", nombre: "Mani Salado 200g", categoria: "Snacks", precio: 5600, unidad: "unidad", stock: 38, colorEtiqueta: "#b5442e" },
  { id: "p15", nombre: "Arroz Premium 1kg", categoria: "Abarrotes", precio: 4900, unidad: "unidad", stock: 150, colorEtiqueta: "#8b95a8" },
  { id: "p16", nombre: "Aceite Vegetal 1L", categoria: "Abarrotes", precio: 10300, unidad: "unidad", stock: 60, colorEtiqueta: "#e29b2b" },
  { id: "p17", nombre: "Pasta Larga 500g", categoria: "Abarrotes", precio: 3600, unidad: "unidad", stock: 95, colorEtiqueta: "#52607a" },
  { id: "p18", nombre: "Cafe Molido 500g", categoria: "Abarrotes", precio: 15800, unidad: "unidad", stock: 27, colorEtiqueta: "#b87c17" },
];
