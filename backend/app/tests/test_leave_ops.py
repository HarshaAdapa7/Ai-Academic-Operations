import pytest
import asyncio
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select
from fastapi import HTTPException

from app.core.database import Base
from app.models.user import User, UserRole
from app.models.faculty import Department, Subject, FacultyProfile, FacultyAvailability
from app.models.leave import FacultyLeaveBalance, LeaveRequest, SubstitutionProposal
from app.schemas.leave import LeaveRequestCreate, SubProposalCreate, LeaveStatusUpdate
from app.api.leave import (
    get_or_create_balances, apply_leave, list_leave_requests,
    update_leave_status, get_eligible_substitutes, update_sub_status
)

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture(scope="function")
async def db_session():
    # Setup test DB
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    async_session = sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False
    )
    async with async_session() as session:
        yield session
        await session.rollback()
        
    await engine.dispose()

@pytest.mark.asyncio
async def test_leave_balances_seeding_and_limits(db_session):
    # Setup User and Faculty Profile
    user = User(
        email="prof.albert@physics.edu",
        password_hash="hashed",
        full_name="Albert Einstein",
        role=UserRole.FACULTY
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    dept = Department(name="Physics", code="PHY")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    profile = FacultyProfile(
        user_id=user.id,
        department_id=dept.id,
        designation="Professor"
    )
    db_session.add(profile)
    await db_session.commit()
    await db_session.refresh(profile)

    # 1. Seeding check
    bals = await get_or_create_balances(profile.id, db_session)
    assert len(bals) == 3
    assert bals[0].leave_type == "Casual"
    assert bals[0].total_allowed == 12
    assert bals[0].taken == 0

    # 2. Apply for 5 days of Casual Leave (within limit)
    start_dt = datetime.utcnow()
    end_dt = start_dt + timedelta(days=4) # 5 days total
    
    leave_in = LeaveRequestCreate(
        leave_type="Casual",
        start_date=start_dt,
        end_date=end_dt,
        reason="Physics Conference",
        substitution_proposals=[]
    )
    
    req = await apply_leave(leave_in, user, db_session)
    assert req.id is not None
    assert req.status == "PENDING"

    # Verify balance hasn't updated yet (still PENDING)
    bals_check = await get_or_create_balances(profile.id, db_session)
    casual_bal = next(b for b in bals_check if b.leave_type == "Casual")
    assert casual_bal.taken == 0

    # Approve Leave Request
    hod_user = User(email="hod.phys@physics.edu", password_hash="hash", full_name="HOD", role=UserRole.HOD)
    db_session.add(hod_user)
    await db_session.commit()
    
    await update_leave_status(req.id, LeaveStatusUpdate(status="APPROVED"), hod_user, db_session)

    # Verify balance is now updated (+5 days)
    db_session.expire(casual_bal)
    bals_after = await get_or_create_balances(profile.id, db_session)
    casual_bal_after = next(b for b in bals_after if b.leave_type == "Casual")
    assert casual_bal_after.taken == 5

    # 3. Apply for 10 days of Casual Leave (exceeds remaining balance of 7 days)
    start_dt_invalid = datetime.utcnow() + timedelta(days=10)
    end_dt_invalid = start_dt_invalid + timedelta(days=9) # 10 days total
    
    invalid_leave_in = LeaveRequestCreate(
        leave_type="Casual",
        start_date=start_dt_invalid,
        end_date=end_dt_invalid,
        reason="Long vacation",
        substitution_proposals=[]
    )
    
    with pytest.raises(HTTPException) as exc_info:
        await apply_leave(invalid_leave_in, user, db_session)
    assert exc_info.value.status_code == 400
    assert "Insufficient leave balance" in exc_info.value.detail

@pytest.mark.asyncio
async def test_substitute_eligibility_matching(db_session):
    # Setup branch dept
    dept = Department(name="Computer Science", code="CSE")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    # Setup subject
    subj = Subject(name="Operating Systems", code="CS301", department_id=dept.id, credits=3)
    db_session.add(subj)
    await db_session.commit()
    await db_session.refresh(subj)

    # Setup original faculty
    user1 = User(email="fac1@cse.edu", password_hash="h", full_name="Teacher A", role=UserRole.FACULTY)
    db_session.add(user1)
    await db_session.commit()
    await db_session.refresh(user1)
    
    profile1 = FacultyProfile(user_id=user1.id, department_id=dept.id, designation="Asst Prof")
    db_session.add(profile1)
    await db_session.commit()
    await db_session.refresh(profile1)

    # Setup potential substitute faculty (qualified and available)
    user2 = User(email="fac2@cse.edu", password_hash="h", full_name="Teacher B", role=UserRole.FACULTY)
    db_session.add(user2)
    await db_session.commit()
    await db_session.refresh(user2)
    
    profile2 = FacultyProfile(user_id=user2.id, department_id=dept.id, designation="Asst Prof")
    profile2.subjects.append(subj) # Mapped expertise
    db_session.add(profile2)
    await db_session.commit()
    await db_session.refresh(profile2)

    # Add availability slots for substitute
    avail = FacultyAvailability(faculty_id=profile2.id, day_of_week="Monday", time_slot=3, is_available=True)
    db_session.add(avail)
    await db_session.commit()

    # Query eligible substitutes
    eligs = await get_eligible_substitutes(
        day_of_week="Monday",
        time_slot=3,
        subject_id=subj.id,
        current_user=user1,
        db=db_session
    )
    assert len(eligs) == 1
    assert eligs[0].id == profile2.id

    # Verify that if availability is set to False (Busy), they are excluded
    avail.is_available = False
    await db_session.commit()
    
    eligs_busy = await get_eligible_substitutes(
        day_of_week="Monday",
        time_slot=3,
        subject_id=subj.id,
        current_user=user1,
        db=db_session
    )
    assert len(eligs_busy) == 0
