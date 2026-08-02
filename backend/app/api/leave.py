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
        start_date=leave_in.start_date.replace(tzinfo=None),
        end_date=leave_in.end_date.replace(tzinfo=None),
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
            substitute_faculty_id=prop.substitute_faculty_id if prop.substitute_faculty_id else None,
            status="PENDING"
        )
        db.add(new_prop)
    
    await db.commit()

    # Notify department HOD
    try:
        from app.services.notification_service import create_notification
        from app.models.notification import NotificationCategory, NotificationPriority
        hod_profile_stmt = (
            select(FacultyProfile)
            .options(selectinload(FacultyProfile.user))
            .where(FacultyProfile.department_id == profile.department_id)
            .join(FacultyProfile.user)
            .where(User.role == UserRole.HOD)
        )
        hod_profile_res = await db.execute(hod_profile_stmt)
        hod_profile = hod_profile_res.scalars().first()
        if hod_profile and hod_profile.user:
            await create_notification(
                db=db,
                title="New Leave Request Pending",
                message=f"{profile.user.full_name if profile.user else 'Faculty'} has submitted a new {leave_in.leave_type} leave request ({duration} days) for your review.",
                category=NotificationCategory.LEAVE_OPERATIONS,
                priority=NotificationPriority.NORMAL,
                user_id=hod_profile.user.id
            )
    except Exception as notif_err:
        logger.warning(f"Failed to send leave submission notification to HOD: {notif_err}")

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

    # Notify applicant user
    try:
        from app.services.notification_service import create_notification
        from app.models.notification import NotificationCategory, NotificationPriority
        user_stmt = select(User).join(FacultyProfile, FacultyProfile.user_id == User.id).where(FacultyProfile.id == request.faculty_id)
        user_res = await db.execute(user_stmt)
        applicant_user = user_res.scalars().first()
        if applicant_user:
            await create_notification(
                db=db,
                title=f"Leave Request {request.status}",
                message=f"Your {request.leave_type} leave request from {request.start_date.date()} to {request.end_date.date()} has been {request.status.lower()}.",
                category=NotificationCategory.LEAVE_OPERATIONS,
                priority=NotificationPriority.NORMAL,
                user_id=applicant_user.id
            )
    except Exception as notif_err:
        logger.warning(f"Failed to send leave status notification: {notif_err}")

    return {"message": f"Leave request status updated to {request.status} successfully."}

