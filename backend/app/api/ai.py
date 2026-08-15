import logging
import json
import re
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

@router.get("/ai/test_ping")
def test_ping():
    return {"ping": "PONG_VERSION_9999"}

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

from app.models.faculty import Department
from app.models.leave import SubstitutionProposal
from app.models.timetable import ExamTimetableEntry
from app.schemas.ai import DepartmentAnalyticsMetric

@router.get("/ai/analytics/dashboard", response_model=AnalyticsDashboardOutput)
async def get_analytics_dashboard(
    department_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Fetch Departments
    res_depts = await db.execute(select(Department))
    departments = res_depts.scalars().all()
    dept_map = {d.id: d for d in departments}

    # Fetch Faculty profiles
    stmt_fac = select(FacultyProfile).options(
        selectinload(FacultyProfile.user),
        selectinload(FacultyProfile.department)
    )
    if department_id and department_id != "ALL":
        stmt_fac = stmt_fac.where(FacultyProfile.department_id == department_id)
    res_fac = await db.execute(stmt_fac)
    faculties = res_fac.scalars().all()

    # Fetch Timetable entries with subjects
    stmt_tt = select(TimetableEntry).options(selectinload(TimetableEntry.subject))
    res_tt = await db.execute(stmt_tt)
    tt_entries = res_tt.scalars().all()

    # Fetch Approved Substitutions
    stmt_sub = select(SubstitutionProposal).where(SubstitutionProposal.status.in_(["APPROVED", "Approved", "ACCEPTED", "Accepted"]))
    res_sub = await db.execute(stmt_sub)
    sub_entries = res_sub.scalars().all()

    # Fetch Exam Invigilations
    stmt_inv = select(ExamTimetableEntry)
    res_inv = await db.execute(stmt_inv)
    inv_entries = res_inv.scalars().all()

    workload_metrics: List[FacultyWorkloadMetric] = []
    
    for fac in faculties:
        # Timetable entries assigned
        my_tt = [e for e in tt_entries if e.faculty_id == fac.id]
        theory_h = sum(1 for e in my_tt if not (e.subject and hasattr(e.subject, 'subject_type') and str(e.subject.subject_type).upper() == 'LAB'))
        lab_h = sum(1 for e in my_tt if e.subject and hasattr(e.subject, 'subject_type') and str(e.subject.subject_type).upper() == 'LAB')
        
        # Substitutions covering for others
        sub_h = sum(1 for s in sub_entries if s.substitute_faculty_id == fac.id)
        
        # Exam invigilations
        inv_h = sum(1 for iv in inv_entries if iv.invigilator_id == fac.id)

        total_active = theory_h + lab_h + sub_h + inv_h
        max_workload = fac.max_weekly_workload or 18
        utilization = round((total_active / max_workload) * 100, 1) if max_workload > 0 else 0.0
        
        status_str = "OPTIMAL"
        if utilization > 100:
            status_str = "OVERUTILIZED"
        elif utilization < 50:
            status_str = "UNDERUTILIZED"

        workload_metrics.append(FacultyWorkloadMetric(
            faculty_id=fac.id,
            faculty_name=fac.user.full_name if fac.user else "Faculty Member",
            department_code=fac.department.code if fac.department else "GEN",
            assigned_slots=len(my_tt),
            max_weekly_workload=max_workload,
            utilization_percentage=utilization,
            status=status_str,
            theory_hours=theory_h,
            lab_hours=lab_h,
            substitution_hours=sub_h,
            invigilation_hours=inv_h,
            total_active_hours=total_active
        ))

    # Calculate Department-Wise Analytics
    department_metrics: List[DepartmentAnalyticsMetric] = []
    for d in departments:
        dept_facs = [m for m in workload_metrics if m.department_code == d.code]
        if dept_facs:
            tot_faculty = len(dept_facs)
            tot_hours = sum(m.total_active_hours for m in dept_facs)
            avg_util = round(sum(m.utilization_percentage for m in dept_facs) / tot_faculty, 1)
            over_cnt = sum(1 for m in dept_facs if m.status == "OVERUTILIZED")
            under_cnt = sum(1 for m in dept_facs if m.status == "UNDERUTILIZED")
            department_metrics.append(DepartmentAnalyticsMetric(
                department_id=d.id,
                department_name=d.name,
                department_code=d.code,
                total_faculty=tot_faculty,
                total_teaching_hours=tot_hours,
                avg_utilization=avg_util,
                overutilized_count=over_cnt,
                underutilized_count=under_cnt
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
        classroom_metrics=classroom_metrics,
        department_metrics=department_metrics
    )

# ==========================================
# 3. CHATGPT-STYLE AI ASSISTANT & DECISION ENGINE
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
    
    # Fetch or create AI conversation
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
    prompt_normalized = prompt_lower.replace("leaves", "leave").replace("rules", "rule").replace("policies", "policy").replace("regulations", "regulation").replace("guidelines", "guideline")

    # Gather Context: Policies, Faculty Workloads, Classrooms, Timetables, Leaves
    pols_res = await db.execute(select(AcademicPolicy))
    policies = pols_res.scalars().all()

    fac_res = await db.execute(
        select(FacultyProfile).options(selectinload(FacultyProfile.user), selectinload(FacultyProfile.department))
    )
    faculties = fac_res.scalars().all()

    tt_res = await db.execute(select(TimetableEntry))
    tt_entries = tt_res.scalars().all()

    # Calculate workload for each faculty
    workload_list = []
    for f in faculties:
        assigned = sum(1 for e in tt_entries if e.faculty_id == f.id)
        max_w = f.max_weekly_workload or 18
        pct = round((assigned / max_w) * 100, 1) if max_w > 0 else 0.0
        dept_code = f.department.code if f.department else "GEN"
        name = f.user.full_name if f.user else "Faculty"
        workload_list.append({
            "id": f.id,
            "name": name,
            "dept": dept_code,
            "assigned": assigned,
            "max": max_w,
            "pct": pct,
            "status": "OVERUTILIZED" if pct > 100 else ("UNDERUTILIZED" if pct < 50 else "OPTIMAL")
        })

    workload_list.sort(key=lambda x: x["pct"], reverse=True)

    # Detect Department filter in prompt
    dept_matches = [d for d in ["cse", "csd", "csm", "ece", "eee", "it", "mech", "civil"] if d in prompt_lower]
    target_dept = dept_matches[0].upper() if dept_matches else None

    logger.info(f"AI_CHAT_PROMPT_RECEIVED: prompt='{chat_in.prompt}' | prompt_normalized='{prompt_normalized}'")

    reply_text = ""
    suggested_actions = []

    # --- CHATGPT-STYLE REASONING ENGINE ---

    # 1. FACULTY WORKLOAD / OVERUTILIZATION QUERY
    if any(k in prompt_normalized for k in ["overutilized", "underutilized", "busy", "workload", "capacity", "teaching hour"]):
        filtered_w = [w for w in workload_list if w["dept"] == target_dept] if target_dept else workload_list
        if not filtered_w:
            filtered_w = workload_list

        top_fac = filtered_w[0]
        dept_str = f"in **{target_dept}**" if target_dept else "across the institution"

        reply_lines = [
            "### 📊 Faculty Workload & Utilization Analysis",
            ""
        ]
        if top_fac['pct'] > 100:
            reply_lines.append(f"The most overutilized faculty member {dept_str} is **{top_fac['name']}** ({top_fac['dept']}) with **{top_fac['assigned']}/{top_fac['max']} assigned slots** (**{top_fac['pct']}% utilization**).")
        else:
            reply_lines.append(f"The faculty member with the highest assigned workload {dept_str} is **{top_fac['name']}** ({top_fac['dept']}) with **{top_fac['assigned']}/{top_fac['max']} slots** (**{top_fac['pct']}% utilization**).")

        reply_lines.append("")
        reply_lines.append("#### 📌 Active Workload Rankings:")
        for w in filtered_w[:4]:
            reply_lines.append(f"- **{w['name']}** ({w['dept']}): `{w['assigned']}/{w['max']} slots` ({w['pct']}%) — **{w['status']}**")

        reply_lines.append("")
        reply_lines.append("💡 *Recommendation: Consider redistributing slots or using the AI Auto-Scheduler to rebalance weekly teaching hours.*")

        reply_text = "\n".join(reply_lines)
        suggested_actions = [
            AISuggestedAction(action_type="VIEW_FACULTY_AVAILABILITY", label="Faculty Availability Grid", payload_json="{}"),
            AISuggestedAction(action_type="AUTO_SOLVE_TIMETABLE", label="Re-optimize Timetable", payload_json="{}")
        ]

    # 2. LEAVE RULES & REGULATIONS QUERY (Triggers for any leave query unless explicitly asking for active absentees/substitutes)
    elif "leave" in prompt_normalized and not any(sub_k in prompt_normalized for sub_k in ["absent", "substitute", "coverage", "pending"]):
        leave_pols = [p for p in policies if p.category == "LEAVE_POLICY"]
        if not leave_pols:
            leave_pols = policies

        reply_lines = [
            "### 📜 Institutional Leave & Substitution Regulations",
            "",
            "Here are the official institutional rules governing faculty leave applications and substitution coverage:",
            ""
        ]
        for p in leave_pols:
            reply_lines.append(f"#### 📌 {p.title}")
            reply_lines.append(f"{p.content}")
            if p.tags:
                reply_lines.append(f"*Category Tags*: `{p.tags}`")
            reply_lines.append("")

        reply_lines.append("#### 📋 Summary of Key Leave Guidelines:")
        reply_lines.append("1. **Advance Notice**: Leave applications must be submitted at least 24 hours in advance.")
        reply_lines.append("2. **Departmental Substitution**: Alternate coverage teachers must belong to the same department and possess subject expertise.")
        reply_lines.append("3. **Duty Leave Protection**: Official duty leaves (conferences, exam duties) do not deduct from casual leave balances.")
        reply_lines.append("")
        reply_lines.append("💡 *Note: HODs and Admins can create or update leave policies anytime via the **RAG Policies** tab.*")

        reply_text = "\n".join(reply_lines)
        suggested_actions = [
            AISuggestedAction(action_type="APPLY_SUBSTITUTION", label="Leave Operations Desk", payload_json="{}")
        ]

    # 3. ACTIVE ABSENCE / SUBSTITUTE COVERAGE LOOKUP
    elif any(k in prompt_normalized for k in ["who is absent", "pending leave", "substitute candidate", "active leave", "coverage for today"]):
        leaves_stmt = select(LeaveRequest).options(selectinload(LeaveRequest.faculty).selectinload(FacultyProfile.user)).order_by(LeaveRequest.created_at.desc())
        leaves_res = await db.execute(leaves_stmt)
        leaves = leaves_res.scalars().all()

        reply_lines = [
            "### 🔄 Live Substitution & Absence Report",
            ""
        ]
        if not leaves:
            reply_lines.append("Currently, there are **no pending or unassigned leave requests** requiring substitution coverage in the system.")
            reply_lines.append("")
            reply_lines.append("All scheduled sessions are fully covered by assigned primary faculty.")
        else:
            latest = leaves[0]
            applicant = latest.faculty.user.full_name if latest.faculty and latest.faculty.user else "Faculty Member"
            reply_lines.append(f"Found **{len(leaves)} active leave request(s)** in the registry:")
            reply_lines.append("")
            reply_lines.append(f"- **Applicant**: **{applicant}**")
            reply_lines.append(f"- **Leave Type**: `{latest.leave_type}`")
            reply_lines.append(f"- **Period**: {latest.start_date.strftime('%Y-%m-%d')} to {latest.end_date.strftime('%Y-%m-%d')}")
            reply_lines.append(f"- **Status**: `{latest.status}`")
            reply_lines.append("")
            reply_lines.append("Candidate substitute teachers are matched based on department affiliation, subject expertise, and free availability slots.")

        reply_text = "\n".join(reply_lines)
        suggested_actions = [
            AISuggestedAction(action_type="APPLY_SUBSTITUTION", label="Open Substitution Desk", payload_json="{}")
        ]

    # 4. CLASSROOM & ROOM OCCUPANCY QUERY
    elif any(k in prompt_normalized for k in ["room", "classroom", "occupancy", "free room", "seating", "hall"]):
        analytics = await get_analytics_dashboard(chat_in.department_id, current_user, db)
        reply_lines = [
            "### 🏫 Classroom & Lab Utilization Report",
            f"The overall campus classroom occupancy rate is **{analytics.average_room_occupancy}%** across {analytics.total_classrooms} registered rooms.",
            "",
            "**Room Occupancy Breakdown:**"
        ]
        for rm in analytics.classroom_metrics:
            reply_lines.append(f"- **Room {rm.room_number}** ({rm.room_type}): **{rm.booked_slots}/{rm.total_available_slots}** slots booked ({rm.occupancy_percentage}%)")

        reply_text = "\n".join(reply_lines)
        suggested_actions = [
            AISuggestedAction(action_type="VIEW_ROOM_GRID", label="Manage Classrooms Inventory", payload_json="{}")
        ]

    # 5. TIMETABLE SOLVER & CLASH QUERY
    elif any(k in prompt_normalized for k in ["generate", "solver", "clash", "schedule", "timetable", "autogenerate"]):
        reply_text = (
            "### ⚡ AI Master Timetable Solver Guidance\n\n"
            "The platform includes an automated backtracking solver engine that respects:\n"
            "1. **3-Slot Consecutive Labs**: Schedules computer labs in `COMPUTER_LAB` classrooms first.\n"
            "2. **Lunch & Activity Blocks**: Ignores slots marked for Lunch (Slot 4) or Saturday activities.\n"
            "3. **Zero Collisions**: Verifies classroom, teacher, and section cohort availability.\n\n"
            "Would you like to trigger the auto-generation wizard for your department?"
        )
        suggested_actions = [
            AISuggestedAction(action_type="AUTO_SOLVE_TIMETABLE", label="Open Auto-Scheduler Solver", payload_json="{}")
        ]

    # 6. GENERAL FREE-FORM CHATGPT-STYLE CONVERSATIONAL ENGINE
    else:
        pol_summary = "\n".join([f"- **{p.title}**: {p.content}" for p in policies[:3]])
        top_busy_name = workload_list[0]['name'] if workload_list else "Faculty"
        top_busy_pct = workload_list[0]['pct'] if workload_list else 0

        reply_text = (
            f"Hello {current_user.full_name}! I am your AI Operations & Decision Engine.\n\n"
            f"Regarding your prompt **\"{chat_in.prompt}\"**:\n\n"
            f"Here is a summary of relevant system intelligence and academic operational policies:\n\n"
            f"### 📌 Institutional Policy Regulations\n"
            f"{pol_summary}\n\n"
            f"### 📊 System Operations Overview\n"
            f"- **Active Faculty**: {len(workload_list)} registered profiles (Highest workload: **{top_busy_name}** at {top_busy_pct}%)\n"
            f"- **Timetable Entries**: {len(tt_entries)} scheduled sessions across all departments\n\n"
            "Feel free to ask any specific questions about faculty workload, leave rules, classroom availability, or timetable generation!"
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
