"""
Local sentence-transformers embedding helper.
Uses 'all-MiniLM-L6-v2' (384-dim, ~22MB) for fast CPU inference.
The model is downloaded once and cached by HuggingFace.
"""
from __future__ import annotations
from functools import lru_cache
from typing import Union
import numpy as np

_MODEL_NAME = "all-MiniLM-L6-v2"


@lru_cache(maxsize=1)
def _get_model():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(_MODEL_NAME)


def embed(text: Union[str, list[str]]) -> np.ndarray:
    """
    Return a unit-normalised embedding (or batch of embeddings).
    Single string → shape (384,)
    List of strings → shape (N, 384)
    """
    model = _get_model()
    vectors = model.encode(text, convert_to_numpy=True, normalize_embeddings=True)
    return vectors


def embed_single(text: str) -> list[float]:
    """Convenience: returns a plain Python list for a single string."""
    return embed(text).tolist()
