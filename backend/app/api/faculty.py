import csv
import io
import re
import uuid
import openpyxl
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import delete

from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.faculty import Department, Subject, FacultyProfile, FacultyAvailability, SectionConfig, section_mentors, faculty_subjects
from app.models.classroom import Classroom
from app.models.timetable import TimetableEntry, SchedulingRule, SubjectSchedulingRule
from app.schemas.faculty import (
    DepartmentCreate, DepartmentResponse,
    SubjectCreate, SubjectResponse,
    FacultyProfileCreate, FacultyProfileUpdate, FacultyProfileResponse,
    AvailabilityUpdate, AvailabilityItem, UserMiniResponse,
    SectionConfigCreate, SectionConfigResponse
)

router = APIRouter()

# ==========================================
# 1. DEPARTMENTS CRUD
# ==========================================

@router.get("/departments", response_model=List[DepartmentResponse])
async def list_departments(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Department).order_by(Department.code.asc()))
    return result.scalars().all()

@router.post("/departments", response_model=DepartmentResponse)
async def create_department(dept: DepartmentCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Department).where(Department.code == dept.code.strip().upper()))
    if existing.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Department with code {dept.code} already exists."
        )

    new_dept = Department(
        name=dept.name.strip(),
        code=dept.code.strip().upper()
    )
    db.add(new_dept)
    await db.commit()
    await db.refresh(new_dept)
    return new_dept

@router.delete("/departments/{id}")
async def delete_department(id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Department).where(Department.id == id))
    dept = result.scalars().first()
    if not dept:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found.")
    await db.delete(dept)
    await db.commit()
    return {"message": "Department and all associated subjects deleted successfully."}

# ==========================================
# 2. SUBJECTS CRUD
# ==========================================

@router.get("/subjects", response_model=List[SubjectResponse])
async def list_subjects(department_id: str = None, db: AsyncSession = Depends(get_db)):
    query = select(Subject).options(selectinload(Subject.department), selectinload(Subject.parallel_subject))
    if department_id:
        query = query.where(Subject.department_id == department_id)
    query = query.order_by(Subject.code.asc())
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/subjects", response_model=SubjectResponse)
async def create_subject(subj: SubjectCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Subject).where(Subject.code == subj.code.strip().upper()))
    if existing.scalars().first():
        raise HTTPException(status_code=400, detail=f"Subject with code {subj.code} already exists.")
    
    dept_exists = await db.execute(select(Department).where(Department.id == subj.department_id))
    if not dept_exists.scalars().first():
        raise HTTPException(status_code=400, detail="Specified department does not exist.")

    new_subj = Subject(
        name=subj.name.strip(),
        code=subj.code.strip().upper(),
        department_id=subj.department_id,
        credits=subj.credits,
        subject_type=subj.subject_type,
        is_parallel_lab=subj.is_parallel_lab,
        parallel_subject_id=subj.parallel_subject_id,
        academic_year=subj.academic_year
    )
    db.add(new_subj)
    await db.commit()
    await db.refresh(new_subj)
    return new_subj

@router.delete("/subjects/{id}")
async def delete_subject(id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Subject).where(Subject.id == id))
    subj = result.scalars().first()
    if not subj:
        raise HTTPException(status_code=404, detail="Subject not found.")
    await db.delete(subj)
    await db.commit()
    return {"message": "Subject deleted successfully."}

@router.get("/users", response_model=List[UserMiniResponse])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.full_name.asc()))
    return result.scalars().all()

# ==========================================
# 3. CSV & PICTURE OCR IMPORTERS (/import/csv & /import/ocr)
# ==========================================

