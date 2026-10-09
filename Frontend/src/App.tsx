import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthProvider } from "./context/AuthContext";
import { OperacionesProvider } from "./context/OperacionesContext";
import { RutaProtegida } from "./components/RutaProtegida";

import Acceso from "./screens/Acceso/Acceso";
import NoEncontrado from "./screens/NoEncontrado/NoEncontrado";
import CrearCliente from "./screens/ClientesPedido/CrearCliente";
import { AdminLayout } from "./modules/administracion/AdminLayout";
import {
  AdminVentas,
  AdminVentasAbonos,
  AdminVentasClienteNuevo,
  AdminVentasCompletado,
  AdminVentasPedido,
  AdminVentasPedidoDetalle,
  VendedorAbonos,
  VendedorInicio,
  VendedorPedido,
  VendedorPedidoCompletado,
  VendedorPedidoDetalle,
} from "./modules/ventas/screens/RutasVentas";

const InventarioAdmin = lazy(() => import("./modules/inventario/screens/InventarioAdmin").then((m) => ({ default: m.InventarioAdmin })));
const PedidosAdmin = lazy(() => import("./modules/pedidos/screens/PedidosAdmin").then((m) => ({ default: m.PedidosAdmin })));
const CreditosAdmin = lazy(() => import("./modules/creditos/screens/CreditosAdmin").then((m) => ({ default: m.CreditosAdmin })));
const CajaAdmin = lazy(() => import("./modules/caja/screens/CajaAdmin").then((m) => ({ default: m.CajaAdmin })));
const CierreAdmin = lazy(() => import("./modules/caja/screens/CierreAdmin").then((m) => ({ default: m.CierreAdmin })));
const UsuariosAdmin = lazy(() => import("./modules/usuarios/screens/UsuariosAdmin").then((m) => ({ default: m.UsuariosAdmin })));
const ComprasAdmin = lazy(() => import("./modules/compras/screens/ComprasAdmin").then((m) => ({ default: m.ComprasAdmin })));
const PreciosAdmin = lazy(() => import("./modules/precios/screens/PreciosAdmin").then((m) => ({ default: m.PreciosAdmin })));
const Auditoria = lazy(() => import("./modules/administracion/screens/Auditoria").then((m) => ({ default: m.Auditoria })));
const Resumen = lazy(() => import("./modules/administracion/screens/Resumen").then((m) => ({ default: m.Resumen })));
const Configuracion = lazy(() => import("./modules/configuracion/Configuracion").then((m) => ({ default: m.Configuracion })));

/** Aplicación: decide si la vista usa el marco móvil o el marco amplio del admin. */
function Contenido() {
  const location = useLocation();
  const esAdmin = location.pathname.startsWith("/admin") || location.pathname === "/administracion";
  return (
    <div className="app-viewport-outer">
      <div className={`app-viewport ${esAdmin ? "app-viewport--amplio" : ""}`}>
        <Suspense fallback={<p role="status" className="p-6 text-ink-soft">Cargando pantalla…</p>}><Routes>
          <Route path="/" element={<Acceso />} />

          {/* ─── Flujo del vendedor (app móvil) ─── */}
          <Route path="/vendedor" element={<RutaProtegida roles={["vendedor"]}><VendedorInicio /></RutaProtegida>} />
          <Route path="/vendedor/pedido" element={<RutaProtegida roles={["vendedor"]}><VendedorPedido /></RutaProtegida>} />
          <Route path="/vendedor/pedido/completado" element={<RutaProtegida roles={["vendedor"]}><VendedorPedidoCompletado /></RutaProtegida>} />
          <Route path="/vendedor/pedido/:pedidoId" element={<RutaProtegida roles={["vendedor"]}><VendedorPedidoDetalle /></RutaProtegida>} />
          <Route path="/vendedor/abonos" element={<RutaProtegida roles={["vendedor"]}><VendedorAbonos /></RutaProtegida>} />
          <Route path="/vendedor/clientes/nuevo" element={<RutaProtegida roles={["vendedor"]}><CrearCliente /></RutaProtegida>} />

          {/* ─── Panel administrativo (rutas anidadas) ─── */}
          <Route path="/admin" element={<RutaProtegida roles={["administrador"]}><AdminLayout /></RutaProtegida>}>
            <Route index element={<Resumen />} />
            <Route path="ventas" element={<AdminVentas />} />
            <Route path="ventas/pedido" element={<AdminVentasPedido />} />
            <Route path="ventas/pedido/:pedidoId" element={<AdminVentasPedidoDetalle />} />
            <Route path="ventas/abonos" element={<AdminVentasAbonos />} />
            <Route path="ventas/completado" element={<AdminVentasCompletado />} />
            <Route path="ventas/clientes/nuevo" element={<AdminVentasClienteNuevo />} />
            <Route path="pedidos" element={<PedidosAdmin />} />
            <Route path="creditos" element={<CreditosAdmin />} />
            <Route path="inventario" element={<InventarioAdmin />} />
            <Route path="compras" element={<ComprasAdmin />} />
            <Route path="precios" element={<PreciosAdmin />} />
            <Route path="caja" element={<CajaAdmin />} />
            <Route path="cierre" element={<CierreAdmin />} />
            <Route path="usuarios" element={<UsuariosAdmin />} />
            <Route path="auditoria" element={<Auditoria />} />
            <Route path="configuracion" element={<Configuracion />} />
          </Route>

          {/* ─── Redirecciones de rutas antiguas ─── */}
          <Route path="/administracion" element={<Navigate to="/admin" replace />} />
          <Route path="/modulos/vendedor" element={<Navigate to="/vendedor" replace />} />
          <Route path="/modulos/clientes/nuevo" element={<Navigate to="/vendedor/clientes/nuevo" replace />} />
          <Route path="/modulos/pedido-rapido" element={<Navigate to="/vendedor/pedido" replace />} />
          <Route path="/modulos/pedido-completado" element={<Navigate to="/vendedor/pedido/completado" replace />} />

          <Route path="*" element={<NoEncontrado />} />
        </Routes></Suspense>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <OperacionesProvider>
        <Contenido />
      </OperacionesProvider>
    </AuthProvider>
  );
}
