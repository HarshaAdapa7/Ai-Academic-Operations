from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, List
from app.schemas.faculty import SubjectResponse

# --- Leave Balance Schemas ---
class LeaveBalanceResponse(BaseModel):
    id: str
    faculty_id: str
    leave_type: str
    total_allowed: int
    taken: int

    model_config = {
        "from_attributes": True
    }

# --- Substitution Proposal Schemas ---
class SubProposalCreate(BaseModel):
    day_of_week: str = Field(..., description="e.g. Monday")
    time_slot: int = Field(..., ge=1, le=6, description="Slot index (1-6)")
    subject_id: str = Field(..., description="Subject UUID to cover")
    substitute_faculty_id: str = Field(..., description="Target substitute faculty profile UUID")

# Simplified profile return structure to avoid schema recursion loops
class FacultyProfileMini(BaseModel):
    id: str
    designation: str
    user: str # Will map user full_name

    model_config = {
        "from_attributes": True
    }

class SubProposalResponse(BaseModel):
    id: str
    leave_request_id: str
    day_of_week: str
    time_slot: int
    subject_id: str
    original_faculty_id: str
    substitute_faculty_id: str
    status: str
    created_at: datetime
    
    # Nested info
    subject: SubjectResponse

    model_config = {
        "from_attributes": True
    }

# --- Leave Request Schemas ---
class LeaveRequestCreate(BaseModel):
    leave_type: str = Field(..., description="Casual, Sick, or Duty")
    start_date: datetime = Field(..., description="Start of leave period")
    end_date: datetime = Field(..., description="End of leave period")
    reason: str = Field(..., description="Detailed reason for the leave")
    substitution_proposals: List[SubProposalCreate] = Field(default=[], description="Proposed slot coverage list")

# Faculty profile reference in leave list
class LeaveApplicantProfile(BaseModel):
    id: str
    designation: str
    user_name: str # Mapping of user.full_name
    department_code: Optional[str] = None # Mapping of department.code

    model_config = {
        "from_attributes": True
    }

class LeaveRequestResponse(BaseModel):
    id: str
    faculty_id: str
    leave_type: str
    start_date: datetime
    end_date: datetime
    reason: str
    status: str
    created_at: datetime
    
    # Nesting
    substitution_proposals: List[SubProposalResponse] = []

    model_config = {
        "from_attributes": True
    }

class LeaveStatusUpdate(BaseModel):
    status: str = Field(..., description="APPROVED or REJECTED")
