import uuid
from datetime import datetime, date
from sqlalchemy import Column, String, Boolean, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class AcademicCalendar(Base):
    __tablename__ = "academic_calendars"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    academic_year = Column(String, nullable=False, index=True) # e.g. "2026–2027"
    semester = Column(String, nullable=False) # e.g. "Odd Semester (Sem I/III/V/VII)"
    
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
    semester_closing_date = Column(Date, nullable=False)
    
    is_active = Column(Boolean, default=False)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    events = relationship("AcademicCalendarEvent", back_populates="calendar", cascade="all, delete-orphan")

class AcademicCalendarEvent(Base):
    __tablename__ = "academic_calendar_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    calendar_id = Column(String, ForeignKey("academic_calendars.id", ondelete="CASCADE"), nullable=False, index=True)
    
    date = Column(Date, nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    is_holiday = Column(Boolean, default=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    calendar = relationship("AcademicCalendar", back_populates="events")
