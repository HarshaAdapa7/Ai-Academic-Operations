import pytest
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.database import Base
from app.models.user import User, UserRole
from app.models.faculty import Department, Subject, FacultyProfile
from app.models.classroom import Classroom
from app.schemas.ai import AIChatInput, AcademicPolicyCreate
from app.api.ai import (
    ai_chat_consultation, get_analytics_dashboard,
    list_academic_policies, create_academic_policy
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
async def test_academic_policies_rag(db_session):
    admin = User(email="admin@college.edu", password_hash="hash", full_name="Admin", role=UserRole.ADMIN)
    db_session.add(admin)
    await db_session.commit()

    # List default policies (triggers auto-seeding)
    policies = await list_academic_policies(None, admin, db_session)
    assert len(policies) >= 4
    assert any("Leave" in p.title for p in policies)

    # Create new custom policy
    new_pol = AcademicPolicyCreate(
        title="B.Tech Attendance Eligibility Rule",
        category="LEAVE_POLICY",
        content="Students must maintain at least 75% attendance to sit for semester examinations.",
        tags="attendance,75%,exam"
    )
    created = await create_academic_policy(new_pol, admin, db_session)
    assert created.id is not None
    assert created.title == "B.Tech Attendance Eligibility Rule"

@pytest.mark.asyncio
async def test_analytics_dashboard_metrics(db_session):
    admin = User(email="admin@college.edu", password_hash="hash", full_name="Admin", role=UserRole.ADMIN)
    db_session.add(admin)
    await db_session.commit()

    dept = Department(name="CSE", code="CSE")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    teacher_user = User(email="t1@college.edu", password_hash="hash", full_name="Dr. T1", role=UserRole.FACULTY)
    db_session.add(teacher_user)
    await db_session.commit()
    await db_session.refresh(teacher_user)

    prof = FacultyProfile(user_id=teacher_user.id, department_id=dept.id, designation="Professor", max_weekly_workload=16)
    db_session.add(prof)

    room = Classroom(room_number="Lab-101", capacity=30, room_type="COMPUTER_LAB")
    db_session.add(room)
    await db_session.commit()

    analytics = await get_analytics_dashboard(dept.id, admin, db_session)
    assert analytics.total_faculty == 1
    assert analytics.total_classrooms == 1
    assert len(analytics.workload_metrics) == 1
    assert analytics.workload_metrics[0].faculty_name == "Dr. T1"

@pytest.mark.asyncio
async def test_ai_chat_and_tool_reasoning(db_session):
    user = User(email="hod@college.edu", password_hash="hash", full_name="Dr. HOD", role=UserRole.HOD)
    db_session.add(user)
    await db_session.commit()

    # Prompt 1: Workload Query
    input_1 = AIChatInput(prompt="Who is the most overutilized faculty member in CSE?")
    out_1 = await ai_chat_consultation(input_1, user, db_session)
    assert out_1.conversation_id is not None
    assert "Workload" in out_1.reply
    assert len(out_1.suggested_actions) > 0

    # Prompt 2: Policy Query
    input_2 = AIChatInput(prompt="What are the B.Tech lab slot rules?", conversation_id=out_1.conversation_id)
    out_2 = await ai_chat_consultation(input_2, user, db_session)
    assert "Policy" in out_2.reply or "Lab" in out_2.reply
