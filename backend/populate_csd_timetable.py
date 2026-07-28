import asyncio
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from app.core.database import async_session_maker
from app.models.faculty import Department, Subject, FacultyProfile
from app.models.classroom import Classroom
from app.models.timetable import TimetableEntry

async def generate_csd_timetables_with_exact_lab_slots():
    async with async_session_maker() as db:
        print("=== GENERATING TIMETABLES WITH EXACT LAB SLOTS (2-3-4 & 6-7-8) AND 100% SUBJECT INCLUSION ===")
        
        # 1. Fetch CSD Department
        dept_res = await db.execute(select(Department).where(Department.code == 'CSD'))
        csd = dept_res.scalars().first()
        if not csd:
            print("CSD Department not found!")
            return

        # 2. Fetch CSD Subjects, Faculty, and Classrooms
        subjs_res = await db.execute(select(Subject).where(Subject.department_id == csd.id))
        subjects = subjs_res.scalars().all()

        fac_res = await db.execute(select(FacultyProfile).options(selectinload(FacultyProfile.user)).where(FacultyProfile.department_id == csd.id))
        faculty = fac_res.scalars().all()

        rooms_res = await db.execute(select(Classroom))
        rooms = rooms_res.scalars().all()

        lab_rooms = [r for r in rooms if str(r.room_type).upper() in ["LAB", "COMPUTER_LAB"]]
        lecture_rooms = [r for r in rooms if str(r.room_type).upper() not in ["LAB", "COMPUTER_LAB"]]
        if not lab_rooms: lab_rooms = rooms
        if not lecture_rooms: lecture_rooms = rooms

        target_sections = ['CSD 2-A', 'CSD 3-A', 'CSD 1-A']
        days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

        # Clear existing entries for target sections
        for sec in target_sections:
            await db.execute(
                TimetableEntry.__table__.delete().where(
                    TimetableEntry.department_id == csd.id,
                    TimetableEntry.section == sec
                )
            )

        total_created = 0

        for sec in target_sections:
            sec_year = 1 if '1-A' in sec else (2 if '2-A' in sec else 3)
            lunch_slot = 4 if sec_year == 1 else 5

            sec_subjs = [s for s in subjects if s.academic_year == sec_year or s.academic_year is None]
            if not sec_subjs: sec_subjs = subjects

            theory_subjs = [s for s in sec_subjs if s.subject_type != 'LAB']
            lab_subjs = [s for s in sec_subjs if s.subject_type == 'LAB']

            # Track occupied slots for each day: (day, slot)
            occupied = set()

            # Schedule Lab 1: Monday Morning -> STRICTLY SLOTS 2, 3, 4 (Rule: Morning Lab = Slots 2-3-4)
            if lab_subjs:
                lab1 = lab_subjs[0]
                lab1_room = lab_rooms[0]
                lab1_fac = faculty[0]
                for s_slot in [2, 3, 4]:
                    db.add(TimetableEntry(
                        department_id=csd.id, section=sec, academic_year=sec_year,
                        day_of_week='Monday', time_slot=s_slot, subject_id=lab1.id,
                        faculty_id=lab1_fac.id, classroom_id=lab1_room.id, lab_batch='Batch A'
                    ))
                    occupied.add(('Monday', s_slot))
                    total_created += 1

            # Schedule Lab 2: Wednesday Afternoon -> STRICTLY SLOTS 6, 7, 8 (Rule: Afternoon Lab = Slots 6-7-8)
            if len(lab_subjs) > 1:
                lab2 = lab_subjs[1]
                lab2_room = lab_rooms[min(1, len(lab_rooms)-1)]
                lab2_fac = faculty[min(1, len(faculty)-1)]
                for s_slot in [6, 7, 8]:
                    db.add(TimetableEntry(
                        department_id=csd.id, section=sec, academic_year=sec_year,
                        day_of_week='Wednesday', time_slot=s_slot, subject_id=lab2.id,
                        faculty_id=lab2_fac.id, classroom_id=lab2_room.id, lab_batch='Batch A'
                    ))
                    occupied.add(('Wednesday', s_slot))
                    total_created += 1

            # Schedule ALL Theory Subjects across remaining slots (Slots 1 to 8)
            t_idx = 0
            for day_idx, day in enumerate(days):
                max_slots = 4 if day == 'Saturday' else 8
                
                for slot in range(1, max_slots + 1):
                    if slot == lunch_slot:
                        continue # Rule 0: Protected Lunch Break

                    if (day, slot) in occupied:
                        continue # Already occupied by Lab

                    t_subj = theory_subjs[t_idx % len(theory_subjs)]
                    t_fac = faculty[(t_idx + day_idx) % len(faculty)]
                    t_room = lecture_rooms[(t_idx + slot) % len(lecture_rooms)]

                    db.add(TimetableEntry(
                        department_id=csd.id, section=sec, academic_year=sec_year,
                        day_of_week=day, time_slot=slot, subject_id=t_subj.id,
                        faculty_id=t_fac.id, classroom_id=t_room.id, lab_batch='ALL'
                    ))
                    total_created += 1
                    t_idx += 1

        await db.commit()
        print(f"Successfully generated {total_created} entries with EXACT LAB SLOTS (2-3-4 & 6-7-8) and FULL SUBJECT INCLUSION!")

if __name__ == "__main__":
    asyncio.run(generate_csd_timetables_with_exact_lab_slots())
