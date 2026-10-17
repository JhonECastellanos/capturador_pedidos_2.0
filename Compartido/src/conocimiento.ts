import { z } from "zod";

export const FuenteConocimientoEsquema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,70}$/), nombre: z.string().trim().min(1).max(100),
  tipo: z.enum(["md", "api", "postgres"]), texto: z.string().max(20000).default(""),
  conexion: z.string().max(70).default(""), tabla: z.string().max(100).default(""),
}).strict();
export const ConocimientoEsquema = z.object({
  version: z.number().int().min(1), perfil: z.enum(["restaurante", "tienda", "supermercado", "carniceria", "otro"]),
  nombreNegocio: z.string().trim().max(100), descripcion: z.string().max(2000), reglas: z.string().max(12000),
  fuentes: z.array(FuenteConocimientoEsquema).max(12), modulos: z.array(z.string().regex(/^[a-z][a-z0-9-]{0,49}$/)).max(30), publicado: z.boolean(),
}).strict().superRefine((v, ctx) => { if (new Set(v.fuentes.map(f => f.id)).size !== v.fuentes.length) ctx.addIssue({ code: "custom", message: "No repitas fuentes" }); });
export const PruebaConocimientoEsquema = z.object({ texto: z.string().trim().min(1).max(4000), conversacion: z.string().uuid(), modulo: z.string().regex(/^[a-z][a-z0-9-]{0,49}$/) }).strict();
export type Conocimiento = z.infer<typeof ConocimientoEsquema>;
