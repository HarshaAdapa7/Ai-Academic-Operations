import os
import csv
import uuid
import asyncio
import logging
from sqlalchemy import text

from app.core.database import async_session_maker
from app.models.user import User, UserRole
from app.models.faculty import Department, Subject, FacultyProfile, SectionConfig
from app.models.classroom import Classroom

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("instant_importer")

WORKSPACE_DIR = r"c:\Users\harsh\Documents\dynamic time table management"

DEPT_CSV_FILES = [
    "biotechnology_master_import.csv",
    "chemical_engineering_master_import.csv",
    "civil_engineering_master_import.csv",
    "csd_master_import.csv",
    "cse_master_import.csv",
    "eee_master_import.csv",
    "it_master_import.csv"
]

async def main():
    logger.info("=== STARTING 1-SECOND INSTANT REAL ANITS COLLEGE DATA IMPORT ===")

    async with async_session_maker() as db:
        try:
            await db.execute(text("""
                TRUNCATE TABLE ai_messages, ai_conversations, substitution_proposals, leave_requests, 
                faculty_leave_balances, timetable_entries, exam_timetable_entries, subject_scheduling_rules, 
                seating_assignments, seating_plans, faculty_availability, section_mentors, faculty_subjects, 
                section_configs, faculty_profiles, subjects, classrooms, scheduling_rules, departments, 
                password_resets, academic_policies CASCADE;
            """))
            await db.execute(text("DELETE FROM users WHERE email != 'harshaadapa23@gmail.com';"))
            await db.commit()
            logger.info("Database truncated cleanly.")
        except Exception as e:
            await db.rollback()
            logger.warning(f"Truncate notice: {e}")

        # Ensure Admin User exists
        admin_check = await db.execute(text("SELECT id FROM users WHERE email = 'harshaadapa23@gmail.com';"))
        if not admin_check.fetchone():
            await db.execute(text("""
                INSERT INTO users (id, email, password_hash, full_name, role, is_active, created_at)
                VALUES ('162da89e-9976-4403-9280-b1451f6ec3b0', 'harshaadapa23@gmail.com', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeg6Lruj3vjPGga31lW', 'harsha adapa', 'ADMIN', true, NOW());
            """))
            await db.commit()

        # Seed core RAG policies
        await db.execute(text("""
            INSERT INTO academic_policies (id, title, category, content, tags, created_at)
            VALUES 
            ('pol-leave-001', 'Faculty Leave & Substitution Policy', 'LEAVE_POLICY', 'Faculty members must submit leave applications at least 24 hours prior. Substitutes must belong to the same department and hold expertise in the assigned subject course.', 'leave,substitution,approval,hod', NOW()),
            ('pol-lab-001', 'Practical Computer & Engineering Laboratory Slot Guidelines', 'TIMETABLE_RULE', 'Practical lab sessions must be assigned in continuous 3-slot blocks. Parallel lab batches (e.g. Batch A & Batch B) must be scheduled simultaneously with designated lab assistants.', 'lab,practical,continuous_slots,batch', NOW()),
            ('pol-workload-001', 'Faculty Workload Allocation Standards', 'WORKLOAD_POLICY', 'Full-time Assistant Professors have a maximum target weekly workload of 16-18 slots. HODs and Senior Professors have a reduced target of 12-14 slots to account for administrative duties.', 'workload,capacity,teaching_hours,limits', NOW())
            ON CONFLICT DO NOTHING;
        """))
        await db.commit()

        logger.info("Parsing 7 department CSV files in memory...")

        depts_map = {}      # code -> name
        subjs_map = {}      # code -> dict
        users_map = {}      # email -> dict
        rooms_map = {}      # room_num -> dict
        secs_map = {}       # (dept_code, name) -> dict
        fac_subj_pairs = set() # (email, subj_code)
        sec_mentor_pairs = set() # ((dept_code, sec_name), email)

        dept_metrics = {}
        total_rows = 0

        for fname in DEPT_CSV_FILES:
            fpath = os.path.join(WORKSPACE_DIR, fname)
            if not os.path.exists(fpath):
                continue

            with open(fpath, 'r', encoding='utf-8-sig', errors='ignore') as f:
                reader = csv.DictReader(f)
                for r in reader:
                    clean_row = {}
                    for k, v in r.items():
                        if k and v is not None:
                            clean_row[k.strip().lower().replace(" ", "").replace("_", "").replace("-", "")] = str(v).strip()
                    if not clean_row or not any(clean_row.values()):
                        continue

                    total_rows += 1
                    dept_code = (clean_row.get('department') or clean_row.get('departmentcode') or 'GEN').upper()
                    dept_name = clean_row.get('departmentname') or f"{dept_code} Department"
                    depts_map[dept_code] = dept_name

                    if dept_code not in dept_metrics:
                        dept_metrics[dept_code] = {"name": dept_name, "rows": 0, "subjects": set(), "faculty": set(), "sections": set(), "classrooms": set()}
                    dept_metrics[dept_code]["rows"] += 1

                    year_raw = clean_row.get('academicyear') or clean_row.get('year') or '1'
                    try:
                        year_val = int(''.join(filter(str.isdigit, str(year_raw))) or 1)
                    except Exception:
                        year_val = 1

                    sec_name = clean_row.get('sectionname') or clean_row.get('section') or f"{dept_code} {year_val}-A"
                    secs_map[(dept_code, sec_name)] = {"dept_code": dept_code, "academic_year": year_val, "name": sec_name, "class_teacher_email": None}
                    dept_metrics[dept_code]["sections"].add(sec_name)

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

                    subjs_map[subj_code] = {"code": subj_code, "name": subj_name, "dept_code": dept_code, "subject_type": subj_type, "academic_year": year_val}
                    dept_metrics[dept_code]["subjects"].add(subj_code)

                    fac_email = (clean_row.get('facultyemail') or clean_row.get('email') or f"prof.{dept_code.lower()}@anits.edu.in").lower()
                    fac_name = clean_row.get('facultyname') or clean_row.get('faculty') or 'Faculty Member'
                    designation = clean_row.get('designation') or 'Assistant Professor'

                    is_hod = str(clean_row.get('ishod', '')).lower() in ['true', '1', 'yes']
                    is_dean = str(clean_row.get('isdean', '')).lower() in ['true', '1', 'yes']
                    is_ct = str(clean_row.get('isclassteacher', '')).lower() in ['true', '1', 'yes']

                    users_map[fac_email] = {
                        "email": fac_email,
                        "full_name": fac_name,
                        "dept_code": dept_code,
                        "designation": designation,
                        "is_hod": is_hod,
                        "is_dean": is_dean,
                        "max_workload": 14 if (is_hod or is_dean or 'professor' in designation.lower() and 'assistant' not in designation.lower()) else 18
                    }
                    dept_metrics[dept_code]["faculty"].add(fac_email)

                    if is_ct:
                        secs_map[(dept_code, sec_name)]["class_teacher_email"] = fac_email

                    fac_subj_pairs.add((fac_email, subj_code))

                    room_num = clean_row.get('roomnumber') or clean_row.get('room')
                    if room_num:
                        rm_num_str = str(room_num).strip()
                        cap_raw = clean_row.get('capacity') or '60'
                        try:
                            cap = int(''.join(filter(str.isdigit, str(cap_raw))) or 60)
                        except Exception:
                            cap = 60
                        rm_type_raw = str(clean_row.get('roomtype') or 'CLASSROOM').upper()
                        rm_type = 'LAB' if 'LAB' in rm_type_raw else ('SEMINAR_HALL' if 'HALL' in rm_type_raw else 'CLASSROOM')
                        rooms_map[rm_num_str] = {"room_number": rm_num_str, "capacity": cap, "room_type": rm_type, "dept_code": dept_code}
                        dept_metrics[dept_code]["classrooms"].add(rm_num_str)

                    mentor_raw = clean_row.get('mentoremails') or clean_row.get('mentors') or ''
                    if mentor_raw:
                        for m_email in [m.strip().lower() for m in mentor_raw.split(',') if m.strip()]:
                            sec_mentor_pairs.add(((dept_code, sec_name), m_email))

        logger.info(f"Parsed {total_rows} total rows. Generating in-memory UUIDs for instant bulk commit...")

        dept_id_map = {}
        for code, name in depts_map.items():
            d_id = str(uuid.uuid4())
            dept_id_map[code] = d_id
            db.add(Department(id=d_id, name=name, code=code))

        subj_id_map = {}
        for code, sdict in subjs_map.items():
            s_id = str(uuid.uuid4())
            subj_id_map[code] = s_id
            db.add(Subject(
                id=s_id,
                name=sdict["name"],
                code=code,
                department_id=dept_id_map[sdict["dept_code"]],
                subject_type=sdict["subject_type"],
                academic_year=sdict["academic_year"],
                credits=3 if sdict["subject_type"] == 'THEORY' else 2
            ))

        prof_id_map = {}
        for email, udict in users_map.items():
            u_id = str(uuid.uuid4())
            f_id = str(uuid.uuid4())
            prof_id_map[email] = f_id

            db.add(User(
                id=u_id,
                email=email,
                full_name=udict["full_name"],
                password_hash="$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeg6Lruj3vjPGga31lW",
                role=UserRole.HOD if udict["is_hod"] else UserRole.FACULTY
            ))
            db.add(FacultyProfile(
                id=f_id,
                user_id=u_id,
                department_id=dept_id_map[udict["dept_code"]],
                designation=udict["designation"],
                is_hod=udict["is_hod"],
                is_dean=udict["is_dean"],
                max_weekly_workload=udict["max_workload"]
            ))

        for rnum, rdict in rooms_map.items():
            db.add(Classroom(
                id=str(uuid.uuid4()),
                room_number=rnum,
                capacity=rdict["capacity"],
                room_type=rdict["room_type"],
                department_id=dept_id_map[rdict["dept_code"]]
            ))

        sec_id_map = {}
        for s_key, sdict in secs_map.items():
            sec_id = str(uuid.uuid4())
            sec_id_map[s_key] = sec_id
            ct_id = prof_id_map.get(sdict["class_teacher_email"]) if sdict["class_teacher_email"] else None
            db.add(SectionConfig(
                id=sec_id,
                department_id=dept_id_map[sdict["dept_code"]],
                academic_year=sdict["academic_year"],
                name=sdict["name"],
                class_teacher_id=ct_id
            ))

        # Single batch commit for all primary entities
        await db.commit()
        logger.info("Primary entities committed. Executing bulk bridge inserts...")

        # Bulk parameters for bridge tables
        fac_subj_dicts = []
        for email, scode in fac_subj_pairs:
            pid = prof_id_map.get(email)
            sid = subj_id_map.get(scode)
            if pid and sid:
                fac_subj_dicts.append({"fid": pid, "sid": sid})

        if fac_subj_dicts:
            await db.execute(text(
                "INSERT INTO faculty_subjects (faculty_id, subject_id) VALUES (:fid, :sid) ON CONFLICT DO NOTHING;"
            ), fac_subj_dicts)

        sec_mentor_dicts = []
        for s_key, email in sec_mentor_pairs:
            sec_id = sec_id_map.get(s_key)
            pid = prof_id_map.get(email)
            if sec_id and pid:
                sec_mentor_dicts.append({"sec_id": sec_id, "fid": pid})

        if sec_mentor_dicts:
            await db.execute(text(
                "INSERT INTO section_mentors (section_id, faculty_id) VALUES (:sec_id, :fid) ON CONFLICT DO NOTHING;"
            ), sec_mentor_dicts)

        await db.commit()
        logger.info("INSTANT BULK COMMIT SUCCESSFUL!")

        # Audit Summary Generation
        report = []
        report.append("="*70)
        report.append("=== ANITS REAL COLLEGE DATA IMPORT SUMMARY REPORT ===")
        report.append("="*70)
        report.append(f"Total CSV Data Rows Processed Across 7 Departments: {total_rows}\n")
        
        for d_code, metrics in dept_metrics.items():
            report.append(f"Department [{d_code}] - {metrics['name']}:")
            report.append(f"  - Rows Processed: {metrics['rows']}")
            report.append(f"  - Unique Subjects: {len(metrics['subjects'])}")
            report.append(f"  - Unique Faculty: {len(metrics['faculty'])}")
            report.append(f"  - Unique Sections: {len(metrics['sections'])} ({', '.join(sorted(metrics['sections']))})")
            report.append(f"  - Unique Classrooms: {len(metrics['classrooms'])}")
            report.append("-" * 50)

        report.append("\n--- POST-IMPORT DATABASE RECORD COUNTS ---")
        tables = [
            'users', 'departments', 'subjects', 'faculty_profiles', 
            'faculty_subjects', 'section_configs', 'section_mentors',
            'classrooms', 'academic_policies'
        ]
        for t in tables:
            res = await db.execute(text(f"SELECT COUNT(*) FROM {t};"))
            report.append(f"  {t:30s}: {res.scalar()} rows")
        report.append("="*70)

        full_report_text = "\n".join(report)
        print(full_report_text)

        with open("instant_import_report.txt", "w", encoding="utf-8") as rf:
            rf.write(full_report_text)

if __name__ == "__main__":
    asyncio.run(main())
