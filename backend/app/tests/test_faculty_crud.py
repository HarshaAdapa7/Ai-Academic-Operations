import pytest
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select

from app.core.database import Base
from app.models.user import User, UserRole
from app.models.faculty import Department, Subject, FacultyProfile, FacultyAvailability
from app.schemas.faculty import DepartmentCreate, SubjectCreate, FacultyProfileCreate, FacultyProfileUpdate, AvailabilityItem, AvailabilityUpdate
from app.api.faculty import (
    create_department, list_departments, delete_department,
    create_subject, list_subjects, delete_subject,
    create_faculty_profile, list_faculty_profiles, update_faculty_profile, delete_faculty_profile,
    update_availability, get_availability
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
async def test_department_crud(db_session):
    # Create
    dept_in = DepartmentCreate(name="Computer Science & Engineering", code="CSE")
    dept = await create_department(dept_in, db_session)
    assert dept.id is not None
    assert dept.code == "CSE"

    # List
    depts = await list_departments(db_session)
    assert len(depts) == 1
    assert depts[0].name == "Computer Science & Engineering"

    # Delete
    res = await delete_department(dept.id, db_session)
    assert res["message"] is not None
    depts_after = await list_departments(db_session)
    assert len(depts_after) == 0

@pytest.mark.asyncio
async def test_subject_crud(db_session):
    # Setup department first
    dept_in = DepartmentCreate(name="Computer Science", code="CS")
    dept = await create_department(dept_in, db_session)

    # Create Subject
    subj_in = SubjectCreate(name="Algorithms", code="CS201", department_id=dept.id, credits=4)
    subj = await create_subject(subj_in, db_session)
    assert subj.id is not None
    assert subj.code == "CS201"

    # List
    subjs = await list_subjects(None, db_session)
    assert len(subjs) == 1

    # Delete
    await delete_subject(subj.id, db_session)
    subjs_after = await list_subjects(None, db_session)
    assert len(subjs_after) == 0

@pytest.mark.asyncio
async def test_faculty_profile_crud_and_availability(db_session):
    # Setup User, Dept, and Subjects
    user = User(
        email="prof.albert@university.edu",
        password_hash="hashed_pwd",
        full_name="Albert Einstein",
        role=UserRole.FACULTY
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    dept = await create_department(DepartmentCreate(name="Physics", code="PHY"), db_session)
    subj1 = await create_subject(SubjectCreate(name="Quantum Mechanics", code="PHY401", department_id=dept.id, credits=4), db_session)
    subj2 = await create_subject(SubjectCreate(name="General Relativity", code="PHY402", department_id=dept.id, credits=4), db_session)

    # 1. Create Profile with subjects
    profile_in = FacultyProfileCreate(
        user_id=user.id,
        department_id=dept.id,
        designation="Professor",
        max_weekly_workload=12,
        office_hours="Tue/Thu 10 AM",
        subject_ids=[subj1.id, subj2.id]
    )
    profile = await create_faculty_profile(profile_in, db_session)
    assert profile.id is not None
    assert profile.designation == "Professor"
    assert len(profile.subjects) == 2

    # 2. Update Profile subjects
    profile_update = FacultyProfileUpdate(
        department_id=dept.id,
        designation="Professor Emeritus",
        max_weekly_workload=8,
        office_hours="Tue 10 AM",
        subject_ids=[subj2.id] # reduce to only 1 subject
    )
    profile_updated = await update_faculty_profile(profile.id, profile_update, db_session)
    assert profile_updated.designation == "Professor Emeritus"
    assert len(profile_updated.subjects) == 1
    assert profile_updated.subjects[0].code == "PHY402"

    # 3. Update Availability
    avail_data = AvailabilityUpdate(availabilities=[
        AvailabilityItem(day_of_week="Monday", time_slot=1, is_available=True),
        AvailabilityItem(day_of_week="Monday", time_slot=2, is_available=False)
    ])
    await update_availability(profile.id, avail_data, db_session)
    
    # Check availability
    avails = await get_availability(profile.id, db_session)
    assert len(avails) == 2
    assert avails[1].day_of_week == "Monday"
    assert avails[1].time_slot == 2
    assert avails[1].is_available is False

    # 4. Delete Profile and verify cascades
    await delete_faculty_profile(profile.id, db_session)
    
    # Check profiles list
    profiles = await list_faculty_profiles(db_session)
    assert len(profiles) == 0

    # Verify availability rows are cascades deleted
    avail_check = await db_session.execute(select(FacultyAvailability).where(FacultyAvailability.faculty_id == profile.id))
    assert len(avail_check.scalars().all()) == 0
