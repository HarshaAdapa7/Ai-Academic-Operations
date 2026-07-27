import asyncio
from sqlalchemy import select, delete, text
from app.core.database import async_session_maker
from app.models.user import User
from app.models.faculty import Department, FacultyProfile, Subject, SectionConfig, faculty_subjects, section_mentors, section_subject_teachers
from app.models.classroom import Classroom
from app.models.timetable import TimetableEntry, SubjectSchedulingRule, SchedulingRule, ExamTimetableEntry
from app.models.import_system import ImportHistory, ImportStagingRecord
from app.models.leave import LeaveRequest, SubstitutionProposal, FacultyLeaveBalance

async def purge_all_data():
    print("=" * 75)
    print("=== PURGING ALL LEGACY/OLD ACADEMIC DATA FOR CLEAN DEPARTMENT IMPORT ===")
    print("=" * 75)

    async with async_session_maker() as db:
        print("[1/5] Purging timetable entries, exam schedules, and scheduling rules...")
        await db.execute(delete(TimetableEntry))
        await db.execute(delete(ExamTimetableEntry))
        await db.execute(delete(SubjectSchedulingRule))
        await db.execute(delete(SchedulingRule))

        print("[2/5] Purging import history and staging records...")
        await db.execute(delete(ImportStagingRecord))
        await db.execute(delete(ImportHistory))

        print("[3/5] Purging section configurations and classroom mappings...")
        await db.execute(text("DELETE FROM section_subject_teachers"))
        await db.execute(text("DELETE FROM section_mentors"))
        await db.execute(text("DELETE FROM faculty_subjects"))
        await db.execute(delete(SectionConfig))
        await db.execute(delete(Classroom))

        print("[4/5] Purging non-HOD faculty profiles and non-HOD subjects...")
        await db.execute(delete(Subject))
        
        # Delete non-HOD faculty profiles
        hod_profile_ids = (await db.execute(select(FacultyProfile.id).where(FacultyProfile.is_hod == True))).scalars().all()
        if hod_profile_ids:
            await db.execute(delete(FacultyProfile).where(FacultyProfile.id.not_in(hod_profile_ids)))
        else:
            await db.execute(delete(FacultyProfile))

        # Delete non-admin, non-HOD user accounts
        hod_user_ids = (await db.execute(select(User.id).where(User.role.in_(["ADMIN", "HOD", "DEAN"])))).scalars().all()
        if hod_user_ids:
            await db.execute(delete(User).where(User.id.not_in(hod_user_ids)))

        await db.commit()

        print("[5/5] Database Purge Completed Successfully!")
        print("=" * 75)
        print("System is 100% clean and ready for clean department-by-department CSV/Excel imports.")
        print("=" * 75)

if __name__ == "__main__":
    asyncio.run(purge_all_data())
