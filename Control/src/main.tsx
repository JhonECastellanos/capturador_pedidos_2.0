import { lazy, StrictMode, Suspense, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { consultas } from "../../Frontend/src/data/query";
import { AuthProvider } from "../../Frontend/src/context/AuthContext";
import { AparienciaProvider } from "../../Frontend/src/context/AparienciaProvider";
import { AccesoComercialProvider } from "../../Frontend/src/context/AccesoComercialProvider";
import { RutaProtegida } from "../../Frontend/src/components/RutaProtegida";
import Acceso from "../../Frontend/src/screens/Acceso/Acceso";
import { RobotAsistente } from "../../Frontend/src/modules/agentes/RobotAsistente";
import "../../Frontend/src/index.css";

const Operador = lazy(() => import("../../Frontend/src/modules/workflows/Operador"));
function AbiOperador() {
  const [abierto, setAbierto] = useState(false);
  const robot = useRef<HTMLButtonElement | null>(null);
  return <RobotAsistente abierto={abierto} escuchando={false} hablando={false} ocupado={false} robotRef={robot} ancho={280} alternar={() => setAbierto(p => !p)} apagar={() => setAbierto(false)} cerrarBurbuja={() => setAbierto(false)} etiqueta="ABI, guía del operador" instrucciones="Toca para ver la guía · dos toques para cerrar · arrastra para mover">
    <div className="abi-nota-operador"><strong>ABI · Panel de mando</strong><p>Administra planes, créditos y workflows desde las opciones del panel.</p><p>Esta guía es visual. No captura audio ni envía mensajes.</p><button type="button" onClick={() => setAbierto(false)}>Cerrar guía</button></div>
  </RobotAsistente>;
}
function Control() {
  return <div className="app-viewport-outer"><div className="app-viewport app-viewport--amplio"><Suspense fallback={<p role="status" className="p-5">Cargando panel de mando…</p>}><Routes>
    <Route path="/operador/acceso" element={<Acceso operador />} />
    <Route path="/operador" element={<RutaProtegida roles={["administrador"]} soloSistema><Operador /></RutaProtegida>} />
    <Route path="*" element={<Navigate to="/operador" replace />} />
  </Routes></Suspense><AbiOperador /></div></div>;
}
// Entrada propia: solo reutiliza el personaje visual; no monta el agente del cliente.
createRoot(document.getElementById("root")!).render(<StrictMode><BrowserRouter><QueryClientProvider client={consultas}><AparienciaProvider><AuthProvider><AccesoComercialProvider><Control /></AccesoComercialProvider></AuthProvider></AparienciaProvider></QueryClientProvider></BrowserRouter></StrictMode>);
