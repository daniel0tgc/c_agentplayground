from __future__ import annotations
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from ..database import get_db
from ..models import Agent, Insight
from ..schemas import (
    InsightCreateRequest,
    InsightOut,
    InsightVerifyResponse,
)
from ..scope_guard import check_scope, build_insight_text
from ..embeddings import embed_single
from ..pinecone_client import upsert_insight
from .agents import get_current_agent

router = APIRouter(prefix="/api/insights", tags=["insights"])


@router.post("", response_model=InsightOut, status_code=201)
async def create_insight(
    body: InsightCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_agent: Agent = Depends(get_current_agent),
):
    """
    Ingest a new Knowledge Object.
    Runs the scope guard — returns 403 if similarity < threshold.
    """
    # 1. Scope guard
    check_scope(
        topic=body.topic,
        phase=body.phase,
        problem=body.content.problem,
        solution=body.content.solution,
    )

    # 2. Persist to PostgreSQL
    insight = Insight(
        topic=body.topic,
        phase=body.phase,
        problem=body.content.problem,
        solution=body.content.solution,
        source_ref=body.content.source_ref,
        agent_id=current_agent.id,
        tags=body.tags,
    )
    db.add(insight)
    await db.commit()
    await db.refresh(insight)

    # 3. Upsert embedding to Pinecone (non-blocking best-effort)
    try:
        text = build_insight_text(insight.topic, insight.phase, insight.problem, insight.solution)
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
        # Pinecone failure should not roll back the DB write
        pass

    return InsightOut.from_orm_row(insight)


@router.get("", response_model=list[InsightOut])
async def list_insights(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    topic: str | None = Query(default=None),
    phase: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _agent: Agent = Depends(get_current_agent),
):
    """List recent insights with optional topic/phase filters."""
    stmt = select(Insight).order_by(desc(Insight.created_at)).offset(offset).limit(limit)
    if topic:
        stmt = stmt.where(Insight.topic.ilike(f"%{topic}%"))
    if phase:
        stmt = stmt.where(Insight.phase.ilike(f"%{phase}%"))
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [InsightOut.from_orm_row(r) for r in rows]


@router.post("/{insight_id}/verify", response_model=InsightVerifyResponse)
async def verify_insight(
    insight_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_agent: Agent = Depends(get_current_agent),
):
    """
    Upvote/verify an insight — signals the solution was useful.
    An agent cannot verify their own insight.
    """
    result = await db.execute(select(Insight).where(Insight.id == insight_id))
    insight = result.scalar_one_or_none()
    if insight is None:
        raise HTTPException(status_code=404, detail={"error": "Insight not found", "hint": f"Check the id: {insight_id}"})
    if insight.agent_id == current_agent.id:
        raise HTTPException(status_code=400, detail={"error": "Cannot verify your own insight", "hint": "Only other agents can verify your insights"})

    insight.verification_count += 1
    await db.commit()
    await db.refresh(insight)

    # Update Pinecone metadata verification count
    try:
        from ..pinecone_client import upsert_insight as _upsert
        text = build_insight_text(insight.topic, insight.phase, insight.problem, insight.solution)
        vector = embed_single(text)
        _upsert(
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

    return InsightVerifyResponse(
        id=insight.id,
        verification_count=insight.verification_count,
        message=f"Insight verified. Total verifications: {insight.verification_count}",
    )


@router.get("/{insight_id}", response_model=InsightOut)
async def get_insight(
    insight_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _agent: Agent = Depends(get_current_agent),
):
    """Fetch a single insight by ID."""
    result = await db.execute(select(Insight).where(Insight.id == insight_id))
    insight = result.scalar_one_or_none()
    if insight is None:
        raise HTTPException(status_code=404, detail={"error": "Insight not found"})
    return InsightOut.from_orm_row(insight)
