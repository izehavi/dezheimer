"""Dezheimer server: serves the web app and the transcription API."""

import datetime as dt
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import unquote

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import accounts, recordings
from .assistant import assist
from .commands import parse_command
from .intents import classifier
from .understanding import understand
from .transcriber import MAX_SECONDS, MODEL_NAME, SAMPLE_RATE, Transcriber

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
MAX_SAMPLE_RATE = 48000
MAX_BODY_BYTES = MAX_SECONDS * MAX_SAMPLE_RATE * 4  # float32 samples

transcriber = Transcriber()


@asynccontextmanager
async def lifespan(app: FastAPI):
    transcriber.load_in_background()
    classifier.load_in_background()
    yield


app = FastAPI(title="Dezheimer", lifespan=lifespan)


@app.middleware("http")
async def no_stale_files(request: Request, call_next):
    # While the app is in development, the browser must always check for the latest files.
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/api/health")
def health():
    return {
        "model": MODEL_NAME,
        "device": transcriber.device,
        "ready": transcriber.ready,
        "error": transcriber.error,
    }


@app.post("/api/transcribe")
async def transcribe(request: Request):
    """Body: mono audio as raw little-endian float32 samples. Header X-Sample-Rate gives the rate."""
    try:
        sample_rate = int(request.headers.get("x-sample-rate", SAMPLE_RATE))
    except ValueError:
        raise HTTPException(400, "X-Sample-Rate must be a number.")
    if not 8000 <= sample_rate <= MAX_SAMPLE_RATE:
        raise HTTPException(400, "Unsupported sample rate.")

    body = await request.body()
    if len(body) > MAX_BODY_BYTES:
        raise HTTPException(413, f"Audio is longer than {MAX_SECONDS} seconds.")
    if len(body) % 4:
        raise HTTPException(400, "Body must be float32 samples.")

    audio = np.frombuffer(body, dtype="<f4")
    if audio.size == 0:
        return {"text": ""}

    # Names and words the user is likely to say, sent by the app to help the speech model.
    vocabulary = unquote(request.headers.get("x-vocabulary", ""))
    text = await run_in_threadpool(transcriber.transcribe, audio, sample_rate, vocabulary)
    # The audio is transcribed in memory and dropped, unless the user switched on
    # "keep the sound of my voice": the phrase is then kept to measure the speech model.
    if request.headers.get("x-keep") == "1" and text:
        return {"text": text, "audio": recordings.keep(audio, sample_rate, text, vocabulary, MODEL_NAME)}
    return {"text": text}


class KnownPerson(BaseModel):
    id: str
    name: str
    relationship: str | None = None


class CommandRequest(BaseModel):
    text: str = Field(max_length=2000)
    now: dt.datetime  # the user's local date and time
    people: list[KnownPerson] = []


@app.post("/api/command")
def command(request: CommandRequest):
    """Read a sentence and, if it is an agenda command, return the event it describes."""
    return parse_command(request.text, request.now, [p.model_dump() for p in request.people])


class AssistRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    now: dt.datetime  # the user's local date and time
    people: list[KnownPerson] = []
    intent: str | None = None  # set when the sentence answers a question from the assistant
    exact_names: bool = False  # set after the user said "no" to "Do you mean ...?"
    asked: str | None = None   # the detail the assistant asked for: "date", "time", "place", "people"
    answer: str | None = Field(default=None, max_length=2000)  # the user's reply to that question
    recent: str | None = Field(default=None, max_length=80)    # the person just talked about, for "She is ..."


@app.post("/api/assist")
def assist_request(request: AssistRequest):
    """Understand one sentence said to the assistant: what is asked, and its details."""
    people = [p.model_dump() for p in request.people]
    return assist(
        request.text, request.now, people, request.intent, request.exact_names, request.asked, request.answer,
        request.recent,
    )


class UnderstandRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    user: str = Field(default="Helen", max_length=60)
    people: list[KnownPerson] = []


@app.post("/api/understand")
def understand_transcript(request: UnderstandRequest):
    """Read a whole transcript with the language model: a summary, and memos about people and things."""
    try:
        return understand(request.text, [p.model_dump() for p in request.people], request.user)
    except ValueError:
        raise HTTPException(502, "The model gave an answer that could not be read. Try again.")
    except RuntimeError as error:  # for example, not enough memory on the graphics card
        raise HTTPException(500, f"The model could not run: {str(error)[:200]}")


# ---- Improvement mode: what the user thought of each answer ----

# Kept with the accounts, outside the project: it holds what the tester said, and the
# project folder may be synced to a cloud drive.
FEEDBACK_FILE = Path(os.environ.get("DEZHEIMER_FEEDBACK_FILE", accounts.DATA_DIR / "feedback" / "feedback.jsonl"))


class Feedback(BaseModel):
    record: dict  # the exchange, the verdict ("yes", "no" or "unanswered") and the user's comment


@app.post("/api/feedback")
def save_feedback(feedback: Feedback):
    """Keep one exchange with the assistant and the user's verdict, one JSON object per line."""
    line = json.dumps({"saved": dt.datetime.now().isoformat(timespec="seconds"), **feedback.record})
    if len(line) > 100_000:
        raise HTTPException(413, "The record is too large.")
    FEEDBACK_FILE.parent.mkdir(parents=True, exist_ok=True)
    with FEEDBACK_FILE.open("a", encoding="utf-8") as file:
        file.write(line + "\n")
    return {}


# ---- Accounts: sign in, and a backup of what the user added ----


class Credentials(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=200)


class Backup(BaseModel):
    doc: dict
    base_version: int = 0  # the version this device last saw


def signed_in_user(request: Request) -> int:
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    user_id = accounts.user_for(token)
    if user_id is None:
        raise HTTPException(401, "Please sign in again.")
    return user_id


@app.post("/api/account/signup")
def sign_up(credentials: Credentials):
    try:
        return accounts.sign_up(credentials.email, credentials.password)
    except accounts.AccountError as error:
        raise HTTPException(400, str(error))


@app.post("/api/account/signin")
def sign_in(credentials: Credentials):
    try:
        return accounts.sign_in(credentials.email, credentials.password)
    except accounts.AccountError as error:
        raise HTTPException(400, str(error))


@app.post("/api/account/signout")
def sign_out(request: Request):
    accounts.sign_out(request.headers.get("authorization", "").removeprefix("Bearer ").strip())
    return {}


@app.get("/api/account/data")
def load_backup(request: Request):
    return accounts.load(signed_in_user(request))


@app.put("/api/account/data")
def save_backup(backup: Backup, request: Request):
    user_id = signed_in_user(request)
    try:
        return accounts.save(user_id, backup.doc, backup.base_version)
    except accounts.Conflict as conflict:
        # Another device saved in the meantime: send back what it saved.
        return JSONResponse(conflict.current, status_code=409)
    except accounts.AccountError as error:
        raise HTTPException(413, str(error))


# Registered last so that it does not shadow the API routes.
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
