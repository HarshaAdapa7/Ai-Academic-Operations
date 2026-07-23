from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, List
from app.schemas.faculty import DepartmentResponse, SubjectResponse, FacultyProfileResponse
from app.schemas.classroom import ClassroomResponse

# --- Scheduling Rule Schemas ---
class SchedulingRuleCreate(BaseModel):
    department_id: Optional[str] = Field(None, description="Department UUID, Null for global college rules")
    slots_per_day: int = Field(7, ge=1, le=12, description="Number of daily teaching slots")
    days_active: str = Field("Monday,Tuesday,Wednesday,Thursday,Friday,Saturday", description="Comma-separated active days list")
    allow_classroom_overlap: bool = Field(False, description="Allow classroom overlaps")
    allow_faculty_overlap: bool = Field(False, description="Allow teacher schedule overlaps")
    lunch_slot: Optional[int] = Field(5, description="Slot index reserved for lunch break")
    activity_blocks: Optional[str] = Field("Saturday-5,Saturday-6,Saturday-7", description="Comma-separated Day-Slot blocks")

class SchedulingRuleResponse(BaseModel):
    id: str
    department_id: Optional[str]
    slots_per_day: int
    days_active: str
    allow_classroom_overlap: bool
    allow_faculty_overlap: bool
    lunch_slot: Optional[int]
    activity_blocks: Optional[str]
    created_at: datetime
    department: Optional[DepartmentResponse] = None

    model_config = {
        "from_attributes": True
    }

# --- Subject Scheduling Rules ---
class SubjectSchedulingRuleCreate(BaseModel):
    subject_id: str
    lectures_per_week: int = Field(3, ge=0, le=10)
    labs_per_week: int = Field(1, ge=0, le=5)
    lab_duration: int = Field(3, ge=1, le=4)

class SubjectSchedulingRuleResponse(BaseModel):
    id: str
    subject_id: str
    lectures_per_week: int
    labs_per_week: int
    lab_duration: int
    created_at: datetime
    subject: Optional[SubjectResponse] = None

    model_config = {
        "from_attributes": True
    }

# --- Timetable Entry Schemas ---
class TimetableEntryCreate(BaseModel):
    department_id: str
    section: str = Field(..., description="e.g. CSE 3-A")
    academic_year: int = Field(1, ge=1, le=4, description="Academic Year (1-4)")
    day_of_week: str = Field(..., description="Monday, Tuesday, etc.")
    time_slot: int = Field(..., ge=1, le=12)
    subject_id: str
    faculty_id: str
    classroom_id: str
    lab_batch: str = Field("ALL", description="ALL, BATCH_A, BATCH_B")

class TimetableEntryResponse(BaseModel):
    id: str
    department_id: str
    section: str
    academic_year: int
    day_of_week: str
    time_slot: int
    subject_id: str
    faculty_id: str
    classroom_id: str
    lab_batch: str
    created_at: datetime
    department: Optional[DepartmentResponse] = None
    subject: Optional[SubjectResponse] = None
    faculty: Optional[FacultyProfileResponse] = None
    classroom: Optional[ClassroomResponse] = None

    model_config = {
        "from_attributes": True
    }

# --- Exam Timetable Schemas ---
class ExamTimetableEntryCreate(BaseModel):
    exam_date: datetime
    time_slot: int
    subject_id: str
    classroom_id: str
    invigilator_id: Optional[str] = None

class ExamTimetableEntryResponse(BaseModel):
    id: str
    exam_date: datetime
    time_slot: int
    subject_id: str
    classroom_id: str
    invigilator_id: Optional[str]
    created_at: datetime
    subject: Optional[SubjectResponse] = None
    classroom: Optional[ClassroomResponse] = None
    invigilator: Optional[FacultyProfileResponse] = None

    model_config = {
        "from_attributes": True
    }
