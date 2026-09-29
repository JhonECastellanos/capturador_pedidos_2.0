import { ConfigCLI, leerConfig } from "./config-cli";

/**
 * Cliente de la API para el CLI.
 *
 * A diferencia del navegador, aquí no hay cookies: se usa el token de acceso
 * como `Authorization: Bearer`, y cuando caduca se renueva solo con el token
 * de refresco. Así el CLI puede correr sin navegador.
 */
export class ClienteAPI {
  private token: string | null = null;
  private refresh: string | null = null;
  private usuario: string | null = null;

  constructor(private config: ConfigCLI = leerConfig()) {}

  get url(): string {
    return this.config.apiUrl.replace(/\/$/, "");
  }

  get correo(): string | null {
    return this.usuario;
  }

  /** Guarda la sesión en memoria y en disco, para no volver a entrar. */
  sesion(usuario: string, token: string, refresco?: string | null): void {
    this.usuario = usuario;
    this.token = token;
    this.refresh = refresco ?? null;
    this.config.usuario = { email: usuario, token, refresh: refresco ?? undefined };
  }

  /** Recupera una sesión guardada, si sigue vigente. */
  reanudar(): boolean {
    const guardada = this.config.usuario;
    if (!guardada?.token) return false;
    this.usuario = guardada.email;
    this.token = guardada.token;
    this.refresh = guardada.refresh ?? null;
    return true;
  }

  async entrar(identificador: string, clave: string): Promise<string> {
    const datos = await this.peticion<{ usuario: { email: string; rol: string; nombre: string }; accessToken: string; refreshToken: string }>(
      "POST",
      "/api/v1/auth/login",
      { identifier: identificador, password: clave },
      false,
    );
    this.sesion(datos.usuario.email, datos.accessToken, datos.refreshToken);
    return datos.usuario.nombre;
  }

  salir(): void {
    this.token = null;
    this.refresh = null;
    this.usuario = null;
    if (this.config.usuario) delete this.config.usuario;
  }

  get conectado(): boolean {
    return this.token !== null;
  }

  /**
   * Hace la petición y, si el token expiró, renueva una vez y reintenta.
   * Un solo reintento: si también falla, el problema no es el token.
   */
  async pedir<T = any>(metodo: string, ruta: string, cuerpo?: unknown, conAuth = true): Promise<T> {
    try {
      return await this.peticion<T>(metodo, ruta, cuerpo, conAuth);
    } catch (error) {
      const estado = (error as { estado?: number }).estado;
      if (estado === 401 && conAuth && this.refresh) {
        await this.renovar();
        return this.peticion<T>(metodo, ruta, cuerpo, conAuth);
      }
      throw error;
    }
  }

  private async renovar(): Promise<void> {
    const datos = await this.peticion<{ accessToken: string; refreshToken: string }>(
      "POST",
      "/api/v1/auth/refresh",
      { refreshToken: this.refresh },
      false,
    );
    this.token = datos.accessToken;
    this.refresh = datos.refreshToken;
    if (this.config.usuario) this.config.usuario = { ...this.config.usuario, token: datos.accessToken, refresh: datos.refreshToken };
  }

  private async peticion<T>(metodo: string, ruta: string, cuerpo?: unknown, conAuth = true): Promise<T> {
    const cabeceras: Record<string, string> = { "content-type": "application/json" };
    if (conAuth && this.token) cabeceras.authorization = `Bearer ${this.token}`;

    const res = await fetch(`${this.url}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });

    const texto = await res.text();
    let envoltura: any = {};
    try {
      envoltura = texto ? JSON.parse(texto) : {};
    } catch {
      envoltura = { data: texto };
    }

    if (!res.ok) {
      const error = new Error(
        envoltura?.error?.mensaje ?? envoltura?.message ?? `La API respondió ${res.status}`,
      ) as Error & { estado?: number };
      error.estado = res.status;
      throw error;
    }

    // La API responde { data, meta }: se desenvuelve para que las
    // herramientas del CLI trabajen con el contenido, no con la envoltura.
    return (envoltura?.data ?? envoltura) as T;
  }

  /** Igual que pedir(), pero devuelve la lista y el total de la paginación. */
  async pedirPagina<T = any>(ruta: string): Promise<{ items: T[]; meta: Record<string, number> }> {
    const separador = ruta.includes("?") ? "&" : "?";
    const res = await fetch(`${this.url}${ruta}${separador}pagina=1&porPagina=50`, {
      headers: this.token ? { authorization: `Bearer ${this.token}` } : {},
    });
    if (!res.ok) {
      const error = new Error(`La API respondió ${res.status}`) as Error & { estado?: number };
      error.estado = res.status;
      throw error;
    }
    const envoltura: any = await res.json();
    const datos = envoltura?.data ?? envoltura;
    return {
      items: Array.isArray(datos) ? datos : datos?.items ?? [],
      meta: envoltura?.meta ?? { total: Array.isArray(datos) ? datos.length : 0 },
    };
  }
}
