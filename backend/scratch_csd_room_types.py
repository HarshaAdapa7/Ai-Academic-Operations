import asyncio
from app.core.database import async_session_maker
from sqlalchemy import select
from app.models.classroom import Classroom
from app.models.faculty import Department

async def check_csd_room_types():
    async with async_session_maker() as db:
        d_res = await db.execute(select(Department).where(Department.code == "CSD"))
        d_csd = d_res.scalar()
        if not d_csd:
            print("CSD department not found.")
            return
            
        r_res = await db.execute(select(Classroom).where(Classroom.department_id == d_csd.id))
        rooms = r_res.scalars().all()
        for r in rooms:
            print(f"Room: room_number={r.room_number}, room_type={r.room_type}, upper_type={str(r.room_type).upper() if r.room_type else 'NONE'}")

if __name__ == "__main__":
    asyncio.run(check_csd_room_types())
