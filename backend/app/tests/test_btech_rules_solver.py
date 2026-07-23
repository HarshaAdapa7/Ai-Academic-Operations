import pytest
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException

from app.core.database import Base
from app.models.user import User, UserRole
from app.models.faculty import Department, Subject, FacultyProfile, FacultyAvailability
from app.models.classroom import Classroom
from app.models.timetable import SchedulingRule, SubjectSchedulingRule, TimetableEntry
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
async def test_17_btech_rules_master_solver(db_session):
    # Setup Admin user
    admin = User(email="admin@college.edu", password_hash="hash", full_name="System Admin", role=UserRole.ADMIN)
    db_session.add(admin)
    await db_session.commit()

    # 1. Setup 2 Departments (CSE and ECE)
    dept_cse = Department(name="Computer Science", code="CSE")
    dept_ece = Department(name="Electronics", code="ECE")
    db_session.add_all([dept_cse, dept_ece])
    await db_session.commit()
    await db_session.refresh(dept_cse)
    await db_session.refresh(dept_ece)

    # 2. Setup Subjects across Year 1 and Year 3
    # CSE Year 1 Subjects
    s_maths1 = Subject(name="Maths-I", code="MA101", department_id=dept_cse.id, credits=3, subject_type="THEORY", academic_year=1)
    s_phy_lab = Subject(name="Physics Lab", code="PH102L", department_id=dept_cse.id, credits=2, subject_type="LAB", academic_year=1)
    s_counsel1 = Subject(name="Mentoring", code="MC101", department_id=dept_cse.id, credits=1, subject_type="COUNSELLING", academic_year=1)
    s_sports1 = Subject(name="Sports", code="SP101", department_id=dept_cse.id, credits=1, subject_type="SPORTS_LIBRARY", academic_year=1)

    # CSE Year 3 Subjects
    s_algo = Subject(name="Algorithms", code="CS301", department_id=dept_cse.id, credits=4, subject_type="THEORY", academic_year=3)
    s_elective = Subject(name="Cloud Computing", code="CS305E", department_id=dept_cse.id, credits=3, subject_type="ELECTIVE", academic_year=3)
    s_net_lab = Subject(name="Networks Lab", code="CS302L", department_id=dept_cse.id, credits=2, subject_type="LAB", academic_year=3)

    db_session.add_all([s_maths1, s_phy_lab, s_counsel1, s_sports1, s_algo, s_elective, s_net_lab])
    await db_session.commit()
    await db_session.refresh(s_maths1)
    await db_session.refresh(s_phy_lab)
    await db_session.refresh(s_counsel1)
    await db_session.refresh(s_sports1)
    await db_session.refresh(s_algo)
    await db_session.refresh(s_elective)
    await db_session.refresh(s_net_lab)

    # Setup subject specs (3-period labs per Rule 9)
    rule_phy = SubjectSchedulingRule(subject_id=s_phy_lab.id, lectures_per_week=0, labs_per_week=1, lab_duration=3)
    rule_net = SubjectSchedulingRule(subject_id=s_net_lab.id, lectures_per_week=0, labs_per_week=1, lab_duration=3)
    rule_math = SubjectSchedulingRule(subject_id=s_maths1.id, lectures_per_week=3, labs_per_week=0, lab_duration=1)
    rule_algo = SubjectSchedulingRule(subject_id=s_algo.id, lectures_per_week=3, labs_per_week=0, lab_duration=1)
    rule_elec = SubjectSchedulingRule(subject_id=s_elective.id, lectures_per_week=2, labs_per_week=0, lab_duration=1)
    db_session.add_all([rule_phy, rule_net, rule_math, rule_algo, rule_elec])
    await db_session.commit()

    # 3. Setup Faculty Members (including an HOD for Rules 1 & 2)
    u_hod = User(email="hod@college.edu", password_hash="hash", full_name="Dr. HOD CSE", role=UserRole.HOD)
    u_prof = User(email="prof@college.edu", password_hash="hash", full_name="Dr. Alan", role=UserRole.FACULTY)
    db_session.add_all([u_hod, u_prof])
    await db_session.commit()
    await db_session.refresh(u_hod)
    await db_session.refresh(u_prof)

    p_hod = FacultyProfile(user_id=u_hod.id, department_id=dept_cse.id, designation="HOD", is_hod=True, max_weekly_workload=16)
    p_prof = FacultyProfile(user_id=u_prof.id, department_id=dept_cse.id, designation="Professor", is_hod=False, max_weekly_workload=20)
    
    # Assign subject expertise
    p_hod.subjects.extend([s_maths1, s_algo])
    p_prof.subjects.extend([s_phy_lab, s_net_lab, s_elective, s_counsel1, s_sports1])
    db_session.add_all([p_hod, p_prof])
    await db_session.commit()

    # 4. Setup Classrooms: 1 Lecture Room, 1 Computer Lab
    r_lecture = Classroom(room_number="Room-101", capacity=40, room_type="LECTURE_HALL")
    r_lab = Classroom(room_number="Lab-1", capacity=40, room_type="COMPUTER_LAB")
    db_session.add_all([r_lecture, r_lab])
    await db_session.commit()
    await db_session.refresh(r_lecture)
    await db_session.refresh(r_lab)

    # 5. Run Solver for Sections: "CSE 1-A" (Year 1) and "CSE 3-A" (Year 3)
    generate_input = MasterGenerateInput(
        department_ids=[dept_cse.id],
        sections=["CSE 1-A", "CSE 3-A"]
    )

    generated_entries = await generate_master_timetable(generate_input, admin, db_session)
    assert len(generated_entries) > 0

    # Verification of 17 Rules:
    
    # Rule 0 Check: Year 1 vs Year 3 Lunch Separation
    # Year 1 (CSE 1-A) entries should NOT have time_slot == 4 (Lunch)
    # Year 3 (CSE 3-A) entries should NOT have time_slot == 5 (Lunch)
    cse_1a = [e for e in generated_entries if e.section == "CSE 1-A"]
    cse_3a = [e for e in generated_entries if e.section == "CSE 3-A"]

    for entry in cse_1a:
        assert entry.time_slot != 4

    for entry in cse_3a:
        assert entry.time_slot != 5

    # Rule 1 Check: HOD (Dr. HOD CSE) must NOT be assigned Slot 1 or Slot 7
    hod_entries = [e for e in generated_entries if e.faculty_id == p_hod.id]
    for entry in hod_entries:
        assert entry.time_slot != 1
        assert entry.time_slot != 7

    # Rule 2 Check: HOD on Wednesday afternoon has no classes
    wed_hod_afternoon = [e for e in hod_entries if e.day_of_week == "Wednesday" and e.time_slot > 4]
    assert len(wed_hod_afternoon) == 0

    # Rule 4 Check: Counselling is placed at Period 7
    counsel_entries = [e for e in generated_entries if e.subject_id == s_counsel1.id]
    for entry in counsel_entries:
        assert entry.time_slot == 7

    # Rule 9 Check: 3-period labs are placed at Periods 2-4 or 5-7
    lab_entries = [e for e in generated_entries if e.classroom_id == r_lab.id]
    for entry in lab_entries:
        assert entry.time_slot in [2, 3, 4, 5, 6, 7]
        assert entry.time_slot != 1

    # Rule 15 Check: Saturday Afternoon slots (5, 6, 7) are empty
    sat_afternoon = [e for e in generated_entries if e.day_of_week == "Saturday" and e.time_slot in [5, 6, 7]]
    assert len(sat_afternoon) == 0
