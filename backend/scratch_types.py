import asyncio
from app.core.database import async_session_maker
from sqlalchemy import select
from app.models.timetable import TimetableEntry

async def check_types():
    async with async_session_maker() as db:
        res = await db.execute(select(TimetableEntry).limit(5))
        entries = res.scalars().all()
        for e in entries:
            print(f"e.day_of_week: {type(e.day_of_week)} -> {repr(e.day_of_week)}")
            print(f"e.time_slot: {type(e.time_slot)} -> {repr(e.time_slot)}")
            print(f"e.faculty_id: {type(e.faculty_id)} -> {repr(e.faculty_id)}")
            print(f"e.classroom_id: {type(e.classroom_id)} -> {repr(e.classroom_id)}")
            break

if __name__ == "__main__":
    asyncio.run(check_types())