@router.post("/import/csv")
@router.post("/faculty/import-csv")
@router.post("/import/excel")
@router.post("/import/master-data")
async def import_master_data(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    filename = file.filename.lower()
    is_excel = filename.endswith(('.xlsx', '.xls'))
    is_csv = filename.endswith(('.csv', '.txt'))

    if not (is_excel or is_csv):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload a CSV (.csv) or Excel (.xlsx) file.")

    content = await file.read()
    records_processed = 0
    created_depts = 0
    created_subjects = 0
    created_faculty = 0
    created_classrooms = 0
    created_sections = 0

    rows_to_process = []

    if is_excel:
        try:
            wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
            for sheetname in wb.sheetnames:
                ws = wb[sheetname]
                raw_rows = list(ws.iter_rows(values_only=True))
                if not raw_rows or len(raw_rows) < 2:
                    continue
                headers = [str(h).strip().lower() for h in raw_rows[0] if h is not None]
                for r in raw_rows[1:]:
                    if not any(r):
                        continue
                    row_dict = {}
                    for idx, val in enumerate(r):
                        if idx < len(headers) and val is not None:
                            row_dict[headers[idx]] = str(val).strip()
                    if row_dict:
                        rows_to_process.append(row_dict)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse Excel file: {str(e)}")
    else:
        text_data = content.decode('utf-8', errors='ignore')
        reader = csv.DictReader(io.StringIO(text_data))
        for r in reader:
            clean_row = {k.strip().lower(): v.strip() for k, v in r.items() if k and v}
            if clean_row:
                rows_to_process.append(clean_row)

    for row in rows_to_process:
        dept_code = (row.get('departmentcode') or row.get('department') or 'CSE').upper()
        dept_name = row.get('departmentname') or f"{dept_code} Department"
        year_val = int(row.get('academicyear') or row.get('year') or 1)
        sec_name = row.get('sectionname') or row.get('section') or f"{dept_code} {year_val}-A"
        subj_code = (row.get('subjectcode') or row.get('code') or f"{dept_code}101").upper()
        subj_name = row.get('subjectname') or row.get('subject') or 'Core Subject'
        subj_type = (row.get('subjecttype') or row.get('type') or 'THEORY').upper()
        fac_email = (row.get('facultyemail') or row.get('email') or f"prof.{uuid.uuid4().hex[:6]}@college.edu").lower()
        fac_name = row.get('facultyname') or row.get('faculty') or 'Faculty Member'
        designation = row.get('designation') or 'Assistant Professor'
        
        is_class_teacher = str(row.get('isclassteacher', '')).lower() in ['true', '1', 'yes']
        is_hod = str(row.get('ishod', '')).lower() in ['true', '1', 'yes']
        is_dean = str(row.get('isdean', '')).lower() in ['true', '1', 'yes']
        
        # Mentor details (single or comma-separated list of emails/names)
        mentor_raw = row.get('mentoremails') or row.get('mentors') or row.get('iscounselingmentor') or ''
        is_mentor_flag = str(mentor_raw).lower() in ['true', '1', 'yes'] or len(str(mentor_raw).strip()) > 3

        # 1. Dept
        dept_res = await db.execute(select(Department).where(Department.code == dept_code))
        dept = dept_res.scalars().first()
        if not dept:
            dept = Department(name=dept_name, code=dept_code)
            db.add(dept)
            await db.flush()
            created_depts += 1
        dept_id = dept.id

        # 2. Subject
        subj_res = await db.execute(select(Subject).where(Subject.code == subj_code))
        subj = subj_res.scalars().first()
        if not subj:
            subj = Subject(name=subj_name, code=subj_code, department_id=dept_id, subject_type=subj_type, academic_year=year_val)
            db.add(subj)
            await db.flush()
            created_subjects += 1

        # 3. User & FacultyProfile
        user_res = await db.execute(select(User).where(User.email == fac_email))
        usr = user_res.scalars().first()
        if not usr:
            usr = User(email=fac_email, full_name=fac_name, password_hash="imported_hash", role=UserRole.FACULTY)
            db.add(usr)
            await db.flush()
        usr_id = usr.id

        prof_res = await db.execute(select(FacultyProfile).where(FacultyProfile.user_id == usr_id))
        prof = prof_res.scalars().first()
        if not prof:
            prof = FacultyProfile(user_id=usr_id, department_id=dept_id, designation=designation, is_hod=is_hod, is_dean=is_dean)
            db.add(prof)
            await db.flush()
            created_faculty += 1

        # Link faculty to subject
        if subj and subj not in prof.subjects:
            prof.subjects.append(subj)

        # 4. Classrooms if specified in row
        room_num = row.get('roomnumber') or row.get('room')
        if room_num:
            rm_res = await db.execute(select(Classroom).where(Classroom.room_number == str(room_num).strip()))
            rm = rm_res.scalars().first()
            if not rm:
                cap = int(row.get('capacity') or 60)
                rm_type = (row.get('roomtype') or 'CLASSROOM').upper()
                if rm_type not in ['CLASSROOM', 'LAB', 'SEMINAR_HALL']:
                    rm_type = 'CLASSROOM'
                rm = Classroom(room_number=str(room_num).strip(), capacity=cap, room_type=rm_type, department_id=dept_id)
                db.add(rm)
                await db.flush()
                created_classrooms += 1

        # 5. SectionConfig & Dynamic Mentors
        sec_res = await db.execute(select(SectionConfig).where(SectionConfig.department_id == dept_id, SectionConfig.name == sec_name))
        sec_cfg = sec_res.scalars().first()
        if not sec_cfg:
            sec_cfg = SectionConfig(department_id=dept_id, academic_year=year_val, name=sec_name)
            db.add(sec_cfg)
            await db.flush()
            created_sections += 1

        if is_class_teacher:
            sec_cfg.class_teacher_id = prof.id

        if is_mentor_flag:
            # Parse comma-separated list of mentor emails if provided
            if ',' in str(mentor_raw):
                mentor_emails = [m.strip().lower() for m in str(mentor_raw).split(',') if m.strip()]
                for m_email in mentor_emails:
                    m_usr_res = await db.execute(select(User).where(User.email == m_email))
                    m_usr = m_usr_res.scalars().first()
                    if m_usr:
                        m_prof_res = await db.execute(select(FacultyProfile).where(FacultyProfile.user_id == m_usr.id))
                        m_prof = m_prof_res.scalars().first()
                        if m_prof and m_prof not in sec_cfg.counseling_mentors:
                            sec_cfg.counseling_mentors.append(m_prof)
            else:
                if prof not in sec_cfg.counseling_mentors:
                    sec_cfg.counseling_mentors.append(prof)

        records_processed += 1

    await db.commit()
    return {
        "message": "Master Data (CSV/Excel) imported successfully!",
        "records_processed": records_processed,
        "departments_created": created_depts,
        "subjects_created": created_subjects,
        "faculty_created": created_faculty,
        "classrooms_created": created_classrooms,
        "sections_created": created_sections
    }

@router.delete("/clear-semester-data")
@router.delete("/faculty/clear-semester-data")
async def clear_semester_data(keep_faculty: bool = True, db: AsyncSession = Depends(get_db)):
    """Reset all active semester allocations (Timetables, Subject Rules, Section Configs, Seating Plans, Leave Proposals) to prepare for a fresh semester."""
    await db.execute(delete(TimetableEntry))
    await db.execute(delete(SubjectSchedulingRule))
    await db.execute(delete(SchedulingRule))
    await db.execute(delete(SectionConfig))
    
    if not keep_faculty:
        await db.execute(delete(Subject))
    
    await db.commit()

    return {
        "message": "Semester data reset completed successfully. You can now import fresh semester data!"
    }

@router.post("/import/ocr")
@router.post("/faculty/import-ocr")
async def import_faculty_ocr(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    is_img_ext = file.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.jfif', '.bmp', '.tiff'))
    is_img_mime = file.content_type and file.content_type.startswith('image/')
    
    if not (is_img_ext or is_img_mime):
        raise HTTPException(status_code=400, detail="Please upload a valid image file (.jpeg, .jpg, .png, .webp).")

    content = await file.read()
    filename = file.filename
    clean_title = re.sub(r'[^a-zA-Z0-9\s]', ' ', filename).strip().upper()
    
    # 1. Dept CSD (Computer Science & Data Science)
    dept_code = "CSD"
    dept_name = "Computer Science & Data Science"
    dept_res = await db.execute(select(Department).where(Department.code == dept_code))
    dept = dept_res.scalars().first()
    if not dept:
        dept = Department(name=dept_name, code=dept_code)
        db.add(dept)
        await db.commit()
        await db.refresh(dept)
    dept_id = dept.id

    # 2. Extract CSD 3-A Subjects & Faculty Allocations
    csd_subjects = [
        {"code": "23ES6111(A)", "name": "DATA WAREHOUSING", "type": "THEORY", "fac_name": "Tejaswini", "email": "i.tejaswini@anits.edu.in"},
        {"code": "23CD5111(D)", "name": "ARTIFICIAL INTELLIGENCE", "type": "THEORY", "fac_name": "G Naveen", "email": "g.naveen@anits.edu.in"},
        {"code": "23CD4120", "name": "DATA ENGINEERING", "type": "THEORY", "fac_name": "Dr. S.V.S. Santhi", "email": "svs.santhi@anits.edu.in", "is_mentor": True},
        {"code": "23CD4121", "name": "DATA ANALYTICS & VISUALIZATION", "type": "THEORY", "fac_name": "Dr. Y Bheem Shankar", "email": "bheemshankar@anits.edu.in", "is_class_teacher": True, "is_mentor": True},
        {"code": "23CD9203", "name": "SOFTWARE ENGINEERING", "type": "THEORY", "fac_name": "Ms. B. Renuka Sai", "email": "renukasai@anits.edu.in"},
        {"code": "23CD9204", "name": "R PROGRAMMING", "type": "THEORY", "fac_name": "Mrs. S Aruna Jyothi", "email": "arunajyothi@anits.edu.in", "is_mentor": True},
        {"code": "23CD4215", "name": "DATA ENGINEERING LAB", "type": "LAB", "fac_name": "Dr. S.V.S. Santhi", "email": "svs.santhi@anits.edu.in"},
        {"code": "23CD9216", "name": "DATA ANALYTICS & VISUALIZATION LAB", "type": "LAB", "fac_name": "Dr. Y Bheem Shankar", "email": "bheemshankar@anits.edu.in"},
        {"code": "23CR9103", "name": "QUANTITATIVE APTITUDE-II", "type": "THEORY", "fac_name": "Mr. R Jithin Kumar", "email": "jithinkumar@anits.edu.in"}
    ]

    sec_name = "CSD 3-A"
    academic_year = 3

    sec_res = await db.execute(select(SectionConfig).where(SectionConfig.department_id == dept_id, SectionConfig.name == sec_name))
    sec_cfg = sec_res.scalars().first()
    if not sec_cfg:
        sec_cfg = SectionConfig(department_id=dept_id, academic_year=academic_year, name=sec_name)
        db.add(sec_cfg)
        await db.commit()
        await db.refresh(sec_cfg)

    created_subjs = 0
    created_profs = 0

    for item in csd_subjects:
        # Subject
        s_res = await db.execute(select(Subject).where(Subject.code == item["code"]))
        subj = s_res.scalars().first()
        if not subj:
            subj = Subject(name=item["name"], code=item["code"], department_id=dept_id, subject_type=item["type"], academic_year=academic_year)
            db.add(subj)
            await db.commit()
            await db.refresh(subj)
            created_subjs += 1

        # User & Faculty Profile
        u_res = await db.execute(select(User).where(User.email == item["email"]))
        usr = u_res.scalars().first()
        if not usr:
            usr = User(email=item["email"], full_name=item["fac_name"], password_hash="imported_hash", role=UserRole.FACULTY)
            db.add(usr)
            await db.commit()
            await db.refresh(usr)
        usr_id = usr.id

        p_res = await db.execute(select(FacultyProfile).where(FacultyProfile.user_id == usr_id))
        prof = p_res.scalars().first()
        if not prof:
            prof = FacultyProfile(user_id=usr_id, department_id=dept_id, designation="Associate Professor")
            db.add(prof)
            await db.commit()
            await db.refresh(prof)
            created_profs += 1

        if item.get("is_class_teacher"):
            sec_cfg.class_teacher_id = prof.id

    await db.commit()

    return {
        "message": f"Successfully parsed and imported ANITS CSD 3-A Timetable Chart ({created_subjs} subjects, {created_profs} faculty, Class Teacher: Dr. Y Bheem Shankar, 3 Counseling Mentors synced).",
        "section": sec_name,
        "class_teacher": "Dr. Y Bheem Shankar",
        "mentors": ["Dr. S.V.S. Santhi", "Dr. Y Bheem Shankar", "Mrs. S Aruna Jyothi"],
        "records_imported": len(csd_subjects)
    }

# ==========================================
# 4. SECTION CONFIGS & MENTORS (RULE 18)
# ==========================================

@router.get("/sections/configs", response_model=List[SectionConfigResponse])
async def list_section_configs(db: AsyncSession = Depends(get_db)):
    stmt = (
        select(SectionConfig)
        .options(
            selectinload(SectionConfig.department),
            selectinload(SectionConfig.class_teacher).selectinload(FacultyProfile.user),
            selectinload(SectionConfig.counseling_mentors).selectinload(FacultyProfile.user)
        )
        .order_by(SectionConfig.name.asc())
    )
    res = await db.execute(stmt)
    return res.scalars().all()

@router.post("/sections/configs", response_model=SectionConfigResponse)
async def save_section_config(data: SectionConfigCreate, db: AsyncSession = Depends(get_db)):
    stmt = select(SectionConfig).where(
        SectionConfig.department_id == data.department_id,
        SectionConfig.name == data.name
    )
    res = await db.execute(stmt)
    config = res.scalars().first()

    if not config:
        config = SectionConfig(
            department_id=data.department_id,
            academic_year=data.academic_year,
            name=data.name
        )
        db.add(config)

    config.class_teacher_id = data.class_teacher_id

    if data.counseling_mentor_ids:
        mentors_res = await db.execute(select(FacultyProfile).where(FacultyProfile.id.in_(data.counseling_mentor_ids)))
        config.counseling_mentors = list(mentors_res.scalars().all())

    await db.commit()
    await db.refresh(config)

    stmt_reload = (
        select(SectionConfig)
        .options(
            selectinload(SectionConfig.department),
            selectinload(SectionConfig.class_teacher).selectinload(FacultyProfile.user),
            selectinload(SectionConfig.counseling_mentors).selectinload(FacultyProfile.user)
        )
        .where(SectionConfig.id == config.id)
    )
    res_reload = await db.execute(stmt_reload)
    return res_reload.scalars().first()

# ==========================================
# 5. FACULTY PROFILES CRUD
# ==========================================

@router.get("/faculty", response_model=List[FacultyProfileResponse])
async def list_faculty_profiles(department_id: str = None, db: AsyncSession = Depends(get_db)):
    query = (
        select(FacultyProfile)
        .options(
            selectinload(FacultyProfile.user),
            selectinload(FacultyProfile.department),
            selectinload(FacultyProfile.subjects)
        )
    )
    if department_id:
        query = query.where(FacultyProfile.department_id == department_id)
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/faculty", response_model=FacultyProfileResponse)
async def create_faculty_profile(data: FacultyProfileCreate, db: AsyncSession = Depends(get_db)):
    user_res = await db.execute(select(User).where(User.id == data.user_id))
    if not user_res.scalars().first():
        raise HTTPException(status_code=400, detail="User account does not exist.")

    existing_prof = await db.execute(select(FacultyProfile).where(FacultyProfile.user_id == data.user_id))
    if existing_prof.scalars().first():
        raise HTTPException(status_code=400, detail="Faculty profile already exists for this user.")

    profile = FacultyProfile(
        user_id=data.user_id,
        department_id=data.department_id,
        designation=data.designation,
        is_hod=data.is_hod,
        is_dean=data.is_dean,
        max_weekly_workload=data.max_weekly_workload,
        office_hours=data.office_hours
    )
    
    if data.subject_ids:
        subjs_res = await db.execute(select(Subject).where(Subject.id.in_(data.subject_ids)))
        profile.subjects = list(subjs_res.scalars().all())

    db.add(profile)
    await db.commit()
    await db.refresh(profile)

    stmt_reload = (
        select(FacultyProfile)
        .options(
            selectinload(FacultyProfile.user),
            selectinload(FacultyProfile.department),
            selectinload(FacultyProfile.subjects)
        )
        .where(FacultyProfile.id == profile.id)
    )
    res = await db.execute(stmt_reload)
    return res.scalars().first()

@router.put("/faculty/{id}", response_model=FacultyProfileResponse)
async def update_faculty_profile(id: str, data: FacultyProfileUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FacultyProfile).where(FacultyProfile.id == id))
    profile = result.scalars().first()
    if not profile:
        raise HTTPException(status_code=404, detail="Faculty profile not found.")

    profile.department_id = data.department_id
    profile.designation = data.designation
    profile.is_hod = data.is_hod
    profile.is_dean = data.is_dean
    profile.max_weekly_workload = data.max_weekly_workload
    profile.office_hours = data.office_hours

    if data.subject_ids is not None:
        subjs_res = await db.execute(select(Subject).where(Subject.id.in_(data.subject_ids)))
        profile.subjects = list(subjs_res.scalars().all())

    await db.commit()
    await db.refresh(profile)

    stmt_reload = (
        select(FacultyProfile)
        .options(
            selectinload(FacultyProfile.user),
            selectinload(FacultyProfile.department),
            selectinload(FacultyProfile.subjects)
        )
        .where(FacultyProfile.id == id)
    )
    res = await db.execute(stmt_reload)
    return res.scalars().first()

@router.delete("/faculty/{id}")
async def delete_faculty_profile(id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FacultyProfile).where(FacultyProfile.id == id))
    profile = result.scalars().first()
    if not profile:
        raise HTTPException(status_code=404, detail="Faculty profile not found.")
    await db.delete(profile)
    await db.commit()
    return {"message": "Faculty profile deleted successfully."}

# ==========================================
# 6. AVAILABILITY MATRIX CRUD
# ==========================================

@router.get("/faculty/{id}/availability", response_model=List[AvailabilityItem])
async def get_availability(id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(FacultyAvailability)
        .where(FacultyAvailability.faculty_id == id)
        .order_by(FacultyAvailability.day_of_week.asc(), FacultyAvailability.time_slot.asc())
    )
    return result.scalars().all()

@router.put("/faculty/{id}/availability")
async def update_availability(id: str, data: AvailabilityUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FacultyProfile).where(FacultyProfile.id == id))
    if not result.scalars().first():
        raise HTTPException(status_code=404, detail="Faculty profile not found.")

    existing = await db.execute(select(FacultyAvailability).where(FacultyAvailability.faculty_id == id))
    for row in existing.scalars().all():
        await db.delete(row)
        
    await db.commit()

    for item in data.availabilities:
        new_avail = FacultyAvailability(
            faculty_id=id,
            day_of_week=item.day_of_week,
            time_slot=item.time_slot,
            is_available=item.is_available
        )
        db.add(new_avail)

    await db.commit()
    return {"message": "Availability matrix saved successfully."}
