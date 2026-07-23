import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.classroom import Classroom, SeatingPlan, SeatingAssignment
from app.schemas.classroom import (
    ClassroomCreate, ClassroomResponse, SeatingPlanCreate, SeatingPlanResponse
)
from app.api.deps import get_current_user

logger = logging.getLogger("classroom-api")

router = APIRouter()

# ==========================================
# 1. CLASSROOM INVENTORY CRUD
# ==========================================

@router.get("/classrooms", response_model=List[ClassroomResponse])
async def list_classrooms(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Classroom).order_by(Classroom.room_number)
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/classrooms", response_model=ClassroomResponse)
async def create_classroom(
    room_in: ClassroomCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Only HOD and ADMIN can register classrooms
    if current_user.role not in [UserRole.HOD, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to manage classrooms.")

    # Unique check
    exist_stmt = select(Classroom).where(Classroom.room_number == room_in.room_number)
    exist_res = await db.execute(exist_stmt)
    if exist_res.scalars().first():
        raise HTTPException(status_code=400, detail=f"Classroom '{room_in.room_number}' is already registered.")

    new_room = Classroom(
        room_number=room_in.room_number,
        capacity=room_in.capacity,
        rows=room_in.rows,
        cols=room_in.cols,
        room_type=room_in.room_type,
        department_id=room_in.department_id
    )
    db.add(new_room)
    await db.commit()
    await db.refresh(new_room)
    return new_room

@router.put("/classrooms/{id}", response_model=ClassroomResponse)
async def update_classroom(
    id: str,
    room_in: ClassroomCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role not in [UserRole.HOD, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to manage classrooms.")

    stmt = select(Classroom).where(Classroom.id == id)
    res = await db.execute(stmt)
    room = res.scalars().first()
    if not room:
        raise HTTPException(status_code=404, detail="Classroom not found.")

    room.room_number = room_in.room_number
    room.capacity = room_in.capacity
    room.rows = room_in.rows
    room.cols = room_in.cols
    room.room_type = room_in.room_type
    room.department_id = room_in.department_id

    await db.commit()
    await db.refresh(room)
    return room

@router.delete("/classrooms/{id}")
async def delete_classroom(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role not in [UserRole.HOD, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to manage classrooms.")

    stmt = select(Classroom).where(Classroom.id == id)
    res = await db.execute(stmt)
    room = res.scalars().first()
    if not room:
        raise HTTPException(status_code=404, detail="Classroom not found.")

    await db.delete(room)
    await db.commit()
    return {"message": f"Classroom '{room.room_number}' deleted successfully."}

# ==========================================
# 2. SEATING PLAN GENERATION (JUMBLING)
# ==========================================

@router.post("/seating-plans/generate", response_model=SeatingPlanResponse)
async def generate_seating_plan(
    plan_in: SeatingPlanCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role not in [UserRole.HOD, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to generate seating plans.")

    # 1. Fetch classroom details
    rooms_stmt = select(Classroom).where(Classroom.id.in_(plan_in.classroom_ids))
    rooms_res = await db.execute(rooms_stmt)
    classrooms = rooms_res.scalars().all()
    if not classrooms:
        raise HTTPException(status_code=400, detail="No valid classrooms selected.")

    # Sort classrooms by room number or capacity to keep order deterministic
    classrooms.sort(key=lambda c: c.room_number)

    # 2. Pre-check total capacity
    total_seats = sum(c.rows * c.cols for c in classrooms)
    total_students_count = sum(len(c.students) for c in plan_in.courses)

    if total_students_count > total_seats:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient physical seating capacity. Total desks: {total_seats}, total students: {total_students_count}."
        )

    # 3. Checkerboard Jumbling logic
    # Separate students by course
    course_lists = []
    for c in plan_in.courses:
        course_lists.append({
            "subject_id": c.subject_id,
            "students": [s for s in c.students]
        })

    # Sort courses by student count descending to handle packing efficiently
    course_lists.sort(key=lambda item: len(item["students"]), reverse=True)

    # 4. Create Seating Plan header record
    new_plan = SeatingPlan(
        exam_date=plan_in.exam_date,
        time_slot=plan_in.time_slot
    )
    db.add(new_plan)
    await db.commit()
    await db.refresh(new_plan)

    # 5. Distribute students using checkerboard parity (r + c) % len(courses)
    assigned_count = 0
    for room in classrooms:
        for r in range(room.rows):
            for c in range(room.cols):
                if assigned_count >= total_students_count:
                    break

                # Target course index using checkerboard parity
                target_idx = (r + c) % len(course_lists)

                # Find the next course that has remaining students
                selected_course = None
                for offset in range(len(course_lists)):
                    idx = (target_idx + offset) % len(course_lists)
                    if len(course_lists[idx]["students"]) > 0:
                        selected_course = course_lists[idx]
                        break

                if not selected_course:
                    break

                # Pop student and subject
                stud = selected_course["students"].pop(0)
                subj_id = selected_course["subject_id"]

                assignment = SeatingAssignment(
                    seating_plan_id=new_plan.id,
                    classroom_id=room.id,
                    student_roll_no=stud.roll_no,
                    student_name=stud.name,
                    subject_id=subj_id,
                    row_index=r,
                    col_index=c
                )
                db.add(assignment)
                assigned_count += 1

            if assigned_count >= total_students_count:
                break

    await db.commit()

    # Fetch and return complete plan with assignments pre-loaded
    stmt = (
        select(SeatingPlan)
        .options(
            selectinload(SeatingPlan.assignments)
            .selectinload(SeatingAssignment.classroom),
            selectinload(SeatingPlan.assignments)
            .selectinload(SeatingAssignment.subject)
        )
        .where(SeatingPlan.id == new_plan.id)
    )
    res = await db.execute(stmt)
    return res.scalars().first()

@router.get("/seating-plans", response_model=List[SeatingPlanResponse])
async def list_seating_plans(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(SeatingPlan)
        .options(
            selectinload(SeatingPlan.assignments)
            .selectinload(SeatingAssignment.classroom),
            selectinload(SeatingPlan.assignments)
            .selectinload(SeatingAssignment.subject)
        )
        .order_by(SeatingPlan.exam_date.desc(), SeatingPlan.time_slot.desc())
    )
    res = await db.execute(stmt)
    return res.scalars().all()

@router.get("/seating-plans/{id}", response_model=SeatingPlanResponse)
async def get_seating_plan(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(SeatingPlan)
        .options(
            selectinload(SeatingPlan.assignments)
            .selectinload(SeatingAssignment.classroom),
            selectinload(SeatingPlan.assignments)
            .selectinload(SeatingAssignment.subject)
        )
        .where(SeatingPlan.id == id)
    )
    res = await db.execute(stmt)
    plan = res.scalars().first()
    if not plan:
        raise HTTPException(status_code=404, detail="Seating plan not found.")
    return plan
