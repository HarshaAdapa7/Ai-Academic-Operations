import asyncio
from sqlalchemy import text
from app.core.database import async_session_maker

async def clear_all_exam_entries():
    async with async_session_maker() as session:
        await session.execute(text("DELETE FROM exam_timetable_entries;"))
        await session.commit()
        print("All exam timetable entries have been successfully cleared from the database.")

if __name__ == "__main__":
    asyncio.run(clear_all_exam_entries())
