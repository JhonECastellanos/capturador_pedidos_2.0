/**
 * Convierte un File de imagen a dataURL comprimido para persistirlo
 * en localStorage (evita el uso de blob URLs que no sobreviven el refresh
 * y reducen la cuota de almacenamiento).
 */
export function archivoAImagenDataUrl(archivo: File, ladoMaximo = 720, calidad = 0.8): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error("No se pudo leer el archivo"));
    lector.onload = () => {
      const imagen = new Image();
      imagen.onerror = () => rechazar(new Error("Archivo de imagen inválido"));
      imagen.onload = () => {
        const escala = Math.min(1, ladoMaximo / Math.max(imagen.width, imagen.height));
        const ancho = Math.max(1, Math.round(imagen.width * escala));
        const alto = Math.max(1, Math.round(imagen.height * escala));
        const lienzo = document.createElement("canvas");
        lienzo.width = ancho;
        lienzo.height = alto;
        const contexto = lienzo.getContext("2d");
        if (!contexto) {
          rechazar(new Error("Canvas no disponible"));
          return;
        }
        contexto.drawImage(imagen, 0, 0, ancho, alto);
        resolver(lienzo.toDataURL("image/jpeg", calidad));
      };
      imagen.src = String(lector.result);
    };
    lector.readAsDataURL(archivo);
  });
}
