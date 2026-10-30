# Speech AI Service

Private FastAPI service for Spelling Kids speech-to-text and text-to-speech. The mobile app calls NestJS; NestJS authenticates requests and forwards speech work to this service.

## Run with Docker Compose

Create `speech-ai/.env` from `.env.example` and set a strong `SPEECH_API_KEY` that matches `backend/.env`. Start the stack from the repository root:

```bash
docker compose up --build
```

The service is reachable to the backend at `http://speech-ai:8001` and is not published to the host. Model files persist in the `speech-models` volume. The first transcription or synthesis request downloads models and may take several minutes. CPU inference is configured by default.

## Run locally

Use Python 3.12, then create a virtual environment:

```bash
python -m venv .venv
```

Install the CPU builds of PyTorch and torchaudio using the command for your platform from the [PyTorch selector](https://pytorch.org/get-started/locally/), then install the service requirements:

```bash
python -m pip install -r requirements.txt
```

Create `.env` from `.env.example`, set `SPEECH_API_KEY`, and launch:

```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8001 --workers 1
```

## Endpoints

- `GET /health` reports service and model configuration without loading models.
- `POST /tts` accepts text and an optional language (`en`, `fr`, or `ar`) and returns WAV audio.
- `POST /stt` accepts an audio upload up to 10 MiB and an optional language (`en`, `fr`, or `ar`), returning the transcript and language confidence.

When configured, the service requires the `x-api-key` header. Keep it private and share the same value only with the backend.

## Configuration

| Variable           | Default                                         | Purpose                     |
| ------------------ | ----------------------------------------------- | --------------------------- |
| `SPEECH_API_KEY`   | unset                                           | Shared internal-service key |
| `STT_MODEL_SIZE`   | `base`                                          | faster-whisper model size   |
| `STT_DEVICE`       | `cpu`                                           | Inference device            |
| `STT_COMPUTE_TYPE` | `int8`                                          | CPU quantization mode       |
| `TTS_MODEL_NAME`   | `tts_models/multilingual/multi-dataset/xtts_v2` | Coqui TTS model             |
| `TTS_SPEAKER`      | `Ana Florence`                                  | Default voice               |
