import logging
from typing import List, Optional, Dict, Any, Set
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import delete

from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.faculty import Department, Subject, FacultyProfile
from app.models.classroom import Classroom
from app.models.timetable import ExamTimetableEntry
from app.models.academic_calendar import AcademicCalendar, AcademicHoliday
from app.schemas.timetable import (
    ExamTimetableEntryCreate, ExamTimetableEntryResponse,
    GenerateExamsRequest
)
from app.api.deps import get_current_user, get_optional_current_user, get_user_department_id

logger = logging.getLogger("exam-timetable-api")

router = APIRouter()


# ==========================================
# HELPER FUNCTIONS FOR DATE COMPUTATION
# ==========================================

def get_next_valid_exam_date(start_dt: datetime, days_offset: int, holiday_dates: Set) -> datetime:
    """Helper to advance dates skipping Sundays & Academic Holidays."""
    curr = start_dt
    added = 0
    while added < days_offset:
        curr = curr + timedelta(days=1)
        # Skip Sundays (weekday == 6) and holidays recorded in AcademicHoliday table
        if curr.weekday() == 6 or curr.date() in holiday_dates:
            continue
        added += 1
    return curr

def get_valid_date_on_or_after(start_dt: datetime, holiday_dates: Set) -> datetime:
    """Helper to check if a single date is valid (not Sunday, not Holiday)."""
    curr = start_dt
    while curr.weekday() == 6 or curr.date() in holiday_dates:
        curr = curr + timedelta(days=1)
    return curr


# ==========================================
# EXAM TIMETABLE ENDPOINTS
# ==========================================

@router.get("/timetable/exams", response_model=List[ExamTimetableEntryResponse])
async def list_exam_schedule(
    category: Optional[str] = None, # MID, SEM_END
    exam_type: Optional[str] = None, # MID_1, MID_2, SEM_END
    academic_year: Optional[int] = None, # 1, 2, 3, 4
    department_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(ExamTimetableEntry)
        .options(
            selectinload(ExamTimetableEntry.subject).selectinload(Subject.department),
            selectinload(ExamTimetableEntry.classroom),
            selectinload(ExamTimetableEntry.invigilator).selectinload(FacultyProfile.user)
        )
        .order_by(ExamTimetableEntry.exam_date, ExamTimetableEntry.time_slot)
    )
    if exam_type:
        stmt = stmt.where(ExamTimetableEntry.exam_type == exam_type)
    elif category:
        if category.upper() == "MID":
            stmt = stmt.where(ExamTimetableEntry.exam_type.in_(["MID_1", "MID_2"]))
        elif category.upper() == "SEM_END":
            stmt = stmt.where(ExamTimetableEntry.exam_type == "SEM_END")

    if academic_year:
        stmt = stmt.where(ExamTimetableEntry.academic_year == academic_year)

    if department_id and department_id != "ALL":
        stmt = stmt.join(Subject, ExamTimetableEntry.subject_id == Subject.id).where(Subject.department_id == department_id)
        
    res = await db.execute(stmt)
    return res.scalars().all()


def get_calendar_date_for_year(all_cals: List[AcademicCalendar], year: int, exam_type: str, category: str, sem_num: int) -> Optional[Any]:
    """Helper to fetch year-specific exam start date from Academic Calendar DB."""
    yr_str = "4th Year" if year == 4 else "3rd Year" if year == 3 else "2nd Year" if year == 2 else "1st Year"
    sem_str = f"Sem {sem_num}"

    matching = [c for c in all_cals if yr_str.lower() in str(c.semester).lower() and sem_str.lower() in str(c.semester).lower()]
    if not matching:
        matching = [c for c in all_cals if yr_str.lower() in str(c.semester).lower()]
    if not matching:
        matching = [c for c in all_cals if sem_str.lower() in str(c.semester).lower()]
    if not matching:
        matching = all_cals

    for c in matching:
        if exam_type == "MID_1" and c.mid1_start_date:
            return c.mid1_start_date
        elif exam_type == "MID_2" and c.mid2_start_date:
            return c.mid2_start_date
        elif (category.upper() in ["SEM_END", "SEM"] or exam_type == "SEM_END") and c.end_sem_exam_start_date:
            return c.end_sem_exam_start_date
    return None


