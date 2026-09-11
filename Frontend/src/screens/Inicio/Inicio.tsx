import { useNavigate } from "react-router-dom";
import { IconChevronRight, IconClipboard, IconPackage } from "../../components/Icons";
import { formatoMoneda } from "../../utils/formato";

const resumenHoy = [
  { etiqueta: "Pedidos", valor: "5" },
  { etiqueta: "Unidades", valor: "142" },
  { etiqueta: "Total", valor: formatoMoneda(1240000) },
];

const pedidosRecientes = [
  { cliente: "Distribuidora El Roble", items: 8, total: 312000, hora: "10:42 a.m." },
  { cliente: "Super Mercar La 80", items: 4, total: 96500, hora: "9:15 a.m." },
  { cliente: "Tienda Dona Pola", items: 2, total: 38200, hora: "8:50 a.m." },
];

export default function Inicio() {
  const navegar = useNavigate();

  return (
    <div className="flex h-full flex-col">
      <header className="flex-shrink-0 bg-ink px-5 pb-7 pt-[max(1.25rem,env(safe-area-inset-top))] text-white md:px-6">
        <p className="text-[13px] text-white/60">Martes, 8 de septiembre</p>
        <h1 className="mt-1 font-display text-2xl font-semibold">
          Buenos dias, Laura
        </h1>
      </header>

      <main className="no-scrollbar flex-1 overflow-y-auto px-5 pb-8 md:px-6">
        <button
          onClick={() => navegar("/cliente")}
          className="-mt-4 flex w-full items-center gap-4 rounded-2xl bg-paper-raised p-5 text-left shadow-[0_12px_28px_-16px_rgba(31,42,60,0.35)] active:scale-[0.99]"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-dark">
            <IconPackage width={24} height={24} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[17px] font-semibold text-ink">
              Nuevo pedido
            </p>
            <p className="text-[13px] text-ink-soft">
              Selecciona un cliente para comenzar
            </p>
          </div>
          <IconChevronRight
            width={20}
            height={20}
            className="flex-shrink-0 text-ink-faint"
          />
        </button>

        <section className="mt-7">
          <h2 className="font-display text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
            Resumen de hoy
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-2.5">
            {resumenHoy.map((r) => (
              <div
                key={r.etiqueta}
                className="rounded-xl border border-line bg-paper-raised px-3 py-3"
              >
                <p className="font-mono text-[15px] font-semibold text-ink">
                  {r.valor}
                </p>
                <p className="mt-0.5 text-[12px] text-ink-soft">
                  {r.etiqueta}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-7">
          <h2 className="font-display text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
            Pedidos recientes
          </h2>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper-raised">
            {pedidosRecientes.map((p) => (
              <li key={p.cliente} className="flex items-center gap-3 px-4 py-3.5">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal-soft text-teal">
                  <IconClipboard width={17} height={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-ink">
                    {p.cliente}
                  </p>
                  <p className="text-[12.5px] text-ink-soft">
                    {p.items} items &middot; {p.hora}
                  </p>
                </div>
                <p className="flex-shrink-0 font-mono text-[13.5px] font-semibold text-ink">
                  {formatoMoneda(p.total)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
