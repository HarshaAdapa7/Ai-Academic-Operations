import asyncio
from app.core.database import async_session_maker
from sqlalchemy import select
from app.models.classroom import Classroom
from app.models.faculty import Department

async def check_classrooms():
    async with async_session_maker() as db:
        res = await db.execute(select(Classroom))
        rooms = res.scalars().all()
        print(f"Total Classrooms in Database: {len(rooms)}")
        
        depts = (await db.execute(select(Department))).scalars().all()
        dept_map = {d.id: d.code for d in depts}
        
        dept_counts = {}
        for r in rooms:
            dcode = dept_map.get(r.department_id, "None")
            dept_counts[dcode] = dept_counts.get(dcode, 0) + 1
            
        print("Classrooms count per department:")
        for dcode, count in dept_counts.items():
            print(f"  * {dcode}: {count}")

if __name__ == "__main__":
    asyncio.run(check_classrooms())
