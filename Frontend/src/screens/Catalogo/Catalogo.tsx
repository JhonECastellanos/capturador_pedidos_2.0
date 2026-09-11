import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarraSuperior } from "../../components/BarraSuperior";
import { BarraInferior } from "../../components/BarraInferior";
import { Boton } from "../../components/Boton";
import { TarjetaProducto } from "../../components/TarjetaProducto";
import { IconCart, IconSearch } from "../../components/Icons";
import { categorias, productos } from "../../data/productos";
import { usePedido } from "../../context/PedidoContext";
import { formatoMoneda } from "../../utils/formato";

export default function Catalogo() {
  const navegar = useNavigate();
  const { cliente, agregarProducto, actualizarCantidad, cantidadDe, totalItems, subtotal } =
    usePedido();
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState<(typeof categorias)[number]>("Todas");

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      const coincideCategoria = categoria === "Todas" || p.categoria === categoria;
      const coincideBusqueda = !q || p.nombre.toLowerCase().includes(q);
      return coincideCategoria && coincideBusqueda;
    });
  }, [busqueda, categoria]);

  return (
    <div className="flex h-full flex-col">
      <BarraSuperior
        titulo="Catalogo"
        subtitulo={cliente ? `Pedido para ${cliente.nombre}` : "Paso 2 de 4"}
        onVolver={() => navegar("/cliente")}
        paso={{ actual: 2, total: 4 }}
      />

      <div className="flex-shrink-0 space-y-3 px-5 pt-4 md:px-6">
        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-paper-raised px-3.5 py-2.5">
          <IconSearch width={18} height={18} className="text-ink-faint" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto"
            className="w-full bg-transparent text-[15px] text-ink placeholder:text-ink-faint focus:outline-none"
          />
        </div>

        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 md:-mx-6 md:px-6">
          {categorias.map((c) => (
            <button
              key={c}
              onClick={() => setCategoria(c)}
              className={`flex-shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                categoria === c
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-paper-raised text-ink-soft"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <main className="no-scrollbar flex-1 overflow-y-auto px-5 py-4 md:px-6">
        {resultados.length === 0 ? (
          <p className="mt-10 text-center text-[14px] text-ink-soft">
            No hay productos que coincidan con la busqueda.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {resultados.map((p) => (
              <li key={p.id}>
                <TarjetaProducto
                  producto={p}
                  cantidad={cantidadDe(p.id)}
                  onAgregar={() => agregarProducto(p)}
                  onCambiarCantidad={(cantidad) => actualizarCantidad(p.id, cantidad)}
                />
              </li>
            ))}
          </ul>
        )}
      </main>

      <BarraInferior>
        <Boton
          variante="primario"
          disabled={totalItems === 0}
          onClick={() => navegar("/carrito")}
          icono={<IconCart width={18} height={18} />}
        >
          {totalItems === 0
            ? "Agrega productos para continuar"
            : `Ver carrito \u00b7 ${totalItems} items \u00b7 ${formatoMoneda(subtotal)}`}
        </Boton>
      </BarraInferior>
    </div>
  );
}
