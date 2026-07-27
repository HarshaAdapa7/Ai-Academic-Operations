import csv
import io
from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.academic_calendar import AcademicCalendar, AcademicCalendarEvent
from app.schemas.academic_calendar import (
    AcademicCalendarCreate,
    AcademicCalendarUpdate,
    AcademicCalendarResponse,
    AcademicCalendarEventCreate,
    AcademicCalendarEventUpdate,
    AcademicCalendarEventResponse
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
        .options(selectinload(AcademicCalendar.events))
        .where(AcademicCalendar.is_active == True)
        .order_by(AcademicCalendar.updated_at.desc())
    )
    result = await db.execute(stmt)
    active_cal = result.scalars().first()
    if not active_cal:
        stmt_latest = (
            select(AcademicCalendar)
            .options(selectinload(AcademicCalendar.events))
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
        .options(selectinload(AcademicCalendar.events))
        .order_by(
            AcademicCalendar.academic_year.desc(),
            AcademicCalendar.created_at.desc()
        )
    )
    if academic_year:
        stmt = stmt.where(AcademicCalendar.academic_year == academic_year)
    
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

    # If new calendar is marked as active, deactivate other calendars first
    if calendar_in.is_active:
        await db.execute(
            update(AcademicCalendar).values(is_active=False)
        )

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
        raise HTTPException(status_code=404, detail="Academic Calendar not found.")

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
        raise HTTPException(status_code=404, detail="Academic Calendar not found.")

    # Deactivate all others
    await db.execute(
        update(AcademicCalendar).values(is_active=False)
    )

    calendar_obj.is_active = True
    await db.commit()
    await db.refresh(calendar_obj)
    return calendar_obj

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
        "practical_exam_end_date": "practical_exam_end_date",
        "practical_exam_end": "practical_exam_end_date",
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

