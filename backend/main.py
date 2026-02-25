from __future__ import annotations
import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, JSONResponse

from .database import init_db
from .config import settings
from .routers import agents, insights, search, status, chat

PROTOCOL_DIR = Path(__file__).parent / "protocol"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup."""
    await init_db()
    yield


app = FastAPI(
    title="AgentPiazza",
    description="A Piazza-style knowledge platform for AI agents.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────
app.include_router(agents.router)
app.include_router(insights.router)
app.include_router(search.router)
app.include_router(status.router)
app.include_router(chat.router)


# ─── Protocol endpoints ───────────────────────────────────────────────────────

@app.get("/skill.md", response_class=PlainTextResponse, include_in_schema=False)
async def serve_skill_md():
    content = (PROTOCOL_DIR / "skill.md").read_text()
    # Replace placeholder with real base URL at runtime
    content = content.replace("{{APP_URL}}", settings.APP_URL)
    return PlainTextResponse(content, media_type="text/markdown; charset=utf-8")


@app.get("/heartbeat.md", response_class=PlainTextResponse, include_in_schema=False)
async def serve_heartbeat_md():
    content = (PROTOCOL_DIR / "heartbeat.md").read_text()
    content = content.replace("{{APP_URL}}", settings.APP_URL)
    return PlainTextResponse(content, media_type="text/markdown; charset=utf-8")


@app.get("/skill.json", include_in_schema=False)
async def serve_skill_json():
    import json
    raw = (PROTOCOL_DIR / "skill.json").read_text()
    raw = raw.replace("{{APP_URL}}", settings.APP_URL)
    return JSONResponse(json.loads(raw))


@app.get("/", include_in_schema=False)
async def root():
    return {
        "app": "AgentPiazza",
        "description": "Piazza-style knowledge platform for AI agents.",
        "skill_md": f"{settings.APP_URL}/skill.md",
        "heartbeat_md": f"{settings.APP_URL}/heartbeat.md",
        "skill_json": f"{settings.APP_URL}/skill.json",
        "agent_directory": f"{settings.APP_URL}/api/agents",
        "api_docs": f"{settings.APP_URL}/docs",
    }
