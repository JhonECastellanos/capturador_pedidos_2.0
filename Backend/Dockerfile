# La API vive en un monorepo: depende de @ambie/contrato, que está en
# ../Compartido. Por eso el contexto de Docker es la raíz del proyecto y no
# Backend/. Con el contexto dentro de Backend la instalación falla, porque el
# paquete del contrato no se encuentra.
#
#   docker build -f Backend/Dockerfile .

# ─── 1. Dependencias ───────────────────────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app

# Solo los manifiestos: si no cambia un package.json, esta capa se reutiliza.
COPY package.json package-lock.json ./
COPY Compartido/package.json ./Compartido/
COPY Backend/package.json ./Backend/
COPY Frontend/package.json ./Frontend/

# Se instalan el contrato y la API, no el frontend: este no se usa en la
# imagen del servidor y con sus dependencias casi doblaría el tamaño.
# `npm rebuild` ejecuta los scripts de instalación que npm no corre por
# defecto (argon2 nativo y los motores de Prisma).
RUN npm ci --workspace @ambie/contrato --workspace ambie-backend --include-workspace-root \
 && npm rebuild --workspace ambie-backend

# ─── 2. Compilación ────────────────────────────────────────────────
FROM deps AS build

COPY Compartido ./Compartido
COPY Backend ./Backend

# Orden obligatorio: el contrato primero (la API importa su código generado),
# después el cliente de Prisma (la API importa sus tipos) y al final la API.
# npm exec resuelve el binario instalado aunque npm lo hoistee a la raíz.
RUN npm run build --workspace @ambie/contrato \
 && npm exec --no -- prisma generate --schema Backend/prisma/schema.prisma \
 && npm run build --workspace ambie-backend

# ─── 3. Dependencias de producción ─────────────────────────────────
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY Compartido/package.json ./Compartido/
COPY Backend/package.json ./Backend/
COPY Frontend/package.json ./Frontend/
# npm hoistea las dependencias del contrato a /app/node_modules. Si el
# workspace no tiene dependencias propias, su carpeta node_modules no llega a
# existir y el COPY de la etapa final falla; la creamos para que sea determinista.
RUN npm ci --omit=dev --workspace @ambie/contrato --workspace ambie-backend --include-workspace-root \
 && npm rebuild argon2 --workspace ambie-backend \
 && mkdir -p Compartido/node_modules Backend/node_modules

# ─── 4. Imagen final ───────────────────────────────────────────────
FROM node:24-alpine AS servidor
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
# La API es un workspace: casi todas sus dependencias viven en
# Backend/node_modules. La imagen final es plana (/app), así que se fusionan
# con las de la raíz para que `node dist/main.js` las encuentre.
COPY --from=prod-deps /app/Backend/node_modules ./node_modules
COPY --from=prod-deps /app/Compartido/node_modules ./Compartido/node_modules
COPY --from=build /app/Compartido/dist ./Compartido/dist
COPY --from=prod-deps /app/Compartido/package.json ./Compartido/package.json
COPY --from=prod-deps /app/Backend/package.json ./package.json

# tsx ejecuta la semilla y los scripts; Prisma aplica las migraciones del
# servicio `migrate`. Se instalan de forma global porque con NODE_ENV=production
# npm omite las dependencias de desarrollo y así no alteran el árbol de la API.
# La versión de Prisma se toma del cliente instalado para que no queden
# desalineados, y después se genera el cliente dentro de la imagen.
RUN TSX_VERSION=$(node -p "require('./package.json').devDependencies.tsx.replace(/^[^0-9]*/, '')") \
 && PRISMA_VERSION=$(node -p "require('./node_modules/@prisma/client/package.json').version") \
 && npm install -g "tsx@$TSX_VERSION" "prisma@$PRISMA_VERSION" \
 && npm rebuild -g prisma @prisma/engines

# Cambiar código no vuelve a descargar herramientas de despliegue.
COPY --from=build /app/Backend/dist ./dist
COPY --from=build /app/Backend/prisma ./prisma
COPY --from=build /app/Backend/src/common/consecutivos.ts ./src/common/consecutivos.ts
COPY --from=build /app/Backend/scripts ./scripts
RUN prisma generate --schema prisma/schema.prisma

# La API no debería ejecutarse como root.
RUN addgroup -S ambie && adduser -S ambie -G ambie
USER ambie

EXPOSE 3000

# La sonda es pública a propósito: no pide credenciales y no revela datos del
# negocio, solo si el proceso responde y si la base acepta conexiones.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]

# La imagen por defecto sigue siendo la API existente.
FROM servidor AS runtime
