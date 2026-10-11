/** Saludos breves no crean ni modifican transacciones. */
export function respuestaCordial(texto: string): string | null {
  const saludo = texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[¿?¡!.,;:]/g, " ").replace(/\s+/g, " ").trim();
  if (/^(?:(?:hola|oye|hey)\s+)?(?:buenos dias|buenas tardes|buenas noches|buenas|hola|como estas|que tal)(?:\s+(?:como estas|que tal))?$/.test(saludo)) return "¡Hola! Soy el asistente de Synchronic.JO. Dime qué necesitas y revisamos la operación antes de guardarla.";
  if (/^(?:muchas )?gracias$/.test(saludo)) return "Con gusto. ¿Qué más necesitas?";
  return null;
}
