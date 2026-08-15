import asyncio
from app.core.database import async_session_maker
from sqlalchemy import select
from app.models.classroom import Classroom
from app.models.faculty import Department, SectionConfig

async def check_csd():
    async with async_session_maker() as db:
        d_res = await db.execute(select(Department).where(Department.code == "CSD"))
        d_csd = d_res.scalar()
        if not d_csd:
            print("CSD department not found.")
            return
            
        print(f"CSD Department ID: {d_csd.id}")
        
        r_res = await db.execute(select(Classroom).where(Classroom.department_id == d_csd.id))
        rooms = r_res.scalars().all()
        print(f"CSD Classrooms in DB: {[r.room_number for r in rooms]}")
        
        s_res = await db.execute(select(SectionConfig).where(SectionConfig.department_id == d_csd.id))
        sections = s_res.scalars().all()
        print(f"CSD Sections in DB: {[s.name for s in sections]}")
        
        for s in sections:
            print(f"Section {s.name}: department_id={s.department_id}")

if __name__ == "__main__":
    asyncio.run(check_csd())
