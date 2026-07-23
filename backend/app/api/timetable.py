import logging
import json
from typing import List, Optional, Dict, Any, Set
from datetime import datetime
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.faculty import Department, Subject, FacultyProfile, FacultyAvailability, SectionConfig, section_mentors, faculty_subjects
from app.models.classroom import Classroom
from app.models.timetable import SchedulingRule, SubjectSchedulingRule, TimetableEntry, ExamTimetableEntry
from app.schemas.timetable import (
    SchedulingRuleCreate, SchedulingRuleResponse,
    SubjectSchedulingRuleCreate, SubjectSchedulingRuleResponse,
    TimetableEntryCreate, TimetableEntryResponse,
    ExamTimetableEntryCreate, ExamTimetableEntryResponse
)
from app.api.deps import get_current_user

logger = logging.getLogger("timetable-api")

router = APIRouter()

DAYS_LIST = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

# ==========================================
# 1. SCHEDULING CONFIGURATION RULES
# ==========================================

@router.get("/timetable/rules", response_model=SchedulingRuleResponse)
async def get_scheduling_rule(
    department_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        stmt = select(SchedulingRule).options(selectinload(SchedulingRule.department)).where(SchedulingRule.department_id == department_id)
        res = await db.execute(stmt)
        rule = res.scalars().first()

        if not rule:
            rule = SchedulingRule(
                department_id=department_id,
                slots_per_day=7,
                days_active="Monday,Tuesday,Wednesday,Thursday,Friday,Saturday",
                allow_classroom_overlap=False,
                allow_faculty_overlap=False,
                lunch_slot=5,
                activity_blocks="Saturday-5,Saturday-6,Saturday-7"
            )
            db.add(rule)
            await db.commit()
            stmt = select(SchedulingRule).options(selectinload(SchedulingRule.department)).where(SchedulingRule.id == rule.id)
            res = await db.execute(stmt)
            rule = res.scalars().first()
        return rule
    except Exception as e:
        import traceback
        print("GET SCHEDULING RULE ERROR:", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Scheduling rule error: {str(e)}")

@router.post("/timetable/rules", response_model=SchedulingRuleResponse)
async def save_scheduling_rule(
    rule_in: SchedulingRuleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role not in [UserRole.HOD, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to configure scheduling rules.")

    stmt = select(SchedulingRule).options(selectinload(SchedulingRule.department)).where(SchedulingRule.department_id == rule_in.department_id)
    res = await db.execute(stmt)
    rule = res.scalars().first()

    if not rule:
        rule = SchedulingRule(department_id=rule_in.department_id)
        db.add(rule)

    rule.slots_per_day = rule_in.slots_per_day
    rule.days_active = rule_in.days_active
    rule.allow_classroom_overlap = rule_in.allow_classroom_overlap
    rule.allow_faculty_overlap = rule_in.allow_faculty_overlap
    rule.lunch_slot = rule_in.lunch_slot
    rule.activity_blocks = rule_in.activity_blocks

    await db.commit()
    stmt = select(SchedulingRule).options(selectinload(SchedulingRule.department)).where(SchedulingRule.id == rule.id)
    res = await db.execute(stmt)
    rule = res.scalars().first()
    return rule

# ==========================================
# 2. SUBJECT SCHEDULING SPECS CRUD
# ==========================================

@router.get("/timetable/subject-rules/{subject_id}", response_model=SubjectSchedulingRuleResponse)
async def get_subject_scheduling_rule(
    subject_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(SubjectSchedulingRule).options(selectinload(SubjectSchedulingRule.subject)).where(SubjectSchedulingRule.subject_id == subject_id)
    res = await db.execute(stmt)
    rule = res.scalars().first()

    if not rule:
        rule = SubjectSchedulingRule(
            subject_id=subject_id,
            lectures_per_week=3,
            labs_per_week=1,
            lab_duration=3
        )
        db.add(rule)
        await db.commit()
        stmt = select(SubjectSchedulingRule).options(selectinload(SubjectSchedulingRule.subject)).where(SubjectSchedulingRule.id == rule.id)
        res = await db.execute(stmt)
        rule = res.scalars().first()
    return rule

@router.post("/timetable/subject-rules", response_model=SubjectSchedulingRuleResponse)
async def save_subject_scheduling_rule(
    rule_in: SubjectSchedulingRuleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role not in [UserRole.HOD, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to configure subject scheduling specs.")

    stmt = select(SubjectSchedulingRule).options(selectinload(SubjectSchedulingRule.subject)).where(SubjectSchedulingRule.subject_id == rule_in.subject_id)
    res = await db.execute(stmt)
    rule = res.scalars().first()

    if not rule:
        rule = SubjectSchedulingRule(subject_id=rule_in.subject_id)
        db.add(rule)

    rule.lectures_per_week = rule_in.lectures_per_week
    rule.labs_per_week = rule_in.labs_per_week
    rule.lab_duration = rule_in.lab_duration

    await db.commit()
    stmt = select(SubjectSchedulingRule).options(selectinload(SubjectSchedulingRule.subject)).where(SubjectSchedulingRule.id == rule.id)
    res = await db.execute(stmt)
    rule = res.scalars().first()
    return rule

# ==========================================
# 3. TIMETABLE CRUD & CONSTRAINTS VALIDATION
# ==========================================

@router.get("/timetable", response_model=List[TimetableEntryResponse])
async def list_timetable(
    department_id: Optional[str] = None,
    section: Optional[str] = None,
    academic_year: Optional[int] = None,
    faculty_id: Optional[str] = None,
    classroom_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(TimetableEntry)
        .options(
            selectinload(TimetableEntry.department),
            selectinload(TimetableEntry.subject),
            selectinload(TimetableEntry.faculty).selectinload(FacultyProfile.user),
            selectinload(TimetableEntry.classroom)
        )
    )
    if department_id:
        stmt = stmt.where(TimetableEntry.department_id == department_id)
    if section:
        stmt = stmt.where(TimetableEntry.section == section)
    if academic_year:
        stmt = stmt.where(TimetableEntry.academic_year == academic_year)
    if faculty_id:
        stmt = stmt.where(TimetableEntry.faculty_id == faculty_id)
    if classroom_id:
        stmt = stmt.where(TimetableEntry.classroom_id == classroom_id)

    stmt = stmt.order_by(TimetableEntry.day_of_week, TimetableEntry.time_slot)
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/timetable", response_model=TimetableEntryResponse)
async def create_timetable_entry(
    entry_in: TimetableEntryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role not in [UserRole.HOD, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to edit timetable.")

    new_entry = TimetableEntry(
        department_id=entry_in.department_id,
        section=entry_in.section,
        academic_year=entry_in.academic_year,
        day_of_week=entry_in.day_of_week,
        time_slot=entry_in.time_slot,
        subject_id=entry_in.subject_id,
        faculty_id=entry_in.faculty_id,
        classroom_id=entry_in.classroom_id,
        lab_batch=entry_in.lab_batch
    )
    db.add(new_entry)
    await db.commit()
    await db.refresh(new_entry)
    return new_entry

@router.delete("/timetable/{id}")
async def delete_timetable_entry(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role not in [UserRole.HOD, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to edit timetable.")

    stmt = select(TimetableEntry).where(TimetableEntry.id == id)
    res = await db.execute(stmt)
    entry = res.scalars().first()
    if not entry:
        raise HTTPException(status_code=404, detail="Timetable entry not found.")

    await db.delete(entry)
    await db.commit()
    return {"message": "Timetable session deleted successfully."}

# ==========================================
# 4. MASTER 22-RULES CONSTRAINT SOLVER ENGINE
# ==========================================

class MasterGenerateInput(BaseModel):
    department_ids: List[str] = Field(default=[], description="Department UUIDs to solve concurrently (empty = all)")
    sections: List[str] = Field(..., description="e.g. ['CSE 1-A', 'CSE 3-A', 'ECE 2-A']")

@router.post("/timetable/generate-master")
async def generate_master_timetable(
    input_data: MasterGenerateInput,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role not in [UserRole.HOD, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not authorized to run timetable auto-generation solvers.")

    # 1. Load target departments
    depts_stmt = select(Department)
    if input_data.department_ids:
        depts_stmt = depts_stmt.where(Department.id.in_(input_data.department_ids))
    depts_res = await db.execute(depts_stmt)
    departments = depts_res.scalars().all()
    if not departments:
        raise HTTPException(status_code=400, detail="No valid target departments found.")

    dept_ids = [d.id for d in departments]

    # 2. Load all subjects for these departments
    subjs_stmt = select(Subject).where(Subject.department_id.in_(dept_ids))
    subjs_res = await db.execute(subjs_stmt)
    subjects = subjs_res.scalars().all()

    # 3. Load subject scheduling rules
    subjs_rules_stmt = select(SubjectSchedulingRule).where(SubjectSchedulingRule.subject_id.in_([s.id for s in subjects]))
    subjs_rules_res = await db.execute(subjs_rules_stmt)
    subjs_rules = {r.subject_id: r for r in subjs_rules_res.scalars().all()}

    for s in subjects:
        if s.id not in subjs_rules:
            l_dur = 3 if s.subject_type == "LAB" else 1
            l_count = 1 if s.subject_type == "LAB" else 0
            subjs_rules[s.id] = SubjectSchedulingRule(
                subject_id=s.id, lectures_per_week=3 if s.subject_type == "THEORY" else 0,
                labs_per_week=l_count, lab_duration=l_dur
            )

    # 4. Load Classrooms
    rooms_stmt = select(Classroom)
    rooms_res = await db.execute(rooms_stmt)
    classrooms = rooms_res.scalars().all()
    if not classrooms:
        raise HTTPException(status_code=400, detail="Please register classrooms & computer labs first.")

    lab_rooms = [r for r in classrooms if str(r.room_type).upper() in ["LAB", "COMPUTER_LAB"]]
    lecture_rooms = [r for r in classrooms if str(r.room_type).upper() not in ["LAB", "COMPUTER_LAB"]]

    if not lab_rooms:
        lab_rooms = classrooms
    if not lecture_rooms:
        lecture_rooms = classrooms

    # 5. Load ALL Faculty Profiles for Rule 19 Cross-Branch protection
    fac_stmt = (
        select(FacultyProfile)
        .options(selectinload(FacultyProfile.subjects), selectinload(FacultyProfile.user))
    )
    fac_res = await db.execute(fac_stmt)
    faculty_profiles = fac_res.scalars().all()

    fac_ids = [f.id for f in faculty_profiles]
    avail_stmt = select(FacultyAvailability).where(FacultyAvailability.faculty_id.in_(fac_ids))
    avail_res = await db.execute(avail_stmt)
    
    unavailable_faculty = set()
    for a in avail_res.scalars().all():
        if not a.is_available:
            unavailable_faculty.add((a.faculty_id, a.day_of_week, a.time_slot))

    # Map qualified faculty per subject
    subject_teachers: Dict[str, List[FacultyProfile]] = {}
    for s in subjects:
        subject_teachers[s.id] = []
        for prof in faculty_profiles:
            if any(sub.id == s.id for sub in prof.subjects):
                subject_teachers[s.id].append(prof)
        if not subject_teachers[s.id]:
            subject_teachers[s.id] = [p for p in faculty_profiles if p.department_id == s.department_id]

    # Calculate lab count per professor (Rule 6)
    prof_lab_subjects_count = {}
    for prof in faculty_profiles:
        lab_subs = [s for s in prof.subjects if s.subject_type == "LAB"]
        prof_lab_subjects_count[prof.id] = len(lab_subs)

    # Load SectionConfigs & Mentors for Rule 18
    sec_cfg_stmt = (
        select(SectionConfig)
        .options(selectinload(SectionConfig.counseling_mentors), selectinload(SectionConfig.class_teacher))
    )
    sec_cfg_res = await db.execute(sec_cfg_stmt)
    section_configs = {c.name: c for c in sec_cfg_res.scalars().all()}

    # 6. Parse sections and determine their Academic Year (Rule 0)
    section_year_map: Dict[str, int] = {}
    section_dept_map: Dict[str, str] = {}

    for sec in input_data.sections:
        yr = 1
        for char in sec:
            if char.isdigit():
                parsed_yr = int(char)
                if 1 <= parsed_yr <= 4:
                    yr = parsed_yr
                    break
        section_year_map[sec] = yr

        matched_dept_id = dept_ids[0]
        for d in departments:
            if d.code.upper() in sec.upper():
                matched_dept_id = d.id
                break
        section_dept_map[sec] = matched_dept_id

    # Clear existing entries
    clear_stmt = select(TimetableEntry).where(TimetableEntry.section.in_(input_data.sections))
    clear_res = await db.execute(clear_stmt)
    for entry in clear_res.scalars().all():
        await db.delete(entry)
    await db.commit()

    # 7. Build Sessions to Schedule
    tasks = []

    for sec in input_data.sections:
        sec_yr = section_year_map[sec]
        sec_dept_id = section_dept_map[sec]

        sec_subjs = [s for s in subjects if s.department_id == sec_dept_id and s.academic_year == sec_yr]
        if not sec_subjs:
            sec_subjs = [s for s in subjects if s.department_id == sec_dept_id]

        for s in sec_subjs:
            spec = subjs_rules[s.id]

            if s.subject_type == "ELECTIVE":
                for _ in range(spec.lectures_per_week):
                    tasks.append({
                        "section": sec, "subject_id": s.id, "type": "ELECTIVE",
                        "duration": 1, "year": sec_yr, "dept_id": sec_dept_id
                    })
            elif s.subject_type == "LAB":
                if s.is_parallel_lab and s.parallel_subject_id:
                    tasks.append({
                        "section": sec, "subject_id": s.id, "parallel_id": s.parallel_subject_id,
                        "type": "DUAL_LAB", "session_num": 1, "duration": spec.lab_duration,
                        "year": sec_yr, "dept_id": sec_dept_id
                    })
                    tasks.append({
                        "section": sec, "subject_id": s.id, "parallel_id": s.parallel_subject_id,
                        "type": "DUAL_LAB", "session_num": 2, "duration": spec.lab_duration,
                        "year": sec_yr, "dept_id": sec_dept_id
                    })
                else:
                    for _ in range(spec.labs_per_week):
                        tasks.append({
                            "section": sec, "subject_id": s.id, "type": "LAB",
                            "duration": spec.lab_duration, "year": sec_yr, "dept_id": sec_dept_id
                        })
            elif s.subject_type == "COUNSELLING":
                tasks.append({
                    "section": sec, "subject_id": s.id, "type": "COUNSELLING",
                    "duration": 1, "year": sec_yr, "dept_id": sec_dept_id
                })
            elif s.subject_type == "SPORTS_LIBRARY":
                tasks.append({
                    "section": sec, "subject_id": s.id, "type": "SPORTS_LIBRARY",
                    "duration": 1, "year": sec_yr, "dept_id": sec_dept_id
                })
            else:
                for _ in range(spec.lectures_per_week):
                    tasks.append({
                        "section": sec, "subject_id": s.id, "type": "THEORY",
                        "duration": 1, "year": sec_yr, "dept_id": sec_dept_id
                    })

    type_priority = {"ELECTIVE": 0, "DUAL_LAB": 1, "LAB": 2, "COUNSELLING": 3, "SPORTS_LIBRARY": 4, "THEORY": 5}
    tasks.sort(key=lambda t: (type_priority.get(t["type"], 9), t["section"]))

    # 8. Tracker states
    schedule_state: List[TimetableEntry] = []
    
    # Rule 19: Global busy state across ALL departments
    busy_teachers: Set[tuple] = set() # (day, slot, teacher_id)
    busy_rooms: Set[tuple] = set() # (day, slot, room_id)
    busy_sections: Set[tuple] = set() # (day, slot, section)

    # Track department assigned for teacher per slot for Rule 20
    teacher_slot_dept: Dict[tuple, str] = {} # (teacher_id, day, slot) -> dept_id

    # Trackers
    teacher_daily_periods: Dict[tuple, int] = {}
    teacher_daily_has_lab: Dict[tuple, bool] = {}
    teacher_p1_count: Dict[str, int] = {}
    teacher_weekly_labs: Dict[str, int] = {}
    elective_sync_slots: Dict[tuple, tuple] = {}
    dual_lab_first_session: Dict[tuple, tuple] = {}

    for p in faculty_profiles:
        teacher_p1_count[p.id] = 0
        teacher_weekly_labs[p.id] = 0

    def backtrack(task_idx: int) -> bool:
        if task_idx == len(tasks):
            return True

        task = tasks[task_idx]
        duration = task["duration"]
        sec = task["section"]
        year = task["year"]
        dept_id = task["dept_id"]
        subj_id = task["subject_id"]
        task_type = task["type"]

        lunch_slot = 4 if year == 1 else 5
        weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

        for day in weekdays:
            max_day_slots = 4 if day == "Saturday" else 7

            if day == "Saturday" and task_type in ["LAB", "DUAL_LAB"]:
                continue

            for start_slot in range(1, max_day_slots - duration + 2):
                end_slot = start_slot + duration - 1

                if start_slot <= lunch_slot <= end_slot:
                    continue

                is_morning = end_slot < lunch_slot
                is_afternoon = start_slot > lunch_slot

                if task_type in ["LAB", "DUAL_LAB"] and duration == 3:
                    if year == 1:
                        # 1st Year: Lunch is slot 4. Morning lab is slots 1-3. Afternoon lab is slots 5-7.
                        if is_morning and (start_slot != 1 or end_slot != 3):
                            continue
                        if is_afternoon and (start_slot != 5 or end_slot != 7):
                            continue
                    else:
                        # 2nd, 3rd, 4th Year: Lunch is slot 5. Morning lab is slots 1-3 or 2-4. Afternoon lab is slots 5-7 or 6-8.
                        if is_morning and (start_slot not in [1, 2]):
                            continue
                        if is_afternoon and (start_slot not in [5, 6]):
                            continue

                if task_type == "COUNSELLING" and start_slot != 7:
                    continue
                elif task_type == "SPORTS_LIBRARY":
                    pre_lunch_slot = 3 if year == 1 else 4
                    if start_slot not in [7, pre_lunch_slot]:
                        continue

                if task_type == "DUAL_LAB" and task["session_num"] == 2:
                    first_info = dual_lab_first_session.get((sec, subj_id))
                    if first_info:
                        first_day, first_is_morning = first_info
                        if day == first_day or is_morning == first_is_morning:
                            continue

                if task_type == "ELECTIVE":
                    sync_key = (dept_id, year, subj_id, task_idx % 3)
                    if sync_key in elective_sync_slots:
                        synced_day, synced_slot = elective_sync_slots[sync_key]
                        if day != synced_day or start_slot != synced_slot:
                            continue

                sec_busy = False
                for slot in range(start_slot, end_slot + 1):
                    if (day, slot, sec) in busy_sections:
                        sec_busy = True
                        break
                if sec_busy:
                    continue

                # Rule 18: Multiple Counseling Mentors Lock
                sec_mentors = []
                if sec in section_configs:
                    sec_mentors = section_configs[sec].counseling_mentors

                if task_type == "COUNSELLING" and sec_mentors:
                    # Check if ALL mentors for this section are free at (day, 7)
                    mentors_free = True
                    for m in sec_mentors:
                        if (day, 7, m.id) in busy_teachers or (m.id, day, 7) in unavailable_faculty:
                            mentors_free = False
                            break
                    if not mentors_free:
                        continue

                teachers = subject_teachers.get(subj_id, [])
                if task_type == "COUNSELLING" and sec_mentors:
                    teachers = [sec_mentors[0]]

                for teacher in teachers:
                    # Rule 1: HOD Period 1/7 Exclusion
                    if teacher.is_hod or teacher.designation.upper() == "HOD":
                        if start_slot == 1 or end_slot == 7 or (start_slot <= 1 <= end_slot) or (start_slot <= 7 <= end_slot):
                            continue

                    # Rule 2: HOD Wednesday Afternoon Exemption
                    if (teacher.is_hod or teacher.designation.upper() == "HOD") and day == "Wednesday" and is_afternoon:
                        continue

                    # Rule 21: Academic Dean Wednesday Afternoon Exemption
                    if (teacher.is_dean or "DEAN" in teacher.designation.upper()) and day == "Wednesday" and is_afternoon:
                        continue

                    # Rule 13: Period 1 Weekly Cap
                    if start_slot == 1 and teacher_p1_count[teacher.id] >= 2:
                        continue

                    # Rule 6: Weekly Lab Limit
                    if task_type in ["LAB", "DUAL_LAB"]:
                        lab_subj_count = prof_lab_subjects_count.get(teacher.id, 1)
                        max_labs_allowed = 2 if lab_subj_count >= 2 else 3
                        if teacher_weekly_labs[teacher.id] >= max_labs_allowed:
                            continue

                    # Rule 10 & 11: Daily 4-Period Cap
                    curr_daily = teacher_daily_periods.get((teacher.id, day), 0)
                    added_periods = 0 if task_type == "COUNSELLING" else duration
                    if curr_daily + added_periods > 4:
                        continue

                    # Rule 20: Cross-Branch Transition Gap Shield (1-Period Buffer)
                    prev_dept = teacher_slot_dept.get((teacher.id, day, start_slot - 1))
                    next_dept = teacher_slot_dept.get((teacher.id, day, end_slot + 1))
                    if prev_dept and prev_dept != dept_id:
                        continue
                    if next_dept and next_dept != dept_id:
                        continue

                    # Rule 19: Global Teacher Availability & Double-Booking
                    teacher_free = True
                    for slot in range(start_slot, end_slot + 1):
                        if (teacher.id, day, slot) in unavailable_faculty:
                            teacher_free = False
                            break
                        if (day, slot, teacher.id) in busy_teachers:
                            teacher_free = False
                            break
                    if not teacher_free:
                        continue

                    target_rooms = lab_rooms if task_type in ["LAB", "DUAL_LAB"] else lecture_rooms
                    for room in target_rooms:
                        room_free = True
                        for slot in range(start_slot, end_slot + 1):
                            if (day, slot, room.id) in busy_rooms:
                                room_free = False
                                break
                        if not room_free:
                            continue

                        # ---- ASSIGN SESSION ----
                        temp_entries = []
                        lab_batch_val = "ALL"
                        if task_type == "DUAL_LAB":
                            lab_batch_val = "BATCH_A" if task["session_num"] == 1 else "BATCH_B"

                        for slot in range(start_slot, end_slot + 1):
                            temp_entries.append(TimetableEntry(
                                department_id=dept_id,
                                section=sec,
                                academic_year=year,
                                day_of_week=day,
                                time_slot=slot,
                                subject_id=subj_id,
                                faculty_id=teacher.id,
                                classroom_id=room.id,
                                lab_batch=lab_batch_val
                            ))
                            busy_sections.add((day, slot, sec))
                            busy_teachers.add((day, slot, teacher.id))
                            busy_rooms.add((day, slot, room.id))
                            teacher_slot_dept[(teacher.id, day, slot)] = dept_id

                        # Rule 18: Lock ALL assigned counseling mentors for Section
                        locked_mentors = []
                        if task_type == "COUNSELLING" and sec_mentors:
                            for m in sec_mentors:
                                if m.id != teacher.id:
                                    busy_teachers.add((day, 7, m.id))
                                    locked_mentors.append(m.id)

                        if task_type != "COUNSELLING":
                            teacher_daily_periods[(teacher.id, day)] = curr_daily + duration
                        if task_type in ["LAB", "DUAL_LAB"]:
                            teacher_daily_has_lab[(teacher.id, day)] = True
                            teacher_weekly_labs[teacher.id] += 1
                        if start_slot == 1:
                            teacher_p1_count[teacher.id] += 1
                        if task_type == "ELECTIVE":
                            sync_key = (dept_id, year, subj_id, task_idx % 3)
                            elective_sync_slots[sync_key] = (day, start_slot)
                        if task_type == "DUAL_LAB" and task["session_num"] == 1:
                            dual_lab_first_session[(sec, subj_id)] = (day, is_morning)

                        if backtrack(task_idx + 1):
                            schedule_state.extend(temp_entries)
                            return True

                        # ---- BACKTRACK ----
                        if task_type != "COUNSELLING":
                            teacher_daily_periods[(teacher.id, day)] = curr_daily
                        if task_type in ["LAB", "DUAL_LAB"]:
                            teacher_daily_has_lab[(teacher.id, day)] = False
                            teacher_weekly_labs[teacher.id] -= 1
                        if start_slot == 1:
                            teacher_p1_count[teacher.id] -= 1
                        if task_type == "DUAL_LAB" and task["session_num"] == 1:
                            dual_lab_first_session.pop((sec, subj_id), None)

                        for m_id in locked_mentors:
                            busy_teachers.remove((day, 7, m_id))

                        for slot in range(start_slot, end_slot + 1):
                            busy_sections.remove((day, slot, sec))
                            busy_teachers.remove((day, slot, teacher.id))
                            busy_rooms.remove((day, slot, room.id))
                            teacher_slot_dept.pop((teacher.id, day, slot), None)

        return False

    success = backtrack(0)

    if not success:
        raise HTTPException(
            status_code=400,
            detail="AI Master Engine Failed: Could not allocate a collision-free timetable satisfying all 22 B.Tech rules (Counseling mentor locks, cross-branch transition buffers, and Dean meeting exemptions)."
        )

    for entry in schedule_state:
        db.add(entry)
    await db.commit()

    stmt = (
        select(TimetableEntry)
        .options(
            selectinload(TimetableEntry.department),
            selectinload(TimetableEntry.subject),
            selectinload(TimetableEntry.faculty).selectinload(FacultyProfile.user),
            selectinload(TimetableEntry.classroom)
        )
        .where(TimetableEntry.section.in_(input_data.sections))
        .order_by(TimetableEntry.day_of_week, TimetableEntry.time_slot)
    )
    res = await db.execute(stmt)
    return res.scalars().all()

# ==========================================
# 5. EXAM TIMETABLE & INVIGILATOR SHIELDS
# ==========================================

@router.get("/timetable/exams", response_model=List[ExamTimetableEntryResponse])
async def list_exam_schedule(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ExamTimetableEntry).order_by(ExamTimetableEntry.exam_date, ExamTimetableEntry.time_slot)
    res = await db.execute(stmt)
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
        exam_date=exam_in.exam_date,
        time_slot=exam_in.time_slot,
        subject_id=exam_in.subject_id,
        classroom_id=exam_in.classroom_id,
        invigilator_id=exam_in.invigilator_id
    )
    db.add(new_exam)
    await db.commit()
    await db.refresh(new_exam)
    return new_exam

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
