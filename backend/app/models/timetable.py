import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.faculty import Department, Subject, FacultyProfile
from app.models.classroom import Classroom

class SchedulingRule(Base):
    __tablename__ = "scheduling_rules"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    department_id = Column(String(36), ForeignKey("departments.id", ondelete="CASCADE"), unique=True, nullable=True) # Null = global rules
    slots_per_day = Column(Integer, nullable=False, default=6)
    days_active = Column(String(250), nullable=False, default="Monday,Tuesday,Wednesday,Thursday,Friday,Saturday") # comma-separated
    allow_classroom_overlap = Column(Boolean, nullable=False, default=False)
    allow_faculty_overlap = Column(Boolean, nullable=False, default=False)
    lunch_slot = Column(Integer, nullable=True, default=4) # e.g. Slot 4 is lunch break
    activity_blocks = Column(String(500), nullable=True, default="Saturday-5,Saturday-6") # comma-separated "Day-Slot" blocks
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationship
    department = relationship("Department", lazy="selectin")

class SubjectSchedulingRule(Base):
    __tablename__ = "subject_scheduling_rules"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    subject_id = Column(String(36), ForeignKey("subjects.id", ondelete="CASCADE"), unique=True, nullable=False)
    lectures_per_week = Column(Integer, nullable=False, default=3)
    labs_per_week = Column(Integer, nullable=False, default=1)
    lab_duration = Column(Integer, nullable=False, default=3) # e.g. 3 consecutive slots
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationship
    subject = relationship("Subject", lazy="selectin")

class TimetableEntry(Base):
    __tablename__ = "timetable_entries"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    department_id = Column(String(36), ForeignKey("departments.id", ondelete="CASCADE"), nullable=False)
    section = Column(String(50), nullable=False) # e.g. CSE 3-A
    academic_year = Column(Integer, nullable=False, default=1) # 1, 2, 3, 4
    day_of_week = Column(String(20), nullable=False) # Monday, etc.
    time_slot = Column(Integer, nullable=False) # 1 to max slots
    subject_id = Column(String(36), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    faculty_id = Column(String(36), ForeignKey("faculty_profiles.id", ondelete="CASCADE"), nullable=False)
    classroom_id = Column(String(36), ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False)
    lab_batch = Column(String(50), nullable=False, default="ALL") # ALL, BATCH_A, BATCH_B
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    department = relationship("Department", lazy="selectin")
    subject = relationship("Subject", lazy="selectin")
    faculty = relationship("FacultyProfile", lazy="selectin")
    classroom = relationship("Classroom", lazy="selectin")

class ExamTimetableEntry(Base):
    __tablename__ = "exam_timetable_entries"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    exam_date = Column(DateTime, nullable=False)
    time_slot = Column(Integer, nullable=False) # Slot 1, 2 etc.
    subject_id = Column(String(36), ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    classroom_id = Column(String(36), ForeignKey("classrooms.id", ondelete="CASCADE"), nullable=False)
    invigilator_id = Column(String(36), ForeignKey("faculty_profiles.id", ondelete="SET NULL"), nullable=True) # Assigned HOD/Admin invigilator
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    subject = relationship("Subject", lazy="selectin")
    classroom = relationship("Classroom", lazy="selectin")
    invigilator = relationship("FacultyProfile", lazy="selectin")
