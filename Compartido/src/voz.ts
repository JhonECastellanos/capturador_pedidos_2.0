/** Conversión local y determinista; no llama modelos ni inventa cantidades. */
export function numeroHablado(texto: string): number | undefined {
  const normal = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const digitos = normal.replace(/\s|\$/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(digitos)) return Number(digitos);
  const valores: Record<string, number> = { cero: 0, uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintiun: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900 };
  let grupo = 0, total = 0;
  for (const palabra of normal.split(/\s+/)) {
    if (palabra === "y" || palabra === "pesos") continue;
    if (palabra === "mil") { total += (grupo || 1) * 1000; grupo = 0; }
    else if (valores[palabra] !== undefined) grupo += valores[palabra];
    else return undefined;
  }
  return total + grupo;
}

const unidades = "(?:un[oa]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)";
const cantidad = `(?:\\d+|(?:treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)(?:\\s+y\\s+${unidades})?|veinti(?:uno|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)|cien|veinte|dieci(?:seis|siete|ocho|nueve)|quince|catorce|trece|doce|once|diez|${unidades})`;
const inicio = new RegExp(`^(${cantidad})\\s+(?:unidades?\\s+de\\s+)?(.+)$`, "i");
const siguiente = new RegExp(`\\s+(?:y\\s+)?(?=${cantidad}\\s+(?!(?:ml|mililitros?|l|litros?|g|gramos?|kg|kilos?)\\b))`, "ig");

/** Acepta listas en una frase o segmentos unidos, conservando números de presentación. */
export function productosHablados(texto: string): { reemplazar: boolean; lineas: Array<{ productoId: string; cantidad: number }> } | null {
  let frase = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[.!?]+$/, "");
  const reemplazar = /^(reemplaza|reemplazar|deja solo|cambia la lista por)\b/.test(frase);
  frase = frase.replace(/^(?:por favor\s+)?(?:reemplaza|reemplazar|deja solo|cambia la lista por|(?:quiero que me des|quiero llevar|voy a llevar|me puedes dar|puedes agregar|me das|me da|quiero|necesito|dame|ponme|pon|agregar|agrega|anadir|anade)(?:\s+tambien)?|tambien|y)\s+/, "").replace(/\s+(?:por favor|eso es todo)$/, "");
  if (reemplazar) frase = frase.replace(/^por\s+/, "");
  const lineas: Array<{ productoId: string; cantidad: number }> = [];
  for (let fragmento of frase.split(/[,;]/).map(f => f.trim()).filter(Boolean)) {
    fragmento = fragmento.replace(/^y\s+/, "");
    while (fragmento) {
      const match = inicio.exec(fragmento);
      if (!match) return null;
      const numero = numeroHablado(match[1]);
      if (!numero || !Number.isSafeInteger(numero) || numero > 100000) return null;
      const resto = match[2];
      siguiente.lastIndex = 0;
      const separador = siguiente.exec(resto);
      let nombre = (separador ? resto.slice(0, separador.index) : resto).trim().replace(/^de\s+(?!(?:fresa|durazno|mora|mango|vainilla|chocolate)\b)/, "");
      if (!nombre) return null;
      if (/^de\s+/.test(nombre) || /^(fresa|durazno|mora|mango|vainilla|chocolate)$/.test(nombre)) {
        const anterior = lineas.at(-1)?.productoId;
        const familia = anterior?.split(/\s+de\s+/)[0];
        if (!familia || familia === anterior) return null;
        nombre = `${familia} ${nombre.startsWith("de ") ? nombre : `de ${nombre}`}`;
      }
      lineas.push({ productoId: nombre, cantidad: numero });
      if (lineas.length > 60) return null;
      fragmento = separador ? resto.slice(separador.index + separador[0].length).trim() : "";
    }
  }
  return lineas.length ? { reemplazar, lineas } : null;
}
