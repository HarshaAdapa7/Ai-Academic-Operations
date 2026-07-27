import pytest
import io
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.future import select

from app.core.database import Base
from app.models.user import User
from app.models.academic_calendar import AcademicCalendar
from app.api.academic_calendar import upload_academic_calendar_csv

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

@pytest.mark.asyncio
async def test_upload_academic_calendar_csv(db_session):
    # Setup admin user
    admin_user = User(
        email="admin@test.com",
        password_hash="pwd",
        full_name="Admin User",
        role="ADMIN"
    )
    db_session.add(admin_user)
    await db_session.commit()
    
    # 1. Prepare CSV data
    csv_data = (
        "academic_year,semester,semester_start_date,semester_end_date,class_commencement_date,semester_closing_date,is_active\n"
        "2026–2027,Odd Semester,2026-06-15,2026-10-31,2026-06-18,2026-10-31,true\n"
        "2026–2027,Even Semester,2026-12-01,2027-04-30,2026-12-05,2027-04-30,false\n"
    )
    
    # Create UploadFile mock
    file_bytes = csv_data.encode("utf-8")
    upload_file = UploadFile(
        file=io.BytesIO(file_bytes),
        filename="calendar.csv"
    )
    
    # Call endpoint function directly
    result = await upload_academic_calendar_csv(
        file=upload_file,
        db=db_session,
        current_user=admin_user
    )
    
    assert result["imported_count"] == 2
    
    # Query database to verify
    stmt = select(AcademicCalendar).order_by(AcademicCalendar.academic_year)
    res = await db_session.execute(stmt)
    calendars = res.scalars().all()
    
    assert len(calendars) == 2
    assert calendars[0].semester == "Odd Semester"
    assert calendars[0].is_active is True
    assert calendars[1].semester == "Even Semester"
    assert calendars[1].is_active is False
    
    # 2. Upload same CSV with active flag toggled to test idempotency and activation/deactivation logic
    csv_data_updated = (
        "academic_year,semester,semester_start_date,semester_end_date,class_commencement_date,semester_closing_date,is_active\n"
        "2026–2027,Odd Semester,2026-06-15,2026-10-31,2026-06-18,2026-10-31,false\n"
        "2026–2027,Even Semester,2026-12-01,2027-04-30,2026-12-05,2027-04-30,true\n"
    )
    
    upload_file_updated = UploadFile(
        file=io.BytesIO(csv_data_updated.encode("utf-8")),
        filename="calendar_updated.csv"
    )
    
    result_updated = await upload_academic_calendar_csv(
        file=upload_file_updated,
        db=db_session,
        current_user=admin_user
    )
    
    assert result_updated["imported_count"] == 2
    
    # Verify values updated in db and active flag flipped
    res_updated = await db_session.execute(stmt)
    calendars_updated = res_updated.scalars().all()
    
    assert len(calendars_updated) == 2
    # Verify Odd Sem is now inactive
    odd_sem = [c for c in calendars_updated if c.semester == "Odd Semester"][0]
    assert odd_sem.is_active is False
    # Verify Even Sem is now active
    even_sem = [c for c in calendars_updated if c.semester == "Even Semester"][0]
    assert even_sem.is_active is True

@pytest.mark.asyncio
async def test_academic_calendar_event_operations(db_session):
    from app.api.academic_calendar import create_calendar_event, list_calendar_events, upload_calendar_events_csv, delete_calendar_event
    from app.schemas.academic_calendar import AcademicCalendarEventCreate
    from datetime import date

    admin_user = User(
        email="admin_event@test.com",
        password_hash="pwd",
        full_name="Admin Event User",
        role="ADMIN"
    )
    db_session.add(admin_user)

    cal = AcademicCalendar(
        academic_year="2026–2027",
        semester="Odd Semester",
        semester_start_date=date(2026, 6, 15),
        semester_end_date=date(2026, 10, 31),
        class_commencement_date=date(2026, 6, 18),
        semester_closing_date=date(2026, 10, 31),
        is_active=True
    )
    db_session.add(cal)
    await db_session.commit()
    await db_session.refresh(cal)

    # 1. Test manual creation of Holiday & Campus Event
    event1_in = AcademicCalendarEventCreate(
        date=date(2026, 8, 15),
        name="Independence Day",
        description="National Holiday - No classes",
        is_holiday=True
    )
    ev1 = await create_calendar_event(cal.id, event1_in, db_session, admin_user)
    assert ev1.name == "Independence Day"
    assert ev1.is_holiday is True

    event2_in = AcademicCalendarEventCreate(
        date=date(2026, 9, 25),
        name="Annual Tech Fest",
        description="Student workshops & competitions",
        is_holiday=False
    )
    ev2 = await create_calendar_event(cal.id, event2_in, db_session, admin_user)
    assert ev2.name == "Annual Tech Fest"
    assert ev2.is_holiday is False

    # 2. Test list events
    events = await list_calendar_events(cal.id, db_session, admin_user)
    assert len(events) == 2

    # 3. Test Event CSV upload
    csv_events = (
        "date,name,description,is_holiday\n"
        "2026-10-02,Gandhi Jayanti,Public Holiday,true\n"
        "2026-10-15,Cultural Evening,Campus Showcase,false\n"
    )
    upload_file = UploadFile(
        file=io.BytesIO(csv_events.encode("utf-8")),
        filename="events.csv"
    )
    csv_res = await upload_calendar_events_csv(cal.id, upload_file, db_session, admin_user)
    assert csv_res["imported_count"] == 2

    # Verify total events after CSV upload
    events_after_csv = await list_calendar_events(cal.id, db_session, admin_user)
    assert len(events_after_csv) == 4

    # 4. Test delete event
    await delete_calendar_event(ev1.id, db_session, admin_user)
    events_after_delete = await list_calendar_events(cal.id, db_session, admin_user)
    assert len(events_after_delete) == 3

