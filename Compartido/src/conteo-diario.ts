/** Selección compartida por API y modo local; el historial confirmado conserva la cobertura. */
export function seleccionarConteoDiario<T extends { id: string }>(productos: T[], ciclo: number, contados: ReadonlySet<string>, azar: () => number = Math.random) {
  const mezclar = (lista: T[]) => {
    for (let i = lista.length - 1; i > 0; i--) {
      const j = Math.floor(azar() * (i + 1));
      [lista[i], lista[j]] = [lista[j], lista[i]];
    }
    return lista;
  };
  const cantidad = Math.min(5, productos.length);
  const seleccion = mezclar(productos.filter(p => !contados.has(p.id))).slice(0, cantidad).map(producto => ({ producto, ciclo }));
  if (seleccion.length < cantidad) {
    const elegidos = new Set(seleccion.map(l => l.producto.id));
    seleccion.push(...mezclar(productos.filter(p => !elegidos.has(p.id))).slice(0, cantidad - seleccion.length).map(producto => ({ producto, ciclo: ciclo + 1 })));
  }
  return seleccion;
}
