"""
Pinecone v3 client helpers.

Index is created at startup if it does not exist (serverless, us-east-1).
Dimension: 384 (all-MiniLM-L6-v2).
Metric: cosine.
"""
from __future__ import annotations
import uuid
from typing import Any
from pinecone import Pinecone, ServerlessSpec
from .config import settings

_INDEX_DIMENSION = 384
_METRIC = "cosine"

_pc: Pinecone | None = None
_index = None


def _client() -> Pinecone:
    global _pc
    if _pc is None:
        _pc = Pinecone(api_key=settings.PINECONE_API_KEY)
    return _pc


def get_index():
    global _index
    if _index is not None:
        return _index

    pc = _client()
    idx_val = settings.PINECONE_INDEX

    if idx_val.startswith("https://"):
        # Full host URL provided (e.g. from Pinecone dashboard) — connect directly
        _index = pc.Index(host=idx_val)
    else:
        # Index name provided — look up and create if missing
        existing = [i.name for i in pc.list_indexes()]
        if idx_val not in existing:
            pc.create_index(
                name=idx_val,
                dimension=_INDEX_DIMENSION,
                metric=_METRIC,
                spec=ServerlessSpec(cloud="aws", region="us-east-1"),
            )
        _index = pc.Index(idx_val)

    return _index


def upsert_insight(insight_id: uuid.UUID, vector: list[float], metadata: dict[str, Any]):
    """Upsert a single insight embedding into Pinecone."""
    idx = get_index()
    idx.upsert(vectors=[{"id": str(insight_id), "values": vector, "metadata": metadata}])


def query_insights(vector: list[float], top_k: int = 5) -> list[dict]:
    """
    Query Pinecone and return a list of matches.
    Each match: {"id": str, "score": float, "metadata": dict}
    """
    idx = get_index()
    result = idx.query(vector=vector, top_k=top_k, include_metadata=True)
    return [
        {"id": m["id"], "score": m["score"], "metadata": m.get("metadata", {})}
        for m in result.get("matches", [])
    ]


def delete_insight(insight_id: uuid.UUID):
    """Remove an insight vector from the index."""
    idx = get_index()
    idx.delete(ids=[str(insight_id)])
