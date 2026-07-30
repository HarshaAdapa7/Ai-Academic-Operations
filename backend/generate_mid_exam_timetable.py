import asyncio
from datetime import datetime, timedelta
from sqlalchemy import select, text
from app.core.database import async_session_maker
from app.models.faculty import Department, Subject, FacultyProfile, SectionConfig
from app.models.classroom import Classroom
from app.models.timetable import ExamTimetableEntry

async def generate_mid_exam_timetable():
    print("="*75)
    print("=== ANITS MID EXAM TIMETABLE & INVIGILATION SCHEDULE GENERATOR ===")
    print("="*75)

    async with async_session_maker() as db:
        # Auto-ensure missing table columns exist
        alter_stmts = [
            "ALTER TABLE exam_timetable_entries ADD COLUMN exam_type VARCHAR(50) DEFAULT 'MID_1';",
            "ALTER TABLE exam_timetable_entries ADD COLUMN academic_year INTEGER DEFAULT 1;",
            "ALTER TABLE exam_timetable_entries ADD COLUMN semester INTEGER DEFAULT 1;"
        ]
        for stmt in alter_stmts:
            try:
                await db.execute(text(stmt))
                await db.commit()
            except Exception:
                await db.rollback()

        # Clear existing exam timetable entries
        await db.execute(text("DELETE FROM exam_timetable_entries;"))
        await db.commit()
        print("-> Purged old exam timetable entries.\n")

        depts = (await db.execute(select(Department).order_by(Department.code.asc()))).scalars().all()
        classrooms = (await db.execute(select(Classroom).order_by(Classroom.room_number.asc()))).scalars().all()
        faculty_list = (await db.execute(select(FacultyProfile).order_by(FacultyProfile.id.asc()))).scalars().all()

        if not classrooms or not faculty_list:
            print("Error: Classrooms or Faculty profiles missing.")
            return

        lecture_rooms = [r for r in classrooms if str(r.room_type).upper() not in ["LAB", "COMPUTER_LAB"]]
        if not lecture_rooms:
            lecture_rooms = classrooms

        start_date = datetime.utcnow().date() + timedelta(days=7) # Next week start
        
        # 2 Sessions per day: Slot 1 = 09:30-11:30 AM (Morning), Slot 2 = 01:00-03:00 PM (Afternoon)
        # 2nd & 3rd Year are scheduled on the SAME DAYS together for both sessions.
        total_created = 0
        invigilator_schedule = set() # (date, slot, invigilator_id)
        room_schedule = set() # (date, slot, room_id)

        room_idx = 0
        fac_idx = 0

        print(f"Targeting {len(depts)} Departments...")

        theory_by_year = {1: [], 2: [], 3: [], 4: []}
        for dept in depts:
            subjs = (await db.execute(select(Subject).where(Subject.department_id == dept.id))).scalars().all()
            for s in subjs:
                if str(s.subject_type).upper() != "LAB":
                    yr = s.academic_year if hasattr(s, "academic_year") and s.academic_year in [1, 2, 3, 4] else 1
                    theory_by_year[yr].append(s)

        for yr in [1, 2, 3, 4]:
            subjs_list = theory_by_year[yr]
            if not subjs_list:
                continue

            print(f"Scheduling Mid Exams for Year {yr} ({len(subjs_list)} theory subjects)...")

            dept_subjs_map = {}
            for s in subjs_list:
                dept_subjs_map.setdefault(s.department_id, []).append(s)

            for d_id, d_subjs in dept_subjs_map.items():
                for s_idx, subj in enumerate(d_subjs):
                    day_offset = s_idx // 2
                    time_slot = 1 if (s_idx % 2 == 0) else 2
                    exam_date = datetime.combine(start_date + timedelta(days=day_offset), datetime.min.time())

                    # Skip Sundays
                    while exam_date.weekday() == 6:
                        day_offset += 1
                        exam_date = datetime.combine(start_date + timedelta(days=day_offset), datetime.min.time())

                    # Find available classroom
                    assigned_room = None
                    for _ in range(len(lecture_rooms)):
                        candidate_room = lecture_rooms[room_idx % len(lecture_rooms)]
                        room_idx += 1
                        if (exam_date.date(), time_slot, candidate_room.id) not in room_schedule:
                            assigned_room = candidate_room
                            room_schedule.add((exam_date.date(), time_slot, candidate_room.id))
                            break
                    
                    if not assigned_room:
                        assigned_room = lecture_rooms[0]

                    # Find available invigilator
                    assigned_fac = None
                    for _ in range(len(faculty_list)):
                        candidate_fac = faculty_list[fac_idx % len(faculty_list)]
                        fac_idx += 1
                        if (exam_date.date(), time_slot, candidate_fac.id) not in invigilator_schedule:
                            assigned_fac = candidate_fac
                            invigilator_schedule.add((exam_date.date(), time_slot, candidate_fac.id))
                            break
                    
                    new_exam = ExamTimetableEntry(
                        exam_type="MID_1",
                        academic_year=yr,
                        semester=1,
                        exam_date=exam_date,
                        time_slot=time_slot,
                        subject_id=subj.id,
                        classroom_id=assigned_room.id,
                        invigilator_id=assigned_fac.id if assigned_fac else None
                    )
                    db.add(new_exam)
                    total_created += 1

        await db.commit()

        print("\n" + "="*75)
        print("=== GENERATION RESULT ===")
        print("="*75)
        print(f"Total Scheduled Mid Exam Slots: {total_created}")
        print(f"Scheduled Rooms Without Collision: {len(room_schedule)}")
        print(f"Invigilators Assigned Without Clash: {len(invigilator_schedule)}")
        print("="*75 + "\n")

if __name__ == "__main__":
    asyncio.run(generate_mid_exam_timetable())
