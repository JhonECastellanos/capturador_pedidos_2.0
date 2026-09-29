import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyRateLimit from "@fastify/rate-limit";
import { AppModule } from "./app.module";
import { FiltroErrores } from "./common/errores";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  await app.register(fastifyCookie as never);
  // Red de seguridad global contra fuerza bruta; las rutas de autenticación
  // además endurecen su propio límite más abajo.
  await app.register(fastifyRateLimit as never, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 300),
    timeWindow: process.env.RATE_LIMIT_VENTANA ?? "1 minute",
  });

  app.setGlobalPrefix("api/v1");

  const origen = process.env.CORS_ALLOWED_ORIGIN;
  app.enableCors({
    origin: origen ? origen.split(",") : true,
    credentials: true,
  });

  app.useGlobalFilters(new FiltroErrores());

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
  // eslint-disable-next-line no-console
  console.log(`AMBIÉ API escuchando en :${port}`);
}

void bootstrap();
