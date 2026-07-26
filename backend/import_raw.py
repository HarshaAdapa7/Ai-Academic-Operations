import os
import csv
import asyncio
from sqlalchemy import text
from app.core.database import engine

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
    print("=== STARTING SUPABASE PGBOUNCER COMPATIBLE REAL COLLEGE IMPORT ===")

    # 1. Truncate sample data table by table
    tables = [
        'ai_messages', 'ai_conversations', 'substitution_proposals', 'leave_requests', 
        'faculty_leave_balances', 'timetable_entries', 'exam_timetable_entries', 
        'subject_scheduling_rules', 'seating_assignments', 'seating_plans', 
        'faculty_availability', 'section_mentors', 'faculty_subjects', 'section_configs', 
        'faculty_profiles', 'subjects', 'classrooms', 'scheduling_rules', 
        'departments', 'password_resets', 'academic_policies'
    ]
    
    async with engine.begin() as conn:
        for t in tables:
            try:
                await conn.execute(text(f"DELETE FROM {t};"))
            except Exception as e:
                pass

        await conn.execute(text("DELETE FROM users WHERE email != 'harshaadapa23@gmail.com';"))

        # Ensure Admin exists
        admin_row = await conn.execute(text("SELECT id FROM users WHERE email = 'harshaadapa23@gmail.com';"))
        if not admin_row.fetchone():
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
            ('pol-workload-001', 'Faculty Workload Allocation Standards', 'WORKLOAD_POLICY', 'Full-time Assistant Professors have a maximum target weekly workload of 16-18 slots. HODs and Senior Professors have a reduced target of 12-14 slots to account for administrative duties.', 'workload,capacity,teaching_hours,limits', NOW())
            ON CONFLICT DO NOTHING;
        """))

    print("Database purged cleanly. Parsing 7 CSV files...")

    depts_map = {}      # code -> name
    subjs_map = {}      # code -> dict
    users_map = {}      # email -> dict
    rooms_map = {}      # room_num -> dict
    secs_map = {}       # (dept_code, name) -> dict
    fac_subj_pairs = set()
    sec_mentor_pairs = set()

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

    print(f"Parsed {total_rows} CSV rows into memory. Inserting records...")

    async with engine.begin() as conn:
        # A. Departments
        dept_id_map = {}
        for code, name in depts_map.items():
            res = await conn.execute(text("""
                INSERT INTO departments (id, name, code, created_at)
                VALUES (gen_random_uuid(), :name, :code, NOW())
                RETURNING id;
            """), {"name": name, "code": code})
            dept_id_map[code] = res.scalar()

        # B. Subjects
        subj_id_map = {}
        for code, sdict in subjs_map.items():
            credits_val = 3 if sdict["subject_type"] == 'THEORY' else 2
            res = await conn.execute(text("""
                INSERT INTO subjects (id, name, code, department_id, subject_type, academic_year, credits, created_at)
                VALUES (gen_random_uuid(), :name, :code, :did, :stype, :ayear, :creds, NOW())
                RETURNING id;
            """), {
                "name": sdict["name"], "code": code, "did": dept_id_map[sdict["dept_code"]],
                "stype": sdict["subject_type"], "ayear": sdict["academic_year"], "creds": credits_val
            })
            subj_id_map[code] = res.scalar()

        # C. Users & FacultyProfiles
        prof_id_map = {}
        for email, udict in users_map.items():
            role_str = 'HOD' if udict["is_hod"] else 'FACULTY'
            u_res = await conn.execute(text("""
                INSERT INTO users (id, email, password_hash, full_name, role, is_active, created_at)
                VALUES (gen_random_uuid(), :email, '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeg6Lruj3vjPGga31lW', :fname, :role, true, NOW())
                RETURNING id;
            """), {"email": email, "fname": udict["full_name"], "role": role_str})
            u_id = u_res.scalar()

            f_res = await conn.execute(text("""
                INSERT INTO faculty_profiles (id, user_id, department_id, designation, max_weekly_workload, is_hod, is_dean, created_at)
                VALUES (gen_random_uuid(), :uid, :did, :desig, :maxw, :ishod, :isdean, NOW())
                RETURNING id;
            """), {
                "uid": u_id, "did": dept_id_map[udict["dept_code"]], "desig": udict["designation"],
                "maxw": udict["max_workload"], "ishod": udict["is_hod"], "isdean": udict["is_dean"]
            })
            prof_id_map[email] = f_res.scalar()

        # D. Classrooms
        for rnum, rdict in rooms_map.items():
            await conn.execute(text("""
                INSERT INTO classrooms (id, room_number, capacity, room_type, department_id, created_at)
                VALUES (gen_random_uuid(), :rnum, :cap, :rtype, :did, NOW());
            """), {
                "rnum": rnum, "cap": rdict["capacity"], "rtype": rdict["room_type"], "did": dept_id_map[rdict["dept_code"]]
            })

        # E. SectionConfigs
        sec_id_map = {}
        for s_key, sdict in secs_map.items():
            ct_id = prof_id_map.get(sdict["class_teacher_email"]) if sdict["class_teacher_email"] else None
            res = await conn.execute(text("""
                INSERT INTO section_configs (id, department_id, academic_year, name, class_teacher_id, created_at)
                VALUES (gen_random_uuid(), :did, :ayear, :name, :ctid, NOW())
                RETURNING id;
            """), {
                "did": dept_id_map[sdict["dept_code"]], "ayear": sdict["academic_year"],
                "name": sdict["name"], "ctid": ct_id
            })
            sec_id_map[s_key] = res.scalar()

        # F. Faculty Subjects Bridge
        for email, scode in fac_subj_pairs:
            pid = prof_id_map.get(email)
            sid = subj_id_map.get(scode)
            if pid and sid:
                await conn.execute(text("""
                    INSERT INTO faculty_subjects (faculty_id, subject_id) VALUES (:pid, :sid) ON CONFLICT DO NOTHING;
                """), {"pid": pid, "sid": sid})

        # G. Section Mentors Bridge
        for s_key, email in sec_mentor_pairs:
            sec_id = sec_id_map.get(s_key)
            pid = prof_id_map.get(email)
            if sec_id and pid:
                await conn.execute(text("""
                    INSERT INTO section_mentors (section_id, faculty_id) VALUES (:secid, :pid) ON CONFLICT DO NOTHING;
                """), {"secid": sec_id, "pid": pid})

    # Generate Summary Report
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

    async with engine.connect() as conn_verify:
        report.append("\n--- POST-IMPORT DATABASE RECORD COUNTS ---")
        tables = [
            'users', 'departments', 'subjects', 'faculty_profiles', 
            'faculty_subjects', 'section_configs', 'section_mentors',
            'classrooms', 'academic_policies'
        ]
        for t in tables:
            res = await conn_verify.execute(text(f"SELECT COUNT(*) FROM {t};"))
            report.append(f"  {t:30s}: {res.scalar()} rows")
        report.append("="*70)

    full_report_text = "\n".join(report)
    print(full_report_text)

    with open("raw_import_report.txt", "w", encoding="utf-8") as rf:
        rf.write(full_report_text)

if __name__ == "__main__":
    asyncio.run(main())
