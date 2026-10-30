
import os
import tempfile
import threading
from pathlib import Path
from typing import Optional

import torch
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from faster_whisper import WhisperModel
from TTS.api import TTS

load_dotenv()

app = FastAPI(
    title="Spelling Kids Speech AI",
    version="1.0.0",
    description="Speech-to-text and text-to-speech service",
)

# Configure through environment variables.
STT_MODEL_SIZE = os.getenv("STT_MODEL_SIZE", "base")
STT_DEVICE = os.getenv("STT_DEVICE", "cpu")
STT_COMPUTE_TYPE = os.getenv("STT_COMPUTE_TYPE", "int8")

TTS_MODEL_NAME = os.getenv(
    "TTS_MODEL_NAME",
    "tts_models/multilingual/multi-dataset/xtts_v2",
)
TTS_SPEAKER = os.getenv("TTS_SPEAKER", "Ana Florence")

MAX_AUDIO_BYTES = 10 * 1024 * 1024
MAX_TEXT_LENGTH = 1000

# Load models only when their endpoint is first called.
whisper_model: Optional[WhisperModel] = None
tts_model: Optional[TTS] = None
whisper_lock = threading.Lock()
tts_lock = threading.Lock()
inference_slots = threading.BoundedSemaphore(1)


def check_api_key(x_api_key: Optional[str]) -> None:
    """Require a shared API key if SPEECH_API_KEY is configured."""
    expected = os.getenv("SPEECH_API_KEY")

    if expected and x_api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid API key")


def get_whisper_model() -> WhisperModel:
    global whisper_model

    if whisper_model is None:
        with whisper_lock:
            if whisper_model is None:
                whisper_model = WhisperModel(
                    STT_MODEL_SIZE,
                    device=STT_DEVICE,
                    compute_type=STT_COMPUTE_TYPE,
                )

    return whisper_model


def get_tts_model() -> TTS:
    global tts_model

    if tts_model is None:
        with tts_lock:
            if tts_model is None:
                use_gpu = torch.cuda.is_available()

                tts_model = TTS(
                    model_name=TTS_MODEL_NAME,
                    progress_bar=False,
                    gpu=use_gpu,
                )

    return tts_model


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "spelling-kids-speech-ai",
        "stt_model": STT_MODEL_SIZE,
        "tts_model": TTS_MODEL_NAME,
    }


@app.post("/stt")
def speech_to_text(
    audio: UploadFile = File(...),
    language: str = Form("en"),
    x_api_key: Optional[str] = Header(None),
):
    check_api_key(x_api_key)

    allowed_languages = {"en", "fr", "ar"}

    if language not in allowed_languages:
        raise HTTPException(
            status_code=400,
            detail="Supported language codes: en, fr, ar",
        )

    if audio.content_type not in {
        "audio/wav",
        "audio/x-wav",
        "audio/mpeg",
        "audio/mp4",
        "audio/m4a",
        "audio/webm",
        "audio/ogg",
        "application/octet-stream",
    }:
        raise HTTPException(
            status_code=415,
            detail="Unsupported audio content type",
        )

    temp_path = None

    try:
        content = audio.file.read(MAX_AUDIO_BYTES + 1)

        if not content:
            raise HTTPException(
                status_code=400,
                detail="The audio file is empty",
            )

        if len(content) > MAX_AUDIO_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Audio file exceeds the 10 MB limit",
            )

        suffix = Path(audio.filename or "recording.wav").suffix
        if not suffix or len(suffix) > 10:
            suffix = ".wav"

        with tempfile.NamedTemporaryFile(
            suffix=suffix,
            delete=False,
        ) as temp:
            temp.write(content)
            temp_path = temp.name

        if not inference_slots.acquire(timeout=10):
            raise HTTPException(status_code=503, detail="Speech inference is busy; retry shortly")

        try:
            model = get_whisper_model()
            segments, info = model.transcribe(
                temp_path,
                language=language,
                beam_size=3,
                vad_filter=True,
            )

            transcript = " ".join(
                segment.text.strip() for segment in segments
            ).strip()
        finally:
            inference_slots.release()

        return {
            "text": transcript,
            "language": info.language,
            "language_probability": info.language_probability,
            "duration_seconds": info.duration,
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Speech recognition failed: {type(exc).__name__}",
        ) from exc
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
        audio.file.close()


@app.post("/tts")
def text_to_speech(
    text: str = Form(...),
    language: str = Form("en"),
    x_api_key: Optional[str] = Header(None),
):
    check_api_key(x_api_key)

    if not text.strip():
        raise HTTPException(
            status_code=400,
            detail="Text cannot be empty",
        )

    if len(text) > MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Text cannot exceed {MAX_TEXT_LENGTH} characters",
        )

    allowed_languages = {"en", "fr", "ar"}

    if language not in allowed_languages:
        raise HTTPException(
            status_code=400,
            detail="Supported language codes: en, fr, ar",
        )

    output_path = None

    try:
        if not inference_slots.acquire(timeout=10):
            raise HTTPException(status_code=503, detail="Speech inference is busy; retry shortly")

        try:
            model = get_tts_model()

            with tempfile.NamedTemporaryFile(
                suffix=".wav",
                delete=False,
            ) as temp:
                output_path = temp.name

            model.tts_to_file(
                text=text.strip(),
                file_path=output_path,
                speaker=TTS_SPEAKER,
                language=language,
            )
        finally:
            inference_slots.release()

        return FileResponse(
            path=output_path,
            media_type="audio/wav",
            filename="speech.wav",
            background=BackgroundTask(
                lambda: os.path.exists(output_path)
                and os.remove(output_path)
            ),
        )

    except HTTPException:
        if output_path and os.path.exists(output_path):
            os.remove(output_path)
        raise
    except Exception as exc:
        if output_path and os.path.exists(output_path):
            os.remove(output_path)

        raise HTTPException(
            status_code=500,
            detail=f"Speech generation failed: {type(exc).__name__}",
        ) from exc
