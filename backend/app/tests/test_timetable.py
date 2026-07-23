import pytest
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException

from app.core.database import Base
from app.models.user import User, UserRole
from app.models.faculty import Department, Subject, FacultyProfile, FacultyAvailability, faculty_subjects
from app.models.classroom import Classroom
from app.models.timetable import SchedulingRule, SubjectSchedulingRule, TimetableEntry, ExamTimetableEntry
from app.schemas.timetable import (
    SchedulingRuleCreate, TimetableEntryCreate, ExamTimetableEntryCreate
)
from app.api.timetable import (
    save_scheduling_rule, create_timetable_entry, create_exam_entry,
    generate_master_timetable, MasterGenerateInput
)

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture(scope="function")
async def db_session():
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
async def test_scheduling_rule_creation(db_session):
    admin = User(email="admin@college.edu", password_hash="hash", full_name="Admin", role=UserRole.ADMIN)
    db_session.add(admin)
    await db_session.commit()

    rule_in = SchedulingRuleCreate(
        department_id=None,
        slots_per_day=8,
        days_active="Monday,Tuesday,Wednesday,Thursday,Friday",
        allow_classroom_overlap=True,
        allow_faculty_overlap=False,
        lunch_slot=4,
        activity_blocks="Saturday-5,Saturday-6"
    )
    
    rule = await save_scheduling_rule(rule_in, admin, db_session)
    assert rule.id is not None
    assert rule.slots_per_day == 8
    assert rule.days_active == "Monday,Tuesday,Wednesday,Thursday,Friday"
    assert rule.allow_classroom_overlap is True

@pytest.mark.asyncio
async def test_timetable_clash_engine(db_session):
    # Setup initial entities
    admin = User(email="admin@college.edu", password_hash="hash", full_name="Admin", role=UserRole.ADMIN)
    db_session.add(admin)
    await db_session.commit()

    dept = Department(name="CSE", code="CSE")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    subj = Subject(name="Operating Systems", code="CS302", department_id=dept.id, credits=4)
    db_session.add(subj)
    await db_session.commit()
    await db_session.refresh(subj)

    faculty_user = User(email="teacher@college.edu", password_hash="hash", full_name="Dr. Smith", role=UserRole.FACULTY)
    db_session.add(faculty_user)
    await db_session.commit()
    await db_session.refresh(faculty_user)

    profile = FacultyProfile(user_id=faculty_user.id, department_id=dept.id, designation="Professor", max_weekly_workload=2)
    db_session.add(profile)
    await db_session.commit()
    await db_session.refresh(profile)

    avail = FacultyAvailability(
        faculty_id=profile.id,
        day_of_week="Monday",
        time_slot=2,
        is_available=False
    )
    db_session.add(avail)
    await db_session.commit()

    room_1 = Classroom(room_number="Room-101", capacity=30, rows=5, cols=6)
    room_2 = Classroom(room_number="Room-102", capacity=30, rows=5, cols=6)
    db_session.add_all([room_1, room_2])
    await db_session.commit()
    await db_session.refresh(room_1)
    await db_session.refresh(room_2)

    entry_in_1 = TimetableEntryCreate(
        department_id=dept.id,
        section="CSE-3A",
        day_of_week="Monday",
        time_slot=1,
        subject_id=subj.id,
        faculty_id=profile.id,
        classroom_id=room_1.id
    )
    e1 = await create_timetable_entry(entry_in_1, admin, db_session)
    assert e1.id is not None

    # Test Clash 1: Section Clash (CSE-3A is busy Monday Slot 1)
    entry_in_clash_sec = TimetableEntryCreate(
        department_id=dept.id,
        section="CSE-3A",
        day_of_week="Monday",
        time_slot=1,
        subject_id=subj.id,
        faculty_id=profile.id,
        classroom_id=room_2.id
    )
    with pytest.raises(HTTPException) as exc:
        await create_timetable_entry(entry_in_clash_sec, admin, db_session)
    assert "Section Clash" in exc.value.detail

