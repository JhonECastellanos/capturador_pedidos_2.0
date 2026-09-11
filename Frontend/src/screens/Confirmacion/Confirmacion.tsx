import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BarraSuperior } from "../../components/BarraSuperior";
import { BarraInferior } from "../../components/BarraInferior";
import { Boton } from "../../components/Boton";
import { IconMapPin, IconPhone } from "../../components/Icons";
import { usePedido } from "../../context/PedidoContext";
import { formatoMoneda } from "../../utils/formato";
import type { Pedido } from "../../types";

function generarNumeroPedido(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `PED-${n}`;
}

export default function Confirmacion() {
  const navegar = useNavigate();
  const { cliente, items, subtotal } = usePedido();

  useEffect(() => {
    if (!cliente || items.length === 0) navegar("/cliente", { replace: true });
  }, [cliente, items.length, navegar]);

  if (!cliente || items.length === 0) return null;

  function confirmarPedido() {
    const pedido: Pedido = {
      numero: generarNumeroPedido(),
      cliente: cliente!,
      items,
      total: subtotal,
      fecha: new Date().toLocaleString("es-CO", {
        dateStyle: "long",
        timeStyle: "short",
      }),
    };
    navegar("/pedido-exitoso", { state: { pedido } });
  }

  return (
    <div className="flex h-full flex-col">
      <BarraSuperior
        titulo="Confirmar pedido"
        subtitulo="Paso 4 de 4"
        onVolver={() => navegar("/carrito")}
        paso={{ actual: 4, total: 4 }}
      />

      <main className="no-scrollbar flex-1 overflow-y-auto px-5 py-4 md:px-6">
        <section className="rounded-xl border border-line bg-paper-raised p-4">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
            Cliente
          </p>
          <p className="mt-1 font-display text-[16px] font-semibold text-ink">
            {cliente.nombre}
          </p>
          <p className="text-[13px] text-ink-soft">{cliente.identificacion}</p>
          <div className="mt-2.5 space-y-1 text-[13px] text-ink-soft">
            <p className="flex items-center gap-1.5">
              <IconMapPin width={14} height={14} className="flex-shrink-0" />
              {cliente.direccion}, {cliente.ciudad}
            </p>
            <p className="flex items-center gap-1.5">
              <IconPhone width={14} height={14} className="flex-shrink-0" />
              {cliente.telefono}
            </p>
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-line bg-paper-raised p-4">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
            Productos &middot; {items.length}
          </p>
          <ul className="mt-2.5 divide-y divide-line">
            {items.map((item) => (
              <li
                key={item.producto.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] text-ink">
                    {item.producto.nombre}
                  </p>
                  <p className="font-mono text-[12px] text-ink-faint">
                    {item.cantidad} x {formatoMoneda(item.producto.precio)}
                  </p>
                </div>
                <p className="flex-shrink-0 font-mono text-[13.5px] font-semibold text-ink">
                  {formatoMoneda(item.cantidad * item.producto.precio)}
                </p>
              </li>
            ))}
          </ul>

          <div className="ticket-edge -mx-4 my-3" />

          <div className="flex items-center justify-between">
            <span className="font-display text-[15px] font-semibold text-ink">
              Total
            </span>
            <span className="font-mono text-[19px] font-semibold text-ink">
              {formatoMoneda(subtotal)}
            </span>
          </div>
        </section>
      </main>

      <BarraInferior>
        <Boton variante="primario" onClick={confirmarPedido}>
          Confirmar pedido
        </Boton>
      </BarraInferior>
    </div>
  );
}
