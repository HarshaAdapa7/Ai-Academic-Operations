import asyncio
import urllib.request
import json
from sqlalchemy import select
from app.core.database import async_session_maker
from app.models.faculty import SectionConfig, Department
from app.models.user import User

async def main():
    print("="*70)
    print("=== ANITS REAL COLLEGE ONE-CLICK MASTER TIMETABLE GENERATOR ===")
    print("="*70)

    async with async_session_maker() as db:
        depts = (await db.execute(select(Department))).scalars().all()
        sections = (await db.execute(select(SectionConfig))).scalars().all()
        admin_user = (await db.execute(select(User).where(User.email == 'harshaadapa23@gmail.com'))).scalars().first()

        dept_ids = [d.id for d in depts]
        section_names = [s.name for s in sections]

        print(f"Targeting {len(depts)} Departments and {len(section_names)} Sections...")

        from app.api.timetable import generate_master_timetable, MasterGenerateInput
        input_data = MasterGenerateInput(department_ids=dept_ids, sections=section_names)

        print("Executing 22-Rules AI Constraint Solver...")
        res = await generate_master_timetable(input_data=input_data, current_user=admin_user, db=db)
        
        print("\n" + "="*70)
        print("=== GENERATION RESULT ===")
        print("="*70)
        print(f"Status: {res.get('status')}")
        print(f"Message: {res.get('message')}")
        print(f"Total Scheduled Entries: {res.get('total_entries')}")
        print("="*70 + "\n")

if __name__ == "__main__":
    asyncio.run(main())
