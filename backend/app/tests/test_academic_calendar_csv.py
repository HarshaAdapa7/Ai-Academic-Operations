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
async def test_academic_holiday_operations(db_session):
    from app.api.academic_calendar import create_academic_holiday, list_academic_holidays, delete_academic_holiday
    from app.schemas.academic_calendar import AcademicHolidayCreate
    from datetime import date

    admin_user = User(
        email="admin_holiday@test.com",
        password_hash="pwd",
        full_name="Admin Holiday User",
        role="ADMIN"
    )
    db_session.add(admin_user)
    await db_session.commit()

    # 1. Test manual creation of Holiday
    holiday1_in = AcademicHolidayCreate(
        date=date(2026, 8, 15),
        name="Independence Day",
        description="National Holiday - No classes",
        is_holiday=True,
        academic_year="2026–2027"
    )
    h1 = await create_academic_holiday(holiday1_in, db_session, admin_user)
    assert h1.name == "Independence Day"
    assert h1.is_holiday is True

    # 2. Test list holidays
    holidays = await list_academic_holidays("2026–2027", None, db_session, admin_user)
    assert len(holidays) == 1

    # 3. Test delete holiday
    await delete_academic_holiday(h1.id, db_session, admin_user)
    holidays_after_delete = await list_academic_holidays("2026–2027", None, db_session, admin_user)
    assert len(holidays_after_delete) == 0

@pytest.mark.asyncio
async def test_clear_all_academic_holidays(db_session):
    from app.api.academic_calendar import create_academic_holiday, list_academic_holidays, clear_all_academic_holidays
    from app.schemas.academic_calendar import AcademicHolidayCreate
    from datetime import date

    admin_user = User(
        email="admin_clear@test.com",
        password_hash="pwd",
        full_name="Admin Clear User",
        role="ADMIN"
    )
    db_session.add(admin_user)
    await db_session.commit()

    # Create multiple holidays across years
    await create_academic_holiday(AcademicHolidayCreate(date=date(2026, 8, 15), name="Independence Day", academic_year="2026–2027", is_holiday=True), db_session, admin_user)
    await create_academic_holiday(AcademicHolidayCreate(date=date(2026, 10, 2), name="Gandhi Jayanti", academic_year="2026–2027", is_holiday=True), db_session, admin_user)
    await create_academic_holiday(AcademicHolidayCreate(date=date(2027, 8, 15), name="Independence Day Next", academic_year="2027–2028", is_holiday=True), db_session, admin_user)

    # 1. Clear holidays for 2026–2027
    res = await clear_all_academic_holidays("2026–2027", db_session, admin_user)
    assert res["deleted_count"] == 2

    holidays_remaining = await list_academic_holidays(None, None, db_session, admin_user)
    assert len(holidays_remaining) == 1
    assert holidays_remaining[0].name == "Independence Day Next"

    # 2. Clear all remaining holidays without filter
    res_all = await clear_all_academic_holidays(None, db_session, admin_user)
    assert res_all["deleted_count"] == 1

    holidays_final = await list_academic_holidays(None, None, db_session, admin_user)
    assert len(holidays_final) == 0



