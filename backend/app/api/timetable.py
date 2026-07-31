import logging
import json
import csv
import io
from typing import List, Optional, Dict, Any, Set
from datetime import datetime
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.faculty import Department, Subject, FacultyProfile, FacultyAvailability, SectionConfig, section_mentors, faculty_subjects, section_subject_teachers
from app.models.classroom import Classroom
from app.models.timetable import SchedulingRule, SubjectSchedulingRule, TimetableEntry
from app.schemas.timetable import (
    SchedulingRuleCreate, SchedulingRuleResponse,
    SubjectSchedulingRuleCreate, SubjectSchedulingRuleResponse,
    TimetableEntryCreate, TimetableEntryResponse
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
    is_permanent: bool = False,
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
    
    stmt = stmt.where(TimetableEntry.is_permanent == is_permanent)

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

    # Section Clash Check
    sec_stmt = select(TimetableEntry).where(
        TimetableEntry.section == entry_in.section,
        TimetableEntry.day_of_week == entry_in.day_of_week,
        TimetableEntry.time_slot == entry_in.time_slot
    )
    sec_res = await db.execute(sec_stmt)
    if sec_res.scalars().first():
        raise HTTPException(status_code=400, detail="Section Clash: This section already has a class scheduled at this day and time slot.")

    # Faculty Clash Check
    if entry_in.faculty_id:
        fac_stmt = select(TimetableEntry).where(
            TimetableEntry.faculty_id == entry_in.faculty_id,
            TimetableEntry.day_of_week == entry_in.day_of_week,
            TimetableEntry.time_slot == entry_in.time_slot
        )
        fac_res = await db.execute(fac_stmt)
        if fac_res.scalars().first():
            raise HTTPException(status_code=400, detail="Faculty Clash: Faculty is already assigned to another class at this time slot.")

    # Classroom Clash Check
    if entry_in.classroom_id:
        room_stmt = select(TimetableEntry).where(
            TimetableEntry.classroom_id == entry_in.classroom_id,
            TimetableEntry.day_of_week == entry_in.day_of_week,
            TimetableEntry.time_slot == entry_in.time_slot
        )
        room_res = await db.execute(room_stmt)
        if room_res.scalars().first():
            raise HTTPException(status_code=400, detail="Classroom Clash: Classroom is already occupied at this time slot.")

    new_entry = TimetableEntry(
        department_id=entry_in.department_id,
        section=entry_in.section,
        academic_year=entry_in.academic_year,
        day_of_week=entry_in.day_of_week,
        time_slot=entry_in.time_slot,
        subject_id=entry_in.subject_id,
        faculty_id=entry_in.faculty_id,
        classroom_id=entry_in.classroom_id,
        lab_batch=entry_in.lab_batch,
        is_permanent=entry_in.is_permanent
    )
    db.add(new_entry)
    await db.commit()
    
    # Reload relation fields for response validation
    stmt = select(TimetableEntry).where(TimetableEntry.id == new_entry.id).options(
        selectinload(TimetableEntry.department),
        selectinload(TimetableEntry.subject),
        selectinload(TimetableEntry.faculty).selectinload(FacultyProfile.user),
        selectinload(TimetableEntry.classroom)
    )
    res = await db.execute(stmt)
    refreshed = res.scalars().first()
    return refreshed

@router.delete("/timetable/entry/{id}")
@router.delete("/timetable/{id:uuid}")
@router.delete("/timetable/{id}")
async def delete_timetable_entry(
    id: str,
    exam_type: Optional[str] = None,
    department_id: Optional[str] = None,
    purge_all: Optional[bool] = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if id == "exams-clear":
        from app.api.exam_timetable import clear_exam_schedule
        return await clear_exam_schedule(
            exam_type=exam_type,
            department_id=department_id,
            purge_all=purge_all,
            current_user=current_user,
            db=db
        )

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
        rule = subjs_rules.get(s.id)
        if not rule or (s.subject_type == "THEORY" and (rule.lectures_per_week or 0) == 0):
            l_dur = 3 if s.subject_type == "LAB" else 1
            l_count = 1 if s.subject_type == "LAB" else 0
            lec_count = 4 if s.subject_type in ["THEORY", "ELECTIVE"] else (1 if s.subject_type in ["SPORTS_LIBRARY", "COUNSELLING"] else 0)
            subjs_rules[s.id] = SubjectSchedulingRule(
                subject_id=s.id,
                lectures_per_week=lec_count,
                labs_per_week=l_count,
                lab_duration=l_dur
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

    # Load Scheduling Rules for slots_per_day
    rules_stmt = select(SchedulingRule).where(SchedulingRule.department_id.in_(dept_ids))
    rules_res = await db.execute(rules_stmt)
    rules_map = {r.department_id: r for r in rules_res.scalars().all()}

    # Load all section-subject-teacher assignments from database
    sst_stmt = select(
        SectionConfig.name.label("section_name"),
        Subject.id.label("subject_id"),
        FacultyProfile.id.label("faculty_id")
    ).select_from(section_subject_teachers)\
     .join(SectionConfig, section_subject_teachers.c.section_id == SectionConfig.id)\
     .join(Subject, section_subject_teachers.c.subject_id == Subject.id)\
     .join(FacultyProfile, section_subject_teachers.c.faculty_id == FacultyProfile.id)
     
    sst_res = await db.execute(sst_stmt)
    assigned_section_subject_teachers = {}
    for row in sst_res.fetchall():
        key = (row.section_name, row.subject_id)
        if key not in assigned_section_subject_teachers:
            assigned_section_subject_teachers[key] = []
        assigned_section_subject_teachers[key].append(row.faculty_id)

    # 5. Load ALL Faculty Profiles for Rule 19 Cross-Branch protection
    fac_stmt = (
        select(FacultyProfile)
        .options(selectinload(FacultyProfile.subjects), selectinload(FacultyProfile.user))
    )
    fac_res = await db.execute(fac_stmt)
    faculty_profiles = fac_res.scalars().all()

    fac_ids = [f.id for f in faculty_profiles]
    unavailable_faculty = set()
    if fac_ids:
        avail_stmt = select(FacultyAvailability).where(FacultyAvailability.faculty_id.in_(fac_ids))
        avail_res = await db.execute(avail_stmt)
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

        if sec in section_configs:
            matched_dept_id = section_configs[sec].department_id
        else:
            matched_dept_id = dept_ids[0]
            for d in departments:
                if d.code.upper() in sec.upper() or (sec.startswith("CS ") and d.code == "IT"):
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
    faculty_map = {p.id: p for p in faculty_profiles}

    for sec in input_data.sections:
        sec_yr = section_year_map[sec]
        sec_dept_id = section_dept_map[sec]

        sec_subjs = [s for s in subjects if s.department_id == sec_dept_id and s.academic_year == sec_yr]
        if not sec_subjs:
            sec_subjs = [s for s in subjects if s.department_id == sec_dept_id]

        for s in sec_subjs:
            spec = subjs_rules[s.id]

            # Determine assigned teachers for this specific section and subject
            assigned_ids = assigned_section_subject_teachers.get((sec, s.id), [])
            task_teachers = [faculty_map[fid] for fid in assigned_ids if fid in faculty_map]
            if not task_teachers:
                task_teachers = subject_teachers.get(s.id, [])
            if not task_teachers:
                task_teachers = [p for p in faculty_profiles if p.department_id == sec_dept_id]

            if s.subject_type == "ELECTIVE":
                periods_count = max(4, spec.lectures_per_week)
                for _ in range(periods_count):
                    tasks.append({
                        "section": sec, "subject_id": s.id, "type": "ELECTIVE",
                        "duration": 1, "year": sec_yr, "dept_id": sec_dept_id,
                        "teachers": task_teachers
                    })
            elif s.subject_type == "LAB":
                if s.is_parallel_lab and s.parallel_subject_id:
                    tasks.append({
                        "section": sec, "subject_id": s.id, "parallel_id": s.parallel_subject_id,
                        "type": "DUAL_LAB", "session_num": 1, "duration": spec.lab_duration,
                        "year": sec_yr, "dept_id": sec_dept_id, "teachers": task_teachers
                    })
                    tasks.append({
                        "section": sec, "subject_id": s.id, "parallel_id": s.parallel_subject_id,
                        "type": "DUAL_LAB", "session_num": 2, "duration": spec.lab_duration,
                        "year": sec_yr, "dept_id": sec_dept_id, "teachers": task_teachers
                    })
                else:
                    for _ in range(spec.labs_per_week):
                        tasks.append({
                            "section": sec, "subject_id": s.id, "type": "LAB",
                            "duration": spec.lab_duration, "year": sec_yr, "dept_id": sec_dept_id,
                            "teachers": task_teachers
                        })
            elif s.subject_type == "COUNSELLING":
                for _ in range(max(1, spec.lectures_per_week)):
                    tasks.append({
                        "section": sec, "subject_id": s.id, "type": "COUNSELLING",
                        "duration": 1, "year": sec_yr, "dept_id": sec_dept_id,
                        "teachers": task_teachers
                    })
            elif s.subject_type == "SPORTS_LIBRARY":
                for _ in range(max(1, spec.lectures_per_week)):
                    tasks.append({
                        "section": sec, "subject_id": s.id, "type": "SPORTS_LIBRARY",
                        "duration": 1, "year": sec_yr, "dept_id": sec_dept_id,
                        "teachers": task_teachers
                    })
            else:
                periods_count = max(4, spec.lectures_per_week)
                for _ in range(periods_count):
                    tasks.append({
                        "section": sec, "subject_id": s.id, "type": "THEORY",
                        "duration": 1, "year": sec_yr, "dept_id": sec_dept_id,
                        "teachers": task_teachers
                    })
                if (spec.labs_per_week or 0) > 0:
                    for _ in range(spec.labs_per_week):
                        tasks.append({
                            "section": sec, "subject_id": s.id, "type": "LAB",
                            "duration": spec.lab_duration or 3, "year": sec_yr, "dept_id": sec_dept_id
                        })

    type_priority = {"ELECTIVE": 0, "DUAL_LAB": 1, "LAB": 2, "COUNSELLING": 3, "SPORTS_LIBRARY": 4, "THEORY": 5}
    tasks.sort(key=lambda t: (type_priority.get(t["type"], 9), t["section"]))

    # 8. Tracker states
    schedule_state: List[TimetableEntry] = []
    
    # Rule 19: Global busy state across ALL departments
    busy_teachers: Set[tuple] = set() # (day, slot, teacher_id_str)
    busy_rooms: Set[tuple] = set() # (day, slot, room_id_str)
    busy_sections: Set[tuple] = set() # (day, slot, section_str)

    # Pre-populate global busy state from ALL existing database timetable entries
    existing_tt_res = await db.execute(select(TimetableEntry))
    for e in existing_tt_res.scalars().all():
        if e.section not in input_data.sections:
            if e.faculty_id:
                busy_teachers.add((e.day_of_week, e.time_slot, str(e.faculty_id)))
            if e.classroom_id:
                busy_rooms.add((e.day_of_week, e.time_slot, str(e.classroom_id)))
            busy_sections.add((e.day_of_week, e.time_slot, str(e.section)))

    # Track department assigned for teacher per slot for Rule 20
    teacher_slot_dept: Dict[tuple, str] = {} # (teacher_id_str, day, slot) -> dept_id

    # Trackers
    teacher_daily_periods: Dict[tuple, int] = {}
    teacher_daily_has_lab: Dict[tuple, bool] = {}
    teacher_p1_count: Dict[str, int] = {}
    teacher_weekly_labs: Dict[str, int] = {}
    elective_sync_slots: Dict[tuple, tuple] = {}
    dual_lab_first_session: Dict[tuple, tuple] = {}
    section_daily_subjects: Set[tuple] = set() # (sec, day, subj_id)
    section_daily_has_lab: Dict[tuple, bool] = {} # (sec, day) -> bool
    section_slot_subject: Dict[tuple, str] = {} # (day, slot, sec) -> subj_id

    for p in faculty_profiles:
        teacher_p1_count[p.id] = 0
        teacher_weekly_labs[p.id] = 0

    step_count = [0]

    def backtrack(task_idx: int) -> bool:
        if step_count[0] > 2000:
            return False
        step_count[0] += 1

        if task_idx == len(tasks):
            return True

        task = tasks[task_idx]
        duration = task["duration"]
        sec = task["section"]
        year = task["year"]
        dept_id = task["dept_id"]
        subj_id = task["subject_id"]
        task_type = task["type"]

        lunch_slot = rules_map[dept_id].lunch_slot if (dept_id in rules_map and rules_map[dept_id].lunch_slot) else (4 if year == 1 else 5)
        weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

        for day in weekdays:
            dept_slots = rules_map[dept_id].slots_per_day if (dept_id in rules_map) else 8
            max_day_slots = 4 if day == "Saturday" else dept_slots

            if day == "Saturday" and task_type in ["LAB", "DUAL_LAB"]:
                continue

            for start_slot in range(1, max_day_slots - duration + 2):
                end_slot = start_slot + duration - 1

                crosses_lunch = start_slot <= lunch_slot <= end_slot
                if crosses_lunch:
                    continue

                is_morning = end_slot < lunch_slot
                is_afternoon = start_slot > lunch_slot

                if task_type in ["LAB", "DUAL_LAB"] and duration == 3:
                    if lunch_slot == 4:
                        # Lunch is slot 4. Morning lab is strictly slots 1-3. Afternoon lab is strictly slots 5-7.
                        if is_morning and (start_slot != 1 or end_slot != 3):
                            continue
                        if is_afternoon and (start_slot != 5 or end_slot != 7):
                            continue
                    else:
                        # Lunch is slot 5. Morning lab is strictly slots 2-4. Afternoon lab is strictly slots 5-7.
                        if is_morning and start_slot != 2:
                            continue
                        if is_afternoon and start_slot != 5:
                            continue

                if task_type == "COUNSELLING" and start_slot != 7:
                    continue
                elif task_type == "SPORTS_LIBRARY":
                    pre_lunch_slot = 3 if year == 1 else 4
                    if start_slot not in [7, pre_lunch_slot]:
                        continue

                # Enforce at most 1 lab session (LAB or DUAL_LAB) per section per day
                if task_type in ["LAB", "DUAL_LAB"]:
                    if section_daily_has_lab.get((sec, day), False):
                        continue

                # Avoid scheduling the same subject at the same slot on consecutive days
                prev_day = "Friday" if day == "Saturday" else ("Thursday" if day == "Friday" else ("Wednesday" if day == "Thursday" else ("Tuesday" if day == "Wednesday" else ("Monday" if day == "Tuesday" else None))))
                if prev_day:
                    same_slot_prev = False
                    for slot in range(start_slot, end_slot + 1):
                        if section_slot_subject.get((prev_day, slot, sec)) == subj_id:
                            same_slot_prev = True
                            break
                    if same_slot_prev:
                        continue

                # Enforce at most 1 theory/elective period of the same subject per section per day
                if task_type in ["THEORY", "ELECTIVE"]:
                    if (sec, day, subj_id) in section_daily_subjects:
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

                teachers = task.get("teachers", [])[:3]
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

                    # Rule 10: Max 1 lab per day for a teacher
                    has_lab_already = teacher_daily_has_lab.get((teacher.id, day), False)
                    if has_lab_already and task_type in ["LAB", "DUAL_LAB"]:
                        continue

                    # Rules 5 & 12: Consecutive periods and morning lab restrictions
                    occupied_slots = set()
                    for slot in range(1, 8):
                        if (day, slot, teacher.id) in busy_teachers or (day, slot, str(teacher.id)) in busy_teachers:
                            occupied_slots.add(slot)
                    
                    candidate_slots = set(range(start_slot, end_slot + 1))
                    all_slots = occupied_slots.union(candidate_slots)
                    
                    consecutive_groups = []
                    current_group = []
                    for slot in sorted(all_slots):
                        if not current_group or slot == current_group[-1] + 1:
                            current_group.append(slot)
                        else:
                            consecutive_groups.append(current_group)
                            current_group = [slot]
                    if current_group:
                        consecutive_groups.append(current_group)
                        
                    violates_consecutive = False
                    for group in consecutive_groups:
                        group_len = len(group)
                        if group_len > 2:
                            has_lab_today = (task_type in ["LAB", "DUAL_LAB"]) or has_lab_already
                            if group_len == 3:
                                if not has_lab_today:
                                    violates_consecutive = True
                                    break
                            elif group_len == 4:
                                is_morning_group = all(slot < lunch_slot for slot in group)
                                if not (has_lab_today and is_morning_group):
                                    violates_consecutive = True
                                    break
                            else:
                                violates_consecutive = True
                                break
                    if violates_consecutive:
                        continue

                    # Rule 20: Cross-Branch Transition Gap Shield (1-Period Buffer)
                    prev_dept = teacher_slot_dept.get((str(teacher.id), day, start_slot - 1)) or teacher_slot_dept.get((teacher.id, day, start_slot - 1))
                    next_dept = teacher_slot_dept.get((str(teacher.id), day, end_slot + 1)) or teacher_slot_dept.get((teacher.id, day, end_slot + 1))
                    if prev_dept and prev_dept != dept_id:
                        continue
                    if next_dept and next_dept != dept_id:
                        continue

                    # Rule 19: Global Teacher Availability & Double-Booking
                    teacher_free = True
                    for slot in range(start_slot, end_slot + 1):
                        if (str(teacher.id), day, slot) in unavailable_faculty or (teacher.id, day, slot) in unavailable_faculty:
                            teacher_free = False
                            break
                        if (day, slot, str(teacher.id)) in busy_teachers or (day, slot, teacher.id) in busy_teachers:
                            teacher_free = False
                            break
                    if not teacher_free:
                        continue

                    target_rooms = lab_rooms if task_type in ["LAB", "DUAL_LAB"] else lecture_rooms
                    for room in target_rooms:
                        room_free = True
                        for slot in range(start_slot, end_slot + 1):
                            if (day, slot, str(room.id)) in busy_rooms or (day, slot, room.id) in busy_rooms:
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
                            busy_sections.add((day, slot, str(sec)))
                            busy_teachers.add((day, slot, str(teacher.id)))
                            busy_rooms.add((day, slot, str(room.id)))
                            teacher_slot_dept[(str(teacher.id), day, slot)] = dept_id
                            section_slot_subject[(day, slot, sec)] = subj_id

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
                            section_daily_has_lab[(sec, day)] = True
                        if start_slot == 1:
                            teacher_p1_count[teacher.id] += 1
                        if task_type == "ELECTIVE":
                            sync_key = (dept_id, year, subj_id, task_idx % 3)
                            elective_sync_slots[sync_key] = (day, start_slot)
                        if task_type == "DUAL_LAB" and task["session_num"] == 1:
                            dual_lab_first_session[(sec, subj_id)] = (day, is_morning)
                        if task_type in ["THEORY", "ELECTIVE"]:
                            section_daily_subjects.add((sec, day, subj_id))

                        if backtrack(task_idx + 1):
                            schedule_state.extend(temp_entries)
                            return True

                        # ---- BACKTRACK ----
                        if task_type in ["THEORY", "ELECTIVE"]:
                            section_daily_subjects.remove((sec, day, subj_id))
                        if task_type in ["LAB", "DUAL_LAB"]:
                            section_daily_has_lab.pop((sec, day), None)
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
                            section_slot_subject.pop((day, slot, sec), None)

        return False

    success = backtrack(0)

    if not success:
        logger.info("Strict backtracking reached preference threshold. Applying Greedy Fallback Solver with zero collision enforcement...")
        
        fallback_section_daily_subjects = set()
        fallback_dual_lab_first_session = {}
        fallback_teacher_daily_has_lab = {}
        fallback_section_daily_has_lab = {}
        fallback_section_slot_subject = {}

        # Greedy Fallback to complete any remaining tasks while strictly preventing collisions
        for task_idx, task in enumerate(tasks):
            sec = task["section"]
            subj_id = task["subject_id"]
            duration = task["duration"]
            year = task["year"]
            dept_id = task["dept_id"]
            task_type = task["type"]
            lunch_slot = 4 if year == 1 else 5
            weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

            teachers = task.get("teachers", [])
            if not teachers:
                teachers = [p for p in faculty_profiles if p.department_id == dept_id]
            if not teachers:
                teachers = faculty_profiles[:1]
            teachers = teachers[:2]

            target_rooms = [r for r in classrooms if r.department_id == dept_id][:5]
            if not target_rooms:
                target_rooms = classrooms[:5]

            assigned = False
            for day in weekdays:
                if assigned:
                    break
                dept_slots = rules_map[dept_id].slots_per_day if (dept_id in rules_map) else 8
                max_day_slots = 4 if day == "Saturday" else dept_slots
                if day == "Saturday" and task_type in ["LAB", "DUAL_LAB"]:
                    continue

                for start_slot in range(1, max_day_slots - duration + 2):
                    end_slot = start_slot + duration - 1
                    crosses_lunch = (start_slot <= 3 and end_slot >= 4) if year == 1 else (start_slot <= 4 and end_slot >= 5)
                    if crosses_lunch:
                        continue

                    is_morning = end_slot < lunch_slot
                    is_afternoon = start_slot > lunch_slot

                    # Lab Slots Alignment (Rule 9)
                    if task_type in ["LAB", "DUAL_LAB"] and duration == 3:
                        if year == 1:
                            if is_morning and (start_slot != 1 or end_slot != 3):
                                continue
                            if is_afternoon and (start_slot != 5 or end_slot != 7):
                                continue
                        else:
                            if is_morning and start_slot != 2:
                                continue
                            if is_afternoon and start_slot != 5:
                                continue

                    # Enforce at most 1 lab session (LAB or DUAL_LAB) per section per day
                    if task_type in ["LAB", "DUAL_LAB"]:
                        if fallback_section_daily_has_lab.get((sec, day), False):
                            continue

                    # Avoid scheduling the same subject at the same slot on consecutive days
                    prev_day = "Friday" if day == "Saturday" else ("Thursday" if day == "Friday" else ("Wednesday" if day == "Friday" else ("Tuesday" if day == "Wednesday" else ("Monday" if day == "Tuesday" else None))))
                    if prev_day:
                        same_slot_prev = False
                        for slot in range(start_slot, end_slot + 1):
                            if fallback_section_slot_subject.get((prev_day, slot, sec)) == subj_id:
                                same_slot_prev = True
                                break
                        if same_slot_prev:
                            continue

                    # Daily Subject Spreading check
                    if task_type in ["THEORY", "ELECTIVE"]:
                        if (sec, day, subj_id) in fallback_section_daily_subjects:
                            continue

                    # Dual Lab same-day protection (Rule 8)
                    if task_type == "DUAL_LAB" and task.get("session_num", 1) == 2:
                        first_info = fallback_dual_lab_first_session.get((sec, subj_id))
                        if first_info:
                            first_day, first_is_morning = first_info
                            if day == first_day or is_morning == first_is_morning:
                                continue

                    # Strict collision check
                    sec_busy = any((day, slot, str(sec)) in busy_sections or (day, slot, sec) in busy_sections for slot in range(start_slot, end_slot + 1))
                    if sec_busy:
                        continue

                    for teacher in teachers:
                        # HOD Exclusions
                        if teacher.is_hod or teacher.designation.upper() == "HOD":
                            if start_slot == 1 or end_slot == 7 or (start_slot <= 1 <= end_slot) or (start_slot <= 7 <= end_slot):
                                continue
                            if day == "Wednesday" and start_slot > lunch_slot:
                                continue

                        teacher_busy = any((day, slot, str(teacher.id)) in busy_teachers or (day, slot, teacher.id) in busy_teachers or (str(teacher.id), day, slot) in unavailable_faculty for slot in range(start_slot, end_slot + 1))
                        if teacher_busy:
                            continue

                        # Consecutive slots check for teacher
                        consec_count = duration
                        check_slot = start_slot - 1
                        while check_slot >= 1 and ((day, check_slot, str(teacher.id)) in busy_teachers or (day, check_slot, teacher.id) in busy_teachers):
                            consec_count += 1
                            check_slot -= 1
                        check_slot = end_slot + 1
                        while check_slot <= max_day_slots and ((day, check_slot, str(teacher.id)) in busy_teachers or (day, check_slot, teacher.id) in busy_teachers):
                            consec_count += 1
                            check_slot += 1
                        
                        has_lab_today = (task_type in ["LAB", "DUAL_LAB"]) or fallback_teacher_daily_has_lab.get((teacher.id, day), False)
                        if consec_count > 3:
                            continue
                        if consec_count > 2 and not has_lab_today:
                            continue

                        for room in target_rooms:
                            room_busy = any((day, slot, str(room.id)) in busy_rooms or (day, slot, room.id) in busy_rooms for slot in range(start_slot, end_slot + 1))
                            if room_busy:
                                continue

                            # Assign
                            lab_batch_val = "ALL"
                            if task_type == "DUAL_LAB":
                                lab_batch_val = "BATCH_A" if task.get("session_num", 1) == 1 else "BATCH_B"

                            for slot in range(start_slot, end_slot + 1):
                                entry = TimetableEntry(
                                    department_id=dept_id,
                                    section=sec,
                                    academic_year=year,
                                    day_of_week=day,
                                    time_slot=slot,
                                    subject_id=subj_id,
                                    faculty_id=teacher.id,
                                    classroom_id=room.id,
                                    lab_batch=lab_batch_val
                                )
                                schedule_state.append(entry)
                                busy_sections.add((day, slot, str(sec)))
                                busy_teachers.add((day, slot, str(teacher.id)))
                                busy_rooms.add((day, slot, str(room.id)))
                                fallback_section_slot_subject[(day, slot, sec)] = subj_id
                            
                            # Bookkeeping
                            if task_type in ["THEORY", "ELECTIVE"]:
                                fallback_section_daily_subjects.add((sec, day, subj_id))
                            if task_type == "DUAL_LAB" and task.get("session_num", 1) == 1:
                                fallback_dual_lab_first_session[(sec, subj_id)] = (day, is_morning)
                            if task_type in ["LAB", "DUAL_LAB"]:
                                fallback_teacher_daily_has_lab[(teacher.id, day)] = True
                                fallback_section_daily_has_lab[(sec, day)] = True

                            assigned = True
                            break
                        if assigned:
                            break

    # Ensure virtual subjects helper
    async def get_or_create_virtual_subject(name: str, code: str, subject_type: str, department_id: str) -> str:
        import uuid
        stmt = select(Subject).where(Subject.department_id == department_id, Subject.code == code)
        res = await db.execute(stmt)
        subj = res.scalars().first()
        if not subj:
            subj = Subject(
                id=str(uuid.uuid4()),
                code=code,
                name=name,
                subject_type=subject_type,
                department_id=department_id,
                academic_year=1,
                is_parallel_lab=False
            )
            db.add(subj)
            await db.flush()
        return subj.id

    # Post-processing: Fill empty slots with Counseling (1), Library/Sports (1), and Activities (2, consecutive)
    for sec in input_data.sections:
        sec_yr = section_year_map[sec]
        sec_dept_id = section_dept_map[sec]
        dept_slots = rules_map[sec_dept_id].slots_per_day if (sec_dept_id in rules_map) else 8
        lunch_slot = 4 if sec_yr == 1 else 5
        
        # Build list of all possible slots
        valid_slots = []
        for day in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]:
            max_day_slots = 4 if day == "Saturday" else dept_slots
            for slot in range(1, max_day_slots + 1):
                if slot == lunch_slot:
                    continue
                valid_slots.append((day, slot))
                
        # Find empty slots for this section
        empty_slots = []
        for day, slot in valid_slots:
            if (day, slot, sec) not in busy_sections and (day, slot, str(sec)) not in busy_sections:
                empty_slots.append((day, slot))
                
        # 1. Find consecutive empty slots on the same day for Activities (2 periods)
        activity_slots = None
        for i in range(len(empty_slots) - 1):
            day1, slot1 = empty_slots[i]
            day2, slot2 = empty_slots[i + 1]
            if day1 == day2 and slot2 == slot1 + 1:
                activity_slots = [(day1, slot1), (day2, slot2)]
                empty_slots.pop(i + 1)
                empty_slots.pop(i)
                break
                
        # 2. Find Counselling slot (1 period) - prefer last period of the day
        counselling_slot = None
        for day, slot in empty_slots:
            max_slots = 4 if day == "Saturday" else dept_slots
            if slot == max_slots:
                counselling_slot = (day, slot)
                empty_slots.remove((day, slot))
                break
        if not counselling_slot and empty_slots:
            counselling_slot = empty_slots.pop(0)
            
        # 3. Find Library/Sports slot (1 period) - prefer last period of the day or slot 4 (before lunch)
        lib_sports_slot = None
        for day, slot in empty_slots:
            max_slots = 4 if day == "Saturday" else dept_slots
            if slot == max_slots:
                lib_sports_slot = (day, slot)
                empty_slots.remove((day, slot))
                break
        if not lib_sports_slot:
            for day, slot in empty_slots:
                if slot == 4:
                    lib_sports_slot = (day, slot)
                    empty_slots.remove((day, slot))
                    break
        if not lib_sports_slot and empty_slots:
            lib_sports_slot = empty_slots.pop(0)
            
        # Setup fallback teacher and room
        sec_teachers = [p for p in faculty_profiles if p.department_id == sec_dept_id]
        fallback_teacher = sec_teachers[0] if sec_teachers else faculty_profiles[0]
        
        sec_cfg = section_configs.get(sec)
        class_teacher = None
        if sec_cfg and sec_cfg.class_teacher_id:
            class_teacher = faculty_map.get(sec_cfg.class_teacher_id)
        counselling_teacher = class_teacher if class_teacher else fallback_teacher
        
        sec_classrooms = [r for r in classrooms if r.department_id == sec_dept_id and str(r.room_type).upper() not in ["LAB", "COMPUTER_LAB"]]
        if not sec_classrooms:
            sec_classrooms = [r for r in classrooms if str(r.room_type).upper() not in ["LAB", "COMPUTER_LAB"]]
        fallback_room = sec_classrooms[0] if sec_classrooms else classrooms[0]
        
        # Ensure virtual subjects exist in the database
        counsel_subj_id = await get_or_create_virtual_subject("COUNSELLING", "COUNSEL", "COUNSELLING", sec_dept_id)
        lib_sports_subj_id = await get_or_create_virtual_subject("SPORTS/LIBRARY", "SPORTS_LIB", "SPORTS_LIBRARY", sec_dept_id)
        activities_subj_id = await get_or_create_virtual_subject("ACTIVITIES", "ACTIVITIES", "THEORY", sec_dept_id)
        
        # Insert Counselling, Sports/Library, and Activities
        if counselling_slot:
            day, slot = counselling_slot
            entry = TimetableEntry(
                department_id=sec_dept_id,
                section=sec,
                academic_year=sec_yr,
                day_of_week=day,
                time_slot=slot,
                subject_id=counsel_subj_id,
                faculty_id=counselling_teacher.id,
                classroom_id=fallback_room.id,
                lab_batch="ALL"
            )
            schedule_state.append(entry)
            busy_sections.add((day, slot, str(sec)))
            
        if lib_sports_slot:
            day, slot = lib_sports_slot
            entry = TimetableEntry(
                department_id=sec_dept_id,
                section=sec,
                academic_year=sec_yr,
                day_of_week=day,
                time_slot=slot,
                subject_id=lib_sports_subj_id,
                faculty_id=fallback_teacher.id,
                classroom_id=fallback_room.id,
                lab_batch="ALL"
            )
            schedule_state.append(entry)
            busy_sections.add((day, slot, str(sec)))
            
        if activity_slots:
            for day, slot in activity_slots:
                entry = TimetableEntry(
                    department_id=sec_dept_id,
                    section=sec,
                    academic_year=sec_yr,
                    day_of_week=day,
                    time_slot=slot,
                    subject_id=activities_subj_id,
                    faculty_id=counselling_teacher.id,
                    classroom_id=fallback_room.id,
                    lab_batch="ALL"
                )
                schedule_state.append(entry)
                busy_sections.add((day, slot, str(sec)))

    for entry in schedule_state:
        entry.is_permanent = True
        db.add(entry)
        
        present_entry = TimetableEntry(
            department_id=entry.department_id,
            section=entry.section,
            academic_year=entry.academic_year,
            day_of_week=entry.day_of_week,
            time_slot=entry.time_slot,
            subject_id=entry.subject_id,
            faculty_id=entry.faculty_id,
            classroom_id=entry.classroom_id,
            lab_batch=entry.lab_batch,
            is_permanent=False
        )
        db.add(present_entry)

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
        .where(TimetableEntry.is_permanent == False)
        .order_by(TimetableEntry.day_of_week, TimetableEntry.time_slot)
    )
    res = await db.execute(stmt)
    return res.scalars().all()


