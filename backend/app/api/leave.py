import logging
from datetime import datetime, date
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.faculty import FacultyProfile, Subject, FacultyAvailability, Department
from app.models.leave import FacultyLeaveBalance, LeaveRequest, SubstitutionProposal
from app.schemas.leave import (
    LeaveBalanceResponse, LeaveRequestCreate, LeaveRequestResponse,
    SubProposalResponse, LeaveStatusUpdate
)
from app.schemas.faculty import FacultyProfileResponse
from app.api.deps import get_current_user

logger = logging.getLogger("leave-api")

router = APIRouter()

# Helper to automatically seed default balances if they don't exist
async def get_or_create_balances(faculty_id: str, db: AsyncSession) -> List[FacultyLeaveBalance]:
    stmt = select(FacultyLeaveBalance).where(FacultyLeaveBalance.faculty_id == faculty_id)
    res = await db.execute(stmt)
    balances = res.scalars().all()
    
    if not balances:
        # Seed standard leave categories
        default_types = [
            ("Casual", 12),
            ("Sick", 10),
            ("Duty", 15)
        ]
        seeded_balances = []
        for l_type, allowed in default_types:
            new_bal = FacultyLeaveBalance(
                faculty_id=faculty_id,
                leave_type=l_type,
                total_allowed=allowed,
                taken=0
            )
            db.add(new_bal)
            seeded_balances.append(new_bal)
        await db.commit()
        return seeded_balances
    return balances

# ==========================================
# 1. LEAVE BALANCES
# ==========================================

