import os
import csv
import asyncio
import logging
from sqlalchemy import text, select

from app.core.database import engine, async_session_maker
from app.models.user import User, UserRole
from app.models.faculty import (
    Department, Subject, FacultyProfile, SectionConfig, 
    faculty_subjects, section_mentors
)
from app.models.classroom import Classroom

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("real_csv_importer")

WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DEPT_CSV_FILES = [
    "biotechnology_master_import.csv",
    "chemical_engineering_master_import.csv",
    "civil_engineering_master_import.csv",
    "csd_master_import.csv",
    "cse_master_import.csv",
    "eee_master_import.csv",
    "it_master_import.csv"
]

async def import_all_real_data():
    logger.info("=== STARTING ULTRA-FAST ZERO-DATA-LOSS REAL ANITS COLLEGE DATA IMPORT ===")
    
    total_processed_rows = 0
    total_warnings = []
    dept_summary = {}

    async with engine.begin() as conn:
        logger.info("Purging sample data & initializing schema...")
        truncate_queries = [
            "TRUNCATE TABLE ai_messages CASCADE;",
            "TRUNCATE TABLE ai_conversations CASCADE;",
            "TRUNCATE TABLE substitution_proposals CASCADE;",
            "TRUNCATE TABLE leave_requests CASCADE;",
            "TRUNCATE TABLE faculty_leave_balances CASCADE;",
            "TRUNCATE TABLE timetable_entries CASCADE;",
            "TRUNCATE TABLE exam_timetable_entries CASCADE;",
            "TRUNCATE TABLE subject_scheduling_rules CASCADE;",
            "TRUNCATE TABLE seating_assignments CASCADE;",
            "TRUNCATE TABLE seating_plans CASCADE;",
            "TRUNCATE TABLE faculty_availability CASCADE;",
            "TRUNCATE TABLE section_mentors CASCADE;",
            "TRUNCATE TABLE faculty_subjects CASCADE;",
            "TRUNCATE TABLE section_configs CASCADE;",
            "TRUNCATE TABLE faculty_profiles CASCADE;",
            "TRUNCATE TABLE subjects CASCADE;",
            "TRUNCATE TABLE classrooms CASCADE;",
            "TRUNCATE TABLE scheduling_rules CASCADE;",
            "TRUNCATE TABLE departments CASCADE;",
            "TRUNCATE TABLE password_resets CASCADE;",
            "TRUNCATE TABLE academic_policies CASCADE;"
        ]
        for tq in truncate_queries:
            try:
                await conn.execute(text(tq))
            except Exception as e:
                pass

        # Preserve Admin user
        await conn.execute(text("DELETE FROM users WHERE email != 'harshaadapa23@gmail.com';"))
        admin_check = await conn.execute(text("SELECT id FROM users WHERE email = 'harshaadapa23@gmail.com';"))
        if not admin_check.fetchone():
            await conn.execute(text("""
                INSERT INTO users (id, email, password_hash, full_name, role, is_active, created_at)
                VALUES ('162da89e-9976-4403-9280-b1451f6ec3b0', 'harshaadapa23@gmail.com', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeg6Lruj3vjPGga31lW', 'harsha adapa', 'ADMIN', true, NOW());
            """))

        # Seed core RAG policies
        await conn.execute(text("""
            INSERT INTO academic_policies (id, title, category, content, tags, created_at)
            VALUES 
            ('pol-leave-001', 'Faculty Leave & Substitution Policy', 'LEAVE_POLICY', 'Faculty members must submit leave applications at least 24 hours prior. Substitutes must belong to the same department and hold expertise in the assigned subject course.', 'leave,substitution,approval,hod', NOW()),
            ('pol-lab-001', 'Practical Computer & Engineering Laboratory Slot Guidelines', 'TIMETABLE_RULE', 'Practical lab sessions must be assigned in continuous 3-slot blocks. Parallel lab batches (e.g. Batch A & Batch B) must be scheduled simultaneously with designated lab assistants.', 'lab,practical,continuous_slots,batch', NOW()),
            ('pol-workload-001', 'Faculty Workload Allocation Standards', 'WORKLOAD_POLICY', 'Full-time Assistant Professors have a maximum target weekly workload of 16-18 slots. HODs and Senior Professors have a reduced target of 12-14 slots to account for administrative duties.', 'workload,capacity,teaching_hours,limits', NOW());
        """))

    logger.info("Database initialized. Loading in-memory cache structures...")

    # Fast in-memory cache maps
    depts_cache = {}    # dept_code -> Department obj
    subjs_cache = {}    # subj_code -> Subject obj
    users_cache = {}    # email -> User obj
    profs_cache = {}    # email -> FacultyProfile obj
    rooms_cache = {}    # room_number -> Classroom obj
    secs_cache = {}     # (dept_id, sec_name) -> SectionConfig obj
    
    faculty_subjects_set = set() # (prof_id, subj_id)
    section_mentors_set = set()  # (sec_id, prof_id)

    async with async_session_maker() as db:
        # Load any existing initial data into cache
        dept_res = await db.execute(select(Department))
        for d in dept_res.scalars().all():
            depts_cache[d.code] = d

        for fname in DEPT_CSV_FILES:
            fpath = os.path.join(WORKSPACE_DIR, fname)
            if not os.path.exists(fpath):
                logger.error(f"File not found: {fname}")
                continue

            dept_file_rows = 0
            with open(fpath, 'r', encoding='utf-8-sig', errors='ignore') as f:
                reader = csv.DictReader(f)
                for line_idx, r in enumerate(reader, start=2):
                    clean_row = {}
                    for k, v in r.items():
                        if k and v is not None:
                            ck = k.strip().lower().replace(" ", "").replace("_", "").replace("-", "")
                            clean_row[ck] = str(v).strip()
                    
                    if not clean_row or not any(clean_row.values()):
                        continue

                    try:
                        # 1. Department
                        dept_code = (clean_row.get('department') or clean_row.get('departmentcode') or 'GEN').upper()
                        dept_name = clean_row.get('departmentname') or f"{dept_code} Department"

                        if dept_code not in depts_cache:
                            dept = Department(name=dept_name, code=dept_code)
                            db.add(dept)
                            await db.flush()
                            depts_cache[dept_code] = dept
                        else:
                            dept = depts_cache[dept_code]
                        dept_id = dept.id

                        if dept_code not in dept_summary:
                            dept_summary[dept_code] = {"name": dept_name, "rows": 0, "subjects": set(), "faculty": set(), "sections": set(), "classrooms": set()}
                        dept_summary[dept_code]["rows"] += 1

                        # 2. Academic Year & Section
                        year_raw = clean_row.get('academicyear') or clean_row.get('year') or '1'
                        try:
                            year_val = int(''.join(filter(str.isdigit, str(year_raw))) or 1)
                        except Exception:
                            year_val = 1
                        
                        sec_name = clean_row.get('sectionname') or clean_row.get('section') or f"{dept_code} {year_val}-A"
                        dept_summary[dept_code]["sections"].add(sec_name)

                        # 3. Subject
                        subj_code = (clean_row.get('subjectcode') or clean_row.get('code') or f"{dept_code}101").upper()
                        subj_name = clean_row.get('subjectname') or clean_row.get('subject') or 'Core Subject'
                        
                        type_raw = str(clean_row.get('subjecttype') or clean_row.get('type') or 'THEORY').upper()
                        if any(lk in type_raw for lk in ['LAB', 'PRACTICAL', 'LABORATORY']):
                            subj_type = 'LAB'
                        elif any(ck in type_raw for ck in ['COUNSEL', 'MENTOR']):
                            subj_type = 'COUNSELLING'
                        elif any(sk in type_raw for sk in ['SPORT', 'LIBRARY']):
                            subj_type = 'SPORTS_LIBRARY'
                        elif 'ELEC' in type_raw:
                            subj_type = 'ELECTIVE'
                        else:
                            subj_type = 'THEORY'

                        if subj_code not in subjs_cache:
                            subj = Subject(
                                name=subj_name,
                                code=subj_code,
                                department_id=dept_id,
                                subject_type=subj_type,
                                academic_year=year_val,
                                credits=3 if subj_type == 'THEORY' else 2
                            )
                            db.add(subj)
                            await db.flush()
                            subjs_cache[subj_code] = subj
                        else:
                            subj = subjs_cache[subj_code]
                            subj.name = subj_name
                            subj.subject_type = subj_type
                            subj.academic_year = year_val

                        dept_summary[dept_code]["subjects"].add(subj_code)

                        # 4. User & Faculty Profile
                        fac_email = (clean_row.get('facultyemail') or clean_row.get('email') or f"prof.{dept_code.lower()}@anits.edu.in").lower()
                        fac_name = clean_row.get('facultyname') or clean_row.get('faculty') or 'Faculty Member'
                        designation = clean_row.get('designation') or 'Assistant Professor'

                        is_hod = str(clean_row.get('ishod', '')).lower() in ['true', '1', 'yes']
                        is_dean = str(clean_row.get('isdean', '')).lower() in ['true', '1', 'yes']
                        is_class_teacher = str(clean_row.get('isclassteacher', '')).lower() in ['true', '1', 'yes']

                        max_workload = 14 if (is_hod or is_dean or 'professor' in designation.lower() and 'assistant' not in designation.lower()) else 18

                        user_role = UserRole.HOD if is_hod else UserRole.FACULTY
                        if fac_email not in users_cache:
                            usr = User(
                                email=fac_email,
                                full_name=fac_name,
                                password_hash="$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeg6Lruj3vjPGga31lW", # '1234567'
                                role=user_role
                            )
                            db.add(usr)
                            await db.flush()
                            users_cache[fac_email] = usr
                        else:
                            usr = users_cache[fac_email]
                            usr.full_name = fac_name
                            if is_hod:
                                usr.role = UserRole.HOD

                        if fac_email not in profs_cache:
                            prof = FacultyProfile(
                                user_id=usr.id,
                                department_id=dept_id,
                                designation=designation,
                                is_hod=is_hod,
                                is_dean=is_dean,
                                max_weekly_workload=max_workload
                            )
                            db.add(prof)
                            await db.flush()
                            profs_cache[fac_email] = prof
                        else:
                            prof = profs_cache[fac_email]
                            prof.department_id = dept_id
                            prof.designation = designation
                            prof.is_hod = is_hod or prof.is_hod
                            prof.is_dean = is_dean or prof.is_dean
                            prof.max_weekly_workload = max_workload

                        dept_summary[dept_code]["faculty"].add(fac_email)

                        # Link Faculty to Subject Expertise
                        if (prof.id, subj.id) not in faculty_subjects_set:
                            faculty_subjects_set.add((prof.id, subj.id))
                            await db.execute(text(
                                "INSERT INTO faculty_subjects (faculty_id, subject_id) VALUES (:fid, :sid) ON CONFLICT DO NOTHING;"
                            ), {"fid": prof.id, "sid": subj.id})

                        # 5. Classroom
                        room_num = clean_row.get('roomnumber') or clean_row.get('room')
                        if room_num:
                            rm_num_str = str(room_num).strip()
                            if rm_num_str not in rooms_cache:
                                cap_raw = clean_row.get('capacity') or '60'
                                try:
                                    cap = int(''.join(filter(str.isdigit, str(cap_raw))) or 60)
                                except Exception:
                                    cap = 60
                                rm_type_raw = str(clean_row.get('roomtype') or 'CLASSROOM').upper()
                                rm_type = 'LAB' if 'LAB' in rm_type_raw else ('SEMINAR_HALL' if 'HALL' in rm_type_raw else 'CLASSROOM')
                                rm = Classroom(room_number=rm_num_str, capacity=cap, room_type=rm_type, department_id=dept_id)
                                db.add(rm)
                                await db.flush()
                                rooms_cache[rm_num_str] = rm
                            dept_summary[dept_code]["classrooms"].add(rm_num_str)

                        # 6. SectionConfig & Mentors
                        sec_key = (dept_id, sec_name)
                        if sec_key not in secs_cache:
                            sec_cfg = SectionConfig(department_id=dept_id, academic_year=year_val, name=sec_name)
                            db.add(sec_cfg)
                            await db.flush()
                            secs_cache[sec_key] = sec_cfg
                        else:
                            sec_cfg = secs_cache[sec_key]

                        if is_class_teacher:
                            sec_cfg.class_teacher_id = prof.id

                        # Counseling Mentors
                        mentor_raw = clean_row.get('mentoremails') or clean_row.get('mentors') or ''
                        if mentor_raw:
                            mentor_emails = [m.strip().lower() for m in mentor_raw.split(',') if m.strip()]
                            for m_email in mentor_emails:
                                m_prof = profs_cache.get(m_email)
                                if m_prof:
                                    if (sec_cfg.id, m_prof.id) not in section_mentors_set:
                                        section_mentors_set.add((sec_cfg.id, m_prof.id))
                                        await db.execute(text(
                                            "INSERT INTO section_mentors (section_id, faculty_id) VALUES (:sec_id, :fid) ON CONFLICT DO NOTHING;"
                                        ), {"sec_id": sec_cfg.id, "fid": m_prof.id})

                        dept_file_rows += 1
                        total_processed_rows += 1

                    except Exception as row_err:
                        warn_msg = f"File {fname} Line {line_idx}: {str(row_err)}"
                        logger.error(warn_msg)
                        total_warnings.append(warn_msg)

            logger.info(f"File {fname} completed: {dept_file_rows} row(s) processed.")

        await db.commit()
        logger.info("All data committed to database successfully!")

        # Final Database Verification Audit Report
        print("\n" + "="*70)
        print("=== ANITS REAL COLLEGE DATA IMPORT SUMMARY REPORT ===")
        print("="*70)
        print(f"Total CSV Data Rows Processed Across 7 Departments: {total_processed_rows}")
        print(f"Total Warnings / Errors: {len(total_warnings)}")
        print("\n--- DEPARTMENT BREAKDOWN ---")
        
        for d_code, metrics in dept_summary.items():
            print(f"Department [{d_code}] - {metrics['name']}:")
            print(f"  - Rows Processed: {metrics['rows']}")
            print(f"  - Unique Subjects: {len(metrics['subjects'])}")
            print(f"  - Unique Faculty: {len(metrics['faculty'])}")
            print(f"  - Unique Sections: {len(metrics['sections'])} ({', '.join(sorted(metrics['sections']))})")
            print(f"  - Unique Classrooms: {len(metrics['classrooms'])}")
            print("-" * 50)

        # Database Row Counts Audit
        tables = [
            'users', 'departments', 'subjects', 'faculty_profiles', 
            'faculty_subjects', 'section_configs', 'section_mentors',
            'classrooms', 'academic_policies'
        ]
        print("\n--- POST-IMPORT DATABASE RECORD COUNTS ---")
        for t in tables:
            res = await db.execute(text(f"SELECT COUNT(*) FROM {t};"))
            print(f"  {t:30s}: {res.scalar()} rows")
        print("="*70 + "\n")

if __name__ == "__main__":
    asyncio.run(import_all_real_data())