@router.get("/timetable/exam-calendar-dates")
@router.get("/timetable/exams/calendar-dates")
@router.api_route("/timetable/exam-calendar-dates", methods=["GET", "POST", "OPTIONS"])
@router.api_route("/timetable/exams/calendar-dates", methods=["GET", "POST", "OPTIONS"])
async def get_exam_calendar_dates(
    semester: Optional[int] = 1,
    current_user: User = Depends(get_current_user),

    db: AsyncSession = Depends(get_db)
):
    stmt = select(AcademicCalendar).order_by(AcademicCalendar.is_active.desc(), AcademicCalendar.updated_at.desc())
    res = await db.execute(stmt)
    cals = res.scalars().all()
    if not cals:
        return {
            "academic_year": None,
            "semester": None,
            "mid1_start_date": None,
            "mid2_start_date": None,
            "end_sem_exam_start_date": None,
            "by_year": {}
        }

    target_cal = cals[0]
    sem_num = semester or 1

    by_year_dates = {}
    for y in [4, 3, 2, 1]:
        d_m1 = get_calendar_date_for_year(cals, y, "MID_1", "MID", sem_num)
        d_m2 = get_calendar_date_for_year(cals, y, "MID_2", "MID", sem_num)
        d_se = get_calendar_date_for_year(cals, y, "SEM_END", "SEM_END", sem_num)
        by_year_dates[str(y)] = {
            "mid1_start_date": d_m1.isoformat() if d_m1 else None,
            "mid2_start_date": d_m2.isoformat() if d_m2 else None,
            "end_sem_exam_start_date": d_se.isoformat() if d_se else None
        }

    m1_top = get_calendar_date_for_year(cals, 3, "MID_1", "MID", sem_num) or target_cal.mid1_start_date
    m2_top = get_calendar_date_for_year(cals, 3, "MID_2", "MID", sem_num) or target_cal.mid2_start_date
    se_top = get_calendar_date_for_year(cals, 3, "SEM_END", "SEM_END", sem_num) or target_cal.end_sem_exam_start_date

    return {
        "academic_year": target_cal.academic_year,
        "semester": target_cal.semester,
        "mid1_start_date": m1_top.isoformat() if m1_top else None,
        "mid2_start_date": m2_top.isoformat() if m2_top else None,
        "end_sem_exam_start_date": se_top.isoformat() if se_top else None,
        "by_year": by_year_dates
    }


