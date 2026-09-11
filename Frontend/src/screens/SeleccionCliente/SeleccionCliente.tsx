import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarraSuperior } from "../../components/BarraSuperior";
import { IconChevronRight, IconMapPin, IconSearch } from "../../components/Icons";
import { clientes } from "../../data/clientes";
import { usePedido } from "../../context/PedidoContext";
import { formatoMoneda } from "../../utils/formato";
import type { Cliente } from "../../types";

export default function SeleccionCliente() {
  const navegar = useNavigate();
  const { seleccionarCliente } = usePedido();
  const [busqueda, setBusqueda] = useState("");

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        c.ciudad.toLowerCase().includes(q),
    );
  }, [busqueda]);

  function elegir(cliente: Cliente) {
    seleccionarCliente(cliente);
    navegar("/catalogo");
  }

  return (
    <div className="flex h-full flex-col">
      <BarraSuperior
        titulo="Selecciona un cliente"
        subtitulo="Paso 1 de 4"
        onVolver={() => navegar("/")}
        paso={{ actual: 1, total: 4 }}
      />

      <div className="flex-shrink-0 px-5 pt-4 md:px-6">
        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-paper-raised px-3.5 py-2.5">
          <IconSearch width={18} height={18} className="text-ink-faint" />
          <input
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o ciudad"
            className="w-full bg-transparent text-[15px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </div>
      </div>

      <main className="no-scrollbar flex-1 overflow-y-auto px-5 py-4 md:px-6">
        {resultados.length === 0 ? (
          <p className="mt-10 text-center text-[14px] text-ink-soft">
            No hay clientes que coincidan con &ldquo;{busqueda}&rdquo;.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {resultados.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => elegir(c)}
                  className="flex w-full items-center gap-3 rounded-xl border border-line bg-paper-raised p-3.5 text-left active:bg-paper-sunken"
                >
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-ink font-display text-[13px] font-semibold text-white">
                    {c.iniciales}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-medium text-ink">
                      {c.nombre}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 truncate text-[12.5px] text-ink-soft">
                      <IconMapPin width={13} height={13} className="flex-shrink-0" />
                      {c.ciudad} &middot; Cupo {formatoMoneda(c.cupoDisponible)}
                    </p>
                  </div>
                  <IconChevronRight
                    width={18}
                    height={18}
                    className="flex-shrink-0 text-ink-faint"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
