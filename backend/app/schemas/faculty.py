from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, List

# --- Department Schemas ---
class DepartmentBase(BaseModel):
    name: str = Field(..., description="Name of the department")
    code: str = Field(..., description="Unique department code, e.g. CSE")

class DepartmentCreate(DepartmentBase):
    pass

class DepartmentResponse(DepartmentBase):
    id: str
    created_at: datetime

    model_config = {
        "from_attributes": True
    }

# --- Subject Schemas ---
class SubjectBase(BaseModel):
    name: str = Field(..., description="Subject title")
    code: str = Field(..., description="Unique subject code, e.g. CS302")
    department_id: str = Field(..., description="Associated Department UUID")
    credits: int = Field(3, ge=1, le=6, description="Subject credits (1-6)")
    subject_type: str = Field("THEORY", description="THEORY, LAB, ELECTIVE, COUNSELLING, SPORTS_LIBRARY")
    is_parallel_lab: bool = Field(False, description="Dual parallel split-batch lab flag")
    parallel_subject_id: Optional[str] = Field(None, description="Linked Subject Y for dual lab")
    academic_year: int = Field(1, ge=1, le=4, description="Academic year (1-4)")

class SubjectCreate(SubjectBase):
    pass

class SubjectResponse(SubjectBase):
    id: str
    created_at: datetime
    parallel_subject: Optional['SubjectResponse'] = None

    model_config = {
        "from_attributes": True
    }

# --- Faculty Profile Schemas ---
class FacultyProfileCreate(BaseModel):
    user_id: str = Field(..., description="Target User account UUID")
    department_id: Optional[str] = Field(None, description="Department UUID")
    designation: str = Field(..., description="Academic designation, e.g. Associate Professor")
    is_hod: bool = Field(False, description="HOD status flag")
    is_dean: bool = Field(False, description="Academic Dean status flag (Rule 21)")
    max_weekly_workload: int = Field(16, ge=1, le=40, description="Max weekly teaching hours")
    office_hours: Optional[str] = Field(None, description="Office hours schedule")
    subject_ids: List[str] = Field(default=[], description="List of Subject UUIDs this faculty can teach")

class FacultyProfileUpdate(BaseModel):
    department_id: Optional[str] = Field(None, description="Department UUID")
    designation: str = Field(..., description="Academic designation")
    is_hod: bool = Field(False, description="HOD status flag")
    is_dean: bool = Field(False, description="Academic Dean status flag (Rule 21)")
    max_weekly_workload: int = Field(16, ge=1, le=40, description="Max weekly teaching hours")
    office_hours: Optional[str] = Field(None, description="Office hours schedule")
    subject_ids: List[str] = Field(default=[], description="List of Subject UUIDs this faculty can teach")

# Nested User details inside Profile response
class UserMiniResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str

    model_config = {
        "from_attributes": True
    }

class FacultyProfileResponse(BaseModel):
    id: str
    user_id: str
    department_id: Optional[str] = None
    designation: str
    is_hod: bool
    is_dean: bool
    max_weekly_workload: int
    current_weekly_workload: int
    office_hours: Optional[str] = None
    created_at: datetime
    
    # Nested relations
    user: UserMiniResponse
    department: Optional[DepartmentResponse] = None
    subjects: List[SubjectResponse] = []

    model_config = {
        "from_attributes": True
    }

# --- Section Config Schemas ---
class SectionConfigBase(BaseModel):
    department_id: str = Field(..., description="Department UUID")
    academic_year: int = Field(1, ge=1, le=4, description="Academic Year (1-4)")
    name: str = Field(..., description="Section Name, e.g. CSE 3-A")
    class_teacher_id: Optional[str] = Field(None, description="Faculty ID of Class Teacher")
    counseling_mentor_ids: List[str] = Field(default=[], description="List of Faculty IDs of Counseling Mentors (Rule 18)")

class SectionConfigCreate(SectionConfigBase):
    pass

class SectionConfigResponse(BaseModel):
    id: str
    department_id: str
    academic_year: int
    name: str
    class_teacher_id: Optional[str] = None
    created_at: datetime
    department: Optional[DepartmentResponse] = None
    class_teacher: Optional[FacultyProfileResponse] = None
    counseling_mentors: List[FacultyProfileResponse] = []

    model_config = {
        "from_attributes": True
    }

# Rebuild Pydantic forward references for SubjectResponse recursive type
SubjectResponse.model_rebuild()

# --- Availability Schemas ---
class AvailabilityItem(BaseModel):
    day_of_week: str = Field(..., description="Name of day (e.g. Monday)")
    time_slot: int = Field(..., ge=1, le=12, description="Slot index (1-12)")
    is_available: bool = Field(True, description="Slot availability status")

class AvailabilityUpdate(BaseModel):
    availabilities: List[AvailabilityItem] = Field(..., description="Full list of slot configurations")
