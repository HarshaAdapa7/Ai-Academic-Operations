import io
import csv
import uuid
import json
from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, func, delete
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User
from app.models.faculty import Department, Subject, FacultyProfile, SectionConfig, faculty_subjects, section_mentors, section_subject_teachers
from app.models.classroom import Classroom
from app.models.timetable import SubjectSchedulingRule
from app.models.import_system import ImportHistory, ImportStagingRecord
from app.api.deps import get_current_user

router = APIRouter()

async def resolve_user_dept_id(user: User, db: AsyncSession) -> Optional[str]:
    """Helper to resolve the department ID for a user safely with multi-level fallback."""
    if hasattr(user, "department_id") and user.department_id:
        return user.department_id

    # Check FacultyProfile
    f_res = await db.execute(select(FacultyProfile.department_id).where(FacultyProfile.user_id == user.id))
    f_dept_id = f_res.scalars().first()
    if f_dept_id:
        return f_dept_id

    # Email Code Parsing Fallback (e.g. hod_csd@anits.edu.in -> CSD)
    if user.email:
        email_prefix = user.email.split("@")[0].lower()
        parts = email_prefix.split("_")
        possible_code = parts[1].upper() if len(parts) > 1 else parts[0].upper()
        
        d_res = await db.execute(select(Department).where(Department.code == possible_code))
        d_obj = d_res.scalars().first()
        if d_obj:
            return d_obj.id

    # Final Fallback to first department in system
    all_d_res = await db.execute(select(Department.id).limit(1))
    return all_d_res.scalars().first()