@router.post("/leaves/{id}/auto-allocate")
async def auto_allocate_substitutes(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # HOD and ADMIN only
    if current_user.role not in [UserRole.HOD, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to auto-allocate substitutions.")

    from datetime import timedelta
    from app.models.timetable import TimetableEntry
    from app.services.notification_service import create_notification
    from app.models.notification import NotificationCategory, NotificationPriority

    # 1. Fetch leave request
    stmt = (
        select(LeaveRequest)
        .options(selectinload(LeaveRequest.faculty).selectinload(FacultyProfile.user))
        .where(LeaveRequest.id == id)
    )
    res = await db.execute(stmt)
    request = res.scalars().first()
    if not request:
        raise HTTPException(status_code=404, detail="Leave request not found.")

    absent_profile = request.faculty
    absent_user = absent_profile.user if absent_profile else None
    absent_name = absent_user.full_name if absent_user else "Faculty Member"

    # 2. Check if there are already proposed substitutions saved by the applicant
    props_stmt = select(SubstitutionProposal).where(SubstitutionProposal.leave_request_id == request.id)
    props_res = await db.execute(props_stmt)
    existing_props = props_res.scalars().all()

    # 3. Find department slots per day and lunch break
    from app.models.timetable import SchedulingRule
    rule_stmt = select(SchedulingRule).where(SchedulingRule.department_id == absent_profile.department_id)
    rule_res = await db.execute(rule_stmt)
    rule = rule_res.scalars().first()
    lunch_slot = rule.lunch_slot if rule else 5

    allocated = []
    unallocated = []

    if existing_props:
        # Loop through existing proposals and auto-allocate substitute for each
        for prop in existing_props:
            day_name = prop.day_of_week
            time_slot = prop.time_slot
            subject_id = prop.subject_id

            # Find matching timetable entry to get classroom/section info
            tt_stmt = (
                select(TimetableEntry)
                .options(selectinload(TimetableEntry.subject), selectinload(TimetableEntry.classroom))
                .where(TimetableEntry.faculty_id == absent_profile.id)
                .where(TimetableEntry.day_of_week == day_name)
                .where(TimetableEntry.time_slot == time_slot)
                .where(TimetableEntry.subject_id == subject_id)
                .where(TimetableEntry.is_permanent == True)
            )
            tt_res = await db.execute(tt_stmt)
            entry = tt_res.scalars().first()
            if not entry:
                continue

            # Find candidates: qualified department faculty
            sub_stmt = (
                select(FacultyProfile)
                .options(
                    selectinload(FacultyProfile.user),
                    selectinload(FacultyProfile.department),
                    selectinload(FacultyProfile.subjects)
                )
                .join(FacultyProfile.subjects)
                .where(FacultyProfile.department_id == absent_profile.department_id)
                .where(Subject.id == subject_id)
                .where(FacultyProfile.id != absent_profile.id)
            )
            sub_res = await db.execute(sub_stmt)
            candidates = sub_res.scalars().all()

            # Filter candidates who are actually free
            selected_sub = None
            for f in candidates:
                # Check preferences
                avail_stmt = (
                    select(FacultyAvailability)
                    .where(FacultyAvailability.faculty_id == f.id)
                    .where(FacultyAvailability.day_of_week == day_name)
                    .where(FacultyAvailability.time_slot == time_slot)
                )
                avail_res = await db.execute(avail_stmt)
                avail = avail_res.scalars().first()
                if avail and not avail.is_available:
                    continue

                # Check schedule
                busy_stmt = (
                    select(TimetableEntry)
                    .where(TimetableEntry.faculty_id == f.id)
                    .where(TimetableEntry.day_of_week == day_name)
                    .where(TimetableEntry.time_slot == time_slot)
                    .where(TimetableEntry.is_permanent == True)
                )
                busy_res = await db.execute(busy_stmt)
                if busy_res.scalars().first():
                    continue

                # Allocate this substitute!
                selected_sub = f
                break

            if selected_sub:
                prop.substitute_faculty_id = selected_sub.id
                prop.status = "PENDING"

                allocated.append({
                    "day_of_week": day_name,
                    "time_slot": time_slot,
                    "subject": entry.subject.name,
                    "substitute": selected_sub.user.full_name if selected_sub.user else "Faculty"
                })

                # Notify substitute teacher
                if selected_sub.user_id:
                    await create_notification(
                        db=db,
                        title="Substitution Coverage Requested",
                        message=f"HOD auto-allocated you to cover {entry.subject.name} ({entry.section}) on {day_name} Slot {time_slot} for {absent_name}.",
                        category=NotificationCategory.LEAVE_OPERATIONS,
                        priority=NotificationPriority.NORMAL,
                        user_id=selected_sub.user_id
                    )
            else:
                unallocated.append(f"{day_name} Slot {time_slot} ({entry.subject.name})")
    else:
        # Loop through date range to schedule replacements for ALL classes
        curr = request.start_date.date()
        end = request.end_date.date()

        while curr <= end:
            day_name = curr.strftime("%A")
            # Get absent faculty's classes on this weekday
            tt_stmt = (
                select(TimetableEntry)
                .options(selectinload(TimetableEntry.subject), selectinload(TimetableEntry.classroom))
                .where(TimetableEntry.faculty_id == absent_profile.id)
                .where(TimetableEntry.day_of_week == day_name)
                .where(TimetableEntry.is_permanent == True)
            )
            tt_res = await db.execute(tt_stmt)
            entries = tt_res.scalars().all()

            for entry in entries:
                if entry.time_slot == lunch_slot:
                    continue

                # Find candidates: qualified department faculty
                sub_stmt = (
                    select(FacultyProfile)
                    .options(
                        selectinload(FacultyProfile.user),
                        selectinload(FacultyProfile.department),
                        selectinload(FacultyProfile.subjects)
                    )
                    .join(FacultyProfile.subjects)
                    .where(FacultyProfile.department_id == absent_profile.department_id)
                    .where(Subject.id == entry.subject_id)
                    .where(FacultyProfile.id != absent_profile.id)
                )
                sub_res = await db.execute(sub_stmt)
                candidates = sub_res.scalars().all()

                # Filter candidates who are actually free
                selected_sub = None
                for f in candidates:
                    # Check preferences
                    avail_stmt = (
                        select(FacultyAvailability)
                        .where(FacultyAvailability.faculty_id == f.id)
                        .where(FacultyAvailability.day_of_week == day_name)
                        .where(FacultyAvailability.time_slot == entry.time_slot)
                    )
                    avail_res = await db.execute(avail_stmt)
                    avail = avail_res.scalars().first()
                    if avail and not avail.is_available:
                        continue

                    # Check schedule
                    busy_stmt = (
                        select(TimetableEntry)
                        .where(TimetableEntry.faculty_id == f.id)
                        .where(TimetableEntry.day_of_week == day_name)
                        .where(TimetableEntry.time_slot == entry.time_slot)
                        .where(TimetableEntry.is_permanent == True)
                    )
                    busy_res = await db.execute(busy_stmt)
                    if busy_res.scalars().first():
                        continue

                    # Allocate this substitute!
                    selected_sub = f
                    break

                if selected_sub:
                    # Create or update substitution proposal
                    prop_stmt = select(SubstitutionProposal).where(
                        SubstitutionProposal.leave_request_id == request.id,
                        SubstitutionProposal.day_of_week == day_name,
                        SubstitutionProposal.time_slot == entry.time_slot,
                        SubstitutionProposal.subject_id == entry.subject_id
                    )
                    prop_res = await db.execute(prop_stmt)
                    existing = prop_res.scalars().first()
                    if existing:
                        existing.substitute_faculty_id = selected_sub.id
                        existing.status = "PENDING"
                    else:
                        new_prop = SubstitutionProposal(
                            leave_request_id=request.id,
                            day_of_week=day_name,
                            time_slot=entry.time_slot,
                            subject_id=entry.subject_id,
                            original_faculty_id=absent_profile.id,
                            substitute_faculty_id=selected_sub.id,
                            status="PENDING"
                        )
                        db.add(new_prop)

                    allocated.append({
                        "day_of_week": day_name,
                        "time_slot": entry.time_slot,
                        "subject": entry.subject.name,
                        "substitute": selected_sub.user.full_name if selected_sub.user else "Faculty"
                    })

                    # Notify substitute teacher
                    if selected_sub.user_id:
                        await create_notification(
                            db=db,
                            title="Substitution Coverage Requested",
                            message=f"HOD auto-allocated you to cover {entry.subject.name} ({entry.section}) on {day_name} Slot {entry.time_slot} for {absent_name}.",
                            category=NotificationCategory.LEAVE_OPERATIONS,
                            priority=NotificationPriority.NORMAL,
                            user_id=selected_sub.user_id
                        )
                else:
                    unallocated.append(f"{day_name} Slot {entry.time_slot} ({entry.subject.name})")

            curr += timedelta(days=1)

    await db.commit()

    # Notify applicant user
    if absent_user:
        await create_notification(
            db=db,
            title="Leave Coverage Auto-Allocated",
            message=f"Coverage for your leave from {request.start_date.date()} to {request.end_date.date()} has been auto-allocated by HOD.",
            category=NotificationCategory.LEAVE_OPERATIONS,
            priority=NotificationPriority.NORMAL,
            user_id=absent_user.id
        )

    # Return reload data
    stmt = (
        select(LeaveRequest)
        .options(
            selectinload(LeaveRequest.substitution_proposals)
            .selectinload(SubstitutionProposal.subject)
        )
        .where(LeaveRequest.id == id)
    )
    res = await db.execute(stmt)
    return res.scalars().first()

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

    from app.models.timetable import TimetableEntry

    # 3. Query all profiles that belong to the SAME department as the subject
    # and are qualified to teach this specific subject (exist in many-to-many bridge)
    stmt = (
        select(FacultyProfile)
        .options(
            selectinload(FacultyProfile.user),
            selectinload(FacultyProfile.department),
            selectinload(FacultyProfile.subjects)
        )
        .join(FacultyProfile.subjects) # Join many-to-many expertise bridge
        .where(FacultyProfile.department_id == subject.department_id) # Same department branch
        .where(Subject.id == subject_id) # Qualified to teach this specific subject
    )
    if own_profile_id:
        stmt = stmt.where(FacultyProfile.id != own_profile_id) # Cannot substitute yourself

    res = await db.execute(stmt)
    candidates = res.scalars().all()

    # 4. Filter candidates based on preferences and active timetable schedule
    eligible = []
    for f in candidates:
        # Check if they have explicitly set availability as False
        avail_stmt = (
            select(FacultyAvailability)
            .where(FacultyAvailability.faculty_id == f.id)
            .where(FacultyAvailability.day_of_week == day_of_week)
            .where(FacultyAvailability.time_slot == time_slot)
        )
        avail_res = await db.execute(avail_stmt)
        avail = avail_res.scalars().first()
        if avail and not avail.is_available:
            continue

        # Check if they are already scheduled to teach in the timetable at this slot
        tt_stmt = (
            select(TimetableEntry)
            .where(TimetableEntry.faculty_id == f.id)
            .where(TimetableEntry.day_of_week == day_of_week)
            .where(TimetableEntry.time_slot == time_slot)
            .where(TimetableEntry.is_permanent == True)
        )
        tt_res = await db.execute(tt_stmt)
        if tt_res.scalars().first():
            continue

        eligible.append(f)

    return eligible

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
    
    if proposal.status == "ACCEPTED":
        from app.models.timetable import TimetableEntry
        tt_stmt = select(TimetableEntry).where(
            TimetableEntry.day_of_week == proposal.day_of_week,
            TimetableEntry.time_slot == proposal.time_slot,
            TimetableEntry.subject_id == proposal.subject_id,
            TimetableEntry.faculty_id == proposal.original_faculty_id,
            TimetableEntry.is_permanent == False
        )
        tt_res = await db.execute(tt_stmt)
        entries = tt_res.scalars().all()
        for entry in entries:
            entry.faculty_id = proposal.substitute_faculty_id
            
    await db.commit()

    # Notify applicant user
    try:
        from app.services.notification_service import create_notification
        from app.models.notification import NotificationCategory, NotificationPriority
        
        # Load the subject name
        sub_stmt = select(Subject).where(Subject.id == proposal.subject_id)
        sub_res = await db.execute(sub_stmt)
        subject_obj = sub_res.scalars().first()
        subj_name = subject_obj.name if subject_obj else "Class"

        orig_stmt = select(User).join(FacultyProfile, FacultyProfile.user_id == User.id).where(FacultyProfile.id == proposal.original_faculty_id)
        orig_res = await db.execute(orig_stmt)
        orig_user = orig_res.scalars().first()
        if orig_user:
            await create_notification(
                db=db,
                title=f"Substitution Proposal {proposal.status.title()}",
                message=f"{profile.user.full_name if profile.user else 'Faculty'} has {proposal.status.lower()} your request to cover {subj_name} on {proposal.day_of_week} Slot {proposal.time_slot}.",
                category=NotificationCategory.LEAVE_OPERATIONS,
                priority=NotificationPriority.NORMAL,
                user_id=orig_user.id
            )
    except Exception as notif_err:
        logger.warning(f"Failed to send substitution status notification: {notif_err}")

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
