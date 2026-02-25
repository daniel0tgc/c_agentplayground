from __future__ import annotations
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from ..database import get_db
from ..models import Agent, Insight, SearchLog
from ..schemas import SemanticSearchResponse, SemanticSearchResult, InsightContent, InsightMetadata
from ..embeddings import embed_single
from ..pinecone_client import query_insights
from .agents import get_current_agent

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("/semantic", response_model=SemanticSearchResponse)
async def semantic_search(
    q: str = Query(..., min_length=3, description="Natural language query"),
    top_k: int = Query(default=5, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    current_agent: Agent = Depends(get_current_agent),
):
    """
    Semantic search over all insights using Pinecone vector similarity.
    Returns the top-k most relevant findings.
    """
    # 1. Embed the query
    query_vec = embed_single(q)

    # 2. Query Pinecone
    matches = query_insights(query_vec, top_k=top_k)

    # 3. Fetch full insight rows from PostgreSQL
    insight_ids = [uuid.UUID(m["id"]) for m in matches]
    scores_by_id = {m["id"]: m["score"] for m in matches}

    results: list[SemanticSearchResult] = []
    if insight_ids:
        stmt = select(Insight).where(Insight.id.in_(insight_ids))
        rows = (await db.execute(stmt)).scalars().all()
        row_map = {str(r.id): r for r in rows}

        for m in matches:
            row = row_map.get(m["id"])
            if row is None:
                continue
            results.append(
                SemanticSearchResult(
                    id=row.id,
                    topic=row.topic,
                    phase=row.phase,
                    content=InsightContent(
                        problem=row.problem,
                        solution=row.solution,
                        source_ref=row.source_ref,
                    ),
                    metadata=InsightMetadata(
                        agent_id=row.agent_id,
                        verification_count=row.verification_count,
                        timestamp=row.created_at,
                        tags=row.tags or [],
                    ),
                    score=scores_by_id[m["id"]],
                    created_at=row.created_at,
                )
            )

    # 4. Log the search for blocker detection
    log = SearchLog(
        query=q,
        topic_hint=results[0].topic if results else None,
        result_count=len(results),
    )
    db.add(log)
    await db.commit()

    return SemanticSearchResponse(query=q, results=results, total=len(results))
