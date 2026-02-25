"""
Ollama HTTP client for local LLM inference.

Ollama must be running locally:
  brew install ollama
  ollama serve
  ollama pull llama3.2

API reference: https://github.com/ollama/ollama/blob/main/docs/api.md
"""
from __future__ import annotations
import httpx
from .config import settings

_UNAVAILABLE_MSG = (
    "I'm not available right now — the local AI model (Ollama) is not running. "
    "To fix this, open a terminal and run: `ollama serve` "
    "then make sure the model is pulled with: `ollama pull {model}`"
)

_TIMEOUT = httpx.Timeout(120.0, connect=5.0)


async def chat(
    messages: list[dict],
    system_prompt: str,
    model: str | None = None,
) -> str:
    """
    Send a conversation to Ollama and return the assistant's reply.

    messages: list of {"role": "user"|"assistant", "content": "..."}
    system_prompt: injected as the first system message
    """
    resolved_model = model or settings.OLLAMA_MODEL
    payload = {
        "model": resolved_model,
        "messages": [{"role": "system", "content": system_prompt}] + messages,
        "stream": False,
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/chat",
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["message"]["content"]
    except httpx.ConnectError:
        return _UNAVAILABLE_MSG.format(model=resolved_model)
    except httpx.TimeoutException:
        return "The AI model took too long to respond. Try a shorter message or check that Ollama is running."
    except Exception as exc:
        return f"Unexpected error communicating with Ollama: {exc}"
