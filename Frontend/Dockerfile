FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY Compartido/package.json ./Compartido/
COPY Backend/package.json ./Backend/
COPY Frontend/package.json ./Frontend/
RUN npm ci --workspace @synchronic-jo/contrato --workspace synchronic-jo-frontend --include-workspace-root
COPY Compartido ./Compartido
COPY Frontend ./Frontend
# La imagen no incorpora .env ni claves. Navegador y API usan el mismo origen.
ENV VITE_DATOS_ORIGEN=api VITE_API_BASE_URL=/api/v1
RUN npm run build --workspace @synchronic-jo/contrato && npm run build --workspace synchronic-jo-frontend

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY Frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/Frontend/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 CMD wget -q -O /dev/null http://127.0.0.1:8080/salud
LABEL org.opencontainers.image.title="Synchronic.JO" org.opencontainers.image.version="V8P4"
ENTRYPOINT ["nginx", "-g", "daemon off;"]
