import logging
import json
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.faculty import FacultyProfile, FacultyAvailability, Department, Subject
from app.models.classroom import Classroom
from app.models.leave import LeaveRequest, FacultyLeaveBalance
from app.models.timetable import SchedulingRule, TimetableEntry
from app.models.ai import AIConversation, AIMessage, AcademicPolicy
from app.schemas.ai import (
    AcademicPolicyCreate, AcademicPolicyResponse,
    AIChatInput, AIChatOutput, AISuggestedAction,
    AIConversationResponse, AIMessageResponse,
    AnalyticsDashboardOutput, FacultyWorkloadMetric, ClassroomUtilizationMetric
)
from app.api.deps import get_current_user

logger = logging.getLogger("ai-api")

router = APIRouter()

# ==========================================
# 1. RAG ACADEMIC POLICIES KNOWLEDGE BASE
# ==========================================

async def seed_default_policies_if_empty(db: AsyncSession):
    stmt = select(AcademicPolicy)
    res = await db.execute(stmt)
    if not res.scalars().first():
        default_policies = [
            AcademicPolicy(
                title="Leave & Substitution Regulations",
                category="LEAVE_POLICY",
                content="Faculty members must submit leave applications at least 24 hours prior. Substitutes must belong to the same department and hold expertise in the assigned subject course.",
                tags="leave,substitution,approval,hod"
            ),
            AcademicPolicy(
                title="Engineering Lab Session Duration Policy",
                category="TIMETABLE_RULES",
                content="All B.Tech computer lab sessions must be scheduled as 3 consecutive slots in registered COMPUTER_LAB classrooms to allow hands-on programming exercises.",
                tags="labs,slots,consecutive,computer_lab"
            ),
            AcademicPolicy(
                title="Faculty Workload Allocation Limits",
                category="WORKLOAD_POLICY",
                content="Full professors are capped at 16 weekly teaching sessions. Associate professors and assistant professors are capped at 18 and 20 sessions per week respectively.",
                tags="workload,capacity,hours,faculty"
            ),
            AcademicPolicy(
                title="Exam Hall Invigilation Shield",
                category="EXAM_RULES",
                content="HODs and invigilators assigned to exam halls cannot be double-booked for multiple halls or regular teaching duties at identical time slots.",
                tags="exam,invigilator,collision,hall"
            )
        ]
        db.add_all(default_policies)
        await db.commit()

