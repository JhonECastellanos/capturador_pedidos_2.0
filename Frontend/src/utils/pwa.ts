interface SolicitudInstalacion extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let solicitud: SolicitudInstalacion | null = null;
export function prepararInstalacion() {
  window.addEventListener("beforeinstallprompt", evento => {
    evento.preventDefault(); solicitud = evento as SolicitudInstalacion;
    window.dispatchEvent(new Event("abinova:instalacion-disponible"));
  });
  window.addEventListener("appinstalled", () => { solicitud = null; window.dispatchEvent(new Event("abinova:instalacion-disponible")); });
  if (import.meta.env.PROD && window.isSecureContext && "serviceWorker" in navigator) {
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
  }
}
export function estaInstalada() { return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone); }
export async function solicitarInstalacion(): Promise<boolean> {
  if (!solicitud) return false;
  const actual = solicitud; solicitud = null;
  await actual.prompt(); await actual.userChoice; return true;
}
