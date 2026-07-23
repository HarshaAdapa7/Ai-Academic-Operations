from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

# --- Academic Policy RAG Schemas ---
class AcademicPolicyCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=255)
    category: str = Field("LEAVE_POLICY", description="LEAVE_POLICY, TIMETABLE_RULES, EXAM_RULES, WORKLOAD_POLICY")
    content: str = Field(..., min_length=10)
    tags: Optional[str] = Field(None, description="Comma-separated tags")

class AcademicPolicyResponse(BaseModel):
    id: str
    title: str
    category: str
    content: str
    tags: Optional[str]
    created_at: datetime

    model_config = {
        "from_attributes": True
    }

# --- Suggested Actions ---
class AISuggestedAction(BaseModel):
    action_type: str = Field(..., description="APPLY_SUBSTITUTION, AUTO_SOLVE_TIMETABLE, VIEW_FACULTY_AVAILABILITY, VIEW_ROOM_GRID")
    label: str
    payload_json: str

# --- AI Chat Schemas ---
class AIChatInput(BaseModel):
    prompt: str = Field(..., min_length=1)
    conversation_id: Optional[str] = None
    department_id: Optional[str] = None

class AIMessageResponse(BaseModel):
    id: str
    sender_role: str
    content: str
    suggested_actions_json: Optional[str]
    created_at: datetime

    model_config = {
        "from_attributes": True
    }

class AIConversationResponse(BaseModel):
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    messages: List[AIMessageResponse] = []

    model_config = {
        "from_attributes": True
    }

class AIChatOutput(BaseModel):
    conversation_id: str
    reply: str
    suggested_actions: List[AISuggestedAction] = []

# --- Analytics Schemas ---
class FacultyWorkloadMetric(BaseModel):
    faculty_id: str
    faculty_name: str
    department_code: str
    assigned_slots: int
    max_weekly_workload: int
    utilization_percentage: float
    status: str # "OVERUTILIZED", "OPTIMAL", "UNDERUTILIZED"

class ClassroomUtilizationMetric(BaseModel):
    classroom_id: str
    room_number: str
    room_type: str
    capacity: int
    booked_slots: int
    total_available_slots: int
    occupancy_percentage: float

class AnalyticsDashboardOutput(BaseModel):
    total_faculty: int
    total_classrooms: int
    total_timetable_slots: int
    average_faculty_utilization: float
    average_room_occupancy: float
    workload_metrics: List[FacultyWorkloadMetric]
    classroom_metrics: List[ClassroomUtilizationMetric]