@router.get("/ai/policies", response_model=List[AcademicPolicyResponse])
async def list_academic_policies(
    category: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await seed_default_policies_if_empty(db)
    stmt = select(AcademicPolicy)
    if category:
        stmt = stmt.where(AcademicPolicy.category == category)
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/ai/policies", response_model=AcademicPolicyResponse)
async def create_academic_policy(
    policy_in: AcademicPolicyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role not in [UserRole.HOD, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to manage institution academic policies.")

    policy = AcademicPolicy(
        title=policy_in.title,
        category=policy_in.category,
        content=policy_in.content,
        tags=policy_in.tags
    )
    db.add(policy)
    await db.commit()
    await db.refresh(policy)
    return policy

# ==========================================
# 2. ANALYTICS & UTILIZATION ENGINE
# ==========================================

@router.get("/ai/analytics/dashboard", response_model=AnalyticsDashboardOutput)
async def get_analytics_dashboard(
    department_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Fetch Faculty profiles
    stmt_fac = select(FacultyProfile).options(
        selectinload(FacultyProfile.user),
        selectinload(FacultyProfile.department)
    )
    if department_id:
        stmt_fac = stmt_fac.where(FacultyProfile.department_id == department_id)
    res_fac = await db.execute(stmt_fac)
    faculties = res_fac.scalars().all()

    # Fetch Timetable entries to count assigned slots
    stmt_tt = select(TimetableEntry)
    res_tt = await db.execute(stmt_tt)
    tt_entries = res_tt.scalars().all()

    workload_metrics: List[FacultyWorkloadMetric] = []
    for fac in faculties:
        assigned = sum(1 for e in tt_entries if e.faculty_profile_id == fac.id)
        max_workload = fac.max_weekly_workload or 18
        utilization = round((assigned / max_workload) * 100, 1) if max_workload > 0 else 0.0
        
        status_str = "OPTIMAL"
        if utilization > 100:
            status_str = "OVERUTILIZED"
        elif utilization < 50:
            status_str = "UNDERUTILIZED"

        workload_metrics.append(FacultyWorkloadMetric(
            faculty_id=fac.id,
            faculty_name=fac.user.full_name if fac.user else "Faculty Member",
            department_code=fac.department.code if fac.department else "GEN",
            assigned_slots=assigned,
            max_weekly_workload=max_workload,
            utilization_percentage=utilization,
            status=status_str
        ))

    # Fetch Classrooms & Occupancy
    stmt_rm = select(Classroom)
    res_rm = await db.execute(stmt_rm)
    rooms = res_rm.scalars().all()

    classroom_metrics: List[ClassroomUtilizationMetric] = []
    TOTAL_WEEKLY_AVAILABLE_SLOTS = 48  # 6 days * 8 slots

    for rm in rooms:
        booked = sum(1 for e in tt_entries if e.classroom_id == rm.id)
        occ_pct = round((booked / TOTAL_WEEKLY_AVAILABLE_SLOTS) * 100, 1)

        classroom_metrics.append(ClassroomUtilizationMetric(
            classroom_id=rm.id,
            room_number=rm.room_number,
            room_type=rm.room_type.value if hasattr(rm.room_type, 'value') else str(rm.room_type),
            capacity=rm.capacity,
            booked_slots=booked,
            total_available_slots=TOTAL_WEEKLY_AVAILABLE_SLOTS,
            occupancy_percentage=occ_pct
        ))

    avg_faculty_util = round(
        sum(m.utilization_percentage for m in workload_metrics) / len(workload_metrics), 1
    ) if workload_metrics else 0.0

    avg_room_occ = round(
        sum(m.occupancy_percentage for m in classroom_metrics) / len(classroom_metrics), 1
    ) if classroom_metrics else 0.0

    return AnalyticsDashboardOutput(
        total_faculty=len(workload_metrics),
        total_classrooms=len(classroom_metrics),
        total_timetable_slots=len(tt_entries),
        average_faculty_utilization=avg_faculty_util,
        average_room_occupancy=avg_room_occ,
        workload_metrics=workload_metrics,
        classroom_metrics=classroom_metrics
    )

# ==========================================
# 3. AI ASSISTANT CHAT & DECISION ENGINE
# ==========================================

@router.get("/ai/conversations", response_model=List[AIConversationResponse])
async def list_user_conversations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(AIConversation)
        .where(AIConversation.user_id == current_user.id)
        .order_by(AIConversation.updated_at.desc())
    )
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/ai/chat", response_model=AIChatOutput)
async def ai_chat_consultation(
    chat_in: AIChatInput,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await seed_default_policies_if_empty(db)
    
    # 1. Fetch or create AI conversation
    conversation = None
    if chat_in.conversation_id:
        stmt = select(AIConversation).where(AIConversation.id == chat_in.conversation_id, AIConversation.user_id == current_user.id)
        res = await db.execute(stmt)
        conversation = res.scalars().first()

    if not conversation:
        title_snippet = chat_in.prompt[:35] + ("..." if len(chat_in.prompt) > 35 else "")
        conversation = AIConversation(
            user_id=current_user.id,
            title=f"Consultation: {title_snippet}"
        )
        db.add(conversation)
        await db.commit()
        await db.refresh(conversation)

    # Save User message
    user_msg = AIMessage(
        conversation_id=conversation.id,
        sender_role="user",
        content=chat_in.prompt
    )
    db.add(user_msg)
    await db.commit()

    prompt_lower = chat_in.prompt.lower()
    reply_text = ""
    suggested_actions = []

    # --- AGENT TOOL & NLP REASONING DISPATCHER ---

    # 1. RAG Policy & Rules Query (Highest Priority for Rules, Policy, Regulations)
    if any(k in prompt_lower for k in ["rule", "rules", "policy", "policies", "regulation", "regulations", "guideline", "guidelines", "duty leave", "lab hour", "invigilation", "exam rule", "workload policy"]) or ("leave" in prompt_lower and any(w in prompt_lower for w in ["rule", "policy", "system", "give", "show", "what", "tell", "explain", "detail"])):
        policies_stmt = select(AcademicPolicy)
        policies_res = await db.execute(policies_stmt)
        policies = policies_res.scalars().all()

        # Find matching policy documents by keyword overlap
        words = [w for w in prompt_lower.replace("?", "").replace(".", "").split() if len(w) > 2]
        matching_pol = [
            p for p in policies 
            if any(w in p.title.lower() or w in p.content.lower() or (p.tags and w in p.tags.lower()) for w in words)
        ]
        
        # Fallback category match if specific words didn't filter down
        if not matching_pol:
            if "leave" in prompt_lower:
                matching_pol = [p for p in policies if p.category == "LEAVE_POLICY"]
            elif "lab" in prompt_lower or "timetable" in prompt_lower or "slot" in prompt_lower:
                matching_pol = [p for p in policies if p.category == "TIMETABLE_RULES"]
            elif "workload" in prompt_lower or "capacity" in prompt_lower:
                matching_pol = [p for p in policies if p.category == "WORKLOAD_POLICY"]
            elif "exam" in prompt_lower:
                matching_pol = [p for p in policies if p.category == "EXAM_RULES"]

        if not matching_pol:
            matching_pol = policies

        reply_lines = [
            "### 📜 RAG Academic Regulations & Policy Knowledge Base",
            f"Here are the active institutional rules and policy regulations retrieved for **\"{chat_in.prompt}\"**:",
            ""
        ]
        for p in matching_pol:
            reply_lines.append(f"#### 📌 {p.title} (`{p.category}`)")
            reply_lines.append(f"{p.content}")
            if p.tags:
                reply_lines.append(f"*Tags*: `{p.tags}`")
            reply_lines.append("")

        reply_lines.append("---")
        reply_lines.append("💡 *Note: HODs and Admins can add or update custom policy documents anytime via the **RAG Policies** tab.*")
        reply_text = "\n".join(reply_lines)
        suggested_actions = [
            AISuggestedAction(action_type="APPLY_SUBSTITUTION", label="Leave Operations Desk", payload_json="{}"),
            AISuggestedAction(action_type="AUTO_SOLVE_TIMETABLE", label="Timetable Solver", payload_json="{}")
        ]

    # 2. Faculty Workload & Capacity Query
    elif any(k in prompt_lower for k in ["workload", "overutilized", "underutilized", "busy", "capacity", "teaching hours"]):
        analytics = await get_analytics_dashboard(chat_in.department_id, current_user, db)
        top_busy = sorted(analytics.workload_metrics, key=lambda m: m.utilization_percentage, reverse=True)[:3]
        
        reply_lines = [
            "### 📊 Faculty Workload Analysis",
            f"The current average faculty utilization rate is **{analytics.average_faculty_utilization}%** across {analytics.total_faculty} faculty members.",
            "",
            "**Top Active Workload Profiles:**"
        ]
        for m in top_busy:
            reply_lines.append(f"- **{m.faculty_name}** ({m.department_code}): **{m.assigned_slots}/{m.max_weekly_workload}** slots ({m.utilization_percentage}%) — *{m.status}*")

        reply_lines.append("")
        reply_lines.append("Would you like to adjust scheduling rules or review individual availability matrices?")

        reply_text = "\n".join(reply_lines)
        suggested_actions = [
            AISuggestedAction(action_type="VIEW_FACULTY_AVAILABILITY", label="Review Availability Grids", payload_json="{}"),
            AISuggestedAction(action_type="AUTO_SOLVE_TIMETABLE", label="Re-optimize Timetable", payload_json="{}")
        ]

    # 3. Active Leave & Substitute Coverage Query
    elif any(k in prompt_lower for k in ["substitute", "substitution", "coverage", "absent", "replace", "pending leave", "who is absent", "applied leave"]):
        # Query active leaves
        leaves_stmt = select(LeaveRequest).options(selectinload(LeaveRequest.faculty).selectinload(FacultyProfile.user)).order_by(LeaveRequest.created_at.desc())
        leaves_res = await db.execute(leaves_stmt)
        leaves = leaves_res.scalars().all()

        reply_lines = [
            "### 🔄 Substitution Coverage Advisor",
            "I searched the leave registry for active absence applications and coverage matching rules.",
            ""
        ]

        if not leaves:
            reply_lines.append("No active leave requests are currently pending substitution coverage.")
        else:
            latest_leave = leaves[0]
            applicant_name = latest_leave.faculty.user.full_name if latest_leave.faculty and latest_leave.faculty.user else "Faculty Member"
            reply_lines.append(f"**Latest Leave Request**: {applicant_name} ({latest_leave.leave_type})")
            reply_lines.append(f"- **Dates**: {latest_leave.start_date.strftime('%Y-%m-%d')} to {latest_leave.end_date.strftime('%Y-%m-%d')}")
            reply_lines.append(f"- **Reason**: {latest_leave.reason}")
            reply_lines.append(f"- **Status**: `{latest_leave.status}`")
            reply_lines.append("")
            reply_lines.append("Recommended candidate substitutes are filtered by department affiliation, subject expertise, and availability matrix alignment.")

        reply_text = "\n".join(reply_lines)
        suggested_actions = [
            AISuggestedAction(action_type="APPLY_SUBSTITUTION", label="Open Substitution Desk", payload_json="{}")
        ]

    # 4. Classroom / Lab Occupancy Query
    elif any(k in prompt_lower for k in ["room", "classroom", "occupancy", "free room", "seating", "hall"]):
        analytics = await get_analytics_dashboard(chat_in.department_id, current_user, db)
        reply_lines = [
            "### 🏫 Classroom & Lab Utilization Report",
            f"The overall campus classroom occupancy rate is **{analytics.average_room_occupancy}%** across {analytics.total_classrooms} rooms.",
            "",
            "**Room Occupancy Breakdown:**"
        ]
        for rm in analytics.classroom_metrics:
            reply_lines.append(f"- **Room {rm.room_number}** ({rm.room_type}): **{rm.booked_slots}/{rm.total_available_slots}** slots booked ({rm.occupancy_percentage}%)")

        reply_text = "\n".join(reply_lines)
        suggested_actions = [
            AISuggestedAction(action_type="VIEW_ROOM_GRID", label="Manage Classrooms Inventory", payload_json="{}")
        ]

    # 5. Timetable Solver / Clash Query
    elif any(k in prompt_lower for k in ["generate", "solver", "clash", "schedule", "timetable", "autogenerate"]):
        reply_text = (
            "### ⚡ AI Master Timetable Solver Guidance\n"
            "The platform includes an automated backtracking solver engine that respects:\n"
            "1. **3-Slot Consecutive Labs**: Schedules computer labs in `COMPUTER_LAB` classrooms first.\n"
            "2. **Lunch & Activity Blocks**: Ignores slots marked for Lunch (e.g. Slot 4) or Saturday activities.\n"
            "3. **Zero Collisions**: Verifies classroom, teacher, and section cohort availability.\n\n"
            "Would you like to trigger the auto-generation wizard for your department?"
        )
        suggested_actions = [
            AISuggestedAction(action_type="AUTO_SOLVE_TIMETABLE", label="Open Auto-Scheduler Solver", payload_json="{}")
        ]

    # 6. Intelligent Conversational & General Query NLP Fallback
    else:
        # Fetch policies and analytics summary to answer general questions
        policies_stmt = select(AcademicPolicy)
        policies_res = await db.execute(policies_stmt)
        all_pols = policies_res.scalars().all()
        
        pol_titles = ", ".join([f"'{p.title}'" for p in all_pols[:3]])
        analytics = await get_analytics_dashboard(chat_in.department_id, current_user, db)

        reply_text = (
            f"Hello {current_user.full_name}! I am your AI Operations & Decision Engine.\n\n"
            f"Regarding **\"{chat_in.prompt}\"**:\n\n"
            f"I have direct access to our live institutional database and RAG academic policy knowledge base.\n\n"
            f"**Current System Overview:**\n"
            f"- **Faculty Members**: {analytics.total_faculty} active profiles ({analytics.average_faculty_utilization}% average workload utilization)\n"
            f"- **Classrooms & Labs**: {analytics.total_classrooms} registered rooms ({analytics.average_room_occupancy}% campus occupancy rate)\n"
            f"- **RAG Institutional Policies**: Available regulations include {pol_titles}.\n\n"
            "Feel free to ask me any questions about leave rules, faculty workload, classroom availability, exam seating, or timetable generation!"
        )
        suggested_actions = [
            AISuggestedAction(action_type="AUTO_SOLVE_TIMETABLE", label="Auto-Schedule Timetable", payload_json="{}"),
            AISuggestedAction(action_type="APPLY_SUBSTITUTION", label="Substitution Desk", payload_json="{}"),
            AISuggestedAction(action_type="VIEW_ROOM_GRID", label="Classrooms Inventory", payload_json="{}")
        ]

    # Save Assistant message
    actions_json = json.dumps([a.model_dump() for a in suggested_actions])
    assistant_msg = AIMessage(
        conversation_id=conversation.id,
        sender_role="assistant",
        content=reply_text,
        suggested_actions_json=actions_json
    )
    db.add(assistant_msg)
    await db.commit()

    return AIChatOutput(
        conversation_id=conversation.id,
        reply=reply_text,
        suggested_actions=suggested_actions
    )
