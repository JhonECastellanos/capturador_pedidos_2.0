import { z } from "zod";
import inicial from "./modulos-iniciales.json";

export const MODULOS_IMPLEMENTADOS: readonly string[] = inicial.implementados;
export const PLANES_COMERCIALES = ["Esencial", "Negocios", "Profesional", "Empresarial"] as const;
export const IdModuloEsquema = z.string().regex(/^[a-z][a-z0-9-]{0,49}$/);
const ModulosComercialesEsquema = z.array(IdModuloEsquema).transform(ids => ids.filter(id => id !== "workflows"));
export const CatalogoModulosEsquema = z.object({
  version: z.number().int().positive(),
  modulos: z.array(z.object({ id: IdModuloEsquema, nombre: z.string().trim().min(2).max(70) }).strict()).min(2).max(100).transform(modulos => modulos.filter(m => m.id !== "workflows")),
  planes: z.object({ Esencial: ModulosComercialesEsquema, Negocios: ModulosComercialesEsquema, Profesional: ModulosComercialesEsquema, Empresarial: ModulosComercialesEsquema }).strict(),
}).strict();
export const AsignacionModulosEsquema = z.object({ version: z.number().int().positive(), plan: z.enum(PLANES_COMERCIALES), adicionales: z.array(IdModuloEsquema).max(100).transform(ids => ids.filter(id => id !== "workflows")), excluidos: z.array(IdModuloEsquema).max(100).transform(ids => ids.filter(id => id !== "workflows")) }).strict();
export const AccesoComercialEsquema = z.object({ revision: z.string().max(100), plan: z.enum(PLANES_COMERCIALES), modulos: z.array(z.object({ id: IdModuloEsquema, nombre: z.string().max(70), implementado: z.boolean(), activo: z.boolean() })).max(100).transform(modulos => modulos.filter(m => m.id !== "workflows")) });
export type CatalogoModulos = z.infer<typeof CatalogoModulosEsquema>;
export type AsignacionModulos = z.infer<typeof AsignacionModulosEsquema>;
export type AccesoComercial = z.infer<typeof AccesoComercialEsquema>;
export const ACCESO_COMERCIAL_INICIAL: AccesoComercial = { revision: "inicial", plan: "Empresarial", modulos: inicial.modulos.map(m => ({ ...m, implementado: MODULOS_IMPLEMENTADOS.includes(m.id), activo: MODULOS_IMPLEMENTADOS.includes(m.id) })) };

/** Pantallas existentes. Un módulo planificado no crea una ruta ni habilita código. */
export function moduloPantalla(ruta: string): string | undefined {
  if (ruta === "/admin" || ruta === "/admin/") return "resumen";
  if (ruta === "/inventario" || ruta.startsWith("/vendedor/conteo")) return "inventario";
  if (ruta.startsWith("/vendedor")) return ruta.includes("abonos") ? "creditos" : "ventas";
  const segmento = ruta.split("/")[2];
  return MODULOS_IMPLEMENTADOS.includes(segmento) ? segmento : undefined;
}
