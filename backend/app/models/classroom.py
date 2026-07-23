import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.faculty import Department

class Classroom(Base):
    __tablename__ = "classrooms"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    room_number = Column(String(50), nullable=False, unique=True)
    capacity = Column(Integer, nullable=False, default=40)
    rows = Column(Integer, nullable=False, default=5)
    cols = Column(Integer, nullable=False, default=8)
    room_type = Column(String(50), nullable=False, default="LECTURE_HALL") # LECTURE_HALL, COMPUTER_LAB, SEMINAR_ROOM
    department_id = Column(String(36), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    department = relationship("Department", lazy="selectin")

class SeatingPlan(Base):
    __tablename__ = "seating_plans"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    exam_date = Column(DateTime, nullable=False)
    time_slot = Column(Integer, nullable=False) # e.g. 1 to 6
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    assignments = relationship("SeatingAssignment", back_populates="seating_plan", cascade="all, delete-orphan")

class SeatingAssignment(Base):
    __tablename__ = "seating_assignments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    seating_plan_id = Column(String(36), ForeignKey("seating_plans.id", ondelete="CASCADE"), nullable=False)
    classroom_id = Column(String(36), ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False)
    student_roll_no = Column(String(50), nullable=False)
    student_name = Column(String(100), nullable=False)
    subject_id = Column(String(36), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    row_index = Column(Integer, nullable=False) # Desk row (0-indexed)
    col_index = Column(Integer, nullable=False) # Desk column (0-indexed)

    # Relationships
    seating_plan = relationship("SeatingPlan", back_populates="assignments")
    classroom = relationship("Classroom", lazy="selectin")
    subject = relationship("Subject", lazy="selectin")
