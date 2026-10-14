import { Link } from "react-router-dom";
import { useAuth } from "../../../context/auth";
import { ConteosCompartidos } from "../components/ConteosCompartidos";

export default function ConteoColaborador() {
  const { usuario, cerrarSesion } = useAuth();
  return <main className="flex min-h-full flex-col gap-4 p-4">
    <header className="flex items-center justify-between gap-2"><div><h1 className="text-lg font-semibold">{usuario?.rol === "vendedor" ? "Conteo diario" : "Conteo de inventario"}</h1><p className="text-sm text-ink-soft">{usuario?.nombre}</p></div><button type="button" onClick={() => void cerrarSesion()} className="min-h-11 px-3 text-sm font-semibold text-teal">Salir</button></header>
    {usuario?.rol === "vendedor" && <Link to="/vendedor" className="min-h-9 text-sm text-teal">← Volver a ventas</Link>}
    <ConteosCompartidos />
  </main>;
}
