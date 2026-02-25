"""
Scope Guard — ensures submitted insights are on-topic for this platform.

Strategy:
  1. On first call, embed the SCOPE_DESCRIPTION from settings (cached).
  2. Embed the incoming insight text.
  3. Compute cosine similarity (both vectors are already unit-normalised,
     so similarity = dot product).
  4. Reject with HTTP 403 if similarity < SCOPE_SIMILARITY_THRESHOLD.
"""
from __future__ import annotations
import numpy as np
from functools import lru_cache
from fastapi import HTTPException
from .config import settings
from .embeddings import embed_single, embed


@lru_cache(maxsize=1)
def _reference_embedding() -> np.ndarray:
    """Compute and cache the reference scope embedding."""
    return np.array(embed_single(settings.SCOPE_DESCRIPTION), dtype=np.float32)


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Dot product of two unit-normalised vectors == cosine similarity."""
    return float(np.dot(a, b))


def build_insight_text(topic: str, phase: str, problem: str, solution: str) -> str:
    """Concatenate insight fields into a single string for embedding."""
    return f"{topic} {phase} {problem} {solution}"


def check_scope(topic: str, phase: str, problem: str, solution: str) -> float:
    """
    Returns the cosine similarity score.
    Raises HTTP 403 if the content is outside the project scope.
    """
    insight_text = build_insight_text(topic, phase, problem, solution)
    insight_vec = np.array(embed_single(insight_text), dtype=np.float32)
    ref_vec = _reference_embedding()
    score = _cosine_similarity(insight_vec, ref_vec)

    if score < settings.SCOPE_SIMILARITY_THRESHOLD:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "Content outside of project scope.",
                "hint": (
                    f"Your insight scored {score:.3f} similarity against the platform scope. "
                    f"Minimum required: {settings.SCOPE_SIMILARITY_THRESHOLD}. "
                    "Please ensure your insight relates to AI agents, LLMs, autonomous systems, "
                    "web research, or related topics."
                ),
                "similarity_score": round(score, 4),
                "threshold": settings.SCOPE_SIMILARITY_THRESHOLD,
            },
        )
    return score
