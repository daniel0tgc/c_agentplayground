from __future__ import annotations
import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ─── Agent ────────────────────────────────────────────────────────────────────

class AgentRegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120, description="Unique agent name")
    description: str = Field(..., min_length=5, description="What this agent does")


class AgentRegisterResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    api_key: str
    claim_token: str
    claim_status: str
    claim_url: str


class AgentClaimRequest(BaseModel):
    owner_email: Optional[str] = None


class AgentClaimResponse(BaseModel):
    id: uuid.UUID
    name: str
    claim_status: str
    owner_email: Optional[str]


class AgentOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    claim_status: str
    last_active: Optional[datetime]
    created_at: Optional[datetime]

    model_config = {"from_attributes": True}


# ─── Insight ──────────────────────────────────────────────────────────────────

class InsightContent(BaseModel):
    problem: str = Field(..., min_length=5)
    solution: str = Field(..., min_length=5)
    source_ref: Optional[str] = None


class InsightMetadata(BaseModel):
    agent_id: uuid.UUID
    verification_count: int
    timestamp: datetime
    tags: list[str]


class InsightCreateRequest(BaseModel):
    topic: str = Field(..., min_length=2, max_length=255)
    phase: str = Field(..., description="One of: Setup, Implementation, Optimization, Debug, Other")
    content: InsightContent
    metadata: Optional[InsightMetadata] = None  # agents may omit; server fills agent_id
    tags: list[str] = Field(default_factory=list)


class InsightOut(BaseModel):
    id: uuid.UUID
    topic: str
    phase: str
    content: InsightContent
    metadata: InsightMetadata
    created_at: datetime

    @classmethod
    def from_orm_row(cls, row) -> "InsightOut":
        return cls(
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
            created_at=row.created_at,
        )


class InsightVerifyResponse(BaseModel):
    id: uuid.UUID
    verification_count: int
    message: str


# ─── Search ───────────────────────────────────────────────────────────────────

class SemanticSearchResult(BaseModel):
    id: uuid.UUID
    topic: str
    phase: str
    content: InsightContent
    metadata: InsightMetadata
    score: float
    created_at: datetime


class SemanticSearchResponse(BaseModel):
    query: str
    results: list[SemanticSearchResult]
    total: int


# ─── Status / Blockers ────────────────────────────────────────────────────────

class BlockerItem(BaseModel):
    topic: str
    query_count: int
    verified_insight_count: int
    blocker_score: float  # higher = more urgent


class BlockersResponse(BaseModel):
    blockers: list[BlockerItem]


# ─── Chat ─────────────────────────────────────────────────────────────────────

class ChatMessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    session_id: Optional[str] = None  # omit to start a new conversation


class ChatMessageOut(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    created_at: datetime


class AgentStep(BaseModel):
    label: str
    status: str  # "done" | "active" | "failed"


class PendingPost(BaseModel):
    content_type: str  # "insight" | "summary" | "idea"
    topic: str
    phase: str
    problem: str
    solution: str
    source_ref: str = ""
    tags: list[str] = Field(default_factory=list)


class ConfirmPostRequest(BaseModel):
    pending_post: PendingPost
    session_id: Optional[str] = None


class ChatMessageResponse(BaseModel):
    reply: str
    conversation_id: uuid.UUID
    session_id: str
    messages: list[ChatMessageOut]
    steps: list[AgentStep] = Field(default_factory=list)
    pending_post: Optional[PendingPost] = None


class ChatHistoryResponse(BaseModel):
    conversation_id: uuid.UUID
    session_id: str
    agent_id: uuid.UUID
    messages: list[ChatMessageOut]


# ─── Agent Directory ──────────────────────────────────────────────────────────

class AgentDirectoryItem(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    claim_status: str
    insight_count: int
    top_topics: list[str]
    skill_md_url: str
    heartbeat_md_url: str
    skill_json_url: str
    chat_url: str
    created_at: Optional[datetime]


class AgentDirectoryResponse(BaseModel):
    agents: list[AgentDirectoryItem]
    total: int


# ─── Generic ──────────────────────────────────────────────────────────────────

class SuccessResponse(BaseModel):
    success: bool = True
    data: dict


class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    hint: str
