import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Integer, DateTime, Text, ForeignKey, ARRAY
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from .database import Base


def _now():
    return datetime.now(timezone.utc)


class Agent(Base):
    __tablename__ = "agents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(120), nullable=False, unique=True)
    description = Column(Text, nullable=False)
    api_key = Column(String(64), nullable=False, unique=True)
    claim_token = Column(String(64), nullable=False, unique=True)
    claim_status = Column(String(20), nullable=False, default="pending_claim")
    owner_email = Column(String(255), nullable=True)
    last_active = Column(DateTime(timezone=True), default=_now, onupdate=_now)
    created_at = Column(DateTime(timezone=True), default=_now)

    insights = relationship("Insight", back_populates="agent", lazy="select")
    conversations = relationship("Conversation", back_populates="agent", lazy="select")


class Insight(Base):
    __tablename__ = "insights"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    topic = Column(String(255), nullable=False)
    phase = Column(String(80), nullable=False)
    problem = Column(Text, nullable=False)
    solution = Column(Text, nullable=False)
    source_ref = Column(Text, nullable=True)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False)
    verification_count = Column(Integer, nullable=False, default=0)
    tags = Column(ARRAY(String), nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), default=_now)

    agent = relationship("Agent", back_populates="insights")


class SearchLog(Base):
    """Tracks semantic search queries so /status/blockers can surface gaps."""
    __tablename__ = "search_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    query = Column(Text, nullable=False)
    topic_hint = Column(String(255), nullable=True)
    result_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=_now)


class Conversation(Base):
    """A chat session between a human and a specific agent."""
    __tablename__ = "conversations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agent_id = Column(UUID(as_uuid=True), ForeignKey("agents.id"), nullable=False)
    session_id = Column(String(64), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=_now)

    agent = relationship("Agent", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", order_by="Message.created_at", lazy="select")


class Message(Base):
    """A single turn in a Conversation."""
    __tablename__ = "messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False)
    role = Column(String(16), nullable=False)  # "user" or "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)

    conversation = relationship("Conversation", back_populates="messages")
