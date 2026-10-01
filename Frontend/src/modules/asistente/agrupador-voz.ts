import type { EventoVoz } from "@ambie/contrato";

export const ESPERA_TURNO_VOZ_MS = 2200;
type FinalVoz = Extract<EventoVoz, { tipo: "final" }>;

/** Vosk puede cortar una frase en varias finales: esperar y reunir antes de interpretar. */
export class AgrupadorVoz {
  private fragmentos: FinalVoz[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly emitir: (evento: EventoVoz) => void;
  constructor(emitir: (evento: EventoVoz) => void) { this.emitir = emitir; }
  recibir(evento: EventoVoz) {
    if (evento.tipo === "error") { this.cancelar(); this.emitir(evento); return; }
    if (evento.tipo === "lista") { this.emitir(evento); return; }
    if (evento.tipo === "final" && evento.texto.trim()) {
      this.fragmentos.push({ ...evento, texto: evento.texto.trim() });
      if (this.fragmentos.map(f => f.texto).join(" ").length > 2000) {
        this.cancelar(); this.emitir({ tipo: "error", mensaje: "El dictado es demasiado largo. Reconecta y dicta una lista más corta." }); return;
      }
      this.esperar();
    } else if (evento.tipo === "parcial" && evento.texto.trim() && this.fragmentos.length) this.esperar();
  }
  private esperar() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const partes = this.fragmentos;
      this.fragmentos = []; this.timer = undefined;
      if (partes.length) this.emitir({ tipo: "final", texto: partes.map(f => f.texto).join(" "), confianza: Math.min(...partes.map(f => f.confianza)) });
    }, ESPERA_TURNO_VOZ_MS);
  }
  cancelar() { clearTimeout(this.timer); this.timer = undefined; this.fragmentos = []; }
}
