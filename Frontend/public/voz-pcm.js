class AmbiePcm extends AudioWorkletProcessor {
  constructor() {
    super();
    this.paso = sampleRate / 16000;
    this.suma = 0; this.peso = 0; this.indice = 0;
    this.buffer = new Int16Array(1600);
    this.energia = 0;
  }
  process(entradas) {
    const canal = entradas[0]?.[0];
    if (!canal) return true;
    for (const muestra of canal) {
      let restante = 1;
      while (restante > 0.000001) {
        const parte = Math.min(restante, this.paso - this.peso);
        this.suma += muestra * parte; this.peso += parte; restante -= parte;
        if (this.peso >= this.paso - 0.000001) {
          const valor = Math.max(-1, Math.min(1, this.suma / this.paso));
          this.buffer[this.indice++] = Math.round(valor * (valor < 0 ? 32768 : 32767));
          this.energia += valor * valor; this.suma = 0; this.peso = 0;
          if (this.indice === this.buffer.length) {
            const audio = this.buffer.buffer;
            this.port.postMessage({ audio, nivel: Math.sqrt(this.energia / this.indice) }, [audio]);
            this.buffer = new Int16Array(1600); this.indice = 0; this.energia = 0;
          }
        }
      }
    }
    return true;
  }
}
registerProcessor("ambie-pcm", AmbiePcm);
