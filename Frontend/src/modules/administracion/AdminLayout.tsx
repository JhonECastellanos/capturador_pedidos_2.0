import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  IconCart,
  IconCash,
  IconChartBar,
  IconClipboard,
  IconHome,
  IconLock,
  IconPackage,
  IconTag,
  IconTruck,
  IconUser,
} from "../../components/Icons";
import { useAuth } from "../../context/auth";
import { useEffect, useRef, type ComponentType } from "react";

interface ItemNavegacion {
  to: string;
  etiqueta: string;
  icono: ComponentType<{ width?: number | string; height?: number | string; className?: string }>;
  fin?: boolean;
}

const navegacionPrincipal: ItemNavegacion[] = [
  { to: "/admin", etiqueta: "Inicio", icono: IconHome, fin: true },
  { to: "/admin/ventas", etiqueta: "Ventas", icono: IconCart },
  { to: "/admin/pedidos", etiqueta: "Pedidos", icono: IconClipboard },
  { to: "/admin/creditos", etiqueta: "Créditos", icono: IconChartBar },
  { to: "/admin/inventario", etiqueta: "Inventario", icono: IconPackage },
  { to: "/admin/compras", etiqueta: "Compras", icono: IconTruck },
  { to: "/admin/precios", etiqueta: "Precios", icono: IconTag },
  { to: "/admin/caja", etiqueta: "Caja", icono: IconCash },
  { to: "/admin/cierre", etiqueta: "Cierre", icono: IconLock },
  { to: "/admin/usuarios", etiqueta: "Usuarios", icono: IconUser },
];

const navegacionSecundaria: ItemNavegacion[] = [];

const todosLosItems = [...navegacionPrincipal, ...navegacionSecundaria];

function claseItemNav({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-colors ${
    isActive ? "bg-accent text-ink" : "text-white/70 active:bg-white/10"
  }`;
}

export function AdminLayout() {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const { usuario, cerrarSesion } = useAuth();
  const contenedorNav = useRef<HTMLElement | null>(null);
  const refsItems = useRef<Record<string, HTMLAnchorElement | null>>({});

  function salir() {
    cerrarSesion();
    navegar("/");
  }

  // Al seleccionar un panel, centra suavemente la opción en el header
  // (solo al hacer click/selección, no al hacer scroll libre).
  useEffect(() => {
    const activo = refsItems.current[ubicacion.pathname];
    if (activo && contenedorNav.current) {
      activo.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [ubicacion.pathname]);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* ─── Sidebar desktop ─── */}
      <aside className="hidden w-60 flex-shrink-0 flex-col bg-ink px-4 py-5 text-white lg:flex">
        <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Administrador</p>
        <h1 className="px-2 font-display text-[18px] font-semibold leading-tight">Centro de control</h1>
        <p className="mt-1 px-2 truncate text-[11px] text-white/60">{usuario?.nombre}</p>
        <nav className="mt-5 flex-1 space-y-1">
          {todosLosItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.fin} className={claseItemNav}>
              <item.icono width={18} height={18} />
              {item.etiqueta}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={salir}
            className="w-full rounded-lg border border-white/20 px-3 py-2 text-[12px] font-semibold text-white/80 active:bg-white/10"
          >
            Salir
          </button>
        </div>
      </aside>

      {/* ─── Header móvil compacto + navegación arriba ─── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex-shrink-0 bg-ink px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white lg:hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] leading-none text-accent">Administrador · Centro de control</p>
              <p className="mt-1 truncate text-[11px] leading-none text-white/60">{usuario?.nombre ?? "Perfil administrador"}</p>
            </div>
            <button type="button" onClick={salir} className="flex-shrink-0 rounded-lg border border-white/20 px-3 py-2 text-[11px] font-semibold text-white/80 active:bg-white/10">
              Salir
            </button>
          </div>
          {/* Navegación siempre visible en el header */}
          <nav ref={contenedorNav} className="no-scrollbar -mx-4 mt-3 flex gap-1.5 overflow-x-auto scroll-smooth px-4 pb-1">
            {todosLosItems.map((item) => (
              <NavLink
                key={item.to}
                ref={(el) => { refsItems.current[item.to] = el; }}
                to={item.to}
                end={item.fin}
                className={({ isActive }) =>
                  `flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition-all duration-300 ${isActive ? "scale-105 border-accent bg-accent text-ink shadow-[0_0_0_3px_rgba(232,143,42,0.25)]" : "border-white/15 bg-white/10 text-white/80"}`
                }
              >
                <item.icono width={14} height={14} />
                {item.etiqueta}
              </NavLink>
            ))}
          </nav>
        </header>

        {/* ─── Contenido ─── */}
        <main className="flex flex-1 flex-col min-h-0 overflow-hidden px-4 pb-3 pt-3 md:px-6 lg:px-8 lg:pt-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
