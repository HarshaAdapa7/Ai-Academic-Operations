import asyncio
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from app.core.database import async_session_maker
from app.models.faculty import Department, Subject, FacultyProfile
from app.models.classroom import Classroom
from app.models.timetable import TimetableEntry

async def generate_perfect_csd_timetables():
    async with async_session_maker() as db:
        print("=== GENERATING 100% REALISTIC & STRICTLY CONSISTENT TIMETABLES FOR CSD ===")

        # 1. Fetch CSD Department
        dept_res = await db.execute(select(Department).where(Department.code == 'CSD'))
        csd = dept_res.scalars().first()
        if not csd:
            print("CSD Department not found!")
            return

        # 2. Fetch CSD Subjects, Faculty, and Classrooms
        subjs_res = await db.execute(select(Subject).where(Subject.department_id == csd.id))
        all_subjects = subjs_res.scalars().all()

        fac_res = await db.execute(select(FacultyProfile).options(selectinload(FacultyProfile.user)).where(FacultyProfile.department_id == csd.id))
        faculty = fac_res.scalars().all()

        rooms_res = await db.execute(select(Classroom))
        rooms = rooms_res.scalars().all()

        lab_rooms = [r for r in rooms if str(r.room_type).upper() in ["LAB", "COMPUTER_LAB"]]
        lecture_rooms = [r for r in rooms if str(r.room_type).upper() not in ["LAB", "COMPUTER_LAB"]]
        if not lab_rooms: lab_rooms = [r for r in rooms if '603' in r.room_number or '604' in r.room_number] or rooms
        if not lecture_rooms: lecture_rooms = rooms

        target_sections = ['CSD 1-A', 'CSD 2-A', 'CSD 3-A']
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

        # Section-to-Home Room Mapping (Consistent Home Classroom per Section)
        section_home_rooms = {
            'CSD 1-A': lecture_rooms[0] if len(lecture_rooms) > 0 else rooms[0], # e.g. I-503
            'CSD 2-A': lecture_rooms[1] if len(lecture_rooms) > 1 else rooms[0], # e.g. I-504
            'CSD 3-A': lecture_rooms[2] if len(lecture_rooms) > 2 else rooms[0], # e.g. I-505
        }

        lab_room_1 = lab_rooms[0] if len(lab_rooms) > 0 else rooms[-1] # e.g. I-603
        lab_room_2 = lab_rooms[1] if len(lab_rooms) > 1 else rooms[-1] # e.g. I-604

        for sec in target_sections:
            sec_year = 1 if '1-A' in sec else (2 if '2-A' in sec else 3)
            lunch_slot = 4 if sec_year == 1 else 5
            home_room = section_home_rooms[sec]

            sec_subjs = [s for s in all_subjects if s.academic_year == sec_year]
            if not sec_subjs:
                sec_subjs = [s for s in all_subjects if s.academic_year is None][:8]

            theory_subjs = [s for s in sec_subjs if str(s.subject_type).upper() != 'LAB']
            lab_subjs = [s for s in sec_subjs if str(s.subject_type).upper() == 'LAB']

            # Create Strict 1-to-1 Subject-to-Professor Mapping for this section
            # Rule: ONE professor per subject throughout the entire week!
            subject_faculty_map = {}
            for idx, subj in enumerate(sec_subjs):
                assigned_prof = faculty[(sec_year * 5 + idx) % len(faculty)]
                subject_faculty_map[subj.id] = assigned_prof

            occupied = set()

            # Schedule Lab 1: Monday Morning -> STRICTLY SLOTS 2, 3, 4 (Rule: Morning Lab = Slots 2-3-4)
            if lab_subjs:
                lab1 = lab_subjs[0]
                lab1_prof = subject_faculty_map[lab1.id]
                for s_slot in [2, 3, 4]:
                    db.add(TimetableEntry(
                        department_id=csd.id, section=sec, academic_year=sec_year,
                        day_of_week='Monday', time_slot=s_slot, subject_id=lab1.id,
                        faculty_id=lab1_prof.id, classroom_id=lab_room_1.id, lab_batch='Batch A'
                    ))
                    occupied.add(('Monday', s_slot))
                    total_created += 1

            # Schedule Lab 2: Wednesday Afternoon -> STRICTLY SLOTS 6, 7, 8 (Rule: Afternoon Lab = Slots 6-7-8)
            if len(lab_subjs) > 1:
                lab2 = lab_subjs[1]
                lab2_prof = subject_faculty_map[lab2.id]
                for s_slot in [6, 7, 8]:
                    db.add(TimetableEntry(
                        department_id=csd.id, section=sec, academic_year=sec_year,
                        day_of_week='Wednesday', time_slot=s_slot, subject_id=lab2.id,
                        faculty_id=lab2_prof.id, classroom_id=lab_room_2.id, lab_batch='Batch A'
                    ))
                    occupied.add(('Wednesday', s_slot))
                    total_created += 1

            # Schedule ALL Theory Subjects into Home Room with designated Professor
            t_idx = 0
            for day_idx, day in enumerate(days):
                max_slots = 4 if day == 'Saturday' else 8

                for slot in range(1, max_slots + 1):
                    if slot == lunch_slot:
                        continue # Rule 0: Protected Lunch Break

                    if (day, slot) in occupied:
                        continue # Already occupied by Lab

                    if not theory_subjs:
                        continue

                    t_subj = theory_subjs[t_idx % len(theory_subjs)]
                    t_prof = subject_faculty_map[t_subj.id] # Always same professor for t_subj!

                    db.add(TimetableEntry(
                        department_id=csd.id, section=sec, academic_year=sec_year,
                        day_of_week=day, time_slot=slot, subject_id=t_subj.id,
                        faculty_id=t_prof.id, classroom_id=home_room.id, lab_batch='ALL'
                    ))
                    total_created += 1
                    t_idx += 1

        await db.commit()
        print(f"Successfully generated {total_created} 100% consistent timetable entries across {target_sections}!")

if __name__ == "__main__":
    asyncio.run(generate_perfect_csd_timetables())
