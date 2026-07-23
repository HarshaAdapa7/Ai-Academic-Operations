import pytest
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.models.user import User, UserRole
from app.models.faculty import Department, Subject, FacultyProfile, SectionConfig
from app.models.classroom import Classroom
from app.models.timetable import SubjectSchedulingRule
from app.api.timetable import generate_master_timetable, MasterGenerateInput

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
async def test_btech_rules_18_to_21_solver(db_session):
    # Setup Admin
    admin = User(email="admin@college.edu", password_hash="hash", full_name="Admin User", role=UserRole.ADMIN)
    db_session.add(admin)
    await db_session.commit()

    # 1. Departments (CSE and ECE)
    dept_cse = Department(name="Computer Science", code="CSE")
    dept_ece = Department(name="Electronics", code="ECE")
    db_session.add_all([dept_cse, dept_ece])
    await db_session.commit()

    # 2. Subjects
    s_counsel = Subject(name="Mentoring Session", code="CS309M", department_id=dept_cse.id, subject_type="COUNSELLING", academic_year=3)
    s_theory = Subject(name="Data Structures", code="CS301", department_id=dept_cse.id, subject_type="THEORY", academic_year=3)
    s_ece_theory = Subject(name="VLSI Design", code="EC301", department_id=dept_ece.id, subject_type="THEORY", academic_year=3)
    db_session.add_all([s_counsel, s_theory, s_ece_theory])
    await db_session.commit()

    r_counsel = SubjectSchedulingRule(subject_id=s_counsel.id, lectures_per_week=0, labs_per_week=0, lab_duration=1)
    r_theory = SubjectSchedulingRule(subject_id=s_theory.id, lectures_per_week=3, labs_per_week=0, lab_duration=1)
    r_ece = SubjectSchedulingRule(subject_id=s_ece_theory.id, lectures_per_week=3, labs_per_week=0, lab_duration=1)
    db_session.add_all([r_counsel, r_theory, r_ece])
    await db_session.commit()

    # 3. Faculty Members: Dean, Mentors, Cross-branch teacher
    u_dean = User(email="dean@college.edu", password_hash="hash", full_name="Dr. Dean", role=UserRole.FACULTY)
    u_mentor1 = User(email="m1@college.edu", password_hash="hash", full_name="Mentor One", role=UserRole.FACULTY)
    u_mentor2 = User(email="m2@college.edu", password_hash="hash", full_name="Mentor Two", role=UserRole.FACULTY)
    db_session.add_all([u_dean, u_mentor1, u_mentor2])
    await db_session.commit()

    p_dean = FacultyProfile(user_id=u_dean.id, department_id=dept_cse.id, designation="Academic Dean", is_dean=True)
    p_m1 = FacultyProfile(user_id=u_mentor1.id, department_id=dept_cse.id, designation="Associate Professor")
    p_m2 = FacultyProfile(user_id=u_mentor2.id, department_id=dept_cse.id, designation="Assistant Professor")
    
    p_dean.subjects.append(s_theory)
    p_m1.subjects.extend([s_counsel, s_theory, s_ece_theory]) # Cross-branch teacher for CSE and ECE!
    p_m2.subjects.extend([s_counsel, s_theory])

    db_session.add_all([p_dean, p_m1, p_m2])
    await db_session.commit()

    # 4. Section Config with 2 Mentors for Rule 18
    sec_cfg = SectionConfig(department_id=dept_cse.id, academic_year=3, name="CSE 3-A", class_teacher_id=p_m1.id)
    sec_cfg.counseling_mentors.extend([p_m1, p_m2])
    db_session.add(sec_cfg)
    await db_session.commit()

    # 5. Classrooms
    room1 = Classroom(room_number="C-101", capacity=40, room_type="LECTURE_HALL")
    room2 = Classroom(room_number="E-101", capacity=40, room_type="LECTURE_HALL")
    db_session.add_all([room1, room2])
    await db_session.commit()

    # 6. Run Master Solver for "CSE 3-A" and "ECE 3-A"
    generate_input = MasterGenerateInput(
        department_ids=[dept_cse.id, dept_ece.id],
        sections=["CSE 3-A", "ECE 3-A"]
    )
    entries = await generate_master_timetable(generate_input, admin, db_session)
    assert len(entries) > 0

    # Rule 21 Check: Dean (Dr. Dean) has NO classes on Wednesday PM (slots 5, 6, 7)
    dean_entries = [e for e in entries if e.faculty_id == p_dean.id]
    for entry in dean_entries:
        if entry.day_of_week == "Wednesday":
            assert entry.time_slot <= 4

    # Rule 18 Check: Both mentors (Mentor One and Mentor Two) are free at Period 7 when Counselling is held
    counsel_entries = [e for e in entries if e.subject_id == s_counsel.id]
    assert len(counsel_entries) > 0
    counsel_day = counsel_entries[0].day_of_week
    
    # Check that Mentor 2 is NOT assigned to any class during (counsel_day, Period 7)
    m2_at_counsel = [e for e in entries if e.faculty_id == p_m2.id and e.day_of_week == counsel_day and e.time_slot == 7]
    assert len(m2_at_counsel) == 0