@router.post("/timetable/generate-exams", response_model=List[ExamTimetableEntryResponse])
async def generate_exam_timetable_endpoint(
    req_in: GenerateExamsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role not in [UserRole.HOD, UserRole.ADMIN, "DEAN"]:
        raise HTTPException(status_code=403, detail="Not authorized to generate exam schedules.")

    # 1. Fetch public & academic holidays to skip
    holidays_res = await db.execute(select(AcademicHoliday.date).where(AcademicHoliday.is_holiday == True))
    holiday_dates = set(holidays_res.scalars().all())

    # Fetch all AcademicCalendar records for per-year date resolution
    cal_stmt = select(AcademicCalendar).order_by(AcademicCalendar.is_active.desc(), AcademicCalendar.updated_at.desc())
    cal_res = await db.execute(cal_stmt)
    all_cals = list(cal_res.scalars().all())

    # 2. Determine default start date fallback
    today = datetime.utcnow().date()
    start_date_val = None

    if req_in.start_date:
        start_date_val = req_in.start_date.replace(tzinfo=None).date()
    else:
        candidate_dates = []
        for c in all_cals:
            if req_in.exam_type == "MID_1" and c.mid1_start_date:
                candidate_dates.append(c.mid1_start_date)
            elif req_in.exam_type == "MID_2" and c.mid2_start_date:
                candidate_dates.append(c.mid2_start_date)
            elif (req_in.category.upper() in ["SEM_END", "SEM"] or req_in.exam_type == "SEM_END") and c.end_sem_exam_start_date:
                candidate_dates.append(c.end_sem_exam_start_date)

        if candidate_dates:
            start_date_val = min(candidate_dates)

    if not start_date_val:
        days_ahead = 7 - today.weekday() if today.weekday() < 5 else (7 - today.weekday() + 7)
        start_date_val = today + timedelta(days=days_ahead)

    base_start_datetime = datetime.combine(start_date_val, datetime.min.time())
    base_start_datetime = get_valid_date_on_or_after(base_start_datetime, holiday_dates)

    # 3. Determine target departments and fetch subjects from DB
    user_dept_id = await get_user_department_id(current_user, db)
    if req_in.department_ids and len(req_in.department_ids) > 0 and "ALL" not in req_in.department_ids:
        target_dept_ids = req_in.department_ids
    elif current_user.role == UserRole.HOD and user_dept_id:
        has_subjs = (await db.execute(select(Subject.id).where(Subject.department_id == user_dept_id))).scalars().first()
        if has_subjs:
            target_dept_ids = [user_dept_id]
        else:
            dept_res = await db.execute(select(Department.id))
            target_dept_ids = list(dept_res.scalars().all())
    else:
        dept_res = await db.execute(select(Department.id))
        target_dept_ids = list(dept_res.scalars().all())

    # Query subjects in DB matching target_dept_ids and academic_year filter if passed
    subj_query = select(Subject).where(Subject.department_id.in_(target_dept_ids))
    if req_in.academic_year and req_in.academic_year in [1, 2, 3, 4]:
        subj_query = subj_query.where(Subject.academic_year == req_in.academic_year)
    subjs_res = await db.execute(subj_query)
    available_subjs = list(subjs_res.scalars().all())

    # Fallback: If no subjects found for specified criteria/departments, fetch ALL subjects in the 'subjects' table
    if not available_subjs:
        all_subj_query = select(Subject)
        if req_in.academic_year and req_in.academic_year in [1, 2, 3, 4]:
            all_subj_query = all_subj_query.where(Subject.academic_year == req_in.academic_year)
        all_subjs_res = await db.execute(all_subj_query)
        available_subjs = list(all_subjs_res.scalars().all())
        if available_subjs:
            target_dept_ids = list(set(s.department_id for s in available_subjs if s.department_id))

    if not available_subjs:
        raise HTTPException(status_code=400, detail="No subjects found in database for exam generation.")

    depts = (await db.execute(select(Department).where(Department.id.in_(target_dept_ids)).order_by(Department.code.asc()))).scalars().all()
    subj_ids = [s.id for s in available_subjs]

    # 4. Fetch lecture rooms & faculty profiles
    classrooms = (await db.execute(select(Classroom).order_by(Classroom.room_number.asc()))).scalars().all()
    lecture_rooms = [r for r in classrooms if str(r.room_type).upper() not in ["LAB", "COMPUTER_LAB"]]
    if not lecture_rooms:
        lecture_rooms = classrooms

    if not lecture_rooms:
        raise HTTPException(status_code=400, detail="No available classrooms found for scheduling exams.")

    faculty_list = (await db.execute(select(FacultyProfile).options(selectinload(FacultyProfile.user)).order_by(FacultyProfile.id.asc()))).scalars().all()
    if not faculty_list:
        raise HTTPException(status_code=400, detail="No faculty members found for invigilation assignment.")

    # 5. Purge old exam entries for this exam_type and targeted departments/subjects
    if subj_ids:
        purge_stmt = delete(ExamTimetableEntry).where(
            ExamTimetableEntry.exam_type == req_in.exam_type,
            ExamTimetableEntry.subject_id.in_(subj_ids)
        )
        if req_in.academic_year in [1, 2, 3, 4]:
            purge_stmt = purge_stmt.where(ExamTimetableEntry.academic_year == req_in.academic_year)
        await db.execute(purge_stmt)
        await db.commit()

    room_schedule = set()  # (date, time_slot, room_id)
    invigilator_schedule = set()  # (date, time_slot, invigilator_id)

    # Pre-populate schedule sets with existing exams in DB to avoid cross-type collisions
    existing_exams = (await db.execute(select(ExamTimetableEntry))).scalars().all()
    for ex in existing_exams:
        ex_date = ex.exam_date.date()
        room_schedule.add((ex_date, ex.time_slot, ex.classroom_id))
        if ex.invigilator_id:
            invigilator_schedule.add((ex_date, ex.time_slot, ex.invigilator_id))

    room_idx = 0
    fac_idx = 0
    category = req_in.category.upper()

    if category == "MID":
        # ==========================================
        # MID EXAM RULES (2 Sessions Per Day):
        # 1) Session 1 (Slot 1): Morning (09:30 AM - 11:30 AM)
        # 2) Session 2 (Slot 2): Afternoon (01:00 PM - 03:00 PM)
        # 3) Each Academic Year (4th, 3rd, 2nd, 1st) starts on its EXACT start date from Academic Calendar DB!
        #    (e.g., 4th Year Mid-1 starts Sep 1, 2nd/3rd Year Mid-1 starts Aug 20).
        # ==========================================
        
        theory_by_year: Dict[int, List[Subject]] = {1: [], 2: [], 3: [], 4: []}
        for s in available_subjs:
            if str(s.subject_type).upper() not in ["LAB", "PRACTICAL"]:
                yr = s.academic_year if hasattr(s, "academic_year") and s.academic_year in [1, 2, 3, 4] else 1
                theory_by_year[yr].append(s)

        target_years = [req_in.academic_year] if req_in.academic_year in [1, 2, 3, 4] else [1, 2, 3, 4]
        for yr in target_years:
            subjs_list = theory_by_year[yr]
            if not subjs_list:
                continue

            if req_in.start_date:
                yr_start_date_val = req_in.start_date.replace(tzinfo=None).date()
            else:
                cal_yr_date = get_calendar_date_for_year(all_cals, yr, req_in.exam_type, req_in.category, req_in.semester)
                yr_start_date_val = cal_yr_date if cal_yr_date else start_date_val

            yr_base_start_datetime = datetime.combine(yr_start_date_val, datetime.min.time())
            yr_base_start_datetime = get_valid_date_on_or_after(yr_base_start_datetime, holiday_dates)

            dept_subjs_map: Dict[str, List[Subject]] = {}
            for s in subjs_list:
                dept_subjs_map.setdefault(s.department_id, []).append(s)

            for d_id, d_subjs in dept_subjs_map.items():
                for s_idx, subj in enumerate(d_subjs):
                    day_offset = s_idx // 2
                    time_slot = 1 if (s_idx % 2 == 0) else 2

                    exam_dt = yr_base_start_datetime if day_offset == 0 else get_next_valid_exam_date(yr_base_start_datetime, day_offset, holiday_dates)
                    ex_date_val = exam_dt.date()

                    assigned_room = None
                    for _ in range(len(lecture_rooms)):
                        candidate_room = lecture_rooms[room_idx % len(lecture_rooms)]
                        room_idx += 1
                        if (ex_date_val, time_slot, candidate_room.id) not in room_schedule:
                            assigned_room = candidate_room
                            room_schedule.add((ex_date_val, time_slot, candidate_room.id))
                            break

                    if not assigned_room:
                        assigned_room = lecture_rooms[0]

                    assigned_fac = None
                    for _ in range(len(faculty_list)):
                        candidate_fac = faculty_list[fac_idx % len(faculty_list)]
                        fac_idx += 1
                        if (ex_date_val, time_slot, candidate_fac.id) not in invigilator_schedule:
                            assigned_fac = candidate_fac
                            invigilator_schedule.add((ex_date_val, time_slot, candidate_fac.id))
                            break

                    new_exam = ExamTimetableEntry(
                        exam_type=req_in.exam_type,
                        academic_year=yr,
                        semester=req_in.semester,
                        exam_date=exam_dt,
                        time_slot=time_slot,
                        subject_id=subj.id,
                        classroom_id=assigned_room.id,
                        invigilator_id=assigned_fac.id if assigned_fac else None
                    )
                    db.add(new_exam)

    elif category == "SEM_END":
        # ==========================================
        # SEMESTER END EXAM SEQUENCING RULES:
        # 1) Phase 1: 4th Year Sem Exams complete FIRST.
        # 2) Phase 2: 3rd & 2nd Year Sem Exams start AFTER 4th year completes and run on CONSECUTIVE DAYS.
        # 3) Phase 3: 1st Year Sem Exams start AFTER ALL remaining years (4th, 3rd, 2nd) are completely finished!
        # Skips Sundays AND Academic Holidays automatically.
        # ==========================================

        if req_in.academic_year in [1, 2, 3, 4]:
            target_years = [req_in.academic_year]
            theory_by_year_dept: Dict[int, Dict[str, List[Subject]]] = {req_in.academic_year: {}}
            for s in available_subjs:
                if str(s.subject_type).upper() not in ["LAB", "PRACTICAL"] and s.academic_year == req_in.academic_year:
                    theory_by_year_dept[req_in.academic_year].setdefault(s.department_id, []).append(s)

            max_paper_count = max([len(subjs) for subjs in theory_by_year_dept[req_in.academic_year].values()], default=0)
            current_exam_dt = base_start_datetime

            for p_idx in range(max_paper_count):
                ex_date_val = current_exam_dt.date()
                time_slot = 1
                for d_id, d_subjs in theory_by_year_dept[req_in.academic_year].items():
                    if p_idx < len(d_subjs):
                        subj = d_subjs[p_idx]
                        assigned_room = None
                        for _ in range(len(lecture_rooms)):
                            candidate_room = lecture_rooms[room_idx % len(lecture_rooms)]
                            room_idx += 1
                            if (ex_date_val, time_slot, candidate_room.id) not in room_schedule:
                                assigned_room = candidate_room
                                room_schedule.add((ex_date_val, time_slot, candidate_room.id))
                                break
                        if not assigned_room:
                            assigned_room = lecture_rooms[0]

                        assigned_fac = None
                        for _ in range(len(faculty_list)):
                            candidate_fac = faculty_list[fac_idx % len(faculty_list)]
                            fac_idx += 1
                            if (ex_date_val, time_slot, candidate_fac.id) not in invigilator_schedule:
                                assigned_fac = candidate_fac
                                invigilator_schedule.add((ex_date_val, time_slot, candidate_fac.id))
                                break

                        new_exam = ExamTimetableEntry(
                            exam_type=req_in.exam_type,
                            academic_year=req_in.academic_year,
                            semester=req_in.semester,
                            exam_date=current_exam_dt,
                            time_slot=time_slot,
                            subject_id=subj.id,
                            classroom_id=assigned_room.id,
                            invigilator_id=assigned_fac.id if assigned_fac else None
                        )
                        db.add(new_exam)

                current_exam_dt = get_next_valid_exam_date(current_exam_dt, 1, holiday_dates)
        else:
            # Full 3-Phase Staggered Sequence across all 4 Years
            theory_by_year_dept: Dict[int, Dict[str, List[Subject]]] = {1: {}, 2: {}, 3: {}, 4: {}}
            for s in available_subjs:
                if str(s.subject_type).upper() not in ["LAB", "PRACTICAL"]:
                    yr = s.academic_year if hasattr(s, "academic_year") and s.academic_year in [1, 2, 3, 4] else 1
                    theory_by_year_dept[yr].setdefault(s.department_id, []).append(s)

            if req_in.start_date:
                p1_start_val = req_in.start_date.replace(tzinfo=None).date()
            else:
                cal_y4_date = get_calendar_date_for_year(all_cals, 4, req_in.exam_type, req_in.category, req_in.semester)
                p1_start_val = cal_y4_date if cal_y4_date else start_date_val

            current_exam_dt = get_valid_date_on_or_after(datetime.combine(p1_start_val, datetime.min.time()), holiday_dates)

            # --- PHASE 1: 4th Year Semester End Exams (First) ---
            max_p_y4 = max([len(subjs) for subjs in theory_by_year_dept[4].values()], default=0)
            for p_idx in range(max_p_y4):
                ex_date_val = current_exam_dt.date()
                time_slot = 1
                for d_id, d_subjs in theory_by_year_dept[4].items():
                    if p_idx < len(d_subjs):
                        subj = d_subjs[p_idx]
                        assigned_room = None
                        for _ in range(len(lecture_rooms)):
                            candidate_room = lecture_rooms[room_idx % len(lecture_rooms)]
                            room_idx += 1
                            if (ex_date_val, time_slot, candidate_room.id) not in room_schedule:
                                assigned_room = candidate_room
                                room_schedule.add((ex_date_val, time_slot, candidate_room.id))
                                break
                        if not assigned_room:
                            assigned_room = lecture_rooms[0]

                        assigned_fac = None
                        for _ in range(len(faculty_list)):
                            candidate_fac = faculty_list[fac_idx % len(faculty_list)]
                            fac_idx += 1
                            if (ex_date_val, time_slot, candidate_fac.id) not in invigilator_schedule:
                                assigned_fac = candidate_fac
                                invigilator_schedule.add((ex_date_val, time_slot, candidate_fac.id))
                                break

                        new_exam = ExamTimetableEntry(
                            exam_type=req_in.exam_type,
                            academic_year=4,
                            semester=req_in.semester,
                            exam_date=current_exam_dt,
                            time_slot=time_slot,
                            subject_id=subj.id,
                            classroom_id=assigned_room.id,
                            invigilator_id=assigned_fac.id if assigned_fac else None
                        )
                        db.add(new_exam)
                current_exam_dt = get_next_valid_exam_date(current_exam_dt, 1, holiday_dates)

            # --- PHASE 2: 3rd & 2nd Year Semester End Exams (Consecutive Days) ---
            max_p_y3 = max([len(subjs) for subjs in theory_by_year_dept[3].values()], default=0)
            max_p_y2 = max([len(subjs) for subjs in theory_by_year_dept[2].values()], default=0)
            max_p_phase2 = max(max_p_y3, max_p_y2)

            for p_idx in range(max_p_phase2):
                # Day A of paper cycle: 3rd Year
                if p_idx < max_p_y3:
                    ex_date_val = current_exam_dt.date()
                    time_slot = 1
                    for d_id, d_subjs in theory_by_year_dept[3].items():
                        if p_idx < len(d_subjs):
                            subj = d_subjs[p_idx]
                            assigned_room = None
                            for _ in range(len(lecture_rooms)):
                                candidate_room = lecture_rooms[room_idx % len(lecture_rooms)]
                                room_idx += 1
                                if (ex_date_val, time_slot, candidate_room.id) not in room_schedule:
                                    assigned_room = candidate_room
                                    room_schedule.add((ex_date_val, time_slot, candidate_room.id))
                                    break
                            if not assigned_room:
                                assigned_room = lecture_rooms[0]

                            assigned_fac = None
                            for _ in range(len(faculty_list)):
                                candidate_fac = faculty_list[fac_idx % len(faculty_list)]
                                fac_idx += 1
                                if (ex_date_val, time_slot, candidate_fac.id) not in invigilator_schedule:
                                    assigned_fac = candidate_fac
                                    invigilator_schedule.add((ex_date_val, time_slot, candidate_fac.id))
                                    break

                            new_exam = ExamTimetableEntry(
                                exam_type=req_in.exam_type,
                                academic_year=3,
                                semester=req_in.semester,
                                exam_date=current_exam_dt,
                                time_slot=time_slot,
                                subject_id=subj.id,
                                classroom_id=assigned_room.id,
                                invigilator_id=assigned_fac.id if assigned_fac else None
                            )
                            db.add(new_exam)
                    current_exam_dt = get_next_valid_exam_date(current_exam_dt, 1, holiday_dates)

                # Day B of paper cycle: 2nd Year
                if p_idx < max_p_y2:
                    ex_date_val = current_exam_dt.date()
                    time_slot = 1
                    for d_id, d_subjs in theory_by_year_dept[2].items():
                        if p_idx < len(d_subjs):
                            subj = d_subjs[p_idx]
                            assigned_room = None
                            for _ in range(len(lecture_rooms)):
                                candidate_room = lecture_rooms[room_idx % len(lecture_rooms)]
                                room_idx += 1
                                if (ex_date_val, time_slot, candidate_room.id) not in room_schedule:
                                    assigned_room = candidate_room
                                    room_schedule.add((ex_date_val, time_slot, candidate_room.id))
                                    break
                            if not assigned_room:
                                assigned_room = lecture_rooms[0]

                            assigned_fac = None
                            for _ in range(len(faculty_list)):
                                candidate_fac = faculty_list[fac_idx % len(faculty_list)]
                                fac_idx += 1
                                if (ex_date_val, time_slot, candidate_fac.id) not in invigilator_schedule:
                                    assigned_fac = candidate_fac
                                    invigilator_schedule.add((ex_date_val, time_slot, candidate_fac.id))
                                    break

                            new_exam = ExamTimetableEntry(
                                exam_type=req_in.exam_type,
                                academic_year=2,
                                semester=req_in.semester,
                                exam_date=current_exam_dt,
                                time_slot=time_slot,
                                subject_id=subj.id,
                                classroom_id=assigned_room.id,
                                invigilator_id=assigned_fac.id if assigned_fac else None
                            )
                            db.add(new_exam)
                    current_exam_dt = get_next_valid_exam_date(current_exam_dt, 1, holiday_dates)

            # --- PHASE 3: 1st Year Semester End Exams (After all remaining years finish) ---
            max_p_y1 = max([len(subjs) for subjs in theory_by_year_dept[1].values()], default=0)
            for p_idx in range(max_p_y1):
                ex_date_val = current_exam_dt.date()
                time_slot = 1
                for d_id, d_subjs in theory_by_year_dept[1].items():
                    if p_idx < len(d_subjs):
                        subj = d_subjs[p_idx]
                        assigned_room = None
                        for _ in range(len(lecture_rooms)):
                            candidate_room = lecture_rooms[room_idx % len(lecture_rooms)]
                            room_idx += 1
                            if (ex_date_val, time_slot, candidate_room.id) not in room_schedule:
                                assigned_room = candidate_room
                                room_schedule.add((ex_date_val, time_slot, candidate_room.id))
                                break
                        if not assigned_room:
                            assigned_room = lecture_rooms[0]

                        assigned_fac = None
                        for _ in range(len(faculty_list)):
                            candidate_fac = faculty_list[fac_idx % len(faculty_list)]
                            fac_idx += 1
                            if (ex_date_val, time_slot, candidate_fac.id) not in invigilator_schedule:
                                assigned_fac = candidate_fac
                                invigilator_schedule.add((ex_date_val, time_slot, candidate_fac.id))
                                break

                        new_exam = ExamTimetableEntry(
                            exam_type=req_in.exam_type,
                            academic_year=1,
                            semester=req_in.semester,
                            exam_date=current_exam_dt,
                            time_slot=time_slot,
                            subject_id=subj.id,
                            classroom_id=assigned_room.id,
                            invigilator_id=assigned_fac.id if assigned_fac else None
                        )
                        db.add(new_exam)
                current_exam_dt = get_next_valid_exam_date(current_exam_dt, 1, holiday_dates)

    await db.commit()

    result_stmt = (
        select(ExamTimetableEntry)
        .options(
            selectinload(ExamTimetableEntry.subject).selectinload(Subject.department),
            selectinload(ExamTimetableEntry.classroom),
            selectinload(ExamTimetableEntry.invigilator).selectinload(FacultyProfile.user)
        )
        .where(ExamTimetableEntry.exam_type == req_in.exam_type)
        .order_by(ExamTimetableEntry.exam_date, ExamTimetableEntry.time_slot)
    )
    if subj_ids:
        result_stmt = result_stmt.where(ExamTimetableEntry.subject_id.in_(subj_ids))
    res = await db.execute(result_stmt)
    return res.scalars().all()


@router.post("/timetable/exams", response_model=ExamTimetableEntryResponse)
async def create_exam_entry(
    exam_in: ExamTimetableEntryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role not in [UserRole.HOD, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to edit exam schedules.")

    if exam_in.exam_date.tzinfo:
        exam_in.exam_date = exam_in.exam_date.replace(tzinfo=None)

    room_stmt = (
        select(ExamTimetableEntry)
        .where(
            ExamTimetableEntry.classroom_id == exam_in.classroom_id,
            ExamTimetableEntry.exam_date == exam_in.exam_date,
            ExamTimetableEntry.time_slot == exam_in.time_slot
        )
    )
    room_res = await db.execute(room_stmt)
    if room_res.scalars().first():
        raise HTTPException(
            status_code=400,
            detail="Classroom is already scheduled for another exam on this date and time slot."
        )

    if exam_in.invigilator_id:
        invig_stmt = (
            select(ExamTimetableEntry)
            .where(
                ExamTimetableEntry.invigilator_id == exam_in.invigilator_id,
                ExamTimetableEntry.exam_date == exam_in.exam_date,
                ExamTimetableEntry.time_slot == exam_in.time_slot
            )
        )
        invig_res = await db.execute(invig_stmt)
        if invig_res.scalars().first():
            raise HTTPException(
                status_code=400,
                detail="Invigilator Collision: Faculty member is already assigned to invigilate another exam hall at this slot."
            )

    new_exam = ExamTimetableEntry(
        exam_type=exam_in.exam_type,
        academic_year=exam_in.academic_year,
        semester=exam_in.semester,
        exam_date=exam_in.exam_date,
        time_slot=exam_in.time_slot,
        subject_id=exam_in.subject_id,
        classroom_id=exam_in.classroom_id,
        invigilator_id=exam_in.invigilator_id
    )
    db.add(new_exam)
    await db.commit()

    res_stmt = (
        select(ExamTimetableEntry)
        .options(
            selectinload(ExamTimetableEntry.subject).selectinload(Subject.department),
            selectinload(ExamTimetableEntry.classroom),
            selectinload(ExamTimetableEntry.invigilator).selectinload(FacultyProfile.user)
        )
        .where(ExamTimetableEntry.id == new_exam.id)
    )
    res = await db.execute(res_stmt)
    return res.scalars().first()


@router.delete("/timetable/exams-clear")
async def clear_exam_schedule(
    exam_type: Optional[str] = None,
    department_id: Optional[str] = None,
    purge_all: Optional[bool] = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role not in [UserRole.HOD, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to clear exam schedules.")

    is_purge = bool(purge_all) and str(purge_all).lower() not in ("false", "0", "")

    stmt = delete(ExamTimetableEntry)
    if not is_purge:
        user_dept_id = await get_user_department_id(current_user, db)
        if current_user.role == UserRole.HOD and user_dept_id:
            department_id = user_dept_id
        if exam_type:
            stmt = stmt.where(ExamTimetableEntry.exam_type == exam_type)
        if department_id:
            subj_stmt = select(Subject.id).where(Subject.department_id == department_id)
            subj_ids = list((await db.execute(subj_stmt)).scalars().all())
            if subj_ids:
                stmt = stmt.where(ExamTimetableEntry.subject_id.in_(subj_ids))

    await db.execute(stmt)
    await db.commit()
    return {"message": "Exam schedule cleared successfully."}


@router.delete("/timetable/exams/{id}")
async def delete_exam_entry(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role not in [UserRole.HOD, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to edit exam schedules.")

    stmt = select(ExamTimetableEntry).where(ExamTimetableEntry.id == id)
    res = await db.execute(stmt)
    exam = res.scalars().first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam entry not found.")

    await db.delete(exam)
    await db.commit()
    return {"message": "Exam entry deleted successfully."}
