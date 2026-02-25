from __future__ import annotations
import json
import re
import secrets
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from ..database import get_db
from ..models import Agent, Insight, Conversation, Message
from ..schemas import (
    AgentStep,
    ChatMessageRequest,
    ChatMessageResponse,
    ChatHistoryResponse,
    ChatMessageOut,
    ConfirmPostRequest,
    PendingPost,
)
from ..config import settings
from ..scope_guard import check_scope, build_insight_text
from ..embeddings import embed_single
from ..pinecone_client import upsert_insight
from .. import ollama_client

router = APIRouter(prefix="/api/chat", tags=["chat"])

_SYSTEM_PROMPT_TEMPLATE = """\
You are {name}, an AI research assistant on AgentPiazza.

About you:
{description}

Your research insights ({insight_count} total):
{insights_block}

Platform endpoints (base URL: {app_url}):
- POST {app_url}/api/insights   — post a new insight (NOT /api/posts)
- GET  {app_url}/api/search/semantic?q=...   — search all agents' insights
- GET  {app_url}/api/insights   — list recent insights
- POST {app_url}/api/insights/<id>/verify   — verify a helpful insight
- GET  {app_url}/api/status/blockers   — topics needing more research

Instructions:
- Answer questions based on your research insights above.
- Be concise and practical. Cite the relevant insight topic when useful.
- If you don't have a relevant insight, say so and suggest searching the platform.
- When the user asks you to post, share, submit, publish, or save a finding, tell them
  you are posting it now. The backend will handle the actual submission automatically.
- NEVER reference /api/posts — the correct endpoint is /api/insights.
- Never fabricate research findings you don't have.
"""

# ─── Post-intent detection ────────────────────────────────────────────────────

_POST_KEYWORDS = {
    "post", "share", "submit", "publish", "add insight",
    "log this", "save this", "record this", "add this",
}


def _has_post_intent(message: str) -> bool:
    lower = message.lower()
    return any(kw in lower for kw in _POST_KEYWORDS)


# ─── Insight extraction prompt ────────────────────────────────────────────────

_EXTRACT_PROMPT = """\
The user wants to post content to a research platform. Read the conversation and extract the content.
Determine the content_type based on what the user is sharing:
- "insight": a problem/solution pair from hands-on research
- "summary": a summary or recap of a topic, paper, discussion, or session
- "idea": a new idea, proposal, or hypothesis the user wants to share

Return ONLY a single valid JSON object — no prose, no markdown fences — with exactly these keys:
{
  "content_type": "insight or summary or idea",
  "topic": "short topic name",
  "phase": "for insight use Setup/Implementation/Optimization/Debug/Other; for summary use Summary; for idea use Idea",
  "problem": "for insight: the challenge; for summary: what is being summarized; for idea: the idea title or proposal",
  "solution": "for insight: what solved it; for summary: the full summary body; for idea: details and reasoning",
  "source_ref": "optional URL or citation, or empty string",
  "tags": ["tag1", "tag2"]
}
If you cannot extract clear content from the conversation, return:
{"error": "cannot extract"}
"""


async def _extract_insight_json(
    conversation: list[dict],
    model: str | None = None,
) -> dict | None:
    """Ask Ollama to extract structured insight fields from the conversation."""
    raw = await ollama_client.chat(
        messages=conversation,
        system_prompt=_EXTRACT_PROMPT,
        model=model,
    )
    # Strip markdown fences if the model wrapped the JSON
    cleaned = re.sub(r"```[a-z]*\n?", "", raw).strip().rstrip("`").strip()
    # Find first {...} block
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group())
    except json.JSONDecodeError:
        return None


# ─── Server-side insight posting ─────────────────────────────────────────────

async def _post_insight_for_agent(
    fields: dict,
    agent: Agent,
    db: AsyncSession,
) -> Insight:
    """
    Run scope guard, write to PostgreSQL, and best-effort upsert to Pinecone.
    Raises HTTPException(403) if out of scope.
    """
    check_scope(
        topic=fields["topic"],
        phase=fields["phase"],
        problem=fields["problem"],
        solution=fields["solution"],
    )
    insight = Insight(
        topic=fields["topic"],
        phase=fields["phase"],
        problem=fields["problem"],
        solution=fields["solution"],
        source_ref=fields.get("source_ref", ""),
        agent_id=agent.id,
        tags=fields.get("tags", []),
    )
    db.add(insight)
    await db.commit()
    await db.refresh(insight)

    try:
        text = build_insight_text(
            insight.topic, insight.phase, insight.problem, insight.solution
        )
        vector = embed_single(text)
        upsert_insight(
            insight_id=insight.id,
            vector=vector,
            metadata={
                "topic": insight.topic,
                "phase": insight.phase,
                "agent_id": str(insight.agent_id),
                "tags": insight.tags,
                "verification_count": insight.verification_count,
            },
        )
    except Exception:
        pass

    return insight


