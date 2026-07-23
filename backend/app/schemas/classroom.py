from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, List
from app.schemas.faculty import DepartmentResponse, SubjectResponse

# --- Classroom Schemas ---
class ClassroomCreate(BaseModel):
    room_number: str = Field(..., description="e.g. Block-A Room 302")
    capacity: int = Field(..., ge=1, description="Total physical seating capacity")
    rows: int = Field(..., ge=1, description="Number of visual rows in seating grid")
    cols: int = Field(..., ge=1, description="Number of visual columns in seating grid")
    room_type: str = Field("LECTURE_HALL", description="LECTURE_HALL, COMPUTER_LAB, SEMINAR_ROOM")
    department_id: Optional[str] = Field(None, description="Department UUID ownership block")

class ClassroomResponse(BaseModel):
    id: str
    room_number: str
    capacity: int
    rows: int
    cols: int
    room_type: str
    department_id: Optional[str]
    created_at: datetime
    department: Optional[DepartmentResponse] = None

    model_config = {
        "from_attributes": True
    }

# --- Seating Assignment Schemas ---
class SeatingAssignmentResponse(BaseModel):
    id: str
    seating_plan_id: str
    classroom_id: str
    student_roll_no: str
    student_name: str
    subject_id: str
    row_index: int
    col_index: int
    classroom: ClassroomResponse
    subject: SubjectResponse

    model_config = {
        "from_attributes": True
    }

# --- Seating Plan Generation Wizard Schemas ---
class StudentInfo(BaseModel):
    roll_no: str = Field(..., description="Unique Student Roll Number")
    name: str = Field(..., description="Student Full Name")

class CourseStudentInput(BaseModel):
    subject_id: str = Field(..., description="Subject UUID")
    students: List[StudentInfo] = Field(..., description="List of students registered for this course")

class SeatingPlanCreate(BaseModel):
    exam_date: datetime = Field(..., description="Exam/Session Date")
    time_slot: int = Field(..., ge=1, le=6, description="Slot index (1-6)")
    classroom_ids: List[str] = Field(..., description="List of classroom UUIDs to distribute students in")
    courses: List[CourseStudentInput] = Field(..., description="List of courses and their student listings")

class SeatingPlanResponse(BaseModel):
    id: str
    exam_date: datetime
    time_slot: int
    created_at: datetime
    assignments: List[SeatingAssignmentResponse] = []

    model_config = {
        "from_attributes": True
    }
