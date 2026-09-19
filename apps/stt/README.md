# STT service

Self-hosted speech-to-text for dictation (`faster-whisper`). It is internal only: the browser
never calls it. The Node API receives `POST /docs/:id/transcribe`, checks auth, role and size,
then forwards the audio here.

## Run

```bash
cd apps/stt
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000
```

The first start downloads the model (~140 MB for `small`). Starts after that work offline.
Keep it bound to `127.0.0.1` (uvicorn's default). It has no auth of its own.

The Node API finds it through `STT_URL` in `apps/server/.env`. The default is
`http://127.0.0.1:8000`.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `WHISPER_MODEL` | `small` | `medium` / `large-v3` on a GPU box |
| `WHISPER_COMPUTE_TYPE` | `int8` | `float16` on GPU |
| `WHISPER_DEVICE` | `cpu` | `cuda` on GPU |

## API

`POST /transcribe` takes multipart `audio` (WebM or Ogg) and returns `{ "transcript": "..." }`.

| Status | `error.code` | When |
|---|---|---|
| 413 | `audio_too_long` | Longer than 60 s |
| 415 | `unsupported_audio_type` | Not WebM/Ogg |
| 422 | `audio_unreadable` | Couldn't be decoded |
| 503 | `stt_busy` | A transcription is already running |

The audio is written to a temp file that is deleted when the request finishes. It is never
logged or stored.
