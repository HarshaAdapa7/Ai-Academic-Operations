import pytest
from datetime import datetime, date, timedelta
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select

from app.core.database import Base
from app.models.user import User, UserRole
from app.models.faculty import Department, Subject, FacultyProfile
from app.models.classroom import Classroom
from app.models.academic_calendar import AcademicCalendar, AcademicHoliday
from app.models.timetable import ExamTimetableEntry
from app.schemas.timetable import GenerateExamsRequest
from app.api.exam_timetable import (
    generate_exam_timetable_endpoint,
    get_exam_calendar_dates
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
async def test_academic_calendar_date_retrieval_and_overrides(db_session: AsyncSession):
    # 1. Setup Admin user
    admin = User(id="user_admin", email="admin@test.com", password_hash="pass", role=UserRole.ADMIN, full_name="Admin User")
    db_session.add(admin)

    # 2. Setup Academic Calendar with mid and end sem exam start dates
    cal = AcademicCalendar(
        id="cal_1",
        academic_year="2026–2027",
        semester="1st Year - Sem 1",
        semester_start_date=date(2026, 6, 1),
        semester_end_date=date(2026, 11, 30),
        class_commencement_date=date(2026, 6, 5),
        mid1_start_date=date(2026, 8, 10), # Monday
        mid2_start_date=date(2026, 10, 5), # Monday
        end_sem_exam_start_date=date(2026, 11, 2), # Monday
        is_active=True
    )
    db_session.add(cal)

    # 3. Setup department, classrooms, faculty, subjects across 4 years
    dept = Department(id="dept_cse", code="CSE", name="Computer Science & Engineering")
    db_session.add(dept)

    fac_user = User(id="fac_user_1", email="fac1@test.com", password_hash="pass", role=UserRole.FACULTY, full_name="Prof John")
    db_session.add(fac_user)
    fac = FacultyProfile(id="fac_1", user_id="fac_user_1", department_id="dept_cse", designation="Assistant Professor")
    db_session.add(fac)

    room = Classroom(id="room_101", room_number="101", capacity=60, room_type="LECTURE_HALL")
    db_session.add(room)

    # Subjects for Year 4, Year 3, Year 2, Year 1
    subjs = [
        Subject(id="s_y4_1", code="CS401", name="Cloud Computing", academic_year=4, department_id="dept_cse", subject_type="THEORY"),
        Subject(id="s_y3_1", code="CS301", name="Database Systems", academic_year=3, department_id="dept_cse", subject_type="THEORY"),
        Subject(id="s_y2_1", code="CS201", name="Data Structures", academic_year=2, department_id="dept_cse", subject_type="THEORY"),
        Subject(id="s_y1_1", code="CS101", name="Programming in C", academic_year=1, department_id="dept_cse", subject_type="THEORY"),
    ]
    for s in subjs:
        db_session.add(s)

    await db_session.commit()

    # Test 1: get_exam_calendar_dates endpoint helper
    cal_dates = await get_exam_calendar_dates(semester=1, current_user=admin, db=db_session)
    assert cal_dates["mid1_start_date"] == "2026-08-10"
    assert cal_dates["mid2_start_date"] == "2026-10-05"
    assert cal_dates["end_sem_exam_start_date"] == "2026-11-02"

    # Test 2: Generate Mid-1 exam without specifying start_date -> Should retrieve mid1_start_date (2026-08-10)
    req_mid = GenerateExamsRequest(
        category="MID",
        exam_type="MID_1",
        semester=1
    )
    res_mid = await generate_exam_timetable_endpoint(req_in=req_mid, current_user=admin, db=db_session)
    assert len(res_mid) > 0
    mid_dates = {ex.exam_date.date() for ex in res_mid}
    assert date(2026, 8, 10) in mid_dates

    # Test 3: Generate Sem End exam without specifying start_date -> Should retrieve end_sem_exam_start_date (2026-11-02)
    req_sem = GenerateExamsRequest(
        category="SEM_END",
        exam_type="SEM_END",
        semester=1
    )
    res_sem = await generate_exam_timetable_endpoint(req_in=req_sem, current_user=admin, db=db_session)
    assert len(res_sem) == 4

    # Verify 3-Phase Staggered Sequence:
    # Year 4 completes first -> Nov 2 (Monday)
    # Year 3 & 2 start after Year 4 -> Nov 3 (Year 3), Nov 4 (Year 2)
    # Year 1 starts after all remaining years (4, 3, 2) finish -> Nov 5 (Year 1)
    y4_ex = [e for e in res_sem if e.academic_year == 4][0]
    y3_ex = [e for e in res_sem if e.academic_year == 3][0]
    y2_ex = [e for e in res_sem if e.academic_year == 2][0]
    y1_ex = [e for e in res_sem if e.academic_year == 1][0]

    assert y4_ex.exam_date.date() == date(2026, 11, 2)
    assert y3_ex.exam_date.date() == date(2026, 11, 3)
    assert y2_ex.exam_date.date() == date(2026, 11, 4)
    assert y1_ex.exam_date.date() == date(2026, 11, 5)

    # Test 4: Custom User Start Date Override
    custom_date = datetime(2026, 12, 1, 0, 0, 0)
    req_custom = GenerateExamsRequest(
        category="SEM_END",
        exam_type="SEM_END",
        start_date=custom_date,
        semester=1
    )
    res_custom = await generate_exam_timetable_endpoint(req_in=req_custom, current_user=admin, db=db_session)
    y4_custom = [e for e in res_custom if e.academic_year == 4][0]
    assert y4_custom.exam_date.date() == date(2026, 12, 1)


@pytest.mark.asyncio
async def test_year_specific_mid_exam_dates(db_session: AsyncSession):
    admin = User(id="user_admin_2", email="admin2@test.com", password_hash="pass", role=UserRole.ADMIN, full_name="Admin User")
    db_session.add(admin)

    # 4th Year Calendar: Mid 1 starts Sep 1, 2026
    cal_y4 = AcademicCalendar(
        id="cal_y4",
        academic_year="2026–2027",
        semester="4th Year - Sem 1",
        semester_start_date=date(2026, 6, 22),
        semester_end_date=date(2026, 11, 30),
        class_commencement_date=date(2026, 6, 22),
        mid1_start_date=date(2026, 9, 1),
        mid2_start_date=date(2026, 11, 16),
        end_sem_exam_start_date=date(2026, 11, 24)
    )
    # 3rd Year Calendar: Mid 1 starts Aug 20, 2026
    cal_y3 = AcademicCalendar(
        id="cal_y3",
        academic_year="2026–2027",
        semester="3rd Year - Sem 1",
        semester_start_date=date(2026, 6, 22),
        semester_end_date=date(2026, 11, 30),
        class_commencement_date=date(2026, 6, 22),
        mid1_start_date=date(2026, 8, 20),
        mid2_start_date=date(2026, 10, 15),
        end_sem_exam_start_date=date(2026, 10, 28)
    )
    # 2nd Year Calendar: Mid 1 starts Aug 20, 2026
    cal_y2 = AcademicCalendar(
        id="cal_y2",
        academic_year="2026–2027",
        semester="2nd Year - Sem 1",
        semester_start_date=date(2026, 6, 29),
        semester_end_date=date(2026, 11, 30),
        class_commencement_date=date(2026, 6, 29),
        mid1_start_date=date(2026, 8, 20),
        mid2_start_date=date(2026, 10, 15),
        end_sem_exam_start_date=date(2026, 10, 29)
    )
    db_session.add_all([cal_y4, cal_y3, cal_y2])

    dept = Department(id="dept_ece", code="ECE", name="Electronics & Communication")
    db_session.add(dept)

    fac_user = User(id="fac_user_ece", email="ece1@test.com", password_hash="pass", role=UserRole.FACULTY, full_name="Prof ECE")
    db_session.add(fac_user)
    fac = FacultyProfile(id="fac_ece", user_id="fac_user_ece", department_id="dept_ece", designation="Professor")
    db_session.add(fac)

    room = Classroom(id="room_201", room_number="201", capacity=60, room_type="LECTURE_HALL")
    db_session.add(room)

    subjs = [
        Subject(id="s_ece_y4", code="EC401", name="VLSI Design", academic_year=4, department_id="dept_ece", subject_type="THEORY"),
        Subject(id="s_ece_y3", code="EC301", name="Signals & Systems", academic_year=3, department_id="dept_ece", subject_type="THEORY"),
        Subject(id="s_ece_y2", code="EC201", name="Network Analysis", academic_year=2, department_id="dept_ece", subject_type="THEORY"),
    ]
    for s in subjs:
        db_session.add(s)

    await db_session.commit()

    # Generate Mid-1 exams across all years
    req_mid = GenerateExamsRequest(
        category="MID",
        exam_type="MID_1",
        semester=1
    )
    res_mid = await generate_exam_timetable_endpoint(req_in=req_mid, current_user=admin, db=db_session)

    y4_ex = [e for e in res_mid if e.academic_year == 4][0]
    y3_ex = [e for e in res_mid if e.academic_year == 3][0]
    y2_ex = [e for e in res_mid if e.academic_year == 2][0]

    # Verify 4th year Mid-1 starts Sep 1, 2026
    assert y4_ex.exam_date.date() == date(2026, 9, 1)
    # Verify 3rd year & 2nd year Mid-1 start Aug 20, 2026
    assert y3_ex.exam_date.date() == date(2026, 8, 20)
    assert y2_ex.exam_date.date() == date(2026, 8, 20)

