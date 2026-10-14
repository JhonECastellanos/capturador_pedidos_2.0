/** Saludos breves no crean ni modifican transacciones. */
export function respuestaCordial(texto: string): string | null {
  const saludo = texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[¿?¡!.,;:]/g, " ").replace(/\s+/g, " ").trim();
  if (/^(?:(?:hola|oye|hey)\s+)?(?:buenos dias|buenas tardes|buenas noches|buenas|hola|como estas|que tal)(?:\s+(?:como estas|que tal))?$/.test(saludo)) {
    if (saludo.includes("buenos dias")) return "Hola, buenos días.";
    if (saludo.includes("buenas tardes")) return "Hola, buenas tardes.";
    if (saludo.includes("buenas noches")) return "Hola, buenas noches.";
    return "Hola. Te escucho.";
  }
  if (/^(?:muchas )?gracias$/.test(saludo)) return "Con gusto.";
  return null;
}
