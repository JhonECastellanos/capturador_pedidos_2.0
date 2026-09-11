import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BarraSuperior } from "../../components/BarraSuperior";
import { BarraInferior } from "../../components/BarraInferior";
import { Boton } from "../../components/Boton";
import { FilaCarrito } from "../../components/FilaCarrito";
import { IconPackage } from "../../components/Icons";
import { usePedido } from "../../context/PedidoContext";
import { formatoMoneda } from "../../utils/formato";

export default function Carrito() {
  const navegar = useNavigate();
  const { cliente, items, actualizarCantidad, quitarProducto, subtotal } =
    usePedido();

  useEffect(() => {
    if (!cliente) navegar("/cliente", { replace: true });
  }, [cliente, navegar]);

  if (!cliente) return null;

  return (
    <div className="flex h-full flex-col">
      <BarraSuperior
        titulo="Tu carrito"
        subtitulo={cliente.nombre}
        onVolver={() => navegar("/catalogo")}
        paso={{ actual: 3, total: 4 }}
      />

      {items.length === 0 ? (
        <main className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-paper-sunken text-ink-faint">
            <IconPackage width={26} height={26} />
          </div>
          <p className="mt-4 text-[15px] font-medium text-ink">
            Tu carrito esta vacio
          </p>
          <p className="mt-1 text-[13.5px] text-ink-soft">
            Agrega productos del catalogo para armar el pedido de{" "}
            {cliente.nombre}.
          </p>
          <Boton
            variante="secundario"
            ancho="auto"
            className="mt-5 px-6"
            onClick={() => navegar("/catalogo")}
          >
            Ir al catalogo
          </Boton>
        </main>
      ) : (
        <>
          <main className="no-scrollbar flex-1 overflow-y-auto px-5 py-4 md:px-6">
            <div className="rounded-xl border border-line bg-paper-raised px-4">
              <ul className="divide-y divide-line">
                {items.map((item) => (
                  <li key={item.producto.id}>
                    <FilaCarrito
                      item={item}
                      onCambiarCantidad={(cantidad) =>
                        actualizarCantidad(item.producto.id, cantidad)
                      }
                      onQuitar={() => quitarProducto(item.producto.id)}
                    />
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => navegar("/catalogo")}
              className="mt-3 w-full rounded-xl border border-dashed border-line py-3 text-center text-[13.5px] font-medium text-ink-soft active:bg-paper-sunken"
            >
              + Agregar mas productos
            </button>
          </main>

          <BarraInferior>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13.5px] text-ink-soft">
                Total del pedido
              </span>
              <span className="font-mono text-[18px] font-semibold text-ink">
                {formatoMoneda(subtotal)}
              </span>
            </div>
            <Boton variante="primario" onClick={() => navegar("/confirmacion")}>
              Continuar
            </Boton>
          </BarraInferior>
        </>
      )}
    </div>
  );
}