@pytest.mark.asyncio
async def test_exam_timetable_constraints(db_session):
    admin = User(email="admin@college.edu", password_hash="hash", full_name="Admin", role=UserRole.ADMIN)
    db_session.add(admin)
    await db_session.commit()

    dept = Department(name="CSE", code="CSE")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    subj_1 = Subject(name="Algorithms", code="CS301", department_id=dept.id, credits=4)
    subj_2 = Subject(name="Databases", code="CS303", department_id=dept.id, credits=3)
    db_session.add_all([subj_1, subj_2])
    await db_session.commit()
    await db_session.refresh(subj_1)
    await db_session.refresh(subj_2)

    teacher_user = User(email="teacher@college.edu", password_hash="hash", full_name="Dr. Alan", role=UserRole.FACULTY)
    db_session.add(teacher_user)
    await db_session.commit()
    await db_session.refresh(teacher_user)

    profile = FacultyProfile(user_id=teacher_user.id, department_id=dept.id, designation="Professor", max_weekly_workload=10)
    db_session.add(profile)
    await db_session.commit()
    await db_session.refresh(profile)

    room_1 = Classroom(room_number="Room-101", capacity=30, rows=5, cols=6)
    room_2 = Classroom(room_number="Room-102", capacity=30, rows=5, cols=6)
    db_session.add_all([room_1, room_2])
    await db_session.commit()
    await db_session.refresh(room_1)
    await db_session.refresh(room_2)

    exam_date = datetime.utcnow() + timedelta(days=5)

    # First exam entry
    exam_1 = ExamTimetableEntryCreate(
        exam_date=exam_date,
        time_slot=1,
        subject_id=subj_1.id,
        classroom_id=room_1.id,
        invigilator_id=profile.id
    )
    e1 = await create_exam_entry(exam_1, admin, db_session)
    assert e1.id is not None

    # Test Invigilator double duty booking clash (Dr. Alan is already in room 1 at slot 1)
    exam_2_clash = ExamTimetableEntryCreate(
        exam_date=exam_date,
        time_slot=1,
        subject_id=subj_2.id,
        classroom_id=room_2.id,
        invigilator_id=profile.id
    )
    with pytest.raises(HTTPException) as exc:
        await create_exam_entry(exam_2_clash, admin, db_session)
    assert "Invigilator Collision" in exc.value.detail

@pytest.mark.asyncio
async def test_ai_master_timetable_solver(db_session):
    admin = User(email="admin@college.edu", password_hash="hash", full_name="Admin", role=UserRole.ADMIN)
    db_session.add(admin)
    await db_session.commit()

    dept = Department(name="Computer Science", code="CSE")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    # Setup rule: 6 slots per day, slot 4 is lunch, active Mon-Fri
    rule = SchedulingRule(
        department_id=dept.id,
        slots_per_day=6,
        days_active="Monday,Tuesday,Wednesday,Thursday,Friday",
        lunch_slot=4,
        activity_blocks="Friday-5,Friday-6"
    )
    db_session.add(rule)
    await db_session.commit()

    # Subjects rules: Algo needs 3 lectures, 1 lab (consecutive 3 slots)
    subj_algo = Subject(name="Algorithms", code="CS301", department_id=dept.id, credits=4)
    db_session.add(subj_algo)
    await db_session.commit()
    await db_session.refresh(subj_algo)

    algo_spec = SubjectSchedulingRule(
        subject_id=subj_algo.id,
        lectures_per_week=3,
        labs_per_week=1,
        lab_duration=3
    )
    db_session.add(algo_spec)
    await db_session.commit()

    # 2 Teachers
    teacher_1 = User(email="t1@college.edu", password_hash="hash", full_name="Dr. T1", role=UserRole.FACULTY)
    db_session.add(teacher_1)
    await db_session.commit()
    await db_session.refresh(teacher_1)

    prof_1 = FacultyProfile(user_id=teacher_1.id, department_id=dept.id, designation="Assoc. Professor", max_weekly_workload=16)
    prof_1.subjects.append(subj_algo)
    db_session.add(prof_1)
    await db_session.commit()

    # 2 Classrooms: 1 Lecture Room, 1 Computer Lab
    c_room = Classroom(room_number="Room-A", capacity=35, room_type="LECTURE_HALL")
    l_room = Classroom(room_number="Lab-1", capacity=35, room_type="COMPUTER_LAB")
    db_session.add_all([c_room, l_room])
    await db_session.commit()
    await db_session.refresh(c_room)
    await db_session.refresh(l_room)

    # Generate timetable for 1 section "CSE-3A"
    generate_input = MasterGenerateInput(
        department_id=dept.id,
        sections=["CSE-3A"]
    )

    generated_slots = await generate_master_timetable(generate_input, admin, db_session)
    assert len(generated_slots) == 6 # 3 lectures + 1 lab (3 slots) = 6 timetable entries!

    # Asserts
    # Verify no entries are in lunch slot index (Slot 4)
    for slot in generated_slots:
        assert slot.time_slot != 4

    # Verify Lab entries are inside "Lab-1" classroom
    lab_entries = [s for s in generated_slots if s.classroom_id == l_room.id]
    assert len(lab_entries) == 3 # 3 consecutive slots

    # Verify lab slots are consecutive on the same day
    lab_day = lab_entries[0].day_of_week
    lab_slots = sorted([s.time_slot for s in lab_entries])
    assert lab_slots == [1, 2, 3] or lab_slots == [5, 6, 7] or lab_slots == [2, 3, 5] # consecutive ignoring lunch break
