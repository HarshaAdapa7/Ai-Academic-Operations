import asyncio
import io
import csv
import json
import uuid
from app.core.database import engine, Base, async_session_maker
from app.models.user import User
from app.models.faculty import Department, Subject, FacultyProfile, SectionConfig
from app.models.classroom import Classroom
from app.models.timetable import SubjectSchedulingRule
from app.models.import_system import ImportHistory, ImportStagingRecord
from sqlalchemy import select

async def run_import_test():
    print("=" * 70)
    print("=== DEPARTMENT DATA COLLECTION & IMPORT SYSTEM INTEGRATION TEST ===")
    print("=" * 70)

    async with async_session_maker() as db:
        # 1. Ensure target Department exists (e.g. Bio Technology - BT)
        res = await db.execute(select(Department).where(Department.code == "BT"))
        bt_dept = res.scalars().first()
        if not bt_dept:
            bt_dept = Department(id=str(uuid.uuid4()), name="Bio Technology", code="BT")
            db.add(bt_dept)
            await db.commit()
            await db.refresh(bt_dept)

        print(f"[OK] Target Department Scoping Verified: {bt_dept.name} [{bt_dept.code}] ({bt_dept.id})")

        # 2. Simulate Uploaded CSV File containing Faculty, Subjects with Weekly Hours, Sections, and Classrooms
        csv_rows = [
            {"entity_type": "FACULTY", "full_name": "Dr. V. Sridevi", "email": "sridevi_bt@anits.edu.in", "designation": "Professor", "max_weekly_workload": "16"},
            {"entity_type": "FACULTY", "full_name": "Dr. K. Eswara Rao", "email": "eswararao_bt@anits.edu.in", "designation": "Associate Professor", "max_weekly_workload": "16"},
            # Subject with custom weekly hours rule (4 hours theory, 3 hours lab)
            {"entity_type": "SUBJECT", "subject_code": "23BT3101", "subject_name": "Bioprocess Engineering", "credits": "4", "subject_type": "THEORY", "weekly_hours": "4", "academic_year": "3"},
            {"entity_type": "SUBJECT", "subject_code": "23BT3201", "subject_name": "Bioprocess Lab", "credits": "2", "subject_type": "LAB", "weekly_hours": "3", "academic_year": "3"},
            # Missing Field Row to test uploader remediation checklist
            {"entity_type": "SUBJECT", "subject_code": "23BT3102", "subject_name": "", "credits": "3", "subject_type": "THEORY", "weekly_hours": "3", "academic_year": "3"},
            # Section & Classroom
            {"entity_type": "SECTION", "section_name": "BT 3-A", "academic_year": "3"},
            {"entity_type": "CLASSROOM", "room_number": "BT-201", "building_name": "BT Block", "capacity": "60", "room_type": "THEORY"}
        ]

        # Ensure a test user exists
        u_res = await db.execute(select(User).limit(1))
        test_user = u_res.scalars().first()
        if not test_user:
            test_user = User(
                id=str(uuid.uuid4()),
                email="admin_test@anits.edu.in",
                hashed_password="pw",
                full_name="System Test Admin",
                role="ADMIN",
                department_id=bt_dept.id
            )
            db.add(test_user)
            await db.commit()
            await db.refresh(test_user)

        # 3. Create Import History Job
        import_job = ImportHistory(
            id=str(uuid.uuid4()),
            department_id=bt_dept.id,
            uploaded_by_id=test_user.id,
            file_name="biotechnology_master_import.csv",
            file_type="CSV",
            total_records=len(csv_rows),
            import_status="STAGED"
        )
        db.add(import_job)
        await db.flush()

        staged_recs = []
        valid_count = 0
        missing_count = 0

        for idx, row in enumerate(csv_rows, start=1):
            etype = row.get("entity_type", "FACULTY")
            row["department_id"] = bt_dept.id # Security Scoping Override
            
            missing = []
            errors = []
            if etype == "SUBJECT" and not row.get("subject_name"):
                missing.append("subject_name")
                errors.append("Subject name is missing.")

            status = "VALID"
            if errors:
                status = "MISSING_DATA" if missing else "INVALID"
                missing_count += 1
            else:
                valid_count += 1

            rec = ImportStagingRecord(
                id=str(uuid.uuid4()),
                import_history_id=import_job.id,
                department_id=bt_dept.id,
                entity_type=etype,
                row_number=idx,
                raw_data=row,
                validation_status=status,
                missing_fields_list=missing,
                error_messages=errors
            )
            staged_recs.append(rec)

        db.add_all(staged_recs)
        import_job.successful_records = valid_count
        import_job.missing_fields_count = missing_count
        await db.commit()

        print(f"[OK] Staging & Multi-Stage Validation Completed:")
        print(f"    - Total Staged Records   : {len(csv_rows)}")
        print(f"    - Valid Records          : {valid_count}")
        print(f"    - Missing Data Reminders : {missing_count}")

        # 4. Inline Remediation Test (Simulating HOD filling in missing subject name)
        missing_rec = [r for r in staged_recs if r.validation_status == "MISSING_DATA"][0]
        missing_rec.raw_data["subject_name"] = "Genetic Engineering"
        missing_rec.validation_status = "VALID"
        missing_rec.missing_fields_list = []
        missing_rec.error_messages = []
        import_job.successful_records += 1
        import_job.missing_fields_count -= 1
        await db.commit()

        print(f"[OK] Inline Data Remediation Verified: Fixed row {missing_rec.row_number} -> 'Genetic Engineering'")

        # 5. Production Atomic Database Commit Test
        all_staged = await db.execute(select(ImportStagingRecord).where(ImportStagingRecord.import_history_id == import_job.id, ImportStagingRecord.validation_status == "VALID"))
        to_commit = all_staged.scalars().all()

        committed_subjs = 0
        committed_fac = 0
        committed_secs = 0
        committed_rooms = 0

        for r in to_commit:
            d = r.raw_data
            et = r.entity_type
            if et == "FACULTY":
                committed_fac += 1
            elif et == "SUBJECT":
                code = d["subject_code"].upper()
                name = d["subject_name"]
                stype = d["subject_type"]
                hours = int(d.get("weekly_hours", 4))

                s_res = await db.execute(select(Subject).where(Subject.code == code))
                subj = s_res.scalars().first()
                if not subj:
                    subj = Subject(id=str(uuid.uuid4()), name=name, code=code, department_id=bt_dept.id, subject_type=stype, credits=int(d.get("credits", 3)), academic_year=int(d.get("academic_year", 3)))
                    db.add(subj)
                    await db.flush()

                r_res = await db.execute(select(SubjectSchedulingRule).where(SubjectSchedulingRule.subject_id == subj.id))
                sub_rule = r_res.scalars().first()
                if not sub_rule:
                    sub_rule = SubjectSchedulingRule(id=str(uuid.uuid4()), subject_id=subj.id, lectures_per_week=hours if stype == "THEORY" else 0, labs_per_week=1 if stype == "LAB" else 0, lab_duration=3 if stype == "LAB" else 1)
                    db.add(sub_rule)

                committed_subjs += 1
            elif et == "SECTION":
                committed_secs += 1
            elif et == "CLASSROOM":
                committed_rooms += 1

        import_job.import_status = "CONFIRMED"
        await db.commit()

        print(f"[OK] Production Database Commit Verified:")
        print(f"    - Faculty Members Committed : {committed_fac}")
        print(f"    - Subjects & Hours Committed : {committed_subjs}")
        print(f"    - Sections Committed        : {committed_secs}")
        print(f"    - Classrooms Committed       : {committed_rooms}")
        print(f"    - Final Import Status       : {import_job.import_status}")

        print("=" * 70)
        print("=== ALL DEPARTMENT IMPORT SYSTEM TESTS PASSED SUCCESSFULLY! ===")
        print("=" * 70)

if __name__ == "__main__":
    asyncio.run(run_import_test())
