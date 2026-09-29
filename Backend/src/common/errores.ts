import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { FastifyReply } from "fastify";

/** Error de dominio con un código estable para el cliente. */
export class ErrorDominio extends HttpException {
  constructor(
    public readonly codigo: string,
    mensaje: string,
    status: number = HttpStatus.BAD_REQUEST,
  ) {
    super(mensaje, status);
  }
}

@Catch()
export class FiltroErrores implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();

    if (exception instanceof ErrorDominio) {
      void response.status(exception.getStatus()).send({
        code: exception.codigo,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const mensaje = typeof body === "string" ? body : (body as { message?: string | string[] }).message;
      void response.status(exception.getStatus()).send({
        code: "HTTP_ERROR",
        message: Array.isArray(mensaje) ? mensaje.join("; ") : mensaje,
      });
      return;
    }

    // eslint-disable-next-line no-console
    console.error(exception);
    void response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      code: "INTERNAL_ERROR",
      message: "Error interno del servidor",
    });
  }
}
