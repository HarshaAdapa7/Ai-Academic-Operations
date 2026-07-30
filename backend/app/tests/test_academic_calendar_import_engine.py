import pytest
import io
import openpyxl
from datetime import date
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select

from app.core.database import Base
from app.models.academic_calendar import AcademicCalendar, AcademicHoliday
from app.services.academic_calendar_import_engine import AcademicCalendarImportEngine, parse_academic_date, clean_header

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

def test_clean_header():
    assert clean_header(" Academic Year ") == "academic_year"
    assert clean_header("Sem-Start.Date") == "sem_start_date"
    assert clean_header("Is Active?") == "is_active"

def test_parse_academic_date():
    assert parse_academic_date("2026-06-15") == date(2026, 6, 15)
    assert parse_academic_date("15/06/2026") == date(2026, 6, 15)
    assert parse_academic_date("15-06-2026") == date(2026, 6, 15)
    assert parse_academic_date("06/15/2026") == date(2026, 6, 15)
    assert parse_academic_date("Jun 15, 2026") == date(2026, 6, 15)
    assert parse_academic_date("15 Jun 2026") == date(2026, 6, 15)
    assert parse_academic_date("June 15, 2026") == date(2026, 6, 15)
    assert parse_academic_date(None) is None
    assert parse_academic_date("invalid_date") is None

def test_preview_academic_calendar_schedule():
    csv_content = (
        "AY,Sem,Semester Start,Semester End,Class Commencement,Semester Closing,Is Active\n"
        "2026-2027,Odd Sem,2026-06-15,2026-10-31,2026-06-18,2026-10-31,True\n"
    ).encode("utf-8")

    raw_rows = AcademicCalendarImportEngine.parse_file_bytes(csv_content, "calendar.csv")
    preview = AcademicCalendarImportEngine.preview_import(raw_rows)

    assert preview["import_type"] == "CALENDAR_SCHEDULE"
    assert preview["total_rows"] == 1
    assert preview["valid_rows"] == 1
    assert preview["invalid_rows"] == 0
    assert len(preview["sample_parsed_data"]) == 1
    assert preview["sample_parsed_data"][0]["academic_year"] == "2026-2027"

def test_preview_academic_calendar_events():
    csv_content = (
        "Holiday Date,Event Name,Description,Is Holiday\n"
        "2026-08-15,Independence Day,National Holiday,True\n"
        "2026-09-05,Teachers Day,Campus Function,False\n"
    ).encode("utf-8")

    raw_rows = AcademicCalendarImportEngine.parse_file_bytes(csv_content, "events.csv")
    preview = AcademicCalendarImportEngine.preview_import(raw_rows)

    assert preview["import_type"] == "HOLIDAYS_DB"
    assert preview["total_rows"] == 2
    assert preview["valid_rows"] == 2
    assert preview["invalid_rows"] == 0
    assert len(preview["sample_parsed_data"]) == 2

@pytest.mark.asyncio
async def test_execute_holidays_db_import(db_session):
    csv_content = (
        "date,name,description,is_holiday\n"
        "2026-08-15,Independence Day,National Holiday,True\n"
        "2026-10-02,Gandhi Jayanti,Public Holiday,True\n"
    ).encode("utf-8")

    raw_rows = AcademicCalendarImportEngine.parse_file_bytes(csv_content, "holidays.csv")
    result = await AcademicCalendarImportEngine.execute_import(db=db_session, raw_rows=raw_rows)

    assert result["imported_count"] == 2
    assert result["type"] == "HOLIDAYS_DB"

    stmt = select(AcademicHoliday)
    res = await db_session.execute(stmt)
    holidays = res.scalars().all()
    assert len(holidays) == 2
    assert holidays[0].name == "Independence Day"


@pytest.mark.asyncio
async def test_execute_excel_calendar_import(db_session):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append([
        "academic_year", "semester", "semester_start_date", "semester_end_date",
        "class_commencement_date", "semester_closing_date", "is_active"
    ])
    ws.append([
        "2026-2027", "Odd Semester", "2026-06-15", "2026-10-31",
        "2026-06-18", "2026-10-31", True
    ])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    raw_rows = AcademicCalendarImportEngine.parse_file_bytes(buf.getvalue(), "academic_calendar.xlsx")
    result = await AcademicCalendarImportEngine.execute_import(db=db_session, raw_rows=raw_rows)

    assert result["imported_count"] == 1
    assert result["type"] == "CALENDAR_SCHEDULE"

    stmt = select(AcademicCalendar)
    res = await db_session.execute(stmt)
    cals = res.scalars().all()
    assert len(cals) == 1
    assert cals[0].academic_year == "2026-2027"
    assert cals[0].semester == "Odd Semester"
    assert cals[0].is_active is True

@pytest.mark.asyncio
async def test_execute_multi_year_ug_odd_semester_import(db_session):
    wb = openpyxl.Workbook()
    ws = wb.active
    # Top title rows before table header
    ws.append(["Academic Calendar for UG Course - 2026-27"])
    ws.append(["Odd Semester"])
    # Table headers at row 3
    ws.append([
        "S. No", "Class", "Date of commencement of class work", "Date of commencement of first mid exam",
        "Date of commencement of second mid exam", "Date of closing of instructions",
        "No. of working days including mid exams", "Date of commencement of sem end exams", "Date of commencement of practical exams"
    ])
    ws.append([1, "IV/I B.Tech", "22-06-2026", "01-09-2026", "16-11-2026", "18-11-2026", 120, "24-11-2026", "07-12-2026"])
    ws.append([2, "III/IV B.Tech", "22-06-2026", "20-08-2026", "15-10-2026", "17-10-2026", 96, "28-10-2026", "10-11-2026"])
    ws.append([3, "II/IV B.Tech", "29-06-2026", "20-08-2026", "15-10-2026", "17-10-2026", 91, "29-10-2026", "11-11-2026"])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    raw_rows = AcademicCalendarImportEngine.parse_file_bytes(buf.getvalue(), "Academic_Calendar_UG_2026_27_Odd_Semester.xlsx")
    assert len(raw_rows) == 3
    assert raw_rows[0]["Class"] == "IV/I B.Tech"
    assert raw_rows[1]["Class"] == "III/IV B.Tech"
    assert raw_rows[2]["Class"] == "II/IV B.Tech"

    preview = AcademicCalendarImportEngine.preview_import(raw_rows, target_type="CALENDAR_SCHEDULE")
    assert preview["import_type"] == "CALENDAR_SCHEDULE"
    assert preview["valid_rows"] == 3
    assert preview["invalid_rows"] == 0

    result = await AcademicCalendarImportEngine.execute_import(db=db_session, raw_rows=raw_rows, target_type="CALENDAR_SCHEDULE")
    assert result["imported_count"] == 3

    stmt = select(AcademicCalendar).order_by(AcademicCalendar.semester)
    res = await db_session.execute(stmt)
    cals = res.scalars().all()
    assert len(cals) == 3
    semesters = [c.semester for c in cals]
    assert "2nd Year - Sem 1" in semesters
    assert "3rd Year - Sem 1" in semesters
    assert "4th Year - Sem 1" in semesters