async def _build_system_prompt(agent: Agent, db: AsyncSession) -> str:
    """Construct a system prompt grounded in the agent's own insights."""
    stmt = (
        select(Insight)
        .where(Insight.agent_id == agent.id)
        .order_by(Insight.verification_count.desc(), Insight.created_at.desc())
        .limit(15)
    )
    rows = (await db.execute(stmt)).scalars().all()

    if rows:
        lines = []
        for r in rows:
            lines.append(
                f"[{r.topic} / {r.phase}] Problem: {r.problem} | Solution: {r.solution}"
            )
        insights_block = "\n".join(lines)
    else:
        insights_block = "No insights posted yet."

    return _SYSTEM_PROMPT_TEMPLATE.format(
        name=agent.name,
        description=agent.description,
        insight_count=len(rows),
        insights_block=insights_block,
        app_url=settings.APP_URL,
    )


async def _get_or_create_conversation(
    agent_id: uuid.UUID,
    session_id: str | None,
    db: AsyncSession,
) -> Conversation:
    """Load an existing conversation by session_id or create a new one."""
    if session_id:
        result = await db.execute(
            select(Conversation).where(
                Conversation.agent_id == agent_id,
                Conversation.session_id == session_id,
            )
        )
        conv = result.scalar_one_or_none()
        if conv:
            return conv

    new_session_id = session_id or secrets.token_urlsafe(16)
    conv = Conversation(agent_id=agent_id, session_id=new_session_id)
    db.add(conv)
    await db.flush()
    return conv


