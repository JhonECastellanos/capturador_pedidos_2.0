import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { Prisma, RolUsuario, Usuario } from "@prisma/client";
import { ConfiguracionAgenteEsquema, ConfiguracionAgenteInicial, problemaConexionAgente, InstruccionAgenteEsquema, type ContextoAgente, type ConfiguracionAgente, type ConfiguracionAgentePublica, type InstruccionAgente, type RevisionAgente, type UsoAgente } from "@ambie/contrato";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { TokensService } from "../common/tokens";
import { fechaLocalISO } from "../common/crypto";
import { interpretarProveedor, modelosProveedor, probarProveedor, validarDestino, permiteRespaldo } from "./proveedores";

export function autorizarOperacion(rol: RolUsuario, operacion: InstruccionAgente["operacion"]) {
  if (rol === RolUsuario.INVENTARIO && operacion !== "conteo") throw new ErrorDominio("AGENTE_PERMISO", "Tu acceso permite únicamente guardar cantidades en tus productos asignados", 403);
  if (rol === RolUsuario.VENDEDOR && !["pedido", "cobro", "estado"].includes(operacion)) throw new ErrorDominio("AGENTE_PERMISO", "Esta operación requiere acceso de administrador", 403);
}
const normalizar = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function claveConfiguracion() {
  const secreto = process.env.AGENT_CONFIG_SECRET || TokensService.secreto;
  if (secreto.length < 32) throw new ErrorDominio("CONFIGURACION_CLAVE", "La clave privada del servidor debe tener al menos 32 caracteres", 503);
  return createHash("sha256").update(`ambie:agentes:${secreto}`).digest();
}
function cifrar(secretos: Record<string, string>) {
  const iv = randomBytes(12), key = claveConfiguracion();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(secretos), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString("base64")).join(".");
}
function descifrar(datos: string): Record<string, string> {
  const [iv, tag, texto] = datos.split(".").map(s => Buffer.from(s, "base64"));
  const key = claveConfiguracion();
  try { const decipher = createDecipheriv("aes-256-gcm", key, iv); decipher.setAuthTag(tag); return JSON.parse(Buffer.concat([decipher.update(texto), decipher.final()]).toString("utf8")); }
  catch { throw new ErrorDominio("CONFIGURACION_CLAVE", "No se pudo abrir la configuración protegida. Revisa la clave del servidor", 503); }
}
@Injectable()
export class AgentesService {
  constructor(private readonly prisma: PrismaService) {}
  private async leer() {
    const registro = await this.prisma.configuracionAgente.findUnique({ where: { id: "principal" } });
    if (!registro) return { configuracion: structuredClone(ConfiguracionAgenteInicial), secretos: {} as Record<string, string>, version: 0 };
    return { configuracion: ConfiguracionAgenteEsquema.parse(registro.configuracion), secretos: descifrar(registro.secretos), version: registro.version };
  }
  async configuracion(): Promise<ConfiguracionAgentePublica> {
    const r = await this.leer();
    return { ...r.configuracion, version: r.version, proveedores: r.configuracion.proveedores.map(({ apiKey: _key, borrarClave: _borrar, ...p }) => ({ ...p, tieneClave: !!r.secretos[p.id] })) };
  }
  async guardar(body: unknown, version: number) {
    const datos = ConfiguracionAgenteEsquema.parse(body);
    if (datos.local.dispositivo === "gpu") throw new ErrorDominio("GPU_NO_COMPROBADA", "Usa CPU o automático hasta comprobar una instalación con GPU");
    if (new Set(datos.proveedores.map(p => p.id)).size !== datos.proveedores.length) throw new ErrorDominio("PROVEEDOR_DUPLICADO", "Cada proveedor debe tener un identificador diferente");
    if (datos.proveedorId && !datos.proveedores.some(p => p.id === datos.proveedorId)) throw new ErrorDominio("PROVEEDOR_INVALIDO", "El proveedor seleccionado ya no existe");
    if (datos.live.proveedorId && !datos.proveedores.some(p => p.id === datos.live.proveedorId)) throw new ErrorDominio("PROVEEDOR_INVALIDO", "Selecciona una conexión existente para Live");
    if (datos.respaldoId && (datos.respaldoId === datos.proveedorId || !datos.proveedores.some(p => p.id === datos.respaldoId && p.modelo))) throw new ErrorDominio("RESPALDO_INVALIDO", "Elige otra conexión con un modelo para el respaldo autorizado");
    for (const p of datos.proveedores) {
      const problema = problemaConexionAgente(p);
      if (problema && !(process.env.AGENTES_PROVEEDORES_PRUEBA === "true" && ["localhost", "127.0.0.1"].includes(new URL(p.url).hostname))) throw new ErrorDominio("PROVEEDOR_CONFIGURACION", `${p.nombre}: ${problema}`);
      await validarDestino(p.url, p.protocolo === "ollama");
    }
    await this.prisma.enTransaccion(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('configuracion:agentes'))`;
      const anterior = await this.leer();
      if (anterior.version !== version) throw new ErrorDominio("CONFIGURACION_CAMBIO", "Otro administrador actualizó estos ajustes. Recarga antes de guardar", 409);
      const secretos: Record<string, string> = {};
      for (const p of datos.proveedores) {
        const clave = p.borrarClave ? undefined : p.apiKey?.trim() || anterior.secretos[p.id];
        if (clave) secretos[p.id] = clave;
      }
      const configuracion = { ...datos, proveedores: datos.proveedores.map(({ apiKey: _key, borrarClave: _borrar, ...p }) => p) };
      await tx.configuracionAgente.upsert({ where: { id: "principal" }, create: { configuracion: configuracion as Prisma.InputJsonValue, secretos: cifrar(secretos) }, update: { configuracion: configuracion as Prisma.InputJsonValue, secretos: cifrar(secretos), version: { increment: 1 } } });
    });
    return this.configuracion();
  }
  async estado() {
    const r = await this.leer();
    return { habilitado: r.configuracion.habilitado, modo: r.configuracion.modo, audio: r.configuracion.audio, configurado: r.configuracion.modo === "local" ? !!r.configuracion.local.modelo : r.configuracion.modo === "live" ? !!r.configuracion.live.proveedorId : !!r.configuracion.proveedorId, version: r.version };
  }
  private async proveedor(id?: string) {
    const r = await this.leer();
    if (!id && r.configuracion.modo === "live") throw new ErrorDominio("LIVE_AUDIO", "En Live inicia la conexión de audio nativa desde el panel; el texto utiliza Local o Híbrido");
    if (!id && r.configuracion.modo === "local") return { id: "local", nombre: "Ollama", protocolo: "ollama" as const, url: process.env.OLLAMA_URL ?? "http://voice-agent:11434", modelo: r.configuracion.local.modelo };
    const p = r.configuracion.proveedores.find(p => p.id === (id ?? r.configuracion.proveedorId));
    if (!p) throw new ErrorDominio("PROVEEDOR_FALTANTE", "Agrega una conexión y selecciona un modelo en Configuración > Agentes IA");
    return { ...p, apiKey: r.secretos[p.id] };
  }
  async modelos(id: string) { return modelosProveedor(await this.proveedor(id)); }
  async probar(id: string) { return probarProveedor(await this.proveedor(id)); }
  async modelosLocales() { return modelosProveedor({ id: "local", nombre: "Ollama", protocolo: "ollama", url: process.env.OLLAMA_URL ?? "http://voice-agent:11434", modelo: "" }); }
  async probarLocal() { const r = await this.leer(); return probarProveedor({ id: "local", nombre: "Ollama", protocolo: "ollama", url: process.env.OLLAMA_URL ?? "http://voice-agent:11434", modelo: r.configuracion.local.modelo }); }
  async interpretar(texto: string, anterior: InstruccionAgente | undefined, usuario: Usuario, id: string = randomUUID(), version = 1, contexto?: ContextoAgente) {
    const estado = await this.estado();
    if (!estado.habilitado) throw new ErrorDominio("AGENTE_DESACTIVADO", "Activa el asistente en Configuración para empezar");
    const mensajes: Array<{ role: "system" | "user"; content: string }> = [{ role: "system", content: `Interpreta instrucciones comerciales en español. Prepara una operación, nunca la ejecutes. Devuelve todos los datos expresados. Si hay un borrador anterior, conserva sus campos y aplica únicamente las correcciones pedidas. No completes datos faltantes por intuición, ni inventes IDs, productos, clientes, precios o pagos. No interpretes confirmar/cancelar como un nuevo pedido. Rol actual: ${usuario.rol}. El rol inventario solo puede contar productos asignados. Borrador anterior: ${JSON.stringify(anterior ?? null)}.` }, { role: "user", content: texto }];
    const inicio = Date.now(); let uso: UsoAgente | undefined; let respaldo = false;
    let proveedor = await this.proveedor(); let llamada: unknown;
    try { llamada = await interpretarProveedor(proveedor, mensajes, medida => { uso = medida; }); }
    catch (error) {
      if (!permiteRespaldo(error)) throw error;
      const configuracion = (await this.leer()).configuracion;
      if (configuracion.modo !== "hibrido" || !configuracion.respaldoId) throw error;
      proveedor = await this.proveedor(configuracion.respaldoId); respaldo = true;
      llamada = await interpretarProveedor(proveedor, mensajes, medida => { uso = medida; });
    }
    const instruccion = InstruccionAgenteEsquema.parse(llamada);
    if (contexto && ["conteo", "finalizar-conteo", "aplicar-conteo"].includes(instruccion.operacion)) {
      instruccion.conteoId ??= contexto.conteoId;
      if (instruccion.operacion === "conteo") instruccion.producto ??= contexto.producto;
    }
    const revision = await this.revisar(instruccion, usuario, id, version);
    return { ...revision, conexion: { proveedor: proveedor.nombre, modelo: proveedor.modelo, respaldo, milisegundos: Date.now() - inicio, ...(uso && Object.keys(uso).length ? { uso } : {}) } };
  }
  private async producto(texto: string) {
    const q = texto.trim();
    const tokens = normalizar(q).split(" ").filter(t => t.length > 2 && !["con", "una", "uno", "del", "las", "los", "para"].includes(t));
    const opciones = await this.prisma.producto.findMany({ where: { activo: true, OR: [{ nombre: { equals: q, mode: "insensitive" } }, { codigoInterno: { equals: q, mode: "insensitive" } }, ...(tokens.map(t => ({ nombre: { contains: t.replace(/s$/, ""), mode: "insensitive" as const } }))) ] }, take: 31 });
    const exacto = opciones.filter(p => normalizar(p.nombre) === normalizar(q) || normalizar(p.codigoInterno) === normalizar(q));
    if (exacto.length === 1) return exacto[0];
    const coinciden = opciones.filter(p => tokens.length > 0 && tokens.every(t => normalizar(p.nombre).includes(t.replace(/s$/, ""))));
    return coinciden.length === 1 ? coinciden[0] : null;
  }
  private async cliente(texto?: string) {
    if (!texto) return null;
    const candidatos = await this.prisma.cliente.findMany({ where: { activo: true, OR: [{ nombre: { contains: texto, mode: "insensitive" } }, { alias: { equals: texto, mode: "insensitive" } }, { telefono: texto }] }, take: 2 });
    return candidatos.length === 1 ? candidatos[0] : null;
  }
  async revisar(i: InstruccionAgente, usuario: Usuario, id: string = randomUUID(), version = 1): Promise<RevisionAgente> {
    autorizarOperacion(usuario.rol, i.operacion);
    const faltantes: string[] = [], datos: Record<string, unknown> = {};
    const admin = usuario.rol === RolUsuario.ADMINISTRADOR;
    let ruta = admin ? "/admin" : usuario.rol === RolUsuario.INVENTARIO ? "/inventario" : "/vendedor", total: string | undefined;
    if (i.operacion === "pedido" || i.operacion === "compra") {
      const productos: Array<Record<string, unknown>> = [], lineas: Array<{ productoId: string; nombre: string; cantidad: number; precioUnitario: number; costoUnitario: number; subtotal: number }> = [];
      for (const linea of i.lineas ?? []) {
        const p = await this.producto(linea.producto);
        if (!p) { faltantes.push(`Aclara el producto «${linea.producto}» con su nombre o código`); continue; }
        if (!linea.cantidad) { faltantes.push(`Indica una cantidad mayor que cero para ${p.nombre}`); continue; }
        if (lineas.some(l => l.productoId === p.id)) { faltantes.push(`Indica una sola cantidad total para ${p.nombre}`); continue; }
        if (i.operacion === "pedido" && linea.cantidad > p.stockFisico - p.stockReservado) faltantes.push(`Solo hay ${p.stockFisico - p.stockReservado} unidades disponibles de ${p.nombre}`);
        if (i.operacion === "compra" && linea.costoUnitario === undefined) faltantes.push(`Indica el costo unitario de ${p.nombre}`);
        const precio = i.operacion === "pedido" ? p.precioVenta : new Prisma.Decimal(linea.costoUnitario ?? 0);
        productos.push({ id: p.id, nombre: p.nombre, codigoInterno: p.codigoInterno, precioVenta: Number(p.precioVenta), costoActual: Number(p.costoActual), stock: p.stockFisico - p.stockReservado, categoria: "", unidad: p.unidad, activo: p.activo });
        lineas.push({ productoId: p.id, nombre: p.nombre, cantidad: linea.cantidad, precioUnitario: Number(precio), costoUnitario: Number(i.operacion === "pedido" ? p.costoActual : precio), subtotal: Number(precio.mul(linea.cantidad)) });
      }
      total = lineas.reduce((s, l) => s.add(new Prisma.Decimal(l.subtotal)), new Prisma.Decimal(0)).toFixed(2);
      if (!i.lineas?.length) faltantes.push("Indica los productos y sus cantidades");
      Object.assign(datos, { productos, lineas });
      if (i.operacion === "pedido") {
        const cliente = await this.cliente(i.cliente);
        if (!i.ocasional && !cliente) faltantes.push("Indica un cliente existente o cliente ocasional");
        if (!i.metodo) faltantes.push("Indica el método de pago");
        if (i.ocasional && i.metodo === "credito") faltantes.push("Para crédito selecciona un cliente registrado");
        if (!i.preparacion) faltantes.push("Indica si es para preparar o ya se entregó");
        Object.assign(datos, { cliente, ocasional: i.ocasional ?? false, metodo: i.metodo, entrega: i.preparacion });
        ruta += "/ventas/pedido";
        if (!admin) ruta = "/vendedor/pedido";
      } else {
        const proveedores = i.proveedor ? await this.prisma.proveedor.findMany({ where: { activo: true, nombre: { contains: i.proveedor, mode: "insensitive" } }, take: 2 }) : [];
        if (proveedores.length !== 1) faltantes.push("Indica un proveedor existente sin ambigüedad");
        Object.assign(datos, { proveedorId: proveedores[0]?.id, descontarCaja: i.descontarCaja ?? true }); ruta = "/admin/compras";
      }
    } else if (i.operacion === "gasto" || i.operacion === "egreso") {
      if (!i.concepto?.trim()) faltantes.push("Indica el concepto");
      if (!i.monto) faltantes.push("Indica un monto mayor que cero");
      if (!i.metodo || i.metodo === "credito") faltantes.push("Indica efectivo o billetera");
      Object.assign(datos, { concepto: i.concepto, monto: i.monto, metodo: i.metodo }); total = new Prisma.Decimal(i.monto ?? 0).toFixed(2); ruta = i.operacion === "gasto" ? "/admin/compras" : "/admin/caja";
    } else if (i.operacion === "precio") {
      const p = i.producto ? await this.producto(i.producto) : null;
      if (!p) faltantes.push("Indica el producto por nombre o código"); if (i.precio === undefined) faltantes.push("Indica el nuevo precio");
      Object.assign(datos, { productoId: p?.id, precio: i.precio }); ruta = "/admin/precios";
    } else if (i.operacion === "cobro") {
      const cliente = await this.cliente(i.cliente);
      if (!cliente) faltantes.push("Indica el cliente del abono");
      if (!i.monto) faltantes.push("Indica el importe del abono");
      if (!i.metodo || i.metodo === "credito") faltantes.push("Indica efectivo o billetera");
      Object.assign(datos, { clienteId: cliente?.id, monto: i.monto, metodo: i.metodo }); ruta = admin ? "/admin/ventas/abonos" : "/vendedor/abonos";
    } else if (i.operacion === "estado") {
      const p = i.referencia ? await this.prisma.pedido.findFirst({ where: { numero: { equals: i.referencia, mode: "insensitive" } } }) : null;
      if (!p) faltantes.push("Indica el número del pedido"); if (!i.estado) faltantes.push("Indica el nuevo estado");
      Object.assign(datos, { pedidoId: p?.id, estado: i.estado }); ruta = p ? admin ? `/admin/ventas/pedido/${p.id}` : `/vendedor/pedido/${p.id}` : admin ? "/admin/pedidos" : "/vendedor";
    } else if (i.operacion === "cierre") {
      if (i.fecha && i.fecha !== fechaLocalISO(new Date())) faltantes.push("El cierre actual corresponde a hoy. Para revisar otros días consulta el historial");
      if (i.efectivo === undefined) faltantes.push("Indica el efectivo contado"); if (i.billetera === undefined) faltantes.push("Indica la billetera confirmada");
      Object.assign(datos, { efectivo: i.efectivo, billetera: i.billetera }); ruta = "/admin/cierre";
    } else {
      ruta = admin ? "/admin/inventario" : "/inventario";
      if (i.operacion === "iniciar-conteo") { if (!i.tipoConteo) faltantes.push("Indica inicial, general o diario"); Object.assign(datos, { tipo: i.tipoConteo }); }
      else {
        if (!i.conteoId) faltantes.push("Abre el conteo en Inventario antes de dictar esta operación");
        const conteo = i.conteoId ? await this.prisma.conteoInventario.findUnique({ where: { id: i.conteoId } }) : null;
        if (i.conteoId && !conteo) faltantes.push("El conteo no existe");
        Object.assign(datos, { conteoId: i.conteoId });
        if (i.operacion === "conteo") {
          const linea = i.conteoId ? await this.prisma.conteoLinea.findFirst({ where: { conteoId: i.conteoId, asignadoPorId: usuario.id, asignadoHasta: { gt: new Date() } }, include: { producto: { select: { id: true, nombre: true, codigoInterno: true, unidad: true } } } }) : null;
          if (!linea || (i.producto && normalizar(i.producto) !== normalizar(linea.producto.nombre))) faltantes.push("Toma el producto asignado en el conteo antes de indicar su cantidad");
          if (i.cantidad === undefined) faltantes.push("Indica la cantidad contada; cero también es válido");
          Object.assign(datos, { productoId: linea?.productoId, cantidad: i.cantidad, contadoEnEsperado: linea?.contadoEn?.toISOString() ?? null, asignacion: linea ? { productoId: linea.productoId, nombre: linea.producto.nombre, codigo: linea.producto.codigoInterno, unidad: linea.producto.unidad, asignadoHasta: linea.asignadoHasta?.toISOString() ?? null } : null });
        }
      }
    }
    const resumen = faltantes.length ? faltantes.join(". ") : "Revisa el detalle. Confirma por voz o con el botón para guardar";
    return { id, version, instruccion: i, faltantes, ruta, datos, resumen, total, huella: createHash("sha256").update(JSON.stringify(datos)).digest("hex") };
  }
  async sesionAudio() {
    const configuracion = await this.leer();
    if (!configuracion.configuracion.habilitado) throw new ErrorDominio("AGENTE_DESACTIVADO", "Habilita el asistente desde Configuración");
    if (configuracion.configuracion.modo === "live") throw new ErrorDominio("LIVE_AUDIO", "Esta conexión corresponde a Híbrido o Local");
    const token = process.env.VOICE_AGENT_TOKEN;
    if (!token || token.length < 32) throw new ErrorDominio("AUDIO_CONFIGURACION", "Configura la conexión privada del servicio de audio", 503);
    const audio = configuracion.configuracion.audio;
    const datos = Buffer.from(JSON.stringify({ id: randomUUID(), exp: Math.floor(Date.now() / 1000) + 30, stt: audio.stt, modelo: audio.modeloStt, idioma: audio.idioma })).toString("base64url");
    return { ticket: `${datos}.${createHmac("sha256", token).update(datos).digest("base64url")}` };
  }
  async audio(accion: string, body: unknown) {
    const token = process.env.VOICE_AGENT_TOKEN;
    if (!token || token.length < 32) throw new ErrorDominio("AUDIO_CONFIGURACION", "El servicio de audio necesita su conexión privada configurada en el servidor", 503);
    const url = process.env.VOICE_AGENT_URL ?? "http://voice-agent:7860";
    try {
      const r = await fetch(`${url}/${accion}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
      const data = await r.json() as { detail?: unknown };
      if (!r.ok) throw new ErrorDominio("AUDIO_RESPUESTA", typeof data.detail === "string" ? data.detail : "No se pudo completar la prueba de audio", r.status >= 500 ? 503 : 400);
      return data;
    } catch (e) { if (e instanceof ErrorDominio) throw e; throw new ErrorDominio("AUDIO_CONEXION", "El servicio de audio no está disponible. Puedes continuar con texto o con los formularios", 503); }
  }
}
