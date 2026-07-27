from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field

class AcademicCalendarBase(BaseModel):
    academic_year: str = Field(..., description="e.g. 2026–2027")
    semester: str = Field(..., description="e.g. Odd Semester or Semester 1")
    
    semester_start_date: date
    semester_end_date: date
    
    orientation_start_date: Optional[date] = None
    orientation_end_date: Optional[date] = None
    
    class_commencement_date: date
    
    mid1_start_date: Optional[date] = None
    mid1_end_date: Optional[date] = None
    mid2_start_date: Optional[date] = None
    mid2_end_date: Optional[date] = None
    
    practical_exam_start_date: Optional[date] = None
    practical_exam_end_date: Optional[date] = None
    
    end_sem_exam_start_date: Optional[date] = None
    end_sem_exam_end_date: Optional[date] = None
    
    result_declaration_date: Optional[date] = None
    semester_closing_date: date
    
    is_active: bool = False

class AcademicCalendarCreate(AcademicCalendarBase):
    pass

class AcademicCalendarUpdate(BaseModel):
    academic_year: Optional[str] = None
    semester: Optional[str] = None
    
    semester_start_date: Optional[date] = None
    semester_end_date: Optional[date] = None
    
    orientation_start_date: Optional[date] = None
    orientation_end_date: Optional[date] = None
    
    class_commencement_date: Optional[date] = None
    
    mid1_start_date: Optional[date] = None
    mid1_end_date: Optional[date] = None
    mid2_start_date: Optional[date] = None
    mid2_end_date: Optional[date] = None
    
    practical_exam_start_date: Optional[date] = None
    practical_exam_end_date: Optional[date] = None
    
    end_sem_exam_start_date: Optional[date] = None
    end_sem_exam_end_date: Optional[date] = None
    
    result_declaration_date: Optional[date] = None
    semester_closing_date: Optional[date] = None
    
    is_active: Optional[bool] = None

class AcademicCalendarEventBase(BaseModel):
    date: date
    name: str = Field(..., description="e.g. Independence Day, Annual Tech Fest")
    description: Optional[str] = None
    is_holiday: bool = Field(True, description="True for no-class holidays, False for campus events/occasions")

class AcademicCalendarEventCreate(AcademicCalendarEventBase):
    pass

class AcademicCalendarEventUpdate(BaseModel):
    date: Optional[date] = None
    name: Optional[str] = None
    description: Optional[str] = None
    is_holiday: Optional[bool] = None

class AcademicCalendarEventResponse(AcademicCalendarEventBase):
    id: str
    calendar_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True
    }

class AcademicCalendarResponse(AcademicCalendarBase):
    id: str
    created_at: datetime
    updated_at: datetime
    events: List[AcademicCalendarEventResponse] = []

    model_config = {
        "from_attributes": True
    }
