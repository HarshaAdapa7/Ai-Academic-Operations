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
    # Enforce role-based department restrictions for HOD
    if current_user.role == UserRole.HOD:
        hod_prof_stmt = select(FacultyProfile).where(FacultyProfile.user_id == current_user.id)
        hod_prof_res = await db.execute(hod_prof_stmt)
        hod_prof = hod_prof_res.scalars().first()
        if hod_prof and hod_prof.department_id:
            department_id = hod_prof.department_id
        else:
            # If HOD has no department assigned, return empty dashboard
            return AnalyticsDashboardOutput(
                total_faculty=0,
                total_classrooms=0,
                total_timetable_slots=0,
                average_faculty_utilization=0.0,
                average_room_occupancy=0.0,
                workload_metrics=[],
                classroom_metrics=[]
            )

    # 1. Fetch Faculty Workloads
    fac_stmt = select(FacultyProfile).options(selectinload(FacultyProfile.user), selectinload(FacultyProfile.department))
    if department_id:
        fac_stmt = fac_stmt.where(FacultyProfile.department_id == department_id)
    fac_res = await db.execute(fac_stmt)
    faculty_profiles = fac_res.scalars().all()

    # 2. Fetch Classroom Occupancy
    rooms_stmt = select(Classroom)
    if department_id:
        rooms_stmt = rooms_stmt.where(Classroom.department_id == department_id)
    rooms_res = await db.execute(rooms_stmt)
    classrooms = rooms_res.scalars().all()

    # 3. Fetch Timetable Entries (optimizing N+1 query problem by doing single query & in-memory counts)
    entries_stmt = select(TimetableEntry)
    if department_id:
        entries_stmt = entries_stmt.where(TimetableEntry.department_id == department_id)
    entries_res = await db.execute(entries_stmt)
    all_entries = entries_res.scalars().all()

    # Map slot counts
    faculty_counts = {}
    room_counts = {}
    for entry in all_entries:
        faculty_counts[entry.faculty_id] = faculty_counts.get(entry.faculty_id, 0) + 1
        room_counts[entry.classroom_id] = room_counts.get(entry.classroom_id, 0) + 1

    # Build Faculty Workload metrics
    workload_metrics = []
    total_fac_util = 0.0

    for prof in faculty_profiles:
        allocated_count = faculty_counts.get(prof.id, 0)
        max_cap = prof.max_weekly_workload if prof.max_weekly_workload > 0 else 16
        util_pct = round((allocated_count / max_cap) * 100, 1)
        total_fac_util += util_pct

        status_str = "OPTIMAL"
        if util_pct >= 90.0:
            status_str = "OVERUTILIZED"
        elif util_pct < 40.0:
            status_str = "UNDERUTILIZED"

        workload_metrics.append(FacultyWorkloadMetric(
            faculty_id=prof.id,
            faculty_name=prof.user.full_name if prof.user else "Faculty Member",
            department_code=prof.department.code if prof.department else "GEN",
            assigned_slots=allocated_count,
            max_weekly_workload=max_cap,
            utilization_percentage=util_pct,
            status=status_str
        ))

    avg_fac_util = round(total_fac_util / len(faculty_profiles), 1) if faculty_profiles else 0.0

    # Build Classroom Utilization metrics
    classroom_metrics = []
    total_room_occ = 0.0

    # Assume 6 active days * 6 slots = 36 available slots per week
    MAX_WEEKLY_SLOTS = 36

    for room in classrooms:
        booked_count = room_counts.get(room.id, 0)
        occ_pct = round((booked_count / MAX_WEEKLY_SLOTS) * 100, 1)
        total_room_occ += occ_pct

        classroom_metrics.append(ClassroomUtilizationMetric(
            classroom_id=room.id,
            room_number=room.room_number,
            room_type=room.room_type,
            capacity=room.capacity,
            booked_slots=booked_count,
            total_available_slots=MAX_WEEKLY_SLOTS,
            occupancy_percentage=occ_pct
        ))

    avg_room_occ = round(total_room_occ / len(classrooms), 1) if classrooms else 0.0

    return AnalyticsDashboardOutput(
        total_faculty=len(faculty_profiles),
        total_classrooms=len(classrooms),
        total_timetable_slots=len(all_entries),
        average_faculty_utilization=avg_fac_util,
        average_room_occupancy=avg_room_occ,
        workload_metrics=workload_metrics,
        classroom_metrics=classroom_metrics
    )

