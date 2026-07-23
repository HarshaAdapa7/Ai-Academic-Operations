import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, Integer, ForeignKey, Table, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.user import User

# Many-to-Many bridge table for Faculty Subject Expertise
faculty_subjects = Table(
    "faculty_subjects",
    Base.metadata,
    Column("faculty_id", String(36), ForeignKey("faculty_profiles.id", ondelete="CASCADE"), primary_key=True),
    Column("subject_id", String(36), ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True),
)

# Many-to-Many bridge table for Section Counseling Mentors (Rule 18 multiple mentors per class)
section_mentors = Table(
    "section_mentors",
    Base.metadata,
    Column("section_id", String(36), ForeignKey("section_configs.id", ondelete="CASCADE"), primary_key=True),
    Column("faculty_id", String(36), ForeignKey("faculty_profiles.id", ondelete="CASCADE"), primary_key=True),
)

# Bridge table for specific Section Subject Teacher assignments
section_subject_teachers = Table(
    "section_subject_teachers",
    Base.metadata,
    Column("section_id", String(36), ForeignKey("section_configs.id", ondelete="CASCADE"), primary_key=True),
    Column("subject_id", String(36), ForeignKey("subjects.id", ondelete="CASCADE"), primary_key=True),
    Column("faculty_id", String(36), ForeignKey("faculty_profiles.id", ondelete="CASCADE"), primary_key=True),
)

class Department(Base):
    __tablename__ = "departments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    subjects = relationship("Subject", back_populates="department", cascade="all, delete-orphan", foreign_keys="Subject.department_id")
    faculty_members = relationship("FacultyProfile", back_populates="department")

class Subject(Base):
    __tablename__ = "subjects"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), unique=True, index=True, nullable=False)
    department_id = Column(String(36), ForeignKey("departments.id", ondelete="CASCADE"), nullable=False)
    credits = Column(Integer, default=3, nullable=False)
    subject_type = Column(String(50), default="THEORY", nullable=False) # THEORY, LAB, ELECTIVE, COUNSELLING, SPORTS_LIBRARY
    is_parallel_lab = Column(Boolean, default=False, nullable=False) # Rule 8 dual labs
    parallel_subject_id = Column(String(36), ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True) # Linked Subject Y
    academic_year = Column(Integer, default=1, nullable=False) # 1, 2, 3, 4
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    department = relationship("Department", back_populates="subjects", foreign_keys=[department_id])
    parallel_subject = relationship("Subject", remote_side=[id], uselist=False)

class FacultyProfile(Base):
    __tablename__ = "faculty_profiles"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    department_id = Column(String(36), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)
    designation = Column(String(100), nullable=False)
    is_hod = Column(Boolean, default=False, nullable=False) # Rule 1 & 2 HOD flag
    is_dean = Column(Boolean, default=False, nullable=False) # Rule 21 Academic Dean flag
    max_weekly_workload = Column(Integer, default=16, nullable=False)
    current_weekly_workload = Column(Integer, default=0, nullable=False)
    office_hours = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    user = relationship("User", lazy="selectin")
    department = relationship("Department", back_populates="faculty_members", lazy="selectin")
    subjects = relationship("Subject", secondary=faculty_subjects, backref="faculty", lazy="selectin")
    availabilities = relationship("FacultyAvailability", back_populates="faculty", cascade="all, delete-orphan", lazy="selectin")

class SectionConfig(Base):
    __tablename__ = "section_configs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    department_id = Column(String(36), ForeignKey("departments.id", ondelete="CASCADE"), nullable=False)
    academic_year = Column(Integer, default=1, nullable=False) # 1, 2, 3, 4
    name = Column(String(50), nullable=False, index=True) # e.g. CSE 3-A
    class_teacher_id = Column(String(36), ForeignKey("faculty_profiles.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("department_id", "academic_year", "name", name="unique_section_per_dept_year"),
    )

    # Relationships
    department = relationship("Department", lazy="selectin")
    class_teacher = relationship("FacultyProfile", foreign_keys=[class_teacher_id], lazy="selectin")
    counseling_mentors = relationship("FacultyProfile", secondary=section_mentors, lazy="selectin")

class FacultyAvailability(Base):
    __tablename__ = "faculty_availability"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), index=True)
    faculty_id = Column(String(36), ForeignKey("faculty_profiles.id", ondelete="CASCADE"), nullable=False)
    day_of_week = Column(String(20), nullable=False) # Monday, Tuesday, etc.
    time_slot = Column(Integer, nullable=False) # 1, 2, 3, etc.
    is_available = Column(Boolean, default=True, nullable=False)

    __table_args__ = (
        UniqueConstraint("faculty_id", "day_of_week", "time_slot", name="unique_faculty_slot"),
    )

    # Relationship
    faculty = relationship("FacultyProfile", back_populates="availabilities")
