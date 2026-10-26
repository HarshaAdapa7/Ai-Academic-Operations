import asyncio
from datetime import datetime, timedelta
from app.core.database import async_session_maker
from app.models.academic_calendar import AcademicHoliday
from sqlalchemy import select

def get_valid_date_on_or_after(start_dt: datetime, holiday_dates: set, occupied_dates: set = None) -> datetime:
    curr = start_dt
    while curr.weekday() == 6 or curr.date() in holiday_dates or (occupied_dates and curr.date() in occupied_dates):
        curr = curr + timedelta(days=1)
    return curr

def compute_interleaved_gap_dates(start_dt: datetime, count: int, holiday_dates: set, other_year_dates: set = None):
    """
    Computes exam dates with at least 1-day preparation gap, skipping Sundays and DB holidays.
    If other_year_dates is provided (e.g. from Year 3), Year 2 gracefully avoids the same dates
    so they interleave on alternating days (e.g. Year 3 on Mon/Wed/Fri, Year 2 on Tue/Thu/Sat).
    """
    dates = []
    # If other_year_dates provided, start on or after start_dt avoiding other_year_dates if possible
    curr = get_valid_date_on_or_after(start_dt, holiday_dates, other_year_dates)
    for i in range(count):
        if i == 0:
            dates.append(curr)
        else:
            candidate = dates[-1] + timedelta(days=2)
            while candidate.weekday() == 6 or candidate.date() in holiday_dates or (other_year_dates and candidate.date() in other_year_dates):
                candidate = candidate + timedelta(days=1)
            dates.append(candidate)
    return dates

async def test():
    async with async_session_maker() as db:
        hols = set((await db.execute(select(AcademicHoliday.date).where(AcademicHoliday.is_holiday == True))).scalars().all())
        
        # 1. Year 3 Sem 1
        y3_start = datetime(2026, 10, 28) # Wed
        y3_dates = compute_interleaved_gap_dates(y3_start, 6, hols)
        y3_date_set = set(d.date() for d in y3_dates)
        
        # 2. Year 2 Sem 1 (alternating with Year 3)
        y2_start = datetime(2026, 10, 29) # Thu
        y2_dates = compute_interleaved_gap_dates(y2_start, 6, hols, other_year_dates=y3_date_set)
        
        print("\n--- Year 3 Sem 1 Exam Schedule ---")
        for idx, d in enumerate(y3_dates):
            print(f"  Paper {idx+1}: {d.strftime('%Y-%m-%d (%A)')}")
            
        print("\n--- Year 2 Sem 1 Exam Schedule (Interleaved with Year 3) ---")
        for idx, d in enumerate(y2_dates):
            print(f"  Paper {idx+1}: {d.strftime('%Y-%m-%d (%A)')}")
            
        overlap = set(d.date() for d in y3_dates).intersection(set(d.date() for d in y2_dates))
        print(f"\nTotal Overlap between Year 3 and Year 2: {len(overlap)} days (Expected 0)")

if __name__ == "__main__":
    asyncio.run(test())