# ==========================================
# 3. CONVERSATIONAL AGENT & REASONING ENGINE
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

<<<<<<< HEAD
    # Fetch base entities for name matching from database
    fac_stmt = select(FacultyProfile).options(
        selectinload(FacultyProfile.user),
        selectinload(FacultyProfile.department)
    )
    fac_res = await db.execute(fac_stmt)
    all_faculties = fac_res.scalars().all()

    rooms_stmt = select(Classroom)
    rooms_res = await db.execute(rooms_stmt)
    all_classrooms = rooms_res.scalars().all()

    depts_stmt = select(Department)
    depts_res = await db.execute(depts_stmt)
    all_departments = depts_res.scalars().all()

    mentioned_faculty = None
    for fac in all_faculties:
        if fac.user and fac.user.full_name.lower() in prompt_lower:
            mentioned_faculty = fac
            break
        if fac.user:
            parts = fac.user.full_name.lower().replace("dr.", "").replace("mr.", "").replace("mrs.", "").replace("ms.", "").replace("prof.", "").strip().split()
            for part in parts:
                if len(part) > 3 and part in prompt_lower:
                    mentioned_faculty = fac
                    break
            if mentioned_faculty:
                break

    mentioned_room = None
    for rm in all_classrooms:
        rm_num_clean = rm.room_number.lower().replace(" ", "").replace("-", "").replace("_", "")
        prompt_clean = prompt_lower.replace(" ", "").replace("-", "").replace("_", "")
        if rm.room_number.lower() in prompt_lower or rm_num_clean in prompt_clean:
            mentioned_room = rm
            break

    mentioned_dept = None
    for dept in all_departments:
        dept_code_clean = f" {dept.code.lower()} "
        if dept_code_clean in f" {prompt_lower} " or dept.name.lower() in prompt_lower:
            mentioned_dept = dept
            break

    # --- AGENT TOOL REASONING DISPATCHER ---

    # Case 1: Specific Faculty Member Query
    if mentioned_faculty:
        slots_stmt = (
            select(TimetableEntry)
            .options(
                selectinload(TimetableEntry.subject),
                selectinload(TimetableEntry.classroom)
            )
            .where(TimetableEntry.faculty_id == mentioned_faculty.id)
        )
        slots_res = await db.execute(slots_stmt)
        slots = slots_res.scalars().all()

        max_cap = mentioned_faculty.max_weekly_workload if mentioned_faculty.max_weekly_workload > 0 else 16
        util_pct = round((len(slots) / max_cap) * 100, 1)

        status_str = "OPTIMAL"
        if util_pct >= 90.0:
            status_str = "OVERUTILIZED ⚠️"
        elif util_pct < 40.0:
            status_str = "UNDERUTILIZED 💤"

        reply_lines = [
            f"### 🧑‍🏫 AI Profile Insight: {mentioned_faculty.user.full_name}",
            f"- **Branch/Department**: {mentioned_faculty.department.name if mentioned_faculty.department else 'General'}",
            f"- **Role**: {'Head of Department (HOD) 🎓' if mentioned_faculty.is_hod else 'Faculty Member 📝'}",
            f"- **Designation**: {mentioned_faculty.designation}",
            f"- **Workload utilization**: **{len(slots)} / {max_cap}** weekly hours booked ({util_pct}%) — **{status_str}**",
            f"- **Office Hours**: {mentioned_faculty.office_hours or 'Not configured'}",
            "",
            "**Scheduled Weekly Sessions:**"
        ]
        if not slots:
            reply_lines.append("- No active teaching hours scheduled in this timetable layout.")
        else:
            for s in slots:
                reply_lines.append(f"- **{s.day_of_week} (Slot {s.time_slot})**: {s.subject.name} ({s.subject.code}) in room **{s.classroom.room_number}** [{s.section}]")
        
        reply_text = "\n".join(reply_lines)
        suggested_actions = [
            AISuggestedAction(action_type="VIEW_FACULTY_AVAILABILITY", label="Review Availability Grids", payload_json=json.dumps({"faculty_id": mentioned_faculty.id}))
        ]

    # Case 2: Specific Room Occupancy Query
    elif mentioned_room:
        slots_stmt = (
            select(TimetableEntry)
            .options(
                selectinload(TimetableEntry.subject),
                selectinload(TimetableEntry.faculty).selectinload(FacultyProfile.user)
            )
            .where(TimetableEntry.classroom_id == mentioned_room.id)
        )
        slots_res = await db.execute(slots_stmt)
        slots = slots_res.scalars().all()

        MAX_WEEKLY_SLOTS = 36
        occ_pct = round((len(slots) / MAX_WEEKLY_SLOTS) * 100, 1)

        reply_lines = [
            f"### 🏫 AI Classroom Details: Room {mentioned_room.room_number}",
            f"- **Room Class Type**: {mentioned_room.room_type}",
            f"- **Student Seating Capacity**: {mentioned_room.capacity} seats",
            f"- **Grid Dimension**: {mentioned_room.rows} rows x {mentioned_room.cols} columns",
            f"- **Current Occupancy Rate**: **{occ_pct}%** ({len(slots)} / {MAX_WEEKLY_SLOTS} slots booked)",
            "",
            "**Allocated Class Sessions:**"
        ]
        if not slots:
            reply_lines.append("- This classroom is completely vacant throughout the current timetable layout.")
        else:
            for s in slots:
                teacher_name = s.faculty.user.full_name if s.faculty and s.faculty.user else "Faculty"
                reply_lines.append(f"- **{s.day_of_week} Slot {s.time_slot}**: {s.subject.name} ({s.section}) taught by {teacher_name}")

        reply_text = "\n".join(reply_lines)
        suggested_actions = [
            AISuggestedAction(action_type="VIEW_ROOM_GRID", label="Manage Classrooms Inventory", payload_json="{}")
        ]

    # Case 3: Specific Department Branch Query
    elif mentioned_dept:
        analytics = await get_analytics_dashboard(mentioned_dept.id, current_user, db)
        
        reply_lines = [
            f"### 🏢 AI Branch Overview: {mentioned_dept.name} ({mentioned_dept.code})",
            f"- **Total Registry Staff**: {analytics.total_faculty} faculty members",
            f"- **Branch Classrooms**: {analytics.total_classrooms} classrooms tracked",
            f"- **Timetable Sessions**: {analytics.total_timetable_slots} slots scheduled",
            f"- **Average Faculty Workload**: **{analytics.average_faculty_utilization}%**",
            f"- **Average Classroom Occupancy**: **{analytics.average_room_occupancy}%**",
            "",
            "**Faculty Workload Balances:**"
        ]
        for f in analytics.workload_metrics[:5]:
            reply_lines.append(f"- **{f.faculty_name}**: {f.assigned_slots}/{f.max_weekly_workload} slots ({f.utilization_percentage}%) — *{f.status}*")
        
        if len(analytics.workload_metrics) > 5:
            reply_lines.append(f"- *and {len(analytics.workload_metrics) - 5} more faculty profiles...*")

        reply_text = "\n".join(reply_lines)
        suggested_actions = [
            AISuggestedAction(action_type="AUTO_SOLVE_TIMETABLE", label="Re-Optimize Timetable Solver", payload_json="{}")
        ]

    # Case 4: Directory Query of Registered Users
    elif any(k in prompt_lower for k in ["users", "registered", "admins", "hods", "faculty members", "teacher list", "staff list"]):
        reply_lines = [
            "### 👥 AI System User & Role Directory",
            "Here is a summary of active accounts fetched from the database:",
            ""
        ]
        admins = [f for f in all_faculties if f.is_dean or (f.user and f.user.role == "ADMIN")]
        hods = [f for f in all_faculties if f.is_hod]
        faculties = [f for f in all_faculties if not f.is_hod and (f.user and f.user.role == "FACULTY")]
        
        reply_lines.append("**System Administrators:**")
        for a in admins:
            reply_lines.append(f"- **{a.user.full_name}** ({a.user.email}) — *Dean: {a.is_dean}*")
        reply_lines.append("")
        
        reply_lines.append("**Heads of Departments (HODs):**")
        for h in hods:
            reply_lines.append(f"- **{h.user.full_name}** ({h.user.email}) — *Branch: {h.department.code if h.department else 'GEN'}*")
        reply_lines.append("")
        
        reply_lines.append("**Active Faculty Members:**")
        for f in faculties[:6]:
            reply_lines.append(f"- **{f.user.full_name}** ({f.user.email}) — *Branch: {f.department.code if f.department else 'GEN'}*")
        
        if len(faculties) > 6:
            reply_lines.append(f"- *and {len(faculties) - 6} more faculty profiles...*")

        reply_text = "\n".join(reply_lines)
        suggested_actions = [
            AISuggestedAction(action_type="VIEW_FACULTY_AVAILABILITY", label="Registry Desk", payload_json="{}")
        ]

    # Tool 1: Workload Query (Fallback Keyword match)
    elif any(k in prompt_lower for k in ["workload", "overutilized", "underutilized", "busy", "capacity"]):