@router.get("/export-department-data")
async def export_department_data_endpoint(
    department_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Exports all live department database records (sections, subject assignments, faculty, classrooms, rules)
    into a single master 20-column CSV format using ultra-fast batch queries.
    """
    if department_id in [None, "", "null", "undefined"]:
        department_id = None

    user_dept_id = await resolve_user_dept_id(current_user, db)
    target_dept_id = department_id or user_dept_id

    dept_obj = None
    if target_dept_id:
        dept_res = await db.execute(select(Department).where(Department.id == target_dept_id))
        dept_obj = dept_res.scalars().first()

    if not dept_obj:
        csd_res = await db.execute(select(Department).where(Department.code == "CSD"))
        dept_obj = csd_res.scalars().first()
        if not dept_obj:
            all_dept_res = await db.execute(select(Department).limit(1))
            dept_obj = all_dept_res.scalars().first()
        target_dept_id = dept_obj.id if dept_obj else target_dept_id

    dept_code = dept_obj.code if dept_obj else "CSD"
    dept_name = dept_obj.name if dept_obj else "Computer Science & Data Science"

    sec_res = await db.execute(
        select(SectionConfig)
        .options(selectinload(SectionConfig.counseling_mentors).selectinload(FacultyProfile.user))
        .where(SectionConfig.department_id == target_dept_id)
    )
    sections = sec_res.scalars().all()
    sec_map = {s.id: s for s in sections}

    room_res = await db.execute(select(Classroom).where(Classroom.department_id == target_dept_id))
    rooms = room_res.scalars().all()
    room_map = {idx: r for idx, r in enumerate(rooms)}

    fac_res = await db.execute(
        select(FacultyProfile)
        .options(selectinload(FacultyProfile.user))
        .where(FacultyProfile.department_id == target_dept_id)
    )
    faculties = fac_res.scalars().all()
    fac_map = {f.id: f for f in faculties}

    subj_res = await db.execute(select(Subject).where(Subject.department_id == target_dept_id))
    subjects = subj_res.scalars().all()
    subj_map = {s.id: s for s in subjects}

    # BATCH QUERY 1: all SubjectSchedulingRule records
    rules_res = await db.execute(
        select(SubjectSchedulingRule)
        .where(SubjectSchedulingRule.subject_id.in_(list(subj_map.keys())))
    ) if subj_map else None
    rules_list = rules_res.scalars().all() if rules_res else []
    rule_map = {r.subject_id: r for r in rules_list}

    # BATCH QUERY 2: all section_subject_teachers links
    sst_res = await db.execute(
        select(section_subject_teachers.c.section_id, section_subject_teachers.c.subject_id, section_subject_teachers.c.faculty_id)
        .where(section_subject_teachers.c.section_id.in_(list(sec_map.keys())))
    ) if sec_map else None
    sst_links = sst_res.all() if sst_res else []

    output_rows = []

    for sec_id, subj_id, fac_id in sst_links:
        sec = sec_map.get(sec_id)
        s_obj = subj_map.get(subj_id)
        f_obj = fac_map.get(fac_id)

        if not sec or not s_obj or not f_obj or not f_obj.user:
            continue

        mentor_emails = [m.user.email for m in sec.counseling_mentors if m and m.user] if sec.counseling_mentors else []
        mentor_emails_str = ", ".join(mentor_emails)

        c_room = room_map.get(len(output_rows) % max(1, len(rooms))) if rooms else None
        rule_obj = rule_map.get(s_obj.id)
        is_ct = "TRUE" if sec.class_teacher_id == f_obj.id else "FALSE"

        output_rows.append({
            "Department": dept_code,
            "DepartmentName": dept_name,
            "AcademicYear": str(sec.academic_year),
            "SectionName": sec.name,
            "SubjectCode": s_obj.code,
            "SubjectName": s_obj.name,
            "SubjectType": s_obj.subject_type,
            "FacultyEmail": f_obj.user.email,
            "FacultyName": f_obj.user.full_name,
            "Designation": f_obj.designation or "Assistant Professor",
            "IsHOD": "TRUE" if f_obj.is_hod else "FALSE",
            "IsDean": "TRUE" if f_obj.is_dean else "FALSE",
            "IsClassTeacher": is_ct,
            "MentorEmail": mentor_emails_str,
            "RoomNumber": c_room.room_number if c_room else "I-501",
            "Capacity": str(c_room.capacity) if c_room else "60",
            "RoomType": c_room.room_type if c_room else "THEORY",
            "Lectures per week": str(rule_obj.lectures_per_week) if rule_obj else ("4" if s_obj.subject_type == "THEORY" else "0"),
            "Labs per week": str(rule_obj.labs_per_week) if rule_obj else ("1" if s_obj.subject_type == "LAB" else "0"),
            "Lab duration": str(rule_obj.lab_duration) if rule_obj else ("3" if s_obj.subject_type == "LAB" else "1")
        })

    # Fallback if no sst_links
    if not output_rows and faculties and subjects:
        for idx, s_obj in enumerate(subjects):
            f_obj = faculties[idx % len(faculties)]
            sec_obj = sections[idx % len(sections)] if sections else None
            c_room = rooms[idx % len(rooms)] if rooms else None
            if not f_obj.user:
                continue

            rule_obj = rule_map.get(s_obj.id)
            output_rows.append({
                "Department": dept_code,
                "DepartmentName": dept_name,
                "AcademicYear": str(sec_obj.academic_year if sec_obj else s_obj.academic_year),
                "SectionName": sec_obj.name if sec_obj else f"{dept_code} {s_obj.academic_year}-A",
                "SubjectCode": s_obj.code,
                "SubjectName": s_obj.name,
                "SubjectType": s_obj.subject_type,
                "FacultyEmail": f_obj.user.email,
                "FacultyName": f_obj.user.full_name,
                "Designation": f_obj.designation or "Assistant Professor",
                "IsHOD": "TRUE" if f_obj.is_hod else "FALSE",
                "IsDean": "TRUE" if f_obj.is_dean else "FALSE",
                "IsClassTeacher": "TRUE" if sec_obj and sec_obj.class_teacher_id == f_obj.id else "FALSE",
                "MentorEmail": f_obj.user.email,
                "RoomNumber": c_room.room_number if c_room else "I-501",
                "Capacity": str(c_room.capacity) if c_room else "60",
                "RoomType": c_room.room_type if c_room else "THEORY",
                "Lectures per week": str(rule_obj.lectures_per_week) if rule_obj else ("4" if s_obj.subject_type == "THEORY" else "0"),
                "Labs per week": str(rule_obj.labs_per_week) if rule_obj else ("1" if s_obj.subject_type == "LAB" else "0"),
                "Lab duration": str(rule_obj.lab_duration) if rule_obj else ("3" if s_obj.subject_type == "LAB" else "1")
            })

    headers = [
        "Department", "DepartmentName", "AcademicYear", "SectionName",
        "SubjectCode", "SubjectName", "SubjectType", "FacultyEmail",
        "FacultyName", "Designation", "IsHOD", "IsDean", "IsClassTeacher",
        "MentorEmail", "RoomNumber", "Capacity", "RoomType",
        "Lectures per week", "Labs per week", "Lab duration"
    ]
    
    from fastapi.responses import Response
    csv_io = io.StringIO()
    writer = csv.DictWriter(csv_io, fieldnames=headers)
    writer.writeheader()
    for row in output_rows:
        writer.writerow(row)

    csv_data = csv_io.getvalue()
    filename = f"{dept_code.lower()}_master_department_export.csv"

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )


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
    user_dept_id = await resolve_user_dept_id(current_user, db)
    
    # Security Check: Non-admin users are strictly locked to their assigned department
    if current_user.role not in ["ADMIN", "DEAN", "HOD"]:
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

    # Normalize headers of rows to lower/stripped keys for easy case-insensitive matching
    normalized_rows = []
    for row in raw_rows:
        norm = {}
        for k, v in row.items():
            if k:
                norm_key = k.strip().lower().replace("_", "").replace(" ", "")
                norm[norm_key] = str(v).strip() if v is not None else ""
        normalized_rows.append((row, norm))

    # Detect if the file is unified (has elements for all 4 entities)
    first_norm = normalized_rows[0][1]
    has_fac_name = any(x in first_norm for x in ["facultyname", "fullname", "name"])
    has_fac_email = any(x in first_norm for x in ["facultyemail", "email"])
    has_subj_code = any(x in first_norm for x in ["subjectcode", "code"])
    has_sec_name = any(x in first_norm for x in ["sectionname", "section"])
    has_room_number = any(x in first_norm for x in ["roomnumber", "room"])

    is_unified = has_fac_name and has_fac_email and has_subj_code and has_sec_name and has_room_number

    staged_records = []
    total_valid = 0
    total_failed = 0
    total_warnings = 0
    total_missing_fields = 0
    all_validation_errors = []

    seen_emails_in_file = set()
    seen_subjs_in_file = set()
    seen_secs_in_file = set()
    seen_rooms_in_file = set()

    row_num_counter = 1

    for idx, (orig_row, norm_row) in enumerate(normalized_rows, start=1):
        # Determine what entity types we can extract from this row
        row_entities = []
        if is_unified:
            row_entities = ["UNIFIED"]
        else:
            entity_type = "FACULTY"
            if any(k in norm_row for k in ["subjectcode", "subjectname", "code"]):
                if "designation" not in norm_row:
                    entity_type = "SUBJECT"
            elif any(k in norm_row for k in ["sectionname", "section"]):
                if "designation" not in norm_row and "subjectcode" not in norm_row:
                    entity_type = "SECTION"
            elif any(k in norm_row for k in ["roomnumber", "room"]):
                entity_type = "CLASSROOM"
            row_entities = [entity_type]

        for entity_type in row_entities:
            errors = []
            warnings = []
            missing_fields = []
            status_val = "VALID"
            
            clean_data = {}
            if entity_type == "UNIFIED":
                clean_data = orig_row
                name = norm_row.get("facultyname") or norm_row.get("fullname") or norm_row.get("name")
                email = norm_row.get("facultyemail") or norm_row.get("email")
                s_code = norm_row.get("subjectcode") or norm_row.get("code")
                sec_name = norm_row.get("sectionname") or norm_row.get("section")
                
                if not name:
                    missing_fields.append("FacultyName")
                if not email:
                    missing_fields.append("FacultyEmail")
                if not s_code:
                    missing_fields.append("SubjectCode")
                if not sec_name:
                    missing_fields.append("SectionName")

            elif entity_type == "FACULTY":
                name = norm_row.get("facultyname") or norm_row.get("fullname") or norm_row.get("name")
                email = norm_row.get("facultyemail") or norm_row.get("email")
                designation = norm_row.get("designation") or "Assistant Professor"
                
                clean_data = {
                    "full_name": name,
                    "email": email,
                    "designation": designation,
                    "is_hod": norm_row.get("ishod") or "FALSE",
                    "is_dean": norm_row.get("isdean") or "FALSE"
                }
                
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
                s_code = norm_row.get("subjectcode") or norm_row.get("code")
                s_name = norm_row.get("subjectname") or norm_row.get("name")
                s_type = (norm_row.get("subjecttype") or norm_row.get("type") or "THEORY").upper()
                raw_hours = norm_row.get("weeklyhours") or norm_row.get("lecturesperweek") or norm_row.get("hours")
                credits_val = norm_row.get("credits") or "3"
                acad_year = norm_row.get("academicyear") or "1"
                
                try:
                    weekly_hours = int(raw_hours) if raw_hours != "" and raw_hours is not None else (4 if s_type == "THEORY" else 3)
                except ValueError:
                    weekly_hours = 4
                    
                clean_data = {
                    "subject_code": s_code,
                    "subject_name": s_name,
                    "subject_type": s_type,
                    "weekly_hours": weekly_hours,
                    "credits": credits_val,
                    "academic_year": acad_year
                }

                if not s_code:
                    missing_fields.append("subject_code")
                    errors.append("Subject code is required.")
                if not s_name:
                    missing_fields.append("subject_name")
                    errors.append("Subject name is required.")

                if s_code and s_code.upper() in seen_subjs_in_file:
                    if is_unified:
                        warnings.append(f"Subject '{s_code}' already exists in staging. Profile will be updated.")
                    else:
                        errors.append(f"Duplicate subject code '{s_code}' within uploaded file.")
                elif s_code:
                    seen_subjs_in_file.add(s_code.upper())

                if s_type not in ["THEORY", "LAB", "ELECTIVE", "COUNSELLING", "SPORTS_LIBRARY"]:
                    warnings.append(f"Subject type '{s_type}' mapped to STANDARD THEORY.")

            elif entity_type == "SECTION":
                sec_name = norm_row.get("sectionname") or norm_row.get("section")
                acad_year = norm_row.get("academicyear") or "1"
                
                clean_data = {
                    "section_name": sec_name,
                    "academic_year": acad_year
                }
                
                if not sec_name:
                    missing_fields.append("section_name")
                    errors.append("Section name (e.g. CSE 3-A) is required.")
                elif sec_name.upper() in seen_secs_in_file:
                    if is_unified:
                        warnings.append(f"Section '{sec_name}' already exists in staging.")
                    else:
                        warnings.append(f"Duplicate section '{sec_name}' in file.")
                else:
                    seen_secs_in_file.add(sec_name.upper())

            elif entity_type == "CLASSROOM":
                room_no = norm_row.get("roomnumber") or norm_row.get("room")
                building = norm_row.get("buildingname") or "Main Block"
                capacity = norm_row.get("capacity") or "60"
                room_type = (norm_row.get("roomtype") or norm_row.get("type") or "THEORY").upper()
                
                clean_data = {
                    "room_number": room_no,
                    "building_name": building,
                    "capacity": capacity,
                    "room_type": room_type
                }

                if not room_no:
                    missing_fields.append("room_number")
                    errors.append("Classroom room_number is required.")
                elif room_no.upper() in seen_rooms_in_file:
                    if is_unified:
                        warnings.append(f"Room '{room_no}' already exists in staging.")
                    else:
                        warnings.append(f"Duplicate room '{room_no}' in file.")
                else:
                    seen_rooms_in_file.add(room_no.upper())

            # Determine Final Record Validation Status
            if errors:
                status_val = "INVALID"
                total_failed += 1
                all_validation_errors.append(f"Row {idx} [{entity_type}]: " + "; ".join(errors))
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
                row_number=row_num_counter,
                raw_data=clean_data,
                validation_status=status_val,
                missing_fields_list=missing_fields,
                error_messages=errors + warnings
            )
            staged_records.append(staging_rec)
            row_num_counter += 1

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

    user_dept_id = await resolve_user_dept_id(current_user, db)
    if current_user.role not in ["ADMIN", "DEAN", "HOD"] and user_dept_id != import_job.department_id:
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

    user_dept_id = await resolve_user_dept_id(current_user, db)
    if current_user.role not in ["ADMIN", "DEAN", "HOD"] and user_dept_id != record.department_id:
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

    user_dept_id = await resolve_user_dept_id(current_user, db)
    if current_user.role not in ["ADMIN", "DEAN", "HOD"] and user_dept_id != import_job.department_id:
        raise HTTPException(status_code=403, detail="Unauthorized confirmation of another department's data.")

    records_res = await db.execute(
        select(ImportStagingRecord)
        .where(
            ImportStagingRecord.import_history_id == import_id,
            ImportStagingRecord.validation_status.in_(["VALID", "VALIDATED", "WARNING"])
        )
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

    # Maps for post-processing links
    sec_class_teachers = {} # sec_name -> prof_id
    sec_mentors_map = {} # sec_name -> list of mentor emails

    for rec in valid_records:
        data = rec.raw_data or {}
        etype = rec.entity_type

        # Extract unified fields if available
        fac_email = (data.get("email") or data.get("FacultyEmail") or data.get("Email") or "").strip().lower()
        fac_name = (data.get("full_name") or data.get("name") or data.get("FacultyName") or "").strip()
        designation = (data.get("designation") or data.get("Designation") or "Assistant Professor").strip()
        
        subj_code = (data.get("subject_code") or data.get("code") or data.get("SubjectCode") or "").strip().upper()
        subj_name = (data.get("subject_name") or data.get("name") or data.get("SubjectName") or "").strip()
        subj_type = (data.get("subject_type") or data.get("type") or data.get("SubjectType") or "THEORY").strip().upper()
        acad_yr = int(data.get("academic_year") or data.get("AcademicYear") or 1)

        sec_name = (data.get("section_name") or data.get("section") or data.get("SectionName") or "").strip().upper()
        room_no = (data.get("room_number") or data.get("room") or data.get("RoomNumber") or "").strip().upper()

        is_class_teacher = str(data.get("is_class_teacher") or data.get("IsClassTeacher") or data.get("ClassTeacher") or "").strip().upper() in ["TRUE", "YES", "1", "Y", "CLASS TEACHER"]
        mentor_emails_str = str(data.get("mentor_emails") or data.get("MentorEmails") or data.get("MentorEmail") or "").strip()

        # 1. Process Faculty if email present
        prof_obj = None
        if fac_email:
            u_res = await db.execute(select(User).where(User.email == fac_email))
            user_obj = u_res.scalars().first()
            if not user_obj:
                user_obj = User(
                    id=str(uuid.uuid4()),
                    email=fac_email,
                    password_hash=default_hashed_pw,
                    full_name=fac_name or fac_email.split('@')[0].capitalize(),
                    role="FACULTY"
                )
                db.add(user_obj)
                await db.flush()
            elif fac_name:
                user_obj.full_name = fac_name

            f_res = await db.execute(select(FacultyProfile).where(FacultyProfile.user_id == user_obj.id))
            prof_obj = f_res.scalars().first()
            if not prof_obj:
                is_hod_val = str(data.get("is_hod") or data.get("IsHOD") or "FALSE").upper() == "TRUE"
                is_dean_val = str(data.get("is_dean") or data.get("IsDean") or "FALSE").upper() == "TRUE"
                prof_obj = FacultyProfile(
                    id=str(uuid.uuid4()),
                    user_id=user_obj.id,
                    department_id=dept_id,
                    designation=designation,
                    is_hod=is_hod_val,
                    is_dean=is_dean_val,
                    max_weekly_workload=16
                )
                db.add(prof_obj)
                await db.flush()
            else:
                prof_obj.designation = designation
                prof_obj.is_hod = str(data.get("is_hod") or data.get("IsHOD") or "FALSE").upper() == "TRUE"
                prof_obj.is_dean = str(data.get("is_dean") or data.get("IsDean") or "FALSE").upper() == "TRUE"
            committed_faculty += 1

        # 2. Process Subject if code present
        subj_obj = None
        if subj_code:
            effective_code = subj_code
            if subj_type == "LAB" and not effective_code.endswith("L") and not effective_code.endswith("_LAB") and not effective_code.endswith("LAB"):
                effective_code = f"{subj_code}L"

            s_res = await db.execute(select(Subject).where(Subject.code == effective_code))
            subj_obj = s_res.scalars().first()
            if not subj_obj:
                subj_obj = Subject(
                    id=str(uuid.uuid4()),
                    name=subj_name or effective_code,
                    code=effective_code,
                    department_id=dept_id,
                    credits=3 if subj_type == "THEORY" else 2,
                    subject_type=subj_type,
                    academic_year=acad_yr
                )
                db.add(subj_obj)
                await db.flush()

            # Create / Update Subject Scheduling Rule
            rule_res = await db.execute(select(SubjectSchedulingRule).where(SubjectSchedulingRule.subject_id == subj_obj.id))
            sub_rule = rule_res.scalars().first()
            if not sub_rule:
                sub_rule = SubjectSchedulingRule(
                    id=str(uuid.uuid4()),
                    subject_id=subj_obj.id,
                    lectures_per_week=4 if subj_type == "THEORY" else 0,
                    labs_per_week=1 if subj_type == "LAB" else 0,
                    lab_duration=3 if subj_type == "LAB" else 1
                )
                db.add(sub_rule)

            committed_subjects += 1

        # Link Faculty and Subject in faculty_subjects join table
        if prof_obj and subj_obj:
            # Check existing link
            link_stmt = select(faculty_subjects).where(
                faculty_subjects.c.faculty_id == prof_obj.id,
                faculty_subjects.c.subject_id == subj_obj.id
            )
            link_res = await db.execute(link_stmt)
            if not link_res.first():
                await db.execute(
                    faculty_subjects.insert().values(
                        faculty_id=prof_obj.id,
                        subject_id=subj_obj.id
                    )
                )

        # 3. Process Section if name present
        if sec_name:
            sec_res = await db.execute(select(SectionConfig).options(selectinload(SectionConfig.counseling_mentors)).where(SectionConfig.department_id == dept_id, SectionConfig.name == sec_name))
            sec_obj = sec_res.scalars().first()
            if not sec_obj:
                sec_obj = SectionConfig(
                    id=str(uuid.uuid4()),
                    department_id=dept_id,
                    academic_year=acad_yr,
                    name=sec_name
                )
                db.add(sec_obj)
                await db.flush()

            if is_class_teacher and prof_obj:
                sec_obj.class_teacher_id = prof_obj.id

            # Automatic mentor assignment (MentorEmail or row FacultyProfile fallback)
            m_target_profs = []
            if mentor_emails_str:
                m_emails = [m.strip().lower() for m in mentor_emails_str.replace('"', '').split(',') if m.strip()]
                for m_email in m_emails:
                    m_u_res = await db.execute(select(User).where(User.email == m_email))
                    m_u = m_u_res.scalars().first()
                    if m_u:
                        m_f_res = await db.execute(select(FacultyProfile).where(FacultyProfile.user_id == m_u.id))
                        m_p = m_f_res.scalars().first()
                        if m_p:
                            m_target_profs.append(m_p)

            if not m_target_profs and prof_obj:
                m_target_profs.append(prof_obj)

            for m_p in m_target_profs:
                sm_stmt = select(section_mentors).where(
                    section_mentors.c.section_id == sec_obj.id,
                    section_mentors.c.faculty_id == m_p.id
                )
                sm_res = await db.execute(sm_stmt)
                if not sm_res.first():
                    await db.execute(
                        section_mentors.insert().values(
                            section_id=sec_obj.id,
                            faculty_id=m_p.id
                        )
                    )

            # Automatic Section-Subject-Teacher assignment
            if subj_obj and prof_obj:
                sst_stmt = select(section_subject_teachers).where(
                    section_subject_teachers.c.section_id == sec_obj.id,
                    section_subject_teachers.c.subject_id == subj_obj.id,
                    section_subject_teachers.c.faculty_id == prof_obj.id
                )
                sst_res = await db.execute(sst_stmt)
                if not sst_res.first():
                    await db.execute(
                        section_subject_teachers.insert().values(
                            section_id=sec_obj.id,
                            subject_id=subj_obj.id,
                            faculty_id=prof_obj.id
                        )
                    )

            committed_sections += 1

        # 4. Process Classroom if room_no present
        if room_no:
            rtype = (data.get("room_type") or data.get("type") or data.get("RoomType") or "THEORY").strip().upper()
            cap = int(data.get("capacity") or data.get("Capacity") or 60)
            
            r_res = await db.execute(select(Classroom).where(Classroom.room_number == room_no))
            room_obj = r_res.scalars().first()
            if not room_obj:
                room_obj = Classroom(
                    id=str(uuid.uuid4()),
                    department_id=dept_id,
                    room_number=room_no,
                    capacity=cap,
                    room_type=rtype
                )
                db.add(room_obj)
            committed_rooms += 1

    # Post-Processing Pass: Guarantee class_teacher_id for ALL section_configs in department
    sec_all = (await db.execute(select(SectionConfig).where(SectionConfig.department_id == dept_id))).scalars().all()
    for sec in sec_all:
        if not sec.class_teacher_id:
            sst_res = await db.execute(select(section_subject_teachers.c.faculty_id).where(section_subject_teachers.c.section_id == sec.id))
            first_fac_id = sst_res.scalar()
            if first_fac_id:
                sec.class_teacher_id = first_fac_id
            else:
                fac_res = await db.execute(select(FacultyProfile.id).where(FacultyProfile.department_id == dept_id))
                any_fac_id = fac_res.scalar()
                if any_fac_id:
                    sec.class_teacher_id = any_fac_id

    # Update Import History status
    import_job.import_status = "CONFIRMED"
    import_job.successful_records = len(valid_records)
    await db.commit()

    return {
        "message": f"Successfully committed {len(valid_records)} records to production database with full subject-faculty and mentor relationships.",
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
    user_dept_id = await resolve_user_dept_id(current_user, db)
    
    query = select(ImportHistory).options(selectinload(ImportHistory.department), selectinload(ImportHistory.uploaded_by))
    if current_user.role not in ["ADMIN", "DEAN", "HOD"]:
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

@router.post("/clear-department-data")
async def clear_department_data_endpoint(
    department_id: Optional[str] = Body(None, embed=True),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Clears all section configs, subjects, classrooms, scheduling rules, 
    and faculty users for the target department to prepare for a fresh semester data import.
    Preserves HOD & Admin logins.
    """
    user_dept_id = await resolve_user_dept_id(current_user, db)
    target_dept_id = department_id or user_dept_id

    if current_user.role not in ["ADMIN", "DEAN", "HOD"] and user_dept_id != target_dept_id:
        raise HTTPException(status_code=403, detail="Unauthorized to clear data for another department.")

    if not target_dept_id:
        raise HTTPException(status_code=400, detail="Department ID is required.")

    # 1. Delete SectionConfigs
    sec_res = await db.execute(select(SectionConfig).where(SectionConfig.department_id == target_dept_id))
    sections = sec_res.scalars().all()
    sec_ids = [s.id for s in sections]

    if sec_ids:
        await db.execute(delete(section_subject_teachers).where(section_subject_teachers.c.section_id.in_(sec_ids)))
        await db.execute(delete(section_mentors).where(section_mentors.c.section_id.in_(sec_ids)))

    await db.execute(delete(SectionConfig).where(SectionConfig.department_id == target_dept_id))

    # 2. Delete Subjects & Rules
    subj_res = await db.execute(select(Subject).where(Subject.department_id == target_dept_id))
    subjects = subj_res.scalars().all()
    subj_ids = [s.id for s in subjects]

    if subj_ids:
        await db.execute(delete(SubjectSchedulingRule).where(SubjectSchedulingRule.subject_id.in_(subj_ids)))
        await db.execute(delete(faculty_subjects).where(faculty_subjects.c.subject_id.in_(subj_ids)))

    await db.execute(delete(Subject).where(Subject.department_id == target_dept_id))

    # 3. Delete Classrooms
    await db.execute(delete(Classroom).where(Classroom.department_id == target_dept_id))

    # 4. Delete non-HOD/non-Admin Faculty User Accounts & Profiles
    fac_res = await db.execute(select(FacultyProfile).where(FacultyProfile.department_id == target_dept_id))
    fac_profiles = fac_res.scalars().all()

    deleted_users_count = 0
    for prof in fac_profiles:
        if prof.is_hod or prof.is_dean:
            continue
        u_id = prof.user_id
        await db.execute(delete(FacultyProfile).where(FacultyProfile.id == prof.id))
        if u_id:
            await db.execute(delete(User).where(User.id == u_id, User.role == "FACULTY"))
            deleted_users_count += 1

    await db.commit()

    return {
        "message": f"Successfully cleared all semester data for department.",
        "deleted_sections": len(sections),
        "deleted_subjects": len(subjects),
        "deleted_faculty_users": deleted_users_count
    }
