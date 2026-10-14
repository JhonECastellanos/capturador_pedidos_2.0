/** Se compara una copia del texto; la transcripción original no se modifica. */
export const normalizarProducto = (texto: string) => texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\bmililitros?\b/g, "ml").replace(/[^a-z0-9]+/g, " ").trim();
const ignoradas = new Set("con de del las los una uno unos unas para quiero venta pedido cliente ocasional pago efectivo billetera credito preparar entregado agrega agregar cambia cambiar producto productos por favor necesito unidades unidad dos tres cuatro cinco seis siete ocho nueve diez tengo contado inventario cuesta costo pesos precio compra proveedor recibir recepcion".split(" "));
export function palabrasProducto(texto: string) {
  return [...new Set(normalizarProducto(texto).split(" ").filter(t => t.length > 2 && t.length <= 150 && !ignoradas.has(t)))].slice(0, 48);
}
function parecido(a: string, b: string) {
  a = a.replace(/s$/, ""); b = b.replace(/s$/, "");
  if (a === b) return 1;
  if (a.length < 4 || b.length < 4 || /\d/.test(a + b) || Math.abs(a.length - b.length) > Math.max(a.length, b.length) * 0.3) return 0;
  let fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const siguiente = [i];
    for (let j = 1; j <= b.length; j++) siguiente[j] = Math.min(siguiente[j - 1] + 1, fila[j] + 1, fila[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    fila = siguiente;
  }
  return 1 - fila[b.length] / Math.max(a.length, b.length);
}
type NombreProducto = { nombre: string; codigoInterno: string };
export function coincidencias<T extends NombreProducto>(texto: string, productos: T[]) {
  const palabras = palabrasProducto(texto), numeros = normalizarProducto(texto).match(/\b\d+\b/g) ?? [];
  return productos.map(producto => {
    const nombre = normalizarProducto(producto.nombre);
    if (normalizarProducto(texto) === nombre || normalizarProducto(texto) === normalizarProducto(producto.codigoInterno)) return { producto, puntaje: 1 };
    if (!palabras.length || numeros.some(n => !nombre.split(" ").includes(n))) return { producto, puntaje: 0 };
    const tokens = palabrasProducto(producto.nombre);
    const compacta = Math.max(parecido(palabras.join(""), tokens.join("")), ...tokens.map(t => parecido(palabras.join(""), t)));
    const valores = palabras.map(p => Math.max(0, ...tokens.map(t => parecido(p, t))));
    if (compacta >= 0.84) return { producto, puntaje: compacta };
    return { producto, puntaje: valores.some(p => p < 0.7) ? 0 : valores.reduce((s, p) => s + p, 0) / valores.length };
  }).filter(p => p.puntaje > 0).sort((a, b) => b.puntaje - a.puntaje);
}
export function elegirProducto<T extends NombreProducto>(texto: string, productos: T[], probable = false) {
  const exactos = productos.filter(p => normalizarProducto(p.nombre) === normalizarProducto(texto) || normalizarProducto(p.codigoInterno) === normalizarProducto(texto));
  if (exactos.length) return exactos.length === 1 ? exactos[0] : null;
  const candidatos = coincidencias(texto, productos);
  // La revisión puede proponer una referencia; otras búsquedas exigen unicidad.
  return candidatos[0]?.puntaje >= 0.84 && (probable || !candidatos[1] || candidatos[0].puntaje - candidatos[1].puntaje >= 0.14) ? candidatos[0].producto : null;
}
export function sugerenciasCatalogo<T extends NombreProducto>(texto: string, productos: T[]) {
  const literal = palabrasProducto(texto);
  return productos.map(producto => ({ producto, puntaje: palabrasProducto(producto.nombre).reduce((suma, palabra) => suma + Math.max(0, ...literal.map(p => { const valor = parecido(palabra, p); return valor >= 0.7 ? valor : 0; })), 0) }))
    .filter(p => p.puntaje > 0).sort((a, b) => b.puntaje - a.puntaje).slice(0, 24).map(p => p.producto);
}