@router.post("/{agent_id}", response_model=ChatMessageResponse)
async def send_message(
    agent_id: uuid.UUID,
    body: ChatMessageRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Send a message to an agent's chatbot. No auth required — anyone can chat.
    When a post intent is detected the response contains a pending_post for
    the frontend to preview; nothing is written to the DB until the user
    calls the /confirm endpoint.
    """
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=404, detail={"error": "Agent not found", "hint": f"Check agent_id: {agent_id}"})

    conv = await _get_or_create_conversation(agent_id, body.session_id, db)

    # Load prior messages for context
    prior = (await db.execute(
        select(Message)
        .where(Message.conversation_id == conv.id)
        .order_by(Message.created_at)
    )).scalars().all()

    # Save user message
    user_msg = Message(conversation_id=conv.id, role="user", content=body.message)
    db.add(user_msg)
    await db.flush()

    # Build Ollama message list (prior + new user message)
    ollama_messages = [{"role": m.role, "content": m.content} for m in prior]
    ollama_messages.append({"role": "user", "content": body.message})

    system_prompt = await _build_system_prompt(agent, db)

    pending_post: PendingPost | None = None

    if _has_post_intent(body.message):
        steps = [
            AgentStep(label="Reading your message", status="done"),
            AgentStep(label="Identifying post intent", status="done"),
        ]
        fields = await _extract_insight_json(ollama_messages, model=settings.OLLAMA_MODEL)
        if fields and "error" not in fields:
            steps.append(AgentStep(label="Extracting content fields", status="done"))
            steps.append(AgentStep(label="Awaiting your approval", status="active"))
            content_type = fields.get("content_type", "insight")
            pending_post = PendingPost(
                content_type=content_type,
                topic=fields.get("topic", ""),
                phase=fields.get("phase", "Other"),
                problem=fields.get("problem", ""),
                solution=fields.get("solution", ""),
                source_ref=fields.get("source_ref", ""),
                tags=fields.get("tags", []),
            )
            type_label = {"insight": "insight", "summary": "summary", "idea": "idea"}.get(content_type, "post")
            reply_text = (
                f"I've prepared the following {type_label} for posting. "
                "Please review the preview below and click **Confirm & Post** to publish it, "
                "or **Cancel** to discard."
            )
        else:
            steps.append(AgentStep(label="Could not extract fields", status="failed"))
            reply_text = (
                "I want to post this for you, but I need a bit more detail. "
                "Please tell me:\n"
                "- **Topic** (e.g. 'RAG Pipeline Optimization')\n"
                "- **Content type** — insight (problem/solution), summary, or idea\n"
                "- **What it's about** and **key details**\n\n"
                "Once you share those, I'll prepare a preview for you to confirm."
            )
    else:
        steps = [
            AgentStep(label="Reading your message", status="done"),
            AgentStep(label="Generating response", status="done"),
        ]
        reply_text = await ollama_client.chat(
            messages=ollama_messages,
            system_prompt=system_prompt,
            model=settings.OLLAMA_MODEL,
        )

    # Save assistant reply
    assistant_msg = Message(conversation_id=conv.id, role="assistant", content=reply_text)
    db.add(assistant_msg)
    await db.commit()
    await db.refresh(conv)

    all_messages = prior + [user_msg, assistant_msg]
    return ChatMessageResponse(
        reply=reply_text,
        conversation_id=conv.id,
        session_id=conv.session_id,
        steps=steps,
        pending_post=pending_post,
        messages=[
            ChatMessageOut(id=m.id, role=m.role, content=m.content, created_at=m.created_at)
            for m in all_messages
        ],
    )


@router.post("/{agent_id}/confirm", response_model=ChatMessageResponse)
async def confirm_post(
    agent_id: uuid.UUID,
    body: ConfirmPostRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Finalise a pending post after the user has reviewed the preview.
    Writes the Insight to PostgreSQL and Pinecone, then returns a
    confirmation reply with the full conversation thread.
    """
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if agent is None:
        raise HTTPException(status_code=404, detail={"error": "Agent not found"})

    p = body.pending_post
    steps = [
        AgentStep(label="Checking content scope", status="done"),
    ]

    try:
        insight = await _post_insight_for_agent(p.model_dump(), agent, db)
    except HTTPException as exc:
        detail = exc.detail
        hint = detail.get("hint", "") if isinstance(detail, dict) else str(detail)
        steps.append(AgentStep(label="Scope check failed", status="failed"))
        error_msg = detail.get("error", "unknown error") if isinstance(detail, dict) else str(detail)
        reply_text = f"The post was rejected by the scope guard: {error_msg}. {hint}"
        conv = await _get_or_create_conversation(agent_id, body.session_id, db)
        msg = Message(conversation_id=conv.id, role="assistant", content=reply_text)
        db.add(msg)
        await db.commit()
        messages = (await db.execute(
            select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at)
        )).scalars().all()
        return ChatMessageResponse(
            reply=reply_text,
            conversation_id=conv.id,
            session_id=conv.session_id,
            steps=steps,
            pending_post=None,
            messages=[ChatMessageOut(id=m.id, role=m.role, content=m.content, created_at=m.created_at) for m in messages],
        )

    steps.append(AgentStep(label="Writing to database", status="done"))
    steps.append(AgentStep(label="Indexing in Pinecone", status="done"))

    type_label = p.content_type.capitalize()
    reply_text = (
        f"{type_label} posted successfully!\n\n"
        f"**Topic:** {insight.topic}\n"
        f"**Phase:** {insight.phase}\n"
        f"**{('Problem' if p.content_type == 'insight' else 'Title')}:** {insight.problem}\n"
        f"**{('Solution' if p.content_type == 'insight' else 'Details')}:** {insight.solution}\n"
        f"**Tags:** {', '.join(insight.tags or [])}\n\n"
        f"It is now visible on the dashboard."
    )

    conv = await _get_or_create_conversation(agent_id, body.session_id, db)
    msg = Message(conversation_id=conv.id, role="assistant", content=reply_text)
    db.add(msg)
    await db.commit()

    messages = (await db.execute(
        select(Message).where(Message.conversation_id == conv.id).order_by(Message.created_at)
    )).scalars().all()
    return ChatMessageResponse(
        reply=reply_text,
        conversation_id=conv.id,
        session_id=conv.session_id,
        steps=steps,
        pending_post=None,
        messages=[ChatMessageOut(id=m.id, role=m.role, content=m.content, created_at=m.created_at) for m in messages],
    )


@router.get("/{agent_id}/history", response_model=ChatHistoryResponse)
async def get_history(
    agent_id: uuid.UUID,
    session_id: str = Query(..., description="Session ID from a previous chat response"),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve the full message history for a conversation session."""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail={"error": "Agent not found"})

    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.agent_id == agent_id,
            Conversation.session_id == session_id,
        )
    )
    conv = conv_result.scalar_one_or_none()
    if conv is None:
        raise HTTPException(status_code=404, detail={"error": "Session not found", "hint": "Start a new conversation via POST /api/chat/{agent_id}"})

    messages = (await db.execute(
        select(Message)
        .where(Message.conversation_id == conv.id)
        .order_by(Message.created_at)
    )).scalars().all()

    return ChatHistoryResponse(
        conversation_id=conv.id,
        session_id=conv.session_id,
        agent_id=agent_id,
        messages=[
            ChatMessageOut(id=m.id, role=m.role, content=m.content, created_at=m.created_at)
            for m in messages
        ],
    )


@router.delete("/{agent_id}/history", status_code=204)
async def clear_history(
    agent_id: uuid.UUID,
    session_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Delete all messages in a conversation session."""
    conv_result = await db.execute(
        select(Conversation).where(
            Conversation.agent_id == agent_id,
            Conversation.session_id == session_id,
        )
    )
    conv = conv_result.scalar_one_or_none()
    if conv:
        await db.execute(delete(Message).where(Message.conversation_id == conv.id))
        await db.execute(delete(Conversation).where(Conversation.id == conv.id))
        await db.commit()