@router.post("/upload")
async def upload_academic_calendar_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload academic calendar entries via CSV file."""
    if current_user.role not in ["ADMIN", "HOD", "DEAN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrators, HODs, or Deans can upload Academic Calendars."
        )
    
    try:
        contents = await file.read()
        decoded = contents.decode("utf-8-sig")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not read or decode CSV file: {str(e)}"
        )
    
    try:
        csv_file = io.StringIO(decoded)
        reader = csv.reader(csv_file)
        headers = next(reader, None)
        if not headers:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The uploaded CSV file is empty."
            )
        
        mapped_headers = [map_header(h) for h in headers]
        
        required_cols = [
            "academic_year", "semester", "semester_start_date",
            "semester_end_date", "class_commencement_date", "semester_closing_date"
        ]
        missing_cols = [col for col in required_cols if col not in mapped_headers]
        if missing_cols:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing required CSV columns: {', '.join(missing_cols)}"
            )
        
        imported_count = 0
        has_active_imported = False
        rows_to_process = []
        
        for row_idx, row in enumerate(reader, start=2):
            if not row or all(not str(val).strip() for val in row):
                continue
            
            row_dict = {}
            for col_idx, header in enumerate(mapped_headers):
                if col_idx < len(row):
                    row_dict[header] = row[col_idx].strip()
                else:
                    row_dict[header] = None
            
            academic_year = row_dict.get("academic_year")
            semester = row_dict.get("semester")
            
            if not academic_year or not semester:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Row {row_idx}: academic_year and semester cannot be empty."
                )
            
            parsed_dates = {}
            date_cols = [
                "semester_start_date", "semester_end_date", "orientation_start_date",
                "orientation_end_date", "class_commencement_date", "mid1_start_date",
                "mid1_end_date", "mid2_start_date", "mid2_end_date",
                "practical_exam_start_date", "practical_exam_end_date",
                "end_sem_exam_start_date", "end_sem_exam_end_date",
                "result_declaration_date", "semester_closing_date"
            ]
            
            for col in date_cols:
                if col in row_dict:
                    val = row_dict[col]
                    parsed_date = parse_date_str(val)
                    if col in ["semester_start_date", "semester_end_date", "class_commencement_date", "semester_closing_date"] and not parsed_date:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Row {row_idx}: Column '{col}' is required and must be a valid date."
                        )
                    parsed_dates[col] = parsed_date
                else:
                    parsed_dates[col] = None
            
            is_active = parse_bool(row_dict.get("is_active"))
            if is_active:
                has_active_imported = True
                
            rows_to_process.append({
                "academic_year": academic_year,
                "semester": semester,
                "dates": parsed_dates,
                "is_active": is_active
            })
            
        if has_active_imported:
            await db.execute(update(AcademicCalendar).values(is_active=False))
            
        for r in rows_to_process:
            stmt = select(AcademicCalendar).where(
                AcademicCalendar.academic_year == r["academic_year"],
                AcademicCalendar.semester == r["semester"]
            )
            res = await db.execute(stmt)
            calendar_obj = res.scalars().first()
            
            if calendar_obj:
                calendar_obj.semester_start_date = r["dates"]["semester_start_date"]
                calendar_obj.semester_end_date = r["dates"]["semester_end_date"]
                calendar_obj.orientation_start_date = r["dates"].get("orientation_start_date")
                calendar_obj.orientation_end_date = r["dates"].get("orientation_end_date")
                calendar_obj.class_commencement_date = r["dates"]["class_commencement_date"]
                calendar_obj.mid1_start_date = r["dates"].get("mid1_start_date")
                calendar_obj.mid1_end_date = r["dates"].get("mid1_end_date")
                calendar_obj.mid2_start_date = r["dates"].get("mid2_start_date")
                calendar_obj.mid2_end_date = r["dates"].get("mid2_end_date")
                calendar_obj.practical_exam_start_date = r["dates"].get("practical_exam_start_date")
                calendar_obj.practical_exam_end_date = r["dates"].get("practical_exam_end_date")
                calendar_obj.end_sem_exam_start_date = r["dates"].get("end_sem_exam_start_date")
                calendar_obj.end_sem_exam_end_date = r["dates"].get("end_sem_exam_end_date")
                calendar_obj.result_declaration_date = r["dates"].get("result_declaration_date")
                calendar_obj.semester_closing_date = r["dates"]["semester_closing_date"]
                calendar_obj.is_active = r["is_active"]
            else:
                new_cal = AcademicCalendar(
                    academic_year=r["academic_year"],
                    semester=r["semester"],
                    semester_start_date=r["dates"]["semester_start_date"],
                    semester_end_date=r["dates"]["semester_end_date"],
                    orientation_start_date=r["dates"].get("orientation_start_date"),
                    orientation_end_date=r["dates"].get("orientation_end_date"),
                    class_commencement_date=r["dates"]["class_commencement_date"],
                    mid1_start_date=r["dates"].get("mid1_start_date"),
                    mid1_end_date=r["dates"].get("mid1_end_date"),
                    mid2_start_date=r["dates"].get("mid2_start_date"),
                    mid2_end_date=r["dates"].get("mid2_end_date"),
                    practical_exam_start_date=r["dates"].get("practical_exam_start_date"),
                    practical_exam_end_date=r["dates"].get("practical_exam_end_date"),
                    end_sem_exam_start_date=r["dates"].get("end_sem_exam_start_date"),
                    end_sem_exam_end_date=r["dates"].get("end_sem_exam_end_date"),
                    result_declaration_date=r["dates"].get("result_declaration_date"),
                    semester_closing_date=r["dates"]["semester_closing_date"],
                    is_active=r["is_active"]
                )
                db.add(new_cal)
            imported_count += 1
            
        await db.commit()
        return {"message": f"Successfully imported {imported_count} academic calendar entries.", "imported_count": imported_count}
        
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"An error occurred while processing CSV data: {str(e)}"
        )


# ==========================================
# Academic Calendar Events / Holidays Endpoints
# ==========================================

@router.get("/{calendar_id}/events", response_model=List[AcademicCalendarEventResponse])
async def list_calendar_events(
    calendar_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all public holidays and campus occasions for a given academic calendar."""
    stmt = select(AcademicCalendarEvent).where(
        AcademicCalendarEvent.calendar_id == calendar_id
    ).order_by(AcademicCalendarEvent.date.asc())
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("/{calendar_id}/events", response_model=AcademicCalendarEventResponse, status_code=status.HTTP_201_CREATED)
async def create_calendar_event(
    calendar_id: str,
    event_in: AcademicCalendarEventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new holiday or campus occasion linked to an academic calendar."""
    if current_user.role not in ["ADMIN", "HOD", "DEAN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrators, HODs, or Deans can manage calendar events/holidays."
        )

    # Verify calendar exists
    stmt = select(AcademicCalendar).where(AcademicCalendar.id == calendar_id)
    cal_res = await db.execute(stmt)
    if not cal_res.scalars().first():
        raise HTTPException(status_code=404, detail="Academic Calendar not found.")

    new_event = AcademicCalendarEvent(
        calendar_id=calendar_id,
        **event_in.model_dump()
    )
    db.add(new_event)
    await db.commit()
    await db.refresh(new_event)
    return new_event

@router.put("/events/{event_id}", response_model=AcademicCalendarEventResponse)
async def update_calendar_event(
    event_id: str,
    event_in: AcademicCalendarEventUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update an existing holiday or occasion event."""
    if current_user.role not in ["ADMIN", "HOD", "DEAN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrators, HODs, or Deans can edit calendar events/holidays."
        )

    stmt = select(AcademicCalendarEvent).where(AcademicCalendarEvent.id == event_id)
    result = await db.execute(stmt)
    event_obj = result.scalars().first()
    if not event_obj:
        raise HTTPException(status_code=404, detail="Event/Holiday not found.")

    update_data = event_in.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(event_obj, field, val)

    await db.commit()
    await db.refresh(event_obj)
    return event_obj

@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_calendar_event(
    event_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a holiday or occasion event."""
    if current_user.role not in ["ADMIN", "HOD", "DEAN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrators, HODs, or Deans can delete calendar events/holidays."
        )

    stmt = select(AcademicCalendarEvent).where(AcademicCalendarEvent.id == event_id)
    result = await db.execute(stmt)
    event_obj = result.scalars().first()
    if not event_obj:
        raise HTTPException(status_code=404, detail="Event/Holiday not found.")

    await db.delete(event_obj)
    await db.commit()
    return None

@router.post("/{calendar_id}/events/upload")
async def upload_calendar_events_csv(
    calendar_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload CSV containing holidays and campus occasions for an academic calendar."""
    if current_user.role not in ["ADMIN", "HOD", "DEAN"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Administrators, HODs, or Deans can upload calendar events."
        )

    # Verify calendar exists
    stmt = select(AcademicCalendar).where(AcademicCalendar.id == calendar_id)
    cal_res = await db.execute(stmt)
    if not cal_res.scalars().first():
        raise HTTPException(status_code=404, detail="Academic Calendar not found.")

    try:
        contents = await file.read()
        decoded = contents.decode("utf-8-sig")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not read or decode CSV file: {str(e)}"
        )

    try:
        csv_file = io.StringIO(decoded)
        reader = csv.reader(csv_file)
        headers = next(reader, None)
        if not headers:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The uploaded CSV file is empty."
            )

        headers_clean = [h.strip().lower().replace(" ", "_").replace("-", "_") for h in headers]
        if "date" not in headers_clean or "name" not in headers_clean:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="CSV must contain at least 'date' and 'name' columns."
            )

        imported_count = 0
        for row_idx, row in enumerate(reader, start=2):
            if not row or all(not str(val).strip() for val in row):
                continue

            row_dict = {}
            for col_idx, header in enumerate(headers_clean):
                if col_idx < len(row):
                    row_dict[header] = row[col_idx].strip()
                else:
                    row_dict[header] = None

            date_str = row_dict.get("date")
            name = row_dict.get("name")
            description = row_dict.get("description")
            is_holiday_str = row_dict.get("is_holiday")

            if not date_str or not name:
                continue

            parsed_date = parse_date_str(date_str)
            if not parsed_date:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Row {row_idx}: Invalid date format '{date_str}'."
                )

            is_holiday = True
            if is_holiday_str is not None:
                is_holiday = parse_bool(is_holiday_str)

            new_ev = AcademicCalendarEvent(
                calendar_id=calendar_id,
                date=parsed_date,
                name=name,
                description=description,
                is_holiday=is_holiday
            )
            db.add(new_ev)
            imported_count += 1

        await db.commit()
        return {
            "message": f"Successfully imported {imported_count} holidays/events.",
            "imported_count": imported_count
        }
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"An error occurred while processing CSV data: {str(e)}"
        )
