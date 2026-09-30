let audio: AudioContext | null = null;
export function prepararSonidos() { if (!audio) audio = new AudioContext(); void audio.resume().catch(() => undefined); }
export function sonar(tipo: "procesando" | "listo" | "guardado" | "error") {
  if (!audio || audio.state !== "running") return;
  const notas = { procesando: [440], listo: [660, 880], guardado: [523, 659, 784], error: [220, 180] }[tipo];
  notas.forEach((frecuencia, i) => {
    const oscilador = audio!.createOscillator(), ganancia = audio!.createGain(), inicio = audio!.currentTime + i * .12;
    oscilador.frequency.value = frecuencia; ganancia.gain.setValueAtTime(.0001, inicio); ganancia.gain.exponentialRampToValueAtTime(.055, inicio + .015); ganancia.gain.exponentialRampToValueAtTime(.0001, inicio + .1);
    oscilador.connect(ganancia); ganancia.connect(audio!.destination); oscilador.start(inicio); oscilador.stop(inicio + .12);
  });
}
