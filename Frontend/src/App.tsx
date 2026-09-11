import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { PedidoProvider } from "./context/PedidoContext";
import { OperacionesProvider } from "./context/OperacionesContext";
import { RutaProtegida } from "./components/RutaProtegida";
import Acceso from "./screens/Acceso/Acceso";
import Administracion from "./screens/Administracion/Administracion";
import SeleccionCliente from "./screens/SeleccionCliente/SeleccionCliente";
import Catalogo from "./screens/Catalogo/Catalogo";
import Carrito from "./screens/Carrito/Carrito";
import Confirmacion from "./screens/Confirmacion/Confirmacion";
import PedidoExitoso from "./screens/PedidoExitoso/PedidoExitoso";
import VendedorInicio from "./screens/ClientesPedido/VendedorInicio";
import CrearCliente from "./screens/ClientesPedido/CrearCliente";
import PedidoRapido from "./screens/ClientesPedido/PedidoRapido";
import PedidoCompletado from "./screens/ClientesPedido/PedidoCompletado";

export default function App() {
  return (
    <AuthProvider>
      <PedidoProvider>
        <OperacionesProvider>
          <div className="app-viewport-outer">
            <div className="app-viewport">
              <Routes>
                <Route path="/" element={<Acceso />} />
                <Route path="/vendedor" element={<RutaProtegida roles={["vendedor"]}><VendedorInicio /></RutaProtegida>} />
                <Route path="/administracion" element={<RutaProtegida roles={["administrador"]}><Administracion /></RutaProtegida>} />
                <Route path="/cliente" element={<RutaProtegida roles={["vendedor"]}><SeleccionCliente /></RutaProtegida>} />
                <Route path="/catalogo" element={<RutaProtegida roles={["vendedor"]}><Catalogo /></RutaProtegida>} />
                <Route path="/carrito" element={<RutaProtegida roles={["vendedor"]}><Carrito /></RutaProtegida>} />
                <Route path="/confirmacion" element={<RutaProtegida roles={["vendedor"]}><Confirmacion /></RutaProtegida>} />
                <Route path="/pedido-exitoso" element={<RutaProtegida roles={["vendedor"]}><PedidoExitoso /></RutaProtegida>} />
                <Route path="/modulos/vendedor" element={<RutaProtegida roles={["vendedor"]}><VendedorInicio /></RutaProtegida>} />
                <Route path="/modulos/clientes/nuevo" element={<RutaProtegida roles={["vendedor"]}><CrearCliente /></RutaProtegida>} />
                <Route path="/modulos/pedido-rapido" element={<RutaProtegida roles={["vendedor"]}><PedidoRapido /></RutaProtegida>} />
                <Route path="/modulos/pedido-completado" element={<RutaProtegida roles={["vendedor"]}><PedidoCompletado /></RutaProtegida>} />
              </Routes>
            </div>
          </div>
        </OperacionesProvider>
      </PedidoProvider>
    </AuthProvider>
  );
}
