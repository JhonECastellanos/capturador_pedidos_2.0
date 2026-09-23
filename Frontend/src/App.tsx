import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { OperacionesProvider } from "./context/OperacionesContext";
import { RutaProtegida } from "./components/RutaProtegida";
import Acceso from "./screens/Acceso/Acceso";
import NoEncontrado from "./screens/NoEncontrado/NoEncontrado";
import VendedorInicio from "./screens/ClientesPedido/VendedorInicio";
import CrearCliente from "./screens/ClientesPedido/CrearCliente";
import { AdminLayout } from "./modules/administracion/AdminLayout";
import { Resumen } from "./modules/administracion/screens/Resumen";
import { PedidosAdmin } from "./modules/pedidos/screens/PedidosAdmin";
import { CreditosAdmin } from "./modules/creditos/screens/CreditosAdmin";
import { InventarioAdmin } from "./modules/inventario/screens/InventarioAdmin";
import { CajaAdmin } from "./modules/caja/screens/CajaAdmin";
import { CierreAdmin } from "./modules/caja/screens/CierreAdmin";
import { UsuariosAdmin } from "./modules/usuarios/screens/UsuariosAdmin";
import { ComprasAdmin } from "./modules/compras/screens/ComprasAdmin";
import { PreciosAdmin } from "./modules/precios/screens/PreciosAdmin";
import {
  AdminVentas,
  AdminVentasClienteNuevo,
  AdminVentasCompletado,
  VendedorAbonos,
  VendedorPedido,
  VendedorPedidoCompletado,
  VendedorPedidoDetalle,
} from "./modules/ventas/screens/RutasVentas";

/** Aplicación: decide si la vista usa el marco móvil o el marco amplio del admin. */
function Contenido() {
  const location = useLocation();
  const esAdmin = location.pathname.startsWith("/admin") || location.pathname === "/administracion";
  return (
    <div className="app-viewport-outer">
      <div className={`app-viewport ${esAdmin ? "app-viewport--amplio" : ""}`}>
        <Routes>
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
          </Route>

          {/* ─── Redirecciones de rutas antiguas ─── */}
          <Route path="/administracion" element={<Navigate to="/admin" replace />} />
          <Route path="/modulos/vendedor" element={<Navigate to="/vendedor" replace />} />
          <Route path="/modulos/clientes/nuevo" element={<Navigate to="/vendedor/clientes/nuevo" replace />} />
          <Route path="/modulos/pedido-rapido" element={<Navigate to="/vendedor/pedido" replace />} />
          <Route path="/modulos/pedido-completado" element={<Navigate to="/vendedor/pedido/completado" replace />} />

          <Route path="*" element={<NoEncontrado />} />
        </Routes>
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
