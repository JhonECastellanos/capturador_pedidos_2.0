import { useEffect, useState, type FormEvent } from "react";
import { APARIENCIA_INICIAL, AparienciaEsquema, type Apariencia } from "@synchronic-jo/contrato";
import { useApariencia } from "../../context/apariencia-context";
import { aplicarApariencia } from "../../utils/apariencia";
import { archivoAImagenDataUrl } from "../../utils/imagen";
import { Boton } from "../../components/Boton";
const campos = { fondo: "Fondo", texto: "Texto", acento: "Acento y botones", encabezado: "Encabezado", textoEncabezado: "Texto del encabezado", robotReposo: "Robot en reposo", robotEscuchando: "Robot escuchando", robotHablando: "Robot respondiendo" } as const;
const paletas = [{ nombre: "Naranja", colores: APARIENCIA_INICIAL }, { nombre: "Azul", colores: { ...APARIENCIA_INICIAL, acento: "#2563eb", robotReposo: "#2563eb", encabezado: "#152b4b", textoEncabezado: "#ffffff" } }, { nombre: "Bosque", colores: { ...APARIENCIA_INICIAL, fondo: "#f4f7f4", acento: "#15803d", robotReposo: "#15803d", encabezado: "#173b2c", textoEncabezado: "#ffffff" } }];
export function PanelApariencia() {
  const { apariencia, guardar } = useApariencia();
  const [borrador, setBorrador] = useState<Apariencia | null>(null);
  const [aviso, setAviso] = useState(""); const [ocupado, setOcupado] = useState(false);
  const actual = borrador ?? apariencia;
  useEffect(() => {
    if (AparienciaEsquema.safeParse(actual).success) aplicarApariencia(actual);
    return () => aplicarApariencia(apariencia);
  }, [actual, apariencia]);
  function cambiar<K extends keyof Apariencia>(campo: K, valor: Apariencia[K]) { setBorrador({ ...actual, [campo]: valor }); setAviso(""); }
  async function subir(archivo?: File) {
    if (!archivo) return;
    try {
      if (!/^image\/(jpeg|png|webp)$/.test(archivo.type) || archivo.size > 5 * 1024 * 1024) throw new Error("Selecciona una imagen JPG, PNG o WebP de hasta 5 MB");
      const imagen = await archivoAImagenDataUrl(archivo, 1000, 0.75);
      if (imagen.length > 410000) throw new Error("La imagen es muy grande. Usa una más liviana");
      cambiar("imagen", imagen);
    } catch (e) { setAviso(e instanceof Error ? e.message : "No se pudo cargar la imagen"); }
  }
  async function confirmar(e: FormEvent) {
    e.preventDefault(); if (ocupado) return;
    const v = AparienciaEsquema.safeParse(actual);
    if (!v.success) { setAviso(v.error.issues[0].message); return; }
    setOcupado(true);
    try { await guardar(v.data); setBorrador(null); setAviso("Apariencia guardada para todos los dispositivos"); }
    catch (error) { setAviso(error instanceof Error ? error.message : "No se pudo guardar"); }
    finally { setOcupado(false); }
  }
  return <section className="mt-4 rounded-2xl border border-line bg-paper-raised p-4 md:p-5">
    <h2 className="font-display text-base font-semibold">Apariencia del negocio</h2>
    <p className="mt-1 text-sm text-ink-soft">Elige una paleta o ajusta los colores. Ves la vista previa mientras editas; guarda para compartirla.</p>
    <form onSubmit={confirmar} className="mt-4 space-y-4">
      <div className="flex flex-wrap gap-2">{paletas.map(p => <button key={p.nombre} type="button" onClick={() => { setBorrador({ ...actual, ...p.colores, imagen: actual.imagen, portada: actual.portada }); setAviso(""); }} className="flex items-center gap-2 rounded-full border border-line px-3 py-2 text-xs font-semibold"><span className="h-3 w-3 rounded-full" style={{ background: p.colores.acento }} />{p.nombre}</button>)}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(Object.keys(campos) as Array<keyof typeof campos>).map(c => <fieldset key={c} className="min-w-0"><legend className="mb-1 text-xs font-semibold">{campos[c]}</legend><div className="flex gap-2"><input type="color" aria-label={`Elegir ${campos[c]}`} value={/^#[a-fA-F0-9]{6}$/.test(actual[c]) ? actual[c] : APARIENCIA_INICIAL[c]} onChange={e => cambiar(c, e.target.value)} className="h-11 w-12 cursor-pointer rounded-lg border border-line" /><input aria-label={`Código de ${campos[c]}`} value={actual[c]} maxLength={7} onChange={e => cambiar(c, e.target.value)} className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 text-sm" /></div></fieldset>)}</div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">Fuente<select aria-label="Fuente" value={actual.fuente} onChange={e => cambiar("fuente", e.target.value as Apariencia["fuente"])} className="mt-1 block w-full rounded-xl border border-line bg-paper p-3"><option value="inter">Inter</option><option value="sistema">Sistema</option><option value="grotesk">Space Grotesk</option><option value="serif">Georgia</option></select></label><label className="text-xs font-semibold">Portada<select aria-label="Portada" value={actual.portada} onChange={e => { setAviso(""); setBorrador({ ...actual, portada: e.target.value as Apariencia["portada"], imagen: "" }); }} className="mt-1 block w-full rounded-xl border border-line bg-paper p-3"><option value="tienda">Comercio</option><option value="oficina">Oficina</option><option value="almacen">Almacén</option></select></label></div>
      <label className="block text-xs font-semibold">Imagen de portada propia<input aria-label="Imagen de portada" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { void subir(e.target.files?.[0]); e.target.value = ""; }} className="mt-2 block max-w-full text-xs" /></label>
      <img src={actual.imagen || `/portadas/${actual.portada}.svg`} alt="Vista previa de la portada" className="h-32 w-full rounded-xl object-cover sm:h-40" />
      <div className="flex flex-wrap gap-2"><Boton type="submit" ancho="auto" disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar apariencia"}</Boton><Boton type="button" ancho="auto" variante="fantasma" onClick={() => { setBorrador(null); setAviso(""); }}>Descartar cambios</Boton><button type="button" className="px-2 text-xs underline" onClick={() => setBorrador({ ...APARIENCIA_INICIAL })}>Restablecer vista previa</button></div>
      {aviso && <p role="status" className="text-sm text-ink-soft">{aviso}</p>}
    </form>
  </section>;
}
