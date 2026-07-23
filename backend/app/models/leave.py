import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base

class FacultyLeaveBalance(Base):
    __tablename__ = "faculty_leave_balances"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    faculty_id = Column(String(36), ForeignKey("faculty_profiles.id", ondelete="CASCADE"), nullable=False)
    leave_type = Column(String(50), nullable=False) # e.g. "Casual", "Sick", "Duty"
    total_allowed = Column(Integer, nullable=False, default=12)
    taken = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    faculty = relationship("FacultyProfile", lazy="select")

    __table_args__ = (
        UniqueConstraint("faculty_id", "leave_type", name="uq_faculty_leave_type"),
    )

class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    faculty_id = Column(String(36), ForeignKey("faculty_profiles.id", ondelete="CASCADE"), nullable=False)
    leave_type = Column(String(50), nullable=False) # e.g. "Casual", "Sick", "Duty"
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    reason = Column(String(500), nullable=False)
    status = Column(String(20), default="PENDING", nullable=False) # "PENDING", "APPROVED", "REJECTED"
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    faculty = relationship("FacultyProfile", lazy="select")
    substitution_proposals = relationship("SubstitutionProposal", back_populates="leave_request", cascade="all, delete-orphan")

class SubstitutionProposal(Base):
    __tablename__ = "substitution_proposals"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    leave_request_id = Column(String(36), ForeignKey("leave_requests.id", ondelete="CASCADE"), nullable=False)
    day_of_week = Column(String(20), nullable=False) # e.g. "Monday"
    time_slot = Column(Integer, nullable=False)     # 1 to 6
    subject_id = Column(String(36), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    original_faculty_id = Column(String(36), ForeignKey("faculty_profiles.id", ondelete="CASCADE"), nullable=False)
    substitute_faculty_id = Column(String(36), ForeignKey("faculty_profiles.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(20), default="PENDING", nullable=False) # "PENDING", "ACCEPTED", "DECLINED"
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    leave_request = relationship("LeaveRequest", back_populates="substitution_proposals")
    subject = relationship("Subject", lazy="selectin")
    original_faculty = relationship("FacultyProfile", foreign_keys=[original_faculty_id], lazy="selectin")
    substitute_faculty = relationship("FacultyProfile", foreign_keys=[substitute_faculty_id], lazy="selectin")
