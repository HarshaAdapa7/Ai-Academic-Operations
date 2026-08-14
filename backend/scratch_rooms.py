import asyncio
from app.core.database import async_session_maker
from sqlalchemy import select
from app.models.faculty import Subject
from app.models.classroom import Classroom

async def check_conflict_elements():
    async with async_session_maker() as db:
        room = await db.get(Classroom, "831777d4-85b0-4ead-b888-e22e4f2b6a78")
        print(f"Room: name={room.room_number if room else 'None'}, type={room.room_type if room else 'None'}")
        
        subj_ids = ["07c58488-a0c3-4e83-a024-ef72cc0d12b6", "9ee98548-e701-4ecf-9dfe-73d4c9778778", "1d8f6ae3-ff75-4e2a-b0c3-12b67a2951c6", "b0af03df-6b00-493e-a103-ecd71d51f814"]
        for sid in subj_ids:
            s = await db.get(Subject, sid)
            if s:
                print(f"Subject: id={sid[:8]}, name={s.name}, code={s.code}, type={s.subject_type}")
            else:
                print(f"Subject: id={sid[:8]} not found")

if __name__ == "__main__":
    asyncio.run(check_conflict_elements())
