import asyncio
from sqlalchemy import text
from app.core.database import async_session_maker

async def check():
    async with async_session_maker() as db:
        res = await db.execute(text("SELECT * FROM timetable_entries LIMIT 1"))
        print("Columns in timetable_entries now:", res.keys())

asyncio.run(check())
