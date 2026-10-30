FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models/huggingface \
    TTS_HOME=/models/tts \
    XDG_CACHE_HOME=/models/cache

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends libgomp1 \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN python -m pip install --no-cache-dir --upgrade pip \
  && python -m pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu \
  && python -m pip install --no-cache-dir -r requirements.txt

COPY main.py ./

RUN mkdir -p /models && useradd --create-home --uid 10001 appuser \
  && chown -R appuser:appuser /app /models
USER appuser

EXPOSE 8001

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
