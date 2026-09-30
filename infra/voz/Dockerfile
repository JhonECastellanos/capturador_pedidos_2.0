FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -c "import urllib.request,zipfile; urllib.request.urlretrieve('https://alphacephei.com/vosk/models/vosk-model-small-es-0.42.zip','/tmp/model.zip'); zipfile.ZipFile('/tmp/model.zip').extractall('/opt');" \
 && rm /tmp/model.zip
COPY servidor.py .
RUN useradd --system --uid 10001 voz
USER voz
ENV VOSK_MODEL_PATH=/opt/vosk-model-small-es-0.42 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
EXPOSE 2700
CMD ["python", "servidor.py"]
