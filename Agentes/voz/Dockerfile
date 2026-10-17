FROM python:3.12-slim-bookworm AS voz-hibrida
ENV PYTHONUNBUFFERED=1 HF_HOME=/data/modelos OMP_NUM_THREADS=2
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY Agentes/voz/requirements.txt .
RUN pip install --no-cache-dir 'torch==2.11.0+cpu' 'torchaudio==2.11.0+cpu' --index-url https://download.pytorch.org/whl/cpu && pip install --no-cache-dir -r requirements.txt
RUN useradd --uid 10001 --create-home abinova && mkdir -p /data/modelos && chown -R abinova:abinova /data /app
COPY --chown=abinova:abinova Agentes/voz/*.py .
USER abinova
EXPOSE 7860
HEALTHCHECK --interval=20s --timeout=5s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:7860/salud', timeout=4)"
CMD ["uvicorn", "servidor:app", "--host", "0.0.0.0", "--port", "7860", "--no-access-log"]

# Esta etapa solo se construye al habilitar Local; no instala modelos.
FROM ollama/ollama:0.40.2 AS ollama-cpu
RUN mkdir -p /opt/cpu/lib && cp /bin/ollama /opt/cpu/ollama && find /usr/lib/ollama -maxdepth 1 -type f -exec cp {} /opt/cpu/lib/ \; && find /usr/lib/ollama -maxdepth 1 -type d -name 'cpu*' -exec cp -r {} /opt/cpu/lib/ \;
FROM voz-hibrida AS voz-local
USER root
COPY --from=ollama-cpu /opt/cpu/ollama /usr/local/bin/ollama
COPY --from=ollama-cpu /opt/cpu/lib/ /usr/lib/ollama/
ENV OLLAMA_HOST=0.0.0.0:11434 OLLAMA_MODELS=/data/modelos/ollama OLLAMA_LLM_LIBRARY=cpu OLLAMA_MAX_LOADED_MODELS=1 OLLAMA_NUM_PARALLEL=1
USER abinova
