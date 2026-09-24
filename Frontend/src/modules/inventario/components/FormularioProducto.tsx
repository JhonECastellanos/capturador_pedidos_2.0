import { useState, type FormEvent } from "react";
import { Boton } from "../../../components/Boton";
import { categorias } from "../../../data/semilla";
import type { NuevoProducto } from "../../../types";

interface FormularioProductoProps {
  alGuardar: (datos: NuevoProducto, archivo: File | null) => void;
  alCancelar: () => void;
}

const campo = "rounded-lg border border-line bg-paper-raised px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none";

const ESTADO_INICIAL = {
  nombre: "",
  categoria: "Abarrotes",
  precioVenta: "",
  costoActual: "",
  unidad: "unidad",
  stock: "",
  stockMinimo: "20",
};

/** Alta completa de producto, compartida por el inventario del administrador. */
export function FormularioProducto({ alGuardar, alCancelar }: FormularioProductoProps) {
  const [producto, setProducto] = useState(ESTADO_INICIAL);
  const [archivo, setArchivo] = useState<File | null>(null);

  function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    alGuardar(
      {
        nombre: producto.nombre,
        categoria: producto.categoria,
        unidad: producto.unidad,
        precioVenta: Number(producto.precioVenta),
        costoActual: Number(producto.costoActual || 0),
        stock: Number(producto.stock),
        stockMinimo: Number(producto.stockMinimo || 0),
      },
      archivo,
    );
    setProducto(ESTADO_INICIAL);
    setArchivo(null);
  }

  return (
    <form onSubmit={guardar} className="rounded-2xl border border-line bg-paper-raised p-4 max-w-lg">
      <div className="flex items-center justify-between border-b border-line pb-2.5">
        <p className="font-display text-[15px] font-semibold text-ink">Nuevo producto</p>
        <button type="button" onClick={alCancelar} className="text-[12px] font-semibold text-ink-soft">Cancelar</button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <input required value={producto.nombre} onChange={(evento) => setProducto((actual) => ({ ...actual, nombre: evento.target.value }))} placeholder="Nombre del producto" className={`${campo} col-span-2`} autoFocus />
        <input required type="number" min="0" value={producto.precioVenta} onChange={(evento) => setProducto((actual) => ({ ...actual, precioVenta: evento.target.value }))} placeholder="Precio venta ($)" className={campo} />
        <input type="number" min="0" value={producto.costoActual} onChange={(evento) => setProducto((actual) => ({ ...actual, costoActual: evento.target.value }))} placeholder="Costo compra ($)" className={campo} />
        <input required type="number" min="0" value={producto.stock} onChange={(evento) => setProducto((actual) => ({ ...actual, stock: evento.target.value }))} placeholder="Stock inicial" className={campo} />
        <input type="number" min="0" value={producto.stockMinimo} onChange={(evento) => setProducto((actual) => ({ ...actual, stockMinimo: evento.target.value }))} placeholder="Stock mínimo alerta" className={campo} />
        <input list="categorias-inventario" value={producto.categoria} onChange={(evento) => setProducto((actual) => ({ ...actual, categoria: evento.target.value }))} placeholder="Categoría" className={campo} />
        <datalist id="categorias-inventario">
          {categorias.map((categoria) => (
            <option key={categoria} value={categoria} />
          ))}
        </datalist>
        <input value={producto.unidad} onChange={(evento) => setProducto((actual) => ({ ...actual, unidad: evento.target.value }))} placeholder="Unidad (ej. unidad, pack)" className={campo} />
      </div>
      <label className="mt-3 flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-line px-3 py-2.5 text-[12px] text-ink-soft bg-paper">
        Foto directa / subir imagen
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(evento) => setArchivo(evento.target.files?.[0] ?? null)} />
        <span className="font-semibold text-ink">{archivo?.name ?? "Seleccionar foto"}</span>
      </label>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={alCancelar} className="rounded-xl border border-line bg-paper py-3 text-[13px] font-semibold text-ink">Volver</button>
        <Boton type="submit">Guardar producto</Boton>
      </div>
    </form>
  );
}
