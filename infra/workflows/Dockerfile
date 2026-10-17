ARG WORKFLOW_BASE=python:3.12-slim
FROM ${WORKFLOW_BASE}
USER root
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
ENV LANGSMITH_TRACING=false LANGCHAIN_TRACING_V2=false
WORKDIR /servicio
COPY infra/workflows/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && (id servicio || useradd -u 10001 -m servicio) && mkdir -p /datos && chown servicio /datos
COPY infra/workflows/*.py ./
COPY marketing/datos/planes-propuestos.json /servicio/planes-iniciales.json
COPY Compartido/src/modulos-iniciales.json /servicio/modulos-iniciales.json
USER servicio
EXPOSE 8090
HEALTHCHECK --interval=15s --timeout=4s --start-period=20s --retries=10 CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8090/salud',timeout=3)"
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","8090","--no-access-log"]
