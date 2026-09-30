import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import WebSocket, { WebSocketServer } from "ws";
import { PrismaService } from "../common/prisma.module";
import { ErrorDominio } from "../common/errores";
import { ConfiguracionAsistente } from "./configuracion-asistente";

@Injectable()
export class VozService implements OnModuleInit, OnModuleDestroy {
  disponible(): Promise<boolean> {
    return new Promise((resolve) => {
      const conexion = new WebSocket(this.entorno.get<string>("VOZ_STT_URL") || "ws://localhost:2700", { handshakeTimeout: 3000 });
      const timer = setTimeout(() => terminar(false), 3500);
      const terminar = (ok: boolean) => { clearTimeout(timer); conexion.terminate(); resolve(ok); };
      conexion.on("message", (datos) => { try { terminar(JSON.parse(datos.toString()).tipo === "lista"); } catch { terminar(false); } });
      conexion.on("error", () => terminar(false));
      conexion.on("close", () => terminar(false));
    });
  }
  private readonly servidor = new WebSocketServer({ noServer: true, maxPayload: 8192, perMessageDeflate: false, handleProtocols: () => "ambie-voz" });
  private readonly tickets = new Map<string, { usuarioId: string; sesionId: string; vence: number }>();
  private readonly conexiones = new Set<WebSocket>();
  private readonly usuariosConectados = new Set<string>();
  private readonly intentos = new Map<string, number>();
  private http?: Server;
  constructor(private readonly adaptador: HttpAdapterHost, private readonly entorno: ConfigService, private readonly prisma: PrismaService, private readonly configuracion: ConfiguracionAsistente) {}
  onModuleInit() {
    this.http = this.adaptador.httpAdapter.getHttpServer() as Server;
    this.http.on("upgrade", this.upgrade);
  }
  onModuleDestroy() { this.http?.off("upgrade", this.upgrade); for (const c of this.conexiones) c.close(1001); this.servidor.close(); }
  async ticket(usuarioId: string, sesionId: string) {
    if (!(await this.configuracion.leer()).vozHabilitada) throw new ErrorDominio("VOZ_DESACTIVADA", "El administrador desactivó las sesiones de voz.");
    const ahora = Date.now();
    for (const [t, datos] of this.tickets) if (datos.vence < ahora) this.tickets.delete(t);
    for (const [u, fecha] of this.intentos) if (ahora - fecha > 30000) this.intentos.delete(u);
    if (ahora - (this.intentos.get(usuarioId) ?? 0) < 3000) throw new ErrorDominio("LIMITE_VOZ", "Espera un momento antes de reconectar.", 429);
    if (this.tickets.size >= 100 || this.conexiones.size >= 2 || this.usuariosConectados.has(usuarioId)) throw new ErrorDominio("VOZ_OCUPADA", "El servicio de voz está ocupado. Intenta más tarde.", 429);
    this.intentos.set(usuarioId, ahora);
    const ticket = randomBytes(24).toString("base64url");
    this.tickets.set(ticket, { usuarioId, sesionId, vence: ahora + 30000 });
    return { ticket, ruta: "/api/v1/asistente/voz", sampleRate: 16000 };
  }
  private upgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => { void this.aceptar(req, socket, head).catch(() => { if (!socket.destroyed) { socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); socket.destroy(); } }); };
  private async aceptar(req: IncomingMessage, socket: Duplex, head: Buffer) {
    if (req.url?.split("?")[0] !== "/api/v1/asistente/voz") return;
    const origenes = (this.entorno.get<string>("CORS_ALLOWED_ORIGIN") || "http://localhost:5173").split(",").map((s) => s.trim());
    const protocolo = req.headers["sec-websocket-protocol"]?.split(",").map((s) => s.trim()) ?? [];
    const ticket = protocolo[1], datos = ticket ? this.tickets.get(ticket) : undefined;
    if (ticket) this.tickets.delete(ticket);
    if (!req.headers.origin || !origenes.includes(req.headers.origin) || protocolo[0] !== "ambie-voz" || !datos || datos.vence < Date.now() || this.conexiones.size >= 2 || this.usuariosConectados.has(datos.usuarioId)) throw new Error("No autorizado");
    const sesion = await this.prisma.sesion.findUnique({ where: { id: datos.sesionId }, include: { usuario: true } });
    if (!sesion || sesion.revocadoEn || sesion.expiraEn < new Date() || !sesion.usuario.activo || sesion.usuarioId !== datos.usuarioId) throw new Error("Sesión inválida");
    if (this.conexiones.size >= 2 || this.usuariosConectados.has(datos.usuarioId)) throw new Error("Servicio ocupado");
    this.usuariosConectados.add(datos.usuarioId);
    try {
      this.servidor.handleUpgrade(req, socket, head, (cliente) => this.conectar(cliente, datos));
    } catch (e) { this.usuariosConectados.delete(datos.usuarioId); throw e; }
  }
  private conectar(cliente: WebSocket, datos: { usuarioId: string; sesionId: string }) {
    this.conexiones.add(cliente);
    const stt = new WebSocket(this.entorno.get<string>("VOZ_STT_URL") || "ws://localhost:2700", { handshakeTimeout: 5000, maxPayload: 8192, perMessageDeflate: false });
    const enviar = (evento: unknown) => { if (cliente.readyState === WebSocket.OPEN) cliente.send(JSON.stringify(evento)); };
    const fallar = () => { enviar({ tipo: "error", mensaje: "No se pudo conectar con la voz local. Revisa el contenedor voz." }); cliente.close(1011); };
    stt.on("error", fallar);
    stt.on("close", () => { if (cliente.readyState === WebSocket.OPEN) cliente.close(1011, "Voz desconectada"); });
    stt.on("message", (buffer) => { try { enviar(JSON.parse(buffer.toString())); } catch { fallar(); } });
    let inicio = Date.now(), bytes = 0;
    cliente.on("message", (buffer, binario) => {
      if (stt.readyState !== WebSocket.OPEN) return;
      if (Date.now() - inicio >= 1000) { inicio = Date.now(); bytes = 0; }
      bytes += (buffer as Buffer).byteLength;
      if (bytes > 64000 || (binario && (buffer as Buffer).byteLength % 2)) { cliente.close(1008, "Audio inválido"); return; }
      if (stt.bufferedAmount > 64000) { cliente.close(1013, "Conexión lenta"); return; }
      if (binario) stt.send(buffer, { binary: true });
      else if (buffer.toString() === '{"reset":1}') stt.send('{"reset":1}');
      else cliente.close(1008, "Mensaje inválido");
    });
    const tiempo = setTimeout(() => cliente.close(1000, "Sesión de voz finalizada"), 10 * 60 * 1000);
    const revisar = setInterval(() => {
      void this.prisma.sesion.findUnique({ where: { id: datos.sesionId }, include: { usuario: true } }).then((s) => { if (!s || s.revocadoEn || s.expiraEn < new Date() || !s.usuario.activo) cliente.close(1008, "Sesión expirada"); }).catch(() => cliente.close(1011));
    }, 30000);
    cliente.on("error", () => cliente.close(1011));
    cliente.on("close", () => { clearTimeout(tiempo); clearInterval(revisar); this.conexiones.delete(cliente); this.usuariosConectados.delete(datos.usuarioId); if (stt.readyState === WebSocket.CONNECTING) stt.terminate(); else stt.close(); });
  }
}
