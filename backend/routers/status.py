from __future__ import annotations
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from ..database import get_db
from ..models import Insight, SearchLog
from ..schemas import BlockersResponse, BlockerItem
from .agents import get_current_agent

router = APIRouter(prefix="/api/status", tags=["status"])


@router.get("/blockers", response_model=BlockersResponse)
async def get_blockers(
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    _agent: Agent = Depends(get_current_agent),
):
    """
    Returns topics that many agents are searching but which have few verified insights.
    These are "blockers" — areas where the collective knowledge is thin.

    Blocker score = query_count / (verified_insight_count + 1)
    Higher score = more urgent blocker.
    """
    # Count recent searches per topic_hint (last 7 days)
    search_counts_stmt = (
        select(SearchLog.topic_hint, func.count(SearchLog.id).label("query_count"))
        .where(SearchLog.topic_hint.isnot(None))
        .group_by(SearchLog.topic_hint)
        .order_by(func.count(SearchLog.id).desc())
        .limit(50)
    )
    search_rows = (await db.execute(search_counts_stmt)).all()
    topic_query_count = {row.topic_hint: row.query_count for row in search_rows}

    if not topic_query_count:
        # Fallback: show topics from insights with zero verifications
        insight_stmt = (
            select(Insight.topic, func.count(Insight.id).label("count"))
            .where(Insight.verification_count == 0)
            .group_by(Insight.topic)
            .order_by(func.count(Insight.id).desc())
            .limit(limit)
        )
        rows = (await db.execute(insight_stmt)).all()
        blockers = [
            BlockerItem(
                topic=r.topic,
                query_count=0,
                verified_insight_count=0,
                blocker_score=float(r.count),
            )
            for r in rows
        ]
        return BlockersResponse(blockers=blockers)

    # For each topic, count insights with verification_count > 0
    topics = list(topic_query_count.keys())
    verified_stmt = (
        select(Insight.topic, func.count(Insight.id).label("verified_count"))
        .where(Insight.topic.in_(topics), Insight.verification_count > 0)
        .group_by(Insight.topic)
    )
    verified_rows = (await db.execute(verified_stmt)).all()
    verified_count = {row.topic: row.verified_count for row in verified_rows}

    blockers: list[BlockerItem] = []
    for topic, q_count in topic_query_count.items():
        v_count = verified_count.get(topic, 0)
        score = q_count / (v_count + 1)
        blockers.append(
            BlockerItem(
                topic=topic,
                query_count=q_count,
                verified_insight_count=v_count,
                blocker_score=round(score, 2),
            )
        )

    blockers.sort(key=lambda b: b.blocker_score, reverse=True)
    return BlockersResponse(blockers=blockers[:limit])


@router.get("/health")
async def health_check():
    """Quick health check — no auth required."""
    return {"status": "ok"}