@router.get("/leaves/balances", response_model=List[LeaveBalanceResponse])
async def get_leave_balances(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Find faculty profile of logged in user
    prof_stmt = select(FacultyProfile).where(FacultyProfile.user_id == current_user.id)
    prof_res = await db.execute(prof_stmt)
    profile = prof_res.scalars().first()
    if not profile:
        return []
    
    return await get_or_create_balances(profile.id, db)

# ==========================================
# 2. LEAVE REQUESTS CRUD
# ==========================================

@router.post("/leaves", response_model=LeaveRequestResponse)
async def apply_leave(
    leave_in: LeaveRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Fetch user faculty profile
    prof_stmt = select(FacultyProfile).where(FacultyProfile.user_id == current_user.id)
    prof_res = await db.execute(prof_stmt)
    profile = prof_res.scalars().first()
    if not profile:
        raise HTTPException(status_code=400, detail="User does not have a Faculty profile.")

    # Calculate leave duration
    duration = (leave_in.end_date.date() - leave_in.start_date.date()).days + 1
    if duration <= 0:
        raise HTTPException(status_code=400, detail="Start date must be before or equal to End date.")

    # Check leave balance limit
    balances = await get_or_create_balances(profile.id, db)
    target_bal = next((b for b in balances if b.leave_type.lower() == leave_in.leave_type.lower()), None)
    if not target_bal:
        raise HTTPException(status_code=400, detail=f"Invalid leave type: {leave_in.leave_type}")

    if target_bal.taken + duration > target_bal.total_allowed:
        remaining = target_bal.total_allowed - target_bal.taken
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient leave balance. You requested {duration} days, but only have {remaining} days remaining for {leave_in.leave_type} Leave."
        )

    # Create Leave Request
    new_request = LeaveRequest(
        faculty_id=profile.id,
        leave_type=leave_in.leave_type,
        start_date=leave_in.start_date,
        end_date=leave_in.end_date,
        reason=leave_in.reason,
        status="PENDING"
    )
    db.add(new_request)
    await db.commit()
    await db.refresh(new_request)

    # Insert proposed substitution arrangements
    for prop in leave_in.substitution_proposals:
        new_prop = SubstitutionProposal(
            leave_request_id=new_request.id,
            day_of_week=prop.day_of_week,
            time_slot=prop.time_slot,
            subject_id=prop.subject_id,
            original_faculty_id=profile.id,
            substitute_faculty_id=prop.substitute_faculty_id,
            status="PENDING"
        )
        db.add(new_prop)
    
    await db.commit()

    # Reload with proposals loaded
    stmt = (
        select(LeaveRequest)
        .options(selectinload(LeaveRequest.substitution_proposals))
        .where(LeaveRequest.id == new_request.id)
    )
    res = await db.execute(stmt)
    return res.scalars().first()

@router.get("/leaves", response_model=List[LeaveRequestResponse])
async def list_leave_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    prof_stmt = select(FacultyProfile).where(FacultyProfile.user_id == current_user.id)
    prof_res = await db.execute(prof_stmt)
    profile = prof_res.scalars().first()

    # HOD and ADMIN see all leave requests in their department or across college
    if current_user.role in [UserRole.HOD, UserRole.ADMIN]:
        stmt = (
            select(LeaveRequest)
            .options(
                selectinload(LeaveRequest.substitution_proposals)
                .selectinload(SubstitutionProposal.subject)
            )
            .order_by(LeaveRequest.created_at.desc())
        )
        # Filter by department if user is HOD
        if current_user.role == UserRole.HOD and profile and profile.department_id:
            stmt = stmt.join(FacultyProfile, LeaveRequest.faculty_id == FacultyProfile.id)\
                       .where(FacultyProfile.department_id == profile.department_id)
            
        res = await db.execute(stmt)
        return res.scalars().all()

    # Faculty see only their own leave requests
    if not profile:
        return []
    
    stmt = (
        select(LeaveRequest)
        .options(
            selectinload(LeaveRequest.substitution_proposals)
            .selectinload(SubstitutionProposal.subject)
        )
        .where(LeaveRequest.faculty_id == profile.id)
        .order_by(LeaveRequest.created_at.desc())
    )
    res = await db.execute(stmt)
    return res.scalars().all()

@router.put("/leaves/{id}/status")
async def update_leave_status(
    id: str,
    update: LeaveStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Only HOD and ADMIN can approve/reject
    if current_user.role not in [UserRole.HOD, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to approve/reject leaves.")

    stmt = select(LeaveRequest).where(LeaveRequest.id == id)
    res = await db.execute(stmt)
    request = res.scalars().first()
    if not request:
        raise HTTPException(status_code=404, detail="Leave request not found.")

    if request.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Leave request has already been {request.status}.")

    request.status = update.status.upper()

    if request.status == "APPROVED":
        # Calculate duration
        duration = (request.end_date.date() - request.start_date.date()).days + 1
        
        # Increment 'taken' in balance
        bal_stmt = select(FacultyLeaveBalance).where(
            FacultyLeaveBalance.faculty_id == request.faculty_id,
            FacultyLeaveBalance.leave_type == request.leave_type
        )
        bal_res = await db.execute(bal_stmt)
        balance = bal_res.scalars().first()
        if balance:
            balance.taken += duration
            
    await db.commit()
    return {"message": f"Leave request status updated to {request.status} successfully."}

# ==========================================
# 3. SUBSTITUTION MATCHING & PROPOSALS
# ==========================================

@router.get("/leaves/substitutes/eligible", response_model=List[FacultyProfileResponse])
async def get_eligible_substitutes(
    day_of_week: str,
    time_slot: int,
    subject_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # 1. Fetch current user's profile to exclude themselves
    own_prof_stmt = select(FacultyProfile).where(FacultyProfile.user_id == current_user.id)
    own_prof_res = await db.execute(own_prof_stmt)
    own_profile = own_prof_res.scalars().first()
    own_profile_id = own_profile.id if own_profile else None

    # 2. Get Subject details to check department
    sub_stmt = select(Subject).where(Subject.id == subject_id)
    sub_res = await db.execute(sub_stmt)
    subject = sub_res.scalars().first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found.")

    # 3. Query profiles that belong to the SAME department as the subject
    # and have matching expertise (subjects) and are available (FacultyAvailability is True)
    # Filter using selectinload to eagerly fetch relationships
    stmt = (
        select(FacultyProfile)
        .options(
            selectinload(FacultyProfile.user),
            selectinload(FacultyProfile.department),
            selectinload(FacultyProfile.subjects)
        )
        .join(FacultyProfile.subjects) # Join many-to-many expertise bridge
        .join(FacultyAvailability, FacultyProfile.id == FacultyAvailability.faculty_id)
        .where(FacultyProfile.department_id == subject.department_id) # Same department branch
        .where(Subject.id == subject_id) # Qualified to teach this specific subject
        .where(FacultyAvailability.day_of_week == day_of_week)
        .where(FacultyAvailability.time_slot == time_slot)
        .where(FacultyAvailability.is_available == True) # Free slot
    )
    if own_profile_id:
        stmt = stmt.where(FacultyProfile.id != own_profile_id) # Cannot substitute yourself

    res = await db.execute(stmt)
    return res.scalars().all()

@router.get("/substitutions/my-proposals", response_model=List[SubProposalResponse])
async def list_sub_proposals(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    prof_stmt = select(FacultyProfile).where(FacultyProfile.user_id == current_user.id)
    prof_res = await db.execute(prof_stmt)
    profile = prof_res.scalars().first()
    if not profile:
        return []

    stmt = (
        select(SubstitutionProposal)
        .options(
            selectinload(SubstitutionProposal.subject)
        )
        .where(SubstitutionProposal.substitute_faculty_id == profile.id)
        .order_by(SubstitutionProposal.created_at.desc())
    )
    res = await db.execute(stmt)
    return res.scalars().all()

@router.put("/substitutions/{id}/status")
async def update_sub_status(
    id: str,
    status_update: str, # "ACCEPTED" or "DECLINED"
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    prof_stmt = select(FacultyProfile).where(FacultyProfile.user_id == current_user.id)
    prof_res = await db.execute(prof_stmt)
    profile = prof_res.scalars().first()
    if not profile:
        raise HTTPException(status_code=400, detail="User does not have a Faculty profile.")

    stmt = select(SubstitutionProposal).where(SubstitutionProposal.id == id)
    res = await db.execute(stmt)
    proposal = res.scalars().first()
    if not proposal:
        raise HTTPException(status_code=404, detail="Substitution arrangement not found.")

    if proposal.substitute_faculty_id != profile.id:
        raise HTTPException(status_code=403, detail="Not authorized to respond to this proposal.")

    proposal.status = status_update.upper()
    await db.commit()
    return {"message": f"Proposal status updated to {proposal.status} successfully."}

# ==========================================
# 4. DAILY MORNING TASK BULLETIN
# ==========================================

@router.get("/dashboard/bulletin")
async def get_daily_bulletin(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    today_name = datetime.now().strftime("%A") # e.g. "Monday"
    today_date = date.today().strftime("%d %B %Y") # e.g. "18 July 2026"

    # Find faculty profile if available
    prof_stmt = select(FacultyProfile).where(FacultyProfile.user_id == current_user.id)
    prof_res = await db.execute(prof_stmt)
    profile = prof_res.scalars().first()

    # --- 1. ADMIN BULLETIN ---
    if current_user.role == UserRole.ADMIN:
        users_count = await db.execute(select(User))
        depts_count = await db.execute(select(Department))
        subjects_count = await db.execute(select(Subject))
        
        return {
            "title": f"System Alert - {today_date}",
            "headline": "System Health Monitor",
            "bullets": [
                f"Active User Registrations: {len(users_count.scalars().all())} profiles",
                f"Registered Departments: {len(depts_count.scalars().all())} branches",
                f"Total Subjects: {len(subjects_count.scalars().all())} courses active",
                "Database connection status: Healthy (Tokyo-Supabase Pooled Connection)"
            ]
        }

    # --- 2. HOD BULLETIN ---
    elif current_user.role == UserRole.HOD:
        # Count pending leaves in department
        leaves_stmt = select(LeaveRequest).where(LeaveRequest.status == "PENDING")
        if profile and profile.department_id:
            leaves_stmt = leaves_stmt.join(FacultyProfile, LeaveRequest.faculty_id == FacultyProfile.id)\
                                     .where(FacultyProfile.department_id == profile.department_id)
        leaves_res = await db.execute(leaves_stmt)
        pending_leaves = len(leaves_res.scalars().all())

        # Find today's absent teachers (approved leaves overlapping today)
        now_dt = datetime.now()
        absents_stmt = select(LeaveRequest).where(
            LeaveRequest.status == "APPROVED",
            LeaveRequest.start_date <= now_dt,
            LeaveRequest.end_date >= now_dt
        ).options(selectinload(LeaveRequest.faculty).selectinload(FacultyProfile.user))
        absents_res = await db.execute(absents_stmt)
        absents = absents_res.scalars().all()
        absent_names = [a.faculty.user.full_name for a in absents if a.faculty and a.faculty.user]

        bullets = [
            f"Pending Leave Applications: {pending_leaves} request(s) awaiting your decision.",
            f"Active Absenteeism: {len(absent_names)} faculty member(s) are off today."
        ]
        if absent_names:
            bullets.append(f"Absent Faculty: {', '.join(absent_names)}")
        else:
            bullets.append("Absent Faculty: None. Full department attendance registered today!")

        return {
            "title": f"HOD Bulletin - {today_date}",
            "headline": f"Today's Branch Status ({today_name})",
            "bullets": bullets
        }

    # --- 3. FACULTY BULLETIN ---
    else:
        if not profile:
            return {
                "title": f"Welcome - {today_date}",
                "headline": "Profile Required",
                "bullets": ["Please contact your Head of Department (HOD) to bootstrap your teaching profile!"]
            }

        # Count active availability slots for today
        avail_stmt = select(FacultyAvailability).where(
            FacultyAvailability.faculty_id == profile.id,
            FacultyAvailability.day_of_week == today_name,
            FacultyAvailability.is_available == True
        )
        avail_res = await db.execute(avail_stmt)
        teaching_slots = len(avail_res.scalars().all())

        # Count pending substitutions proposed to them
        props_stmt = select(SubstitutionProposal).where(
            SubstitutionProposal.substitute_faculty_id == profile.id,
            SubstitutionProposal.status == "PENDING"
        )
        props_res = await db.execute(props_stmt)
        pending_subs = len(props_res.scalars().all())

        # Count covered classes today (substitutions they accepted that overlap today)
        covered_stmt = select(SubstitutionProposal).where(
            SubstitutionProposal.substitute_faculty_id == profile.id,
            SubstitutionProposal.status == "ACCEPTED",
            SubstitutionProposal.day_of_week == today_name
        )
        covered_res = await db.execute(covered_stmt)
        covered_slots = len(covered_res.scalars().all())

        return {
            "title": f"Morning Briefing - {today_date}",
            "headline": f"Your Schedule for {today_name}",
            "bullets": [
                f"Regular Active Teaching Slots today: {teaching_slots} slot(s)",
                f"Accepted Coverages (Substitutions) today: {covered_slots} session(s)",
                f"Pending Substitution requests: {pending_subs} proposal(s) require your action"
            ]
        }
