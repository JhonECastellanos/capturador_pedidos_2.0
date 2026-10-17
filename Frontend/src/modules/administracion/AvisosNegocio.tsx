import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Envelope } from "@abinova/contrato";
import { useAuth } from "../../context/auth";
import { useAccesoComercial } from "../../context/acceso-comercial-context";
import { respuestaRed } from "../../data/api";
import { claveConsulta } from "../../data/query";
import { mostrarAviso, silenciarAvisos, type AvisoNegocio } from "./notificaciones";
export function AvisosNegocio() {
  const { usuario } = useAuth();
  const { tieneModulo } = useAccesoComercial();
  const [aviso, setAviso] = useState<AvisoNegocio | null>(null);
  const vistos = useRef(new Set<string>()), primera = useRef(true);
  const habilitado = !!usuario && tieneModulo("notificaciones") && !usuario.permisosDenegados?.includes("notificaciones");
  useEffect(() => () => silenciarAvisos(), []);
  useEffect(() => { if (!aviso) return; const timer = window.setTimeout(() => setAviso(null), 9000); return () => window.clearTimeout(timer); }, [aviso]);
  const consulta = useQuery({ queryKey: claveConsulta("/notificaciones?recientes=true"), enabled: habilitado, refetchInterval: 5000, refetchIntervalInBackground: true, queryFn: ({ signal }) => respuestaRed<Envelope<AvisoNegocio[]>>("/notificaciones?recientes=true", "GET", undefined, signal) });
  useEffect(() => {
    const filas = consulta.data?.data; if (!habilitado || !filas) return;
    const nuevas = filas.filter(n => !vistos.current.has(n.id));
    vistos.current = new Set(filas.map(n => n.id));
    if (primera.current) { primera.current = false; return; }
    if (nuevas.length) {
      const n = nuevas[0]; setAviso(n);
      if (localStorage.getItem(`abinova:ui:avisos:${usuario!.id}`) === "true" && "Notification" in window) void mostrarAviso(n).catch(() => {});
    }
  }, [consulta.data, usuario, habilitado]);
  if (!habilitado || !aviso) return null;
  return <aside role="status" aria-label="Nuevo aviso" className="fixed left-2 right-2 top-2 z-50 mx-auto flex max-w-md items-center gap-2 rounded-xl border border-line bg-paper-raised p-3 text-sm shadow-lg"><Link to={aviso.ruta} onClick={() => setAviso(null)} className="flex-1 font-semibold">{aviso.titulo}</Link><button type="button" aria-label="Cerrar aviso" onClick={() => setAviso(null)} className="min-h-11 min-w-11">×</button></aside>;
}
