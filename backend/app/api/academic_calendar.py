import csv
import io
import re
from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, or_
from sqlalchemy.orm import selectinload

from app.services.academic_calendar_import_engine import AcademicCalendarImportEngine

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.academic_calendar import AcademicCalendar, AcademicHoliday
from app.schemas.academic_calendar import (
    AcademicCalendarCreate,
    AcademicCalendarUpdate,
    AcademicCalendarResponse,
    AcademicHolidayCreate,
    AcademicHolidayUpdate,
    AcademicHolidayResponse
)

def parse_date_str(val: Optional[str]) -> Optional[date]:
    if not val or str(val).strip().lower() in ["none", "null", "n/a", ""]:
        return None
    val_str = str(val).strip()
    formats = [
        "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y",
        "%Y/%m/%d", "%d.%m.%Y", "%b %d, %Y", "%d %b %Y"
    ]
    for fmt in formats:
        try:
            return datetime.strptime(val_str, fmt).date()
        except ValueError:
            continue
    return None

router = APIRouter(prefix="/academic-calendar", tags=["Academic Calendar"])

@router.get("/active", response_model=Optional[AcademicCalendarResponse])
async def get_active_academic_calendar(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve the currently active operational academic calendar for the institution."""
    stmt = (
        select(AcademicCalendar)
        .options(selectinload(AcademicCalendar.holidays))
        .where(AcademicCalendar.is_active == True)
        .order_by(AcademicCalendar.updated_at.desc())
    )
    result = await db.execute(stmt)
    active_cal = result.scalars().first()
    if not active_cal:
        stmt_latest = (
            select(AcademicCalendar)
            .options(selectinload(AcademicCalendar.holidays))
            .order_by(AcademicCalendar.academic_year.desc(), AcademicCalendar.created_at.desc())
        )
        result_latest = await db.execute(stmt_latest)
        active_cal = result_latest.scalars().first()
    return active_cal

@router.get("", response_model=List[AcademicCalendarResponse])
async def list_academic_calendars(
    academic_year: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve all academic calendars, optionally filtered by academic year."""
    stmt = (
        select(AcademicCalendar)
        .options(selectinload(AcademicCalendar.holidays))
        .order_by(
            AcademicCalendar.academic_year.desc(),
            AcademicCalendar.created_at.desc()
        )
    )
    if academic_year:
        ay_hyphen = academic_year.replace("–", "-").replace("—", "-").strip()
        ay_endash = academic_year.replace("-", "–").strip()
        stmt = stmt.where(
            or_(
                AcademicCalendar.academic_year == academic_year,
                AcademicCalendar.academic_year == ay_hyphen,
                AcademicCalendar.academic_year == ay_endash
            )
        )
    
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("", response_model=AcademicCalendarResponse, status_code=status.HTTP_201_CREATED)
async def create_academic_calendar(
    calendar_in: AcademicCalendarCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new Academic Calendar configuration (Admin / HOD / Dean)."""
    if current_user.role not in ["ADMIN", "HOD", "DEAN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrators, HODs, or Deans can configure Academic Calendars."
        )

    ay_hyphen = calendar_in.academic_year.replace("–", "-").replace("—", "-").strip()
    ay_endash = calendar_in.academic_year.replace("-", "–").strip()
    # Check if a calendar with the same academic_year and semester already exists
    stmt_check = select(AcademicCalendar).where(
        or_(
            AcademicCalendar.academic_year == calendar_in.academic_year,
            AcademicCalendar.academic_year == ay_hyphen,
            AcademicCalendar.academic_year == ay_endash
        ),
        AcademicCalendar.semester == calendar_in.semester
    )
    res_check = await db.execute(stmt_check)
    existing_cal = res_check.scalars().first()

    # If new calendar is marked as active, deactivate other calendars first
    if calendar_in.is_active:
        await db.execute(
            update(AcademicCalendar).values(is_active=False)
        )

    if existing_cal:
        calendar_data = calendar_in.model_dump(exclude_unset=True)
        for k, v in calendar_data.items():
            setattr(existing_cal, k, v)
        await db.commit()
        await db.refresh(existing_cal)
        return existing_cal

    calendar_data = calendar_in.model_dump()
    new_calendar = AcademicCalendar(**calendar_data)
    
    db.add(new_calendar)
    await db.commit()
    await db.refresh(new_calendar)
    return new_calendar

@router.put("/{calendar_id}", response_model=AcademicCalendarResponse)
async def update_academic_calendar(
    calendar_id: str,
    calendar_in: AcademicCalendarUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update an existing Academic Calendar configuration."""
    if current_user.role not in ["ADMIN", "HOD", "DEAN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrators, HODs, or Deans can update Academic Calendars."
        )

    stmt = select(AcademicCalendar).where(AcademicCalendar.id == calendar_id)
    result = await db.execute(stmt)
    calendar_obj = result.scalars().first()

    if not calendar_obj:
        raise HTTPException(status_code=404, detail="Academic Calendar configuration record not found.")

    update_data = calendar_in.model_dump(exclude_unset=True)

    if update_data.get("is_active") is True:
        await db.execute(
            update(AcademicCalendar).where(AcademicCalendar.id != calendar_id).values(is_active=False)
        )

    for field, val in update_data.items():
        setattr(calendar_obj, field, val)

    await db.commit()
    await db.refresh(calendar_obj)
    return calendar_obj

@router.put("/{calendar_id}/set-active", response_model=AcademicCalendarResponse)
async def set_active_academic_calendar(
    calendar_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Set specified Academic Calendar as the active operational calendar."""
    if current_user.role not in ["ADMIN", "HOD", "DEAN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrators, HODs, or Deans can activate Academic Calendars."
        )

    stmt = select(AcademicCalendar).where(AcademicCalendar.id == calendar_id)
    result = await db.execute(stmt)
    calendar_obj = result.scalars().first()

    if not calendar_obj:
        raise HTTPException(status_code=404, detail="Academic Calendar configuration record not found.")

    # Deactivate all others
    await db.execute(
        update(AcademicCalendar).values(is_active=False)
    )

    calendar_obj.is_active = True
    await db.commit()
    await db.refresh(calendar_obj)
    return calendar_obj

@router.delete("/clear-all", status_code=status.HTTP_200_OK)
async def clear_all_academic_calendars(
    academic_year: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete all academic calendar schedule records, optionally filtered by academic year."""
    if current_user.role not in ["ADMIN", "HOD", "DEAN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrators, HODs, or Deans can clear Academic Calendar schedules."
        )

    stmt = select(AcademicCalendar)
    if academic_year and academic_year.strip().upper() != "ALL":
        yr_digits = re.findall(r'\d{4}', academic_year)
        ay_hyphen = academic_year.replace("–", "-").replace("—", "-").strip()
        ay_endash = academic_year.replace("-", "–").strip()

        conditions = [
            AcademicCalendar.academic_year == academic_year,
            AcademicCalendar.academic_year == ay_hyphen,
            AcademicCalendar.academic_year == ay_endash,
            AcademicCalendar.academic_year == None,
            AcademicCalendar.academic_year == ""
        ]
        if len(yr_digits) >= 2:
            y1, y2 = yr_digits[0], yr_digits[1]
            conditions.append(AcademicCalendar.academic_year.like(f"%{y1}%{y2}%"))
            conditions.append(AcademicCalendar.academic_year.like(f"%{y1}%{y2[-2:]}%"))
        elif len(yr_digits) == 1:
            y1 = yr_digits[0]
            conditions.append(AcademicCalendar.academic_year.like(f"%{y1}%"))

        stmt = stmt.where(or_(*conditions))

    result = await db.execute(stmt)
    calendars_to_delete = result.scalars().all()
    count = len(calendars_to_delete)

    for cal in calendars_to_delete:
        await db.delete(cal)

    await db.commit()
    return {"message": f"Successfully deleted {count} academic calendar schedule entry/entries.", "deleted_count": count}

@router.delete("/{calendar_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_academic_calendar(
    calendar_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete an Academic Calendar configuration."""
    if current_user.role not in ["ADMIN", "HOD", "DEAN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrators, HODs, or Deans can delete Academic Calendars."
        )

    stmt = select(AcademicCalendar).where(AcademicCalendar.id == calendar_id)
    result = await db.execute(stmt)
    calendar_obj = result.scalars().first()

    if not calendar_obj:
        raise HTTPException(status_code=404, detail="Academic Calendar not found.")

    await db.delete(calendar_obj)
    await db.commit()
    return None

def map_header(h: str) -> str:
    h_clean = h.strip().lower().replace(" ", "_").replace("-", "_")
    mapping = {
        "academic_year": "academic_year",
        "academic_year_designation": "academic_year",
        "academicyear": "academic_year",
        "semester": "semester",
        "semester_designation": "semester",
        "semester_start_date": "semester_start_date",
        "semester_start": "semester_start_date",
        "start_date": "semester_start_date",
        "semester_end_date": "semester_end_date",
        "semester_end": "semester_end_date",
        "end_date": "semester_end_date",
        "orientation_start_date": "orientation_start_date",
        "orientation_start": "orientation_start_date",
        "orientation_end_date": "orientation_end_date",
        "orientation_end": "orientation_end_date",
        "class_commencement_date": "class_commencement_date",
        "class_commencement": "class_commencement_date",
        "classes_start": "class_commencement_date",
        "commencement_date": "class_commencement_date",
        "mid1_start_date": "mid1_start_date",
        "mid1_start": "mid1_start_date",
        "mid_1_start": "mid1_start_date",
        "mid1_end_date": "mid1_end_date",
        "mid1_end": "mid1_end_date",
        "mid_1_end": "mid1_end_date",
        "mid2_start_date": "mid2_start_date",
        "mid2_start": "mid2_start_date",
        "mid_2_start": "mid2_start_date",
        "mid2_end_date": "mid2_end_date",
        "mid2_end": "mid2_end_date",
        "mid_2_end": "mid2_end_date",
        "practical_exam_start_date": "practical_exam_start_date",
        "practical_exam_start": "practical_exam_start_date",
        "external_exam_start_date": "practical_exam_start_date",
        "external_exam_start": "practical_exam_start_date",
        "external_exams_start": "practical_exam_start_date",
        "external_examination_start": "practical_exam_start_date",
        "practical_exam_end_date": "practical_exam_end_date",
        "practical_exam_end": "practical_exam_end_date",
        "external_exam_end_date": "practical_exam_end_date",
        "external_exam_end": "practical_exam_end_date",
        "external_exams_end": "practical_exam_end_date",
        "external_examination_end": "practical_exam_end_date",
        "end_sem_exam_start_date": "end_sem_exam_start_date",
        "end_sem_exam_start": "end_sem_exam_start_date",
        "end_sem_exam_end_date": "end_sem_exam_end_date",
        "end_sem_exam_end": "end_sem_exam_end_date",
        "result_declaration_date": "result_declaration_date",
        "result_declaration": "result_declaration_date",
        "semester_closing_date": "semester_closing_date",
        "semester_closing": "semester_closing_date",
        "closing_date": "semester_closing_date",
        "is_active": "is_active",
        "active": "is_active"
    }
    return mapping.get(h_clean, h_clean)

def parse_bool(val: Optional[str]) -> bool:
    if not val:
        return False
    val_str = str(val).strip().lower()
    return val_str in ["true", "1", "yes", "y", "t"]

@router.post("/import-engine")
async def run_academic_calendar_import_engine(
    file: UploadFile = File(...),
    preview: bool = Query(False),
    calendar_id: Optional[str] = Query(None),
    import_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Dedicated Academic Calendar Import Engine.
    Exclusively handles header auto-mapping, multi-format date parsing, preview validation,
    and database commits strictly for Academic Calendar Schedules & Events.
    Does NOT touch or use any other system import engine.
    """
    if current_user.role not in ["ADMIN", "HOD", "DEAN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrators, HODs, or Deans can run the Academic Calendar Import Engine."
        )

    try:
        content = await file.read()
        raw_rows = AcademicCalendarImportEngine.parse_file_bytes(content, file.filename or "upload.csv")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error parsing file in Academic Calendar Import Engine: {str(e)}"
        )

    if preview:
        return AcademicCalendarImportEngine.preview_import(raw_rows, target_type=import_type, filename=file.filename)

    try:
        result = await AcademicCalendarImportEngine.execute_import(
            db=db,
            raw_rows=raw_rows,
            calendar_id=calendar_id,
            target_type=import_type,
            filename=file.filename
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Academic Calendar Import Engine error: {str(e)}"
        )

@router.post("/upload")
async def upload_academic_calendar_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload academic calendar entries via CSV/Excel using dedicated Academic Calendar Import Engine."""
    if current_user.role not in ["ADMIN", "HOD", "DEAN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrators, HODs, or Deans can upload Academic Calendars."
        )
    
    try:
        content = await file.read()
        raw_rows = AcademicCalendarImportEngine.parse_file_bytes(content, file.filename or "upload.csv")
        return await AcademicCalendarImportEngine.execute_import(db=db, raw_rows=raw_rows)
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))


# ==========================================
# Dedicated Holidays Database Endpoints
# ==========================================

@router.get("/holidays/list", response_model=List[AcademicHolidayResponse])
async def list_academic_holidays(
    academic_year: Optional[str] = None,
    calendar_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieve all official holidays and campus occasions stored in dedicated academic_holidays DB."""
    stmt = select(AcademicHoliday).order_by(AcademicHoliday.date.asc())
    if academic_year:
        ay_hyphen = academic_year.replace("–", "-").replace("—", "-").strip()
        ay_endash = academic_year.replace("-", "–").strip()
        stmt = stmt.where(
            or_(
                AcademicHoliday.academic_year == academic_year,
                AcademicHoliday.academic_year == ay_hyphen,
                AcademicHoliday.academic_year == ay_endash
            )
        )
    if calendar_id:
        stmt = stmt.where(AcademicHoliday.calendar_id == calendar_id)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/holidays", response_model=AcademicHolidayResponse, status_code=status.HTTP_201_CREATED)
async def create_academic_holiday(
    holiday_in: AcademicHolidayCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new holiday entry in the dedicated academic_holidays database table."""
    if current_user.role not in ["ADMIN", "HOD", "DEAN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrators, HODs, or Deans can manage academic holidays."
        )

    new_holiday = AcademicHoliday(**holiday_in.model_dump())
    db.add(new_holiday)
    await db.commit()
    await db.refresh(new_holiday)
    return new_holiday

@router.put("/holidays/{holiday_id}", response_model=AcademicHolidayResponse)
async def update_academic_holiday(
    holiday_id: str,
    holiday_in: AcademicHolidayUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update an existing holiday in academic_holidays database table."""
    if current_user.role not in ["ADMIN", "HOD", "DEAN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrators, HODs, or Deans can edit academic holidays."
        )

    stmt = select(AcademicHoliday).where(AcademicHoliday.id == holiday_id)
    result = await db.execute(stmt)
    holiday_obj = result.scalars().first()

    if not holiday_obj:
        raise HTTPException(status_code=404, detail="Holiday record not found.")

    update_data = holiday_in.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(holiday_obj, field, val)

    await db.commit()
    await db.refresh(holiday_obj)
    return holiday_obj

@router.delete("/holidays/clear-all")
async def clear_all_academic_holidays(
    academic_year: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Clear/delete all holiday records from academic_holidays database table."""
    if current_user.role not in ["ADMIN", "HOD", "DEAN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrators, HODs, or Deans can clear academic holidays."
        )

    stmt = select(AcademicHoliday)
    if academic_year and academic_year.strip().upper() != "ALL":
        yr_digits = re.findall(r'\d{4}', academic_year)
        ay_hyphen = academic_year.replace("–", "-").replace("—", "-").strip()
        ay_endash = academic_year.replace("-", "–").strip()

        conditions = [
            AcademicHoliday.academic_year == academic_year,
            AcademicHoliday.academic_year == ay_hyphen,
            AcademicHoliday.academic_year == ay_endash,
            AcademicHoliday.academic_year == None,
            AcademicHoliday.academic_year == ""
        ]
        if len(yr_digits) >= 2:
            y1, y2 = yr_digits[0], yr_digits[1]
            conditions.append(AcademicHoliday.academic_year.like(f"%{y1}%{y2}%"))
            conditions.append(AcademicHoliday.academic_year.like(f"%{y1}%{y2[-2:]}%"))
        elif len(yr_digits) == 1:
            y1 = yr_digits[0]
            conditions.append(AcademicHoliday.academic_year.like(f"%{y1}%"))

        stmt = stmt.where(or_(*conditions))

    res = await db.execute(stmt)
    holidays_to_delete = res.scalars().all()
    count = len(holidays_to_delete)

    for h in holidays_to_delete:
        await db.delete(h)

    await db.commit()
    return {"message": f"Successfully deleted {count} holiday record(s) from database.", "deleted_count": count}

@router.delete("/holidays/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_academic_holiday(
    holiday_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a holiday from academic_holidays database table."""
    if current_user.role not in ["ADMIN", "HOD", "DEAN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrators, HODs, or Deans can delete academic holidays."
        )

    stmt = select(AcademicHoliday).where(AcademicHoliday.id == holiday_id)
    result = await db.execute(stmt)
    holiday_obj = result.scalars().first()

    if not holiday_obj:
        raise HTTPException(status_code=404, detail="Holiday record not found.")

    await db.delete(holiday_obj)
    await db.commit()
    return None

@router.post("/holidays/upload")
async def upload_holidays_csv(
    file: UploadFile = File(...),
    calendar_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload CSV/Excel file directly into dedicated Academic Holidays database table."""
    if current_user.role not in ["ADMIN", "HOD", "DEAN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrators, HODs, or Deans can upload holidays."
        )

    try:
        content = await file.read()
        raw_rows = AcademicCalendarImportEngine.parse_file_bytes(content, file.filename or "holidays.csv")
        return await AcademicCalendarImportEngine.execute_import(db=db, raw_rows=raw_rows, calendar_id=calendar_id, target_type="HOLIDAYS_DB")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Holidays upload error: {str(e)}"
        )


