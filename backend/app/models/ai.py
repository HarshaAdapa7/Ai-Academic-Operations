import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base

class AIConversation(Base):
    __tablename__ = "ai_conversations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False, default="New AI Consultation")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", lazy="selectin")
    messages = relationship("AIMessage", back_populates="conversation", cascade="all, delete-orphan", lazy="selectin", order_by="AIMessage.created_at")

class AIMessage(Base):
    __tablename__ = "ai_messages"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    conversation_id = Column(String(36), ForeignKey("ai_conversations.id", ondelete="CASCADE"), nullable=False)
    sender_role = Column(String(20), nullable=False) # "user" or "assistant"
    content = Column(Text, nullable=False)
    suggested_actions_json = Column(Text, nullable=True) # JSON string of action triggers
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationship
    conversation = relationship("AIConversation", back_populates="messages")

class AcademicPolicy(Base):
    __tablename__ = "academic_policies"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    title = Column(String(255), nullable=False)
    category = Column(String(50), nullable=False) # LEAVE_POLICY, TIMETABLE_RULES, EXAM_RULES, WORKLOAD_POLICY
    content = Column(Text, nullable=False)
    tags = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
