/** Saludos breves no crean ni modifican transacciones. */
export function esConfirmacion(texto: string, operacion?: string): boolean {
  const orden = texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[¿?¡!.,;:]/g, " ").replace(/\s+/g, " ").trim();
  // Una pregunta, negación o instrucción combinada nunca equivale a aceptar el detalle.
  if (/[¿?]/.test(texto) || /\b(?:no|nunca|tampoco|todavia|despues|cuando|antes|pero|cambia|agrega|quita|falta)\b/.test(orden)) return false;
  const asunto = /\b(pedido|venta|compra|pago|cobro|gasto|egreso|conteo|cierre|ajuste)\b/.exec(orden)?.[1];
  const destino: Record<string, string[]> = { pedido: ["pedido"], venta: ["pedido"], compra: ["compra"], pago: ["pedido", "cobro"], cobro: ["cobro"], gasto: ["gasto"], egreso: ["egreso"], conteo: ["conteo", "iniciar-conteo", "finalizar-conteo", "aplicar-conteo"], cierre: ["cierre"], ajuste: ["aplicar-conteo", "precio"] };
  if (operacion && asunto && !destino[asunto].includes(operacion)) return false;
  return /^(?:(?:si|listo|bueno|de acuerdo|perfecto|ok|vale|dale|ya esta|por favor)\s+)?(?:(?:quiero|puedes|vamos a|procede a)\s+)?(?:confirmar|confirmo|confirma|confirme|confirmemos|confirmalo|confirmala|confirmarlo|confirmarla)(?:\s+(?:(?:el|la|este|esta|mi)\s+)?(?:pedido|venta|compra|operacion|transaccion|pago|cobro|gasto|egreso|conteo|cierre|cambio|ajuste))?(?:\s+(?:por favor|ahora|ya))?$/.test(orden);
}

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
