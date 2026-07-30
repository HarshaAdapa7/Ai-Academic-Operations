import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, Date, DateTime, ForeignKey, Integer
from sqlalchemy.orm import relationship
from app.core.database import Base

class AcademicCalendar(Base):
    __tablename__ = "academic_calendars"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    academic_year = Column(String, nullable=False, index=True) # e.g. "2026–2027"
    semester = Column(String, nullable=False) # e.g. "1st Year - Sem 1"
    
    semester_start_date = Column(Date, nullable=False)
    semester_end_date = Column(Date, nullable=False)
    
    orientation_start_date = Column(Date, nullable=True)
    orientation_end_date = Column(Date, nullable=True)
    
    class_commencement_date = Column(Date, nullable=False)
    
    mid1_start_date = Column(Date, nullable=True)
    mid1_end_date = Column(Date, nullable=True)
    mid2_start_date = Column(Date, nullable=True)
    mid2_end_date = Column(Date, nullable=True)
    
    practical_exam_start_date = Column(Date, nullable=True)
    practical_exam_end_date = Column(Date, nullable=True)
    
    end_sem_exam_start_date = Column(Date, nullable=True)
    end_sem_exam_end_date = Column(Date, nullable=True)
    
    result_declaration_date = Column(Date, nullable=True)
    semester_closing_date = Column(Date, nullable=True)
    working_days_count = Column(Integer, nullable=True, default=90)
    
    is_active = Column(Boolean, default=False)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    holidays = relationship("AcademicHoliday", back_populates="calendar", cascade="all, delete-orphan")

class AcademicHoliday(Base):
    """
    Dedicated database table for all public holidays, festival breaks, and campus occasions.
    """
    __tablename__ = "academic_holidays"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    calendar_id = Column(String, ForeignKey("academic_calendars.id", ondelete="CASCADE"), nullable=True, index=True)
    academic_year = Column(String, nullable=True, index=True) # e.g. "2026–2027"
    
    date = Column(Date, nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    is_holiday = Column(Boolean, default=True) # True = Holiday (No classes), False = Campus Event/Occasion
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    calendar = relationship("AcademicCalendar", back_populates="holidays")
