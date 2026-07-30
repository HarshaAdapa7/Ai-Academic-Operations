import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app.core.database import async_session_maker
from app.models.academic_calendar import AcademicCalendar
from sqlalchemy import select, delete

async def main():
    async with async_session_maker() as db:
        res = await db.execute(select(AcademicCalendar).order_by(AcademicCalendar.created_at.asc()))
        cals = res.scalars().all()
        print(f"Total calendars in DB: {len(cals)}")
        seen = set()
        to_delete = []
        for c in cals:
            key = (c.academic_year, c.semester)
            print(f"ID: {c.id} | AY: {c.academic_year} | Sem: {c.semester} | Created: {c.created_at}")
            if key in seen:
                to_delete.append(c.id)
            else:
                seen.add(key)
        
        if to_delete:
            print(f"Deleting {len(to_delete)} duplicate records: {to_delete}")
            for cid in to_delete:
                stmt = delete(AcademicCalendar).where(AcademicCalendar.id == cid)
                await db.execute(stmt)
            await db.commit()
            print("Cleanup complete!")

if __name__ == "__main__":
    asyncio.run(main())
