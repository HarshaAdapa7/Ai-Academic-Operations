import io
import csv
import uuid
import json
from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User
from app.models.faculty import Department, Subject, FacultyProfile, SectionConfig, faculty_subjects, section_mentors
from app.models.classroom import Classroom
from app.models.timetable import SubjectSchedulingRule
from app.models.import_system import ImportHistory, ImportStagingRecord
from app.api.deps import get_current_user

router = APIRouter()

def get_user_dept_id(user: User) -> Optional[str]:
    """Helper to resolve the department ID for a user safely."""
    if hasattr(user, "faculty_profile") and user.faculty_profile and user.faculty_profile.department_id:
        return user.faculty_profile.department_id
    if hasattr(user, "department_id") and user.department_id:
        return user.department_id
    return None

@router.post("/upload", response_model=Dict[str, Any])
async def upload_department_data(
    file: UploadFile = File(...),
    department_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Department Portal Data Collection & Import Endpoint.
    Stores records in staging tables, enforces department security scoping,
    and runs multi-stage validation (missing fields, duplicates, subject weekly hours rules).
    """
    user_dept_id = get_user_dept_id(current_user)
    
    # Security Check: Non-admin users are strictly locked to their assigned department
    if current_user.role not in ["ADMIN", "DEAN"]:
        if not user_dept_id:
            raise HTTPException(status_code=400, detail="User is not associated with any department.")
        effective_dept_id = user_dept_id
    else:
        effective_dept_id = department_id or user_dept_id

    if not effective_dept_id:
        # Fallback to first department in system if admin hasn't selected one
        dept_res = await db.execute(select(Department).limit(1))
        dept_obj = dept_res.scalars().first()
        if not dept_obj:
            raise HTTPException(status_code=400, detail="No departments exist in system.")
        effective_dept_id = dept_obj.id

    dept_res = await db.execute(select(Department).where(Department.id == effective_dept_id))
    dept = dept_res.scalars().first()
    if not dept:
        raise HTTPException(status_code=404, detail="Target department not found.")

    # Read uploaded file content
    content = await file.read()
    filename = file.filename or "upload.csv"
    file_type = "XLSX" if filename.endswith((".xlsx", ".xls")) else "CSV"

    raw_rows: List[Dict[str, Any]] = []

    # Parse File Content (CSV or Excel)
    if filename.endswith((".xlsx", ".xls")):
        try:
            import pandas as pd
            df = pd.read_excel(io.BytesIO(content))
            df = df.fillna("")
            raw_rows = df.to_dict(orient="records")
        except Exception as e:
            # Fallback if pandas is not installed or error occurs
            raise HTTPException(status_code=400, detail=f"Failed to parse Excel file: {str(e)}")
    else:
        try:
            text_str = content.decode("utf-8-sig", errors="ignore")
            reader = csv.DictReader(io.StringIO(text_str))
            for row in reader:
                raw_rows.append({k.strip() if k else "": v.strip() if v else "" for k, v in row.items()})
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse CSV file: {str(e)}")

    if not raw_rows:
        raise HTTPException(status_code=400, detail="Uploaded file contains no data rows.")

    # Create Import History Record (Staging Phase)
    import_job = ImportHistory(
        id=str(uuid.uuid4()),
        department_id=effective_dept_id,
        uploaded_by_id=current_user.id,
        file_name=filename,
        file_type=file_type,
        total_records=len(raw_rows),
        import_status="STAGED"
    )
    db.add(import_job)
    await db.flush()

    # Pre-fetch existing department database entities for duplicate validation
    existing_users_res = await db.execute(select(User.email))
    existing_emails = set(e.lower() for e in existing_users_res.scalars().all() if e)

    existing_subjs_res = await db.execute(select(Subject.code))
    existing_subject_codes = set(c.upper() for c in existing_subjs_res.scalars().all() if c)

    existing_secs_res = await db.execute(select(SectionConfig.name))
    existing_section_names = set(s.upper() for s in existing_secs_res.scalars().all() if s)

    existing_rooms_res = await db.execute(select(Classroom.room_number))
    existing_room_numbers = set(r.upper() for r in existing_rooms_res.scalars().all() if r)

    staged_records = []
    total_valid = 0
    total_failed = 0
    total_warnings = 0
    total_missing_fields = 0
    all_validation_errors = []

    seen_emails_in_file = set()
    seen_subjs_in_file = set()

    for idx, row in enumerate(raw_rows, start=1):
        row_num = idx
        # Detect Entity Type from CSV/Excel row headers
        entity_type = "FACULTY"
        if any(k in row for k in ["subject_code", "Subject Code", "subject_name", "Subject Name", "code", "Code"]):
            if "designation" not in [k.lower() for k in row.keys()]:
                entity_type = "SUBJECT"
        elif any(k in row for k in ["section_name", "Section", "section"]):
            if "designation" not in [k.lower() for k in row.keys()] and "subject_code" not in [k.lower() for k in row.keys()]:
                entity_type = "SECTION"
        elif any(k in row for k in ["room_number", "Room", "room"]):
            entity_type = "CLASSROOM"

        errors = []
        warnings = []
        missing_fields = []
        status_val = "VALID"

        # Universal Department Security Override: Enforce user's department ID
        row["department_id"] = effective_dept_id
        row["department_code"] = dept.code

        # Field-by-Field Validation
        if entity_type == "FACULTY":
            name = row.get("full_name") or row.get("name") or row.get("Faculty Name") or row.get("faculty_name")
            email = row.get("email") or row.get("Email")
            designation = row.get("designation") or row.get("Designation") or "Assistant Professor"

            if not name:
                missing_fields.append("full_name")
                errors.append("Faculty full_name is required.")
            if not email:
                missing_fields.append("email")
                errors.append("Faculty email address is required.")
            elif email.lower() in existing_emails or email.lower() in seen_emails_in_file:
                warnings.append(f"Email '{email}' already registered. Profile will be updated.")
            else:
                seen_emails_in_file.add(email.lower())

        elif entity_type == "SUBJECT":
            s_code = row.get("subject_code") or row.get("code") or row.get("Subject Code")
            s_name = row.get("subject_name") or row.get("name") or row.get("Subject Name")
            s_type = (row.get("subject_type") or row.get("type") or "THEORY").upper()
            
            # Department-Specific Subject Weekly Hours Validation Rule
            raw_hours = row.get("weekly_hours") or row.get("lectures_per_week") or row.get("hours") or row.get("periods_per_week")
            try:
                weekly_hours = int(raw_hours) if raw_hours != "" and raw_hours is not None else (4 if s_type == "THEORY" else 3)
            except ValueError:
                weekly_hours = 4
                warnings.append(f"Invalid weekly hours '{raw_hours}'. Defaulted to 4 hours/week.")

            if not s_code:
                missing_fields.append("subject_code")
                errors.append("Subject code is required.")
            if not s_name:
                missing_fields.append("subject_name")
                errors.append("Subject name is required.")

            if s_code and s_code.upper() in seen_subjs_in_file:
                errors.append(f"Duplicate subject code '{s_code}' within uploaded file.")
            elif s_code:
                seen_subjs_in_file.add(s_code.upper())

            if s_type not in ["THEORY", "LAB", "ELECTIVE", "COUNSELLING", "SPORTS_LIBRARY"]:
                warnings.append(f"Subject type '{s_type}' mapped to STANDARD THEORY.")

        elif entity_type == "SECTION":
            sec_name = row.get("section_name") or row.get("section") or row.get("Section")
            if not sec_name:
                missing_fields.append("section_name")
                errors.append("Section name (e.g. CSE 3-A) is required.")

        elif entity_type == "CLASSROOM":
            room_no = row.get("room_number") or row.get("room") or row.get("Room Number")
            if not room_no:
                missing_fields.append("room_number")
                errors.append("Classroom room_number is required.")

        # Determine Final Record Validation Status
        if errors:
            status_val = "INVALID"
            total_failed += 1
            all_validation_errors.append(f"Row {row_num} [{entity_type}]: " + "; ".join(errors))
        elif missing_fields:
            status_val = "MISSING_DATA"
            total_missing_fields += 1
            total_warnings += 1
        elif warnings:
            status_val = "WARNING"
            total_warnings += 1
            total_valid += 1
        else:
            status_val = "VALID"
            total_valid += 1

        staging_rec = ImportStagingRecord(
            id=str(uuid.uuid4()),
            import_history_id=import_job.id,
            department_id=effective_dept_id,
            entity_type=entity_type,
            row_number=row_num,
            raw_data=row,
            validation_status=status_val,
            missing_fields_list=missing_fields,
            error_messages=errors + warnings
        )
        staged_records.append(staging_rec)

    # Save all staged records
    db.add_all(staged_records)

    # Update Import History metrics
    import_job.successful_records = total_valid
    import_job.failed_records = total_failed
    import_job.warning_records = total_warnings
    import_job.missing_fields_count = total_missing_fields
    import_job.validation_errors = all_validation_errors
    import_job.import_status = "VALIDATED" if total_failed == 0 else "NEEDS_REMEDIATION"

    await db.commit()

    return {
        "import_id": import_job.id,
        "department": {"id": dept.id, "name": dept.name, "code": dept.code},
        "file_name": filename,
        "total_records": len(raw_rows),
        "valid_records": total_valid,
        "failed_records": total_failed,
        "warning_records": total_warnings,
        "missing_fields_count": total_missing_fields,
        "import_status": import_job.import_status,
        "validation_errors": all_validation_errors[:20] # Preview first 20 errors
    }

@router.get("/staging/{import_id}", response_model=Dict[str, Any])
async def get_staging_preview(
    import_id: str,
    status_filter: Optional[str] = Query(None),
    entity_filter: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Fetch staged data preview for HOD review, missing data remediation, and confirmation."""
    import_res = await db.execute(select(ImportHistory).where(ImportHistory.id == import_id))
    import_job = import_res.scalars().first()
    if not import_job:
        raise HTTPException(status_code=404, detail="Import job not found.")

    user_dept_id = get_user_dept_id(current_user)
    if current_user.role not in ["ADMIN", "DEAN"] and user_dept_id != import_job.department_id:
        raise HTTPException(status_code=403, detail="Unauthorized access to another department's import job.")

    query = select(ImportStagingRecord).where(ImportStagingRecord.import_history_id == import_id)
    if status_filter:
        query = query.where(ImportStagingRecord.validation_status == status_filter.upper())
    if entity_filter:
        query = query.where(ImportStagingRecord.entity_type == entity_filter.upper())

    query = query.order_by(ImportStagingRecord.row_number.asc())
    records_res = await db.execute(query)
    records = records_res.scalars().all()

    return {
        "import_id": import_job.id,
        "department_id": import_job.department_id,
        "file_name": import_job.file_name,
        "total_records": import_job.total_records,
        "successful_records": import_job.successful_records,
        "failed_records": import_job.failed_records,
        "missing_fields_count": import_job.missing_fields_count,
        "import_status": import_job.import_status,
        "records": [
            {
                "id": r.id,
                "row_number": r.row_number,
                "entity_type": r.entity_type,
                "raw_data": r.raw_data,
                "validation_status": r.validation_status,
                "missing_fields": r.missing_fields_list or [],
                "error_messages": r.error_messages or []
            }
            for r in records
        ]
    }

@router.put("/staging/{import_id}/record/{record_id}", response_model=Dict[str, Any])
async def remediate_staging_record(
    import_id: str,
    record_id: str,
    updated_data: Dict[str, Any],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Missing Data Remediation Endpoint.
    Allows the uploader to inline-edit a staged record to fix missing fields or warnings before confirmation.
    """
    rec_res = await db.execute(
        select(ImportStagingRecord)
        .where(ImportStagingRecord.id == record_id, ImportStagingRecord.import_history_id == import_id)
    )
    record = rec_res.scalars().first()
    if not record:
        raise HTTPException(status_code=404, detail="Staged record not found.")

    user_dept_id = get_user_dept_id(current_user)
    if current_user.role not in ["ADMIN", "DEAN"] and user_dept_id != record.department_id:
        raise HTTPException(status_code=403, detail="Unauthorized access to record.")

    # Merge updated data
    current_raw = dict(record.raw_data or {})
    current_raw.update(updated_data)
    record.raw_data = current_raw

    # Re-validate
    errors = []
    missing = []
    if record.entity_type == "FACULTY":
        if not current_raw.get("full_name") and not current_raw.get("name"):
            missing.append("full_name")
            errors.append("Faculty name is required.")
        if not current_raw.get("email"):
            missing.append("email")
            errors.append("Faculty email is required.")

    elif record.entity_type == "SUBJECT":
        if not current_raw.get("subject_code") and not current_raw.get("code"):
            missing.append("subject_code")
            errors.append("Subject code is required.")
        if not current_raw.get("subject_name") and not current_raw.get("name"):
            missing.append("subject_name")
            errors.append("Subject name is required.")

    if errors:
        record.validation_status = "INVALID"
    elif missing:
        record.validation_status = "MISSING_DATA"
    else:
        record.validation_status = "VALID"

    record.missing_fields_list = missing
    record.error_messages = errors

    await db.commit()
    return {"message": "Record remediated successfully.", "validation_status": record.validation_status}

@router.post("/confirm/{import_id}", response_model=Dict[str, Any])
async def confirm_production_commit(
    import_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    HOD Production Commit Endpoint.
    Atomically commits valid staged records into production tables (Users, Faculty, Subjects, Rooms, Sections).
    """
    import_res = await db.execute(select(ImportHistory).where(ImportHistory.id == import_id))
    import_job = import_res.scalars().first()
    if not import_job:
        raise HTTPException(status_code=404, detail="Import job not found.")

    user_dept_id = get_user_dept_id(current_user)
    if current_user.role not in ["ADMIN", "DEAN"] and user_dept_id != import_job.department_id:
        raise HTTPException(status_code=403, detail="Unauthorized confirmation of another department's data.")

    records_res = await db.execute(
        select(ImportStagingRecord)
        .where(ImportStagingRecord.import_history_id == import_id, ImportStagingRecord.validation_status.in_(["VALID", "WARNING"]))
    )
    valid_records = records_res.scalars().all()

    if not valid_records:
        raise HTTPException(status_code=400, detail="No valid staged records available to commit.")

    from app.core.security import get_password_hash
    default_hashed_pw = get_password_hash("anits123")
    dept_id = import_job.department_id

    committed_faculty = 0
    committed_subjects = 0
    committed_sections = 0
    committed_rooms = 0

    for rec in valid_records:
        data = rec.raw_data or {}
        etype = rec.entity_type

        if etype == "FACULTY":
            name = data.get("full_name") or data.get("name") or data.get("Faculty Name") or "Faculty Member"
            email = (data.get("email") or data.get("Email") or f"fac_{uuid.uuid4().hex[:6]}@anits.edu.in").lower()
            designation = data.get("designation") or data.get("Designation") or "Assistant Professor"

            # Check if user exists
            u_res = await db.execute(select(User).where(User.email == email))
            user_obj = u_res.scalars().first()
            if not user_obj:
                user_obj = User(
                    id=str(uuid.uuid4()),
                    email=email,
                    hashed_password=default_hashed_pw,
                    full_name=name,
                    role="FACULTY",
                    department_id=dept_id,
                    is_active=True
                )
                db.add(user_obj)
                await db.flush()

            f_res = await db.execute(select(FacultyProfile).where(FacultyProfile.user_id == user_obj.id))
            prof = f_res.scalars().first()
            if not prof:
                prof = FacultyProfile(
                    id=str(uuid.uuid4()),
                    user_id=user_obj.id,
                    department_id=dept_id,
                    designation=designation,
                    max_weekly_workload=16
                )
                db.add(prof)
                await db.flush()
            committed_faculty += 1

        elif etype == "SUBJECT":
            code = (data.get("subject_code") or data.get("code") or f"SUB_{uuid.uuid4().hex[:4]}").upper()
            name = data.get("subject_name") or data.get("name") or code
            stype = (data.get("subject_type") or data.get("type") or "THEORY").upper()
            try:
                credits_val = int(data.get("credits") or 3)
            except ValueError:
                credits_val = 3
            
            # Department Subject Weekly Hours Rule
            raw_hours = data.get("weekly_hours") or data.get("lectures_per_week") or data.get("hours")
            try:
                weekly_hours = int(raw_hours) if raw_hours else (4 if stype == "THEORY" else 3)
            except ValueError:
                weekly_hours = 4

            s_res = await db.execute(select(Subject).where(Subject.code == code))
            subj = s_res.scalars().first()
            if not subj:
                subj = Subject(
                    id=str(uuid.uuid4()),
                    name=name,
                    code=code,
                    department_id=dept_id,
                    credits=credits_val,
                    subject_type=stype,
                    academic_year=int(data.get("academic_year") or 1)
                )
                db.add(subj)
                await db.flush()

            # Create / Update Subject Scheduling Rule for Subject Weekly Hours
            rule_res = await db.execute(select(SubjectSchedulingRule).where(SubjectSchedulingRule.subject_id == subj.id))
            sub_rule = rule_res.scalars().first()
            if not sub_rule:
                sub_rule = SubjectSchedulingRule(
                    id=str(uuid.uuid4()),
                    subject_id=subj.id,
                    lectures_per_week=weekly_hours if stype == "THEORY" else 0,
                    labs_per_week=1 if stype == "LAB" else 0,
                    lab_duration=3 if stype == "LAB" else 1
                )
                db.add(sub_rule)

            committed_subjects += 1

        elif etype == "SECTION":
            sec_name = (data.get("section_name") or data.get("section") or "SEC 1-A").upper()
            try:
                yr = int(data.get("academic_year") or sec_name.split()[1].split("-")[0] if "-" in sec_name else 1)
            except Exception:
                yr = 1

            sec_res = await db.execute(select(SectionConfig).where(SectionConfig.department_id == dept_id, SectionConfig.name == sec_name))
            sec_obj = sec_res.scalars().first()
            if not sec_obj:
                sec_obj = SectionConfig(
                    id=str(uuid.uuid4()),
                    department_id=dept_id,
                    academic_year=yr,
                    name=sec_name
                )
                db.add(sec_obj)
            committed_sections += 1

        elif etype == "CLASSROOM":
            r_number = (data.get("room_number") or data.get("room") or f"R-{uuid.uuid4().hex[:4]}").upper()
            rtype = (data.get("room_type") or data.get("type") or "THEORY").upper()
            
            r_res = await db.execute(select(Classroom).where(Classroom.room_number == r_number))
            room_obj = r_res.scalars().first()
            if not room_obj:
                room_obj = Classroom(
                    id=str(uuid.uuid4()),
                    department_id=dept_id,
                    room_number=r_number,
                    building_name=data.get("building_name") or "Main Block",
                    capacity=int(data.get("capacity") or 60),
                    room_type=rtype
                )
                db.add(room_obj)
            committed_rooms += 1

    # Update Import History status
    import_job.import_status = "CONFIRMED"
    import_job.successful_records = len(valid_records)
    await db.commit()

    return {
        "message": f"Successfully committed {len(valid_records)} records to production database.",
        "import_id": import_job.id,
        "committed_faculty": committed_faculty,
        "committed_subjects": committed_subjects,
        "committed_sections": committed_sections,
        "committed_rooms": committed_rooms,
        "import_status": "CONFIRMED"
    }

@router.get("/history", response_model=Dict[str, Any])
async def get_import_history(
    department_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve audit trail of past department imports."""
    user_dept_id = get_user_dept_id(current_user)
    
    query = select(ImportHistory).options(selectinload(ImportHistory.department), selectinload(ImportHistory.uploaded_by))
    if current_user.role not in ["ADMIN", "DEAN"]:
        query = query.where(ImportHistory.department_id == user_dept_id)
    elif department_id:
        query = query.where(ImportHistory.department_id == department_id)

    query = query.order_by(ImportHistory.upload_time.desc()).limit(50)
    res = await db.execute(query)
    history_items = res.scalars().all()

    return {
        "history": [
            {
                "id": h.id,
                "department_name": h.department.name if h.department else "N/A",
                "department_code": h.department.code if h.department else "N/A",
                "uploaded_by": h.uploaded_by.full_name if h.uploaded_by else "Admin",
                "file_name": h.file_name,
                "file_type": h.file_type,
                "upload_time": h.upload_time.isoformat(),
                "total_records": h.total_records,
                "successful_records": h.successful_records,
                "failed_records": h.failed_records,
                "warning_records": h.warning_records,
                "missing_fields_count": h.missing_fields_count,
                "import_status": h.import_status,
                "errors_preview": (h.validation_errors or [])[:5]
            }
            for h in history_items
        ]
    }
