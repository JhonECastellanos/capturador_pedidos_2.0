import { useAuth } from "../../../context/auth";
import { ConteosCompartidos } from "../components/ConteosCompartidos";

export default function ConteoColaborador() {
  const { usuario, cerrarSesion } = useAuth();
  return <main className="flex min-h-full flex-col gap-4 p-4">
    <header className="flex items-center justify-between gap-2"><div><h1 className="text-lg font-semibold">Conteo de inventario</h1><p className="text-sm text-ink-soft">{usuario?.nombre}</p></div><button type="button" onClick={() => void cerrarSesion()} className="min-h-11 px-3 text-sm font-semibold text-teal">Salir</button></header>
    <ConteosCompartidos />
  </main>;
}
