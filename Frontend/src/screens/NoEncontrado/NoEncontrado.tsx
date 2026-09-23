import { useNavigate } from "react-router-dom";
import { Boton } from "../../components/Boton";
import { IconPackage } from "../../components/Icons";

export default function NoEncontrado() {
  const navegar = useNavigate();
  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-paper px-6 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-accent">
        <IconPackage width={28} height={28} />
      </div>
      <h1 className="mt-5 font-display text-[22px] font-semibold text-ink">Página no encontrada</h1>
      <p className="mt-2 max-w-xs text-[13.5px] leading-relaxed text-ink-soft">
        La dirección que buscas no existe o fue movida. Vuelve al inicio para continuar.
      </p>
      <div className="mt-6 w-full max-w-xs">
        <Boton onClick={() => navegar("/")}>Volver al inicio</Boton>
      </div>
    </div>
  );
}
