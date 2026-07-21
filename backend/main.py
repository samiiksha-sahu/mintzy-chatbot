"""
FastAPI backend for the website chat widget.
# Trigger deploy: update system prompt brevity

Responsibilities:
  1. Accept messages from the frontend widget (POST /chat)
  2. Keep the last 5 exchanges per session so the bot can answer follow-ups
  3. Forward the message + recent history to your Node.js RAG engine
     (mintzy-ai-chatbot) and return its reply
  4. Expose /health for uptime checks and /session/reset to clear memory

Run locally:
    uvicorn main:app --reload --port 8000
"""

import os
import time
import uuid
import logging
from collections import deque
from typing import Deque, Dict, List, Optional

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# How many exchanges (user+bot pairs) to remember per session
MAX_TURNS = 5

# Where your existing Node.js RAG engine (mintzy-ai-chatbot) lives.
# Point this at the route in your Node project that does retrieval + LLM call.
NODE_BACKEND_URL = os.getenv("NODE_BACKEND_URL", "http://localhost:5000/api/chat")

# Comma separated list of origins allowed to call this API.
# In production, replace "*" with your actual website domain(s).
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

# How long an idle session is kept in memory (seconds) before it's evicted
SESSION_TTL_SECONDS = int(os.getenv("SESSION_TTL_SECONDS", "1800"))  # 30 min

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("chat-backend")

app = FastAPI(title="Mintzy-style Chat Widget API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# In-memory session store
# ---------------------------------------------------------------------------
# Each session_id maps to a deque of the last MAX_TURNS (user, bot) pairs
# plus a last_seen timestamp used for TTL cleanup.
# NOTE: this is fine for a single-process demo/dev server. For production
# with multiple workers, swap this dict for Redis (see note at bottom).

_sessions: Dict[str, Deque[Dict[str, str]]] = {}
_last_seen: Dict[str, float] = {}


def _touch(session_id: str) -> None:
    _last_seen[session_id] = time.time()


def _get_history(session_id: str) -> Deque[Dict[str, str]]:
    if session_id not in _sessions:
        _sessions[session_id] = deque(maxlen=MAX_TURNS)
    _touch(session_id)
    return _sessions[session_id]


def _cleanup_expired() -> None:
    now = time.time()
    expired = [sid for sid, t in _last_seen.items() if now - t > SESSION_TTL_SECONDS]
    for sid in expired:
        _sessions.pop(sid, None)
        _last_seen.pop(sid, None)
    if expired:
        logger.info("Evicted %d expired session(s)", len(expired))


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    session_id: Optional[str] = Field(
        default=None, description="Pass the same id on every call in a conversation"
    )
    message: str = Field(..., min_length=1, max_length=2000)


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    turns_remembered: int


# ---------------------------------------------------------------------------
# Call out to the Node.js RAG engine
# ---------------------------------------------------------------------------

async def call_node_backend(message: str, history: List[Dict[str, str]]) -> str:
    """
    Sends the current message plus recent history to your Node.js RAG engine
    (mintzy-ai-chatbot) and returns its reply. Adjust the payload shape to
    match whatever your Express route in src/routes expects.
    """
    payload = {
        "message": message,
        "history": history,  # [{"user": "...", "bot": "..."}, ...]
    }

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            resp = await client.post(NODE_BACKEND_URL, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data.get("reply", "Sorry, I didn't get a proper response.")
    except httpx.TimeoutException:
        logger.error("Node backend timed out")
        return "I'm taking a little longer than usual — please try again in a moment."
    except httpx.HTTPStatusError as e:
        logger.error("Node backend returned %s: %s", e.response.status_code, e.response.text)
        return "Something went wrong on our end. Please try again shortly."
    except Exception:
        logger.exception("Unexpected error calling Node backend")
        return "Something went wrong on our end. Please try again shortly."


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "active_sessions": len(_sessions)}


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    _cleanup_expired()

    session_id = req.session_id or str(uuid.uuid4())
    history = _get_history(session_id)

    # history currently holds up to MAX_TURNS prior exchanges — this is
    # what lets the bot resolve follow-up questions like "what about the second one?"
    reply = await call_node_backend(req.message, list(history))

    history.append({"user": req.message, "bot": reply})

    return ChatResponse(
        session_id=session_id,
        reply=reply,
        turns_remembered=len(history),
    )


@app.post("/session/reset")
async def reset_session(session_id: str):
    _sessions.pop(session_id, None)
    _last_seen.pop(session_id, None)
    return {"status": "reset", "session_id": session_id}


# ---------------------------------------------------------------------------
# Production note:
# Swap the in-memory dicts above for Redis if you run multiple uvicorn
# workers or multiple instances, since each process would otherwise keep
# its own separate memory. Example:
#
#   import redis.asyncio as redis
#   r = redis.from_url(os.getenv("REDIS_URL"))
#   await r.set(f"session:{session_id}", json.dumps(list(history)), ex=SESSION_TTL_SECONDS)
# ---------------------------------------------------------------------------