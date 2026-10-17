import { z } from "zod";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Usa un color hexadecimal de seis dígitos");
export function contraste(a: string, b: string): number {
  const luz = (hex: string) => {
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const x = luz(a), y = luz(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export const AparienciaEsquema = z.object({
  fondo: color, texto: color, acento: color, encabezado: color, textoEncabezado: color,
  robotReposo: color.default("#4e4cdb"), robotEscuchando: color.default("#8ce3ef"), robotHablando: color.default("#f5cf83"),
  fuente: z.enum(["inter", "sistema", "grotesk", "serif"]),
  portada: z.enum(["tienda", "oficina", "almacen"]),
  imagen: z.string().max(410000).regex(/^$|^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/, "Usa una imagen JPG, PNG o WebP").default(""),
}).strict().superRefine((v, ctx) => {
  if (contraste(v.texto, v.fondo) < 4.5 || contraste(v.texto, "#ffffff") < 4.5) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["texto"], message: "Oscurece el texto para que se lea bien sobre el fondo y las tarjetas" });
  if (contraste(v.textoEncabezado, v.encabezado) < 4.5) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["textoEncabezado"], message: "Aumenta el contraste entre el encabezado y su texto" });
});
export type Apariencia = z.infer<typeof AparienciaEsquema>;
export const APARIENCIA_INICIAL: Apariencia = { fondo: "#f7f8ff", texto: "#211d55", acento: "#4e4cdb", encabezado: "#ffffff", textoEncabezado: "#211d55", robotReposo: "#4e4cdb", robotEscuchando: "#8ce3ef", robotHablando: "#f5cf83", fuente: "grotesk", portada: "tienda", imagen: "" };
export const PERMISOS_EDITABLES: Record<string, string[]> = {
  administrador: ["clientes", "pedidos", "cobros", "inventario", "caja", "usuarios", "cierre-diario", "notificaciones", "chat"],
  vendedor: ["clientes", "pedidos", "cobros", "inventario"], inventario: ["inventario"],
};
