import asyncio
import os
import tempfile

from fastapi import FastAPI, File, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel
from faster_whisper.audio import decode_audio

# Internal only: the Node API does auth, role and size checks before forwarding.
# Audio lives in a temp file for one request and is deleted when the `with` exits.

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
MAX_DURATION_SECONDS = 60
SAMPLE_RATE = 16_000
SUFFIX_BY_TYPE = {"audio/webm": ".webm", "audio/ogg": ".ogg"}

app = FastAPI()

# Loaded once at start-up, never per request.
whisper_model = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE_TYPE)

# One model instance handles one transcription at a time; anything arriving
# while it's busy gets a 503 so the client can say "busy, try again".
busy = asyncio.Semaphore(1)


def error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def run_whisper(path: str) -> str | None:
    samples = decode_audio(path, sampling_rate=SAMPLE_RATE)
    if len(samples) / SAMPLE_RATE > MAX_DURATION_SECONDS + 1:
        return None

    # `segments` is lazy — the model actually runs while it's consumed.
    segments, _ = whisper_model.transcribe(samples, vad_filter=True)
    return " ".join(text for segment in segments if (text := segment.text.strip()))


@app.get("/health")
def health_check():
    return {"status": "ok", "model": WHISPER_MODEL}


@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    media_type = (audio.content_type or "").split(";")[0].strip()
    suffix = SUFFIX_BY_TYPE.get(media_type)
    if suffix is None:
        return error(415, "unsupported_audio_type", "Audio must be WebM or Ogg")

    if busy.locked():
        return error(503, "stt_busy", "Transcription is busy, try again shortly")

    async with busy:
        with tempfile.NamedTemporaryFile(suffix=suffix) as temp_file:
            temp_file.write(await audio.read())
            temp_file.flush()
            try:
                # Off the event loop, so /health stays responsive mid-transcription.
                transcript = await run_in_threadpool(run_whisper, temp_file.name)
            except Exception:
                return error(422, "audio_unreadable", "The audio could not be decoded")

    if transcript is None:
        return error(413, "audio_too_long", "Audio is longer than 60 seconds")

    # Never log the audio or the transcript text.
    return {"transcript": transcript}
