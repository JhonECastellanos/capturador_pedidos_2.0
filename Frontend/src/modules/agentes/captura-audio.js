/* global AudioWorkletProcessor, sampleRate, registerProcessor */
/* La salida permanece en silencio; solo se envía PCM mono a 16 kHz. */
class CapturaABINOVA extends AudioWorkletProcessor {
  constructor() {
    super(); this.pendiente = []; this.fase = 0; this.suma = 0; this.muestras = 0;
  }
  process(entradas) {
    const canal = entradas[0]?.[0];
    if (!canal) return true;
    for (const valor of canal) {
      this.suma += valor; this.muestras++; this.fase += 16000;
      if (this.fase >= sampleRate) {
        this.fase -= sampleRate;
        const muestra = Math.max(-1, Math.min(1, this.suma / this.muestras));
        this.pendiente.push(Math.round(muestra * (muestra < 0 ? 32768 : 32767)));
        this.suma = 0; this.muestras = 0;
        if (this.pendiente.length === 1600) {
          const audio = new Int16Array(this.pendiente);
          this.port.postMessage(audio.buffer, [audio.buffer]); this.pendiente = [];
        }
      }
    }
    return true;
  }
}
registerProcessor("captura-abinova", CapturaABINOVA);
