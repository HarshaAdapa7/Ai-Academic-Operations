import asyncio
import sys
from sqlalchemy import text
from app.core.database import async_session_maker

async def view_timetable(section_name="CSE 3-A"):
    async with async_session_maker() as db:
        res = await db.execute(text("""
            SELECT t.section, t.day_of_week, t.time_slot, s.code as subject_code, s.name as subject_name, 
                   u.full_name as faculty_name, c.room_number, c.room_type, t.lab_batch
            FROM timetable_entries t
            LEFT JOIN subjects s ON t.subject_id = s.id
            LEFT JOIN faculty_profiles f ON t.faculty_id = f.id
            LEFT JOIN users u ON f.user_id = u.id
            LEFT JOIN classrooms c ON t.classroom_id = c.id
            WHERE t.section = :sec
            ORDER BY CASE t.day_of_week
                WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
                WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 END, t.time_slot;
        """), {"sec": section_name})
        rows = res.fetchall()

        if not rows:
            print(f"No timetable entries found for section: {section_name}")
            return

        print("=" * 95)
        print(f"=== WEEKLY MASTER TIMETABLE FOR SECTION [{section_name}] ===")
        print("=" * 95)
        header = f"{'DAY':10s} | {'SLOT':10s} | {'SUBJECT':15s} | {'FACULTY ASSIGNED':25s} | {'ROOM / LAB':15s} | {'BATCH'}"
        print(header)
        print("-" * 95)

        for r in rows:
            day = r[1]
            slot = f"Period {r[2]}"
            subj = r[3] or "FREE"
            fac = r[5] or "N/A"
            room = f"Room {r[6]}" if r[6] else "Outdoor / N/A"
            batch = r[8] or "ALL"
            print(f"{day:10s} | {slot:10s} | {subj:15s} | {fac:25s} | {room:15s} | {batch}")
        print("=" * 95 + "\n")

if __name__ == "__main__":
    sec = sys.argv[1] if len(sys.argv) > 1 else "CSE 3-A"
    asyncio.run(view_timetable(sec))
