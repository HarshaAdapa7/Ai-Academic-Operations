import pytest
import asyncio
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select
from fastapi import HTTPException

from app.core.database import Base
from app.models.user import User, UserRole
from app.models.faculty import Department, Subject
from app.models.classroom import Classroom, SeatingPlan, SeatingAssignment
from app.schemas.classroom import SeatingPlanCreate, CourseStudentInput, StudentInfo, ClassroomCreate
from app.api.classroom import (
    create_classroom, generate_seating_plan, list_classrooms
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
async def test_classroom_creation(db_session):
    admin = User(email="admin@college.edu", password_hash="hash", full_name="Admin", role=UserRole.ADMIN)
    db_session.add(admin)
    await db_session.commit()

    room_in = ClassroomCreate(
        room_number="Room-A",
        capacity=30,
        rows=5,
        cols=6,
        room_type="LECTURE_HALL"
    )
    
    room = await create_classroom(room_in, admin, db_session)
    assert room.id is not None
    assert room.room_number == "Room-A"
    assert room.capacity == 30

    # Test uniqueness
    with pytest.raises(HTTPException) as exc_info:
        await create_classroom(room_in, admin, db_session)
    assert exc_info.value.status_code == 400

@pytest.mark.asyncio
async def test_alternate_seat_jumbling_algorithm(db_session):
    # Setup roles and department
    admin = User(email="admin@college.edu", password_hash="hash", full_name="Admin", role=UserRole.ADMIN)
    db_session.add(admin)
    await db_session.commit()

    dept = Department(name="Computer Science", code="CSE")
    db_session.add(dept)
    await db_session.commit()
    await db_session.refresh(dept)

    # Setup 2 subjects
    subj_algo = Subject(name="Algorithms", code="CS302", department_id=dept.id, credits=4)
    subj_db = Subject(name="Databases", code="CS304", department_id=dept.id, credits=3)
    db_session.add_all([subj_algo, subj_db])
    await db_session.commit()
    await db_session.refresh(subj_algo)
    await db_session.refresh(subj_db)

    # Setup classroom (4x4 layout, 16 capacity)
    room = Classroom(room_number="Room-101", capacity=16, rows=4, cols=4, room_type="LECTURE_HALL")
    db_session.add(room)
    await db_session.commit()
    await db_session.refresh(room)

    # Students inputs
    algo_students = [
        StudentInfo(roll_no=f"ALGO-0{i}", name=f"Algo Stud {i}") for i in range(1, 7) # 6 students
    ]
    db_students = [
        StudentInfo(roll_no=f"DB-0{i}", name=f"DB Stud {i}") for i in range(1, 7) # 6 students
    ]

    courses_in = [
        CourseStudentInput(subject_id=subj_algo.id, students=algo_students),
        CourseStudentInput(subject_id=subj_db.id, students=db_students)
    ]

    plan_in = SeatingPlanCreate(
        exam_date=datetime.utcnow() + timedelta(days=2),
        time_slot=1,
        classroom_ids=[room.id],
        courses=courses_in
    )

    plan = await generate_seating_plan(plan_in, admin, db_session)
    assert plan.id is not None
    assert len(plan.assignments) == 12 # 6 + 6 = 12 student assignments

    # Verify jumbling: adjacent seats along rows should alternate courses
    # Map row,col to assignment
    grid = {}
    for assign in plan.assignments:
        grid[(assign.row_index, assign.col_index)] = assign

    # Traverse grid and check adjacent neighbors (horizontal and vertical)
    for r in range(4):
        for c in range(4):
            curr = grid.get((r, c))
            if not curr:
                continue
            
            # Check horizontal neighbor (r, c+1)
            right = grid.get((r, c+1))
            if right:
                # Subjects must be different!
                assert curr.subject_id != right.subject_id

            # Check vertical neighbor (r+1, c)
            down = grid.get((r+1, c))
            if down:
                # Subjects must be different!
                assert curr.subject_id != down.subject_id
