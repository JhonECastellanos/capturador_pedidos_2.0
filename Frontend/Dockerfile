FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY Compartido/package.json ./Compartido/
COPY Backend/package.json ./Backend/
COPY Frontend/package.json ./Frontend/
RUN npm ci --workspace @abinova/contrato --workspace abinova-frontend --include-workspace-root
COPY Compartido ./Compartido
COPY Frontend ./Frontend
COPY Control ./Control
# La imagen no incorpora .env ni claves. Navegador y API usan el mismo origen.
ENV VITE_DATOS_ORIGEN=api VITE_API_BASE_URL=/api/v1
RUN npm run build --workspace @abinova/contrato && npm run build --workspace abinova-frontend

FROM nginxinc/nginx-unprivileged:stable-alpine AS cliente
COPY Frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/Frontend/dist /usr/share/nginx/html
COPY marketing/12-landing-page /usr/share/nginx/html/comercial
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 CMD wget -q -O /dev/null http://127.0.0.1:8080/salud
LABEL org.opencontainers.image.title="ABINOVA" org.opencontainers.image.version="V8P4"
ENTRYPOINT ["nginx", "-g", "daemon off;"]

FROM nginxinc/nginx-unprivileged:stable-alpine AS operador
COPY Control/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/Frontend/dist-operador /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 CMD wget -q -O /dev/null http://127.0.0.1:8080/salud
LABEL org.opencontainers.image.title="ABINOVA · Control" org.opencontainers.image.version="V8P4"
ENTRYPOINT ["nginx", "-g", "daemon off;"]
