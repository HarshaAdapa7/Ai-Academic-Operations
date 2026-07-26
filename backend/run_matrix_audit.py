import asyncio
from sqlalchemy import select
from app.core.database import async_session_maker
from app.models.faculty import Department, Subject, FacultyProfile, SectionConfig
from app.models.classroom import Classroom

async def audit():
    async with async_session_maker() as db:
        depts = (await db.execute(select(Department).order_by(Department.code.asc()))).scalars().all()
        rooms = (await db.execute(select(Classroom))).scalars().all()
        sections = (await db.execute(select(SectionConfig))).scalars().all()
        subjects = (await db.execute(select(Subject))).scalars().all()
        faculty = (await db.execute(select(FacultyProfile))).scalars().all()

        print("\n" + "="*75)
        print("=== REAL ANITS COLLEGE BRANCH CAPACITY & RESOURCE MATRIX ===")
        print("="*75)

        for d in depts:
            d_sections = [s for s in sections if s.department_id == d.id]
            d_classrooms = [r for r in rooms if r.department_id == d.id and r.room_type == 'CLASSROOM']
            d_labs = [r for r in rooms if r.department_id == d.id and r.room_type == 'LAB']
            d_halls = [r for r in rooms if r.department_id == d.id and r.room_type == 'SEMINAR_HALL']
            d_faculty = [f for f in faculty if f.department_id == d.id]
            d_subjects = [s for s in subjects if s.department_id == d.id]

            sec_names = ", ".join(sorted([s.name for s in d_sections]))
            cr_names = ", ".join(sorted([r.room_number for r in d_classrooms])) if d_classrooms else "Shared Central Rooms"
            lab_names = ", ".join(sorted([r.room_number for r in d_labs])) if d_labs else "Shared Central Labs"
            hall_names = ", ".join(sorted([r.room_number for r in d_halls])) if d_halls else "None"

            print(f"Branch [{d.code:5s}] - {d.name}:")
            print(f"  • Total Academic Sections : {len(d_sections):2d} sections ({sec_names})")
            print(f"  • Theory Classrooms       : {len(d_classrooms):2d} rooms ({cr_names})")
            print(f"  • Specialized Laboratories: {len(d_labs):2d} labs  ({lab_names})")
            if d_halls:
                print(f"  • Seminar Halls           : {len(d_halls):2d} halls ({hall_names})")
            print(f"  • Faculty Members         : {len(d_faculty):2d} active faculty")
            print(f"  • Core & Elective Subjects: {len(d_subjects):2d} courses")
            print("-" * 70)

if __name__ == "__main__":
    asyncio.run(audit())