=======
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
>>>>>>> 811a9dd (feat: enhance AI Chat dispatcher to prioritize RAG rules and policies, and provide rich natural language responses for all general queries)
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

<<<<<<< HEAD
    # Tool 2: Substitute / Leave Coverage Query (Fallback Keyword match)
    elif any(k in prompt_lower for k in ["substitute", "coverage", "leave", "absent", "replace"]):
=======
    # 3. Active Leave & Substitute Coverage Query
    elif any(k in prompt_lower for k in ["substitute", "substitution", "coverage", "absent", "replace", "pending leave", "who is absent", "applied leave"]):
        # Query active leaves
>>>>>>> 811a9dd (feat: enhance AI Chat dispatcher to prioritize RAG rules and policies, and provide rich natural language responses for all general queries)
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

<<<<<<< HEAD
    # Tool 3: Classroom / Lab Occupancy Query (Fallback Keyword match)
    elif any(k in prompt_lower for k in ["room", "classroom", "occupancy", "lab", "free room"]):
=======
    # 4. Classroom / Lab Occupancy Query
    elif any(k in prompt_lower for k in ["room", "classroom", "occupancy", "free room", "seating", "hall"]):
>>>>>>> 811a9dd (feat: enhance AI Chat dispatcher to prioritize RAG rules and policies, and provide rich natural language responses for all general queries)
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

<<<<<<< HEAD
    # Tool 4: Timetable Solver / Clash Query (Fallback Keyword match)
    elif any(k in prompt_lower for k in ["generate", "solver", "clash", "schedule", "timetable"]):
=======
    # 5. Timetable Solver / Clash Query
    elif any(k in prompt_lower for k in ["generate", "solver", "clash", "schedule", "timetable", "autogenerate"]):
>>>>>>> 811a9dd (feat: enhance AI Chat dispatcher to prioritize RAG rules and policies, and provide rich natural language responses for all general queries)
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

<<<<<<< HEAD
    # Tool 5: RAG Policy Query (Fallback Keyword match)
    elif any(k in prompt_lower for k in ["policy", "rule", "regulation", "duty", "limit"]):
=======
    # 6. Intelligent Conversational & General Query NLP Fallback
    else:
        # Fetch policies and analytics summary to answer general questions
>>>>>>> 811a9dd (feat: enhance AI Chat dispatcher to prioritize RAG rules and policies, and provide rich natural language responses for all general queries)
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
