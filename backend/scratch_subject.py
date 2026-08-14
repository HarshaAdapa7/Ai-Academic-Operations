import asyncio
from app.core.database import async_session_maker
from sqlalchemy import select
from app.models.faculty import Subject

async def check_subject():
    async with async_session_maker() as db:
        res = await db.execute(select(Subject).where(Subject.id == "056f590b-547b-4bff-b9b2-a817097cd6b7"))
        s = res.scalar()
        if s:
            print(f"Subject: name={s.name}, code={s.code}, type={s.subject_type}, parallel={s.is_parallel_lab}, parallel_id={s.parallel_subject_id}")
        else:
            print("Subject not found.")

if __name__ == "__main__":
    asyncio.run(check_subject())
