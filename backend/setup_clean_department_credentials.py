import asyncio
import uuid
from sqlalchemy import select, delete, text
from app.core.database import engine, async_session_maker
from app.core.security import get_password_hash
from app.models.user import User
from app.models.faculty import Department, FacultyProfile, Subject, SectionConfig
from app.models.classroom import Classroom
from app.models.timetable import TimetableEntry, SubjectSchedulingRule, SchedulingRule
from app.models.import_system import ImportHistory, ImportStagingRecord
from app.models.leave import LeaveRequest, SubstitutionProposal, FacultyLeaveBalance

DEPARTMENTS_CONFIG = [
    {"code": "CSE", "name": "Computer Science & Engineering", "hod_email": "hod_cse@anits.edu.in", "hod_name": "Dr. CSE HOD", "pw": "hodcse123"},
    {"code": "IT", "name": "Information Technology", "hod_email": "hod_it@anits.edu.in", "hod_name": "Dr. IT HOD", "pw": "hodit123"},
    {"code": "CSD", "name": "Computer Science & Data Science", "hod_email": "hod_csd@anits.edu.in", "hod_name": "Dr. CSD HOD", "pw": "hodcsd123"},
    {"code": "EEE", "name": "Electrical & Electronics Engineering", "hod_email": "hod_eee@anits.edu.in", "hod_name": "Dr. EEE HOD", "pw": "hodeee123"},
    {"code": "CIVIL", "name": "Civil Engineering", "hod_email": "hod_civil@anits.edu.in", "hod_name": "Dr. Civil HOD", "pw": "hodcivil123"},
    {"code": "CHE", "name": "Chemical Engineering", "hod_email": "hod_che@anits.edu.in", "hod_name": "Dr. Chemical HOD", "pw": "hodche123"},
    {"code": "BT", "name": "Bio Technology", "hod_email": "hod_bt@anits.edu.in", "hod_name": "Dr. BioTech HOD", "pw": "hodbt123"},
]

async def clean_database_and_seed_credentials():
    print("=" * 75)
    print("=== ANITS PLATFORM - DATABASE CLEANSE & HOD CREDENTIALS SETUP ===")
    print("=" * 75)

    async with async_session_maker() as db:
        # Step 1: Wipe all legacy/test data tables to ensure 100% clean state
        print("[1/4] Cleansing legacy timetable entries, staging data, and test records...")
        await db.execute(delete(TimetableEntry))
        await db.execute(delete(SubjectSchedulingRule))
        await db.execute(delete(ImportStagingRecord))
        await db.execute(delete(ImportHistory))
        await db.execute(delete(SubstitutionProposal))
        await db.execute(delete(LeaveRequest))
        await db.execute(delete(FacultyLeaveBalance))
        await db.flush()

        print("[OK] Legacy data tables purged clean.")

        # Step 2: Ensure Super Admin & Principal/Dean Accounts
        print("[2/4] Initializing Super Admin & Principal/Dean credentials...")
        
        # Super Admin
        admin_res = await db.execute(select(User).where(User.email == "admin@anits.edu.in"))
        admin_user = admin_res.scalars().first()
        if not admin_user:
            admin_user = User(
                id=str(uuid.uuid4()),
                email="admin@anits.edu.in",
                password_hash=get_password_hash("admin123"),
                full_name="System Super Admin",
                role="ADMIN"
            )
            db.add(admin_user)
        else:
            admin_user.password_hash = get_password_hash("admin123")
            admin_user.role = "ADMIN"

        # Principal / Dean
        principal_res = await db.execute(select(User).where(User.email == "principal@anits.edu.in"))
        principal_user = principal_res.scalars().first()
        if not principal_user:
            principal_user = User(
                id=str(uuid.uuid4()),
                email="principal@anits.edu.in",
                password_hash=get_password_hash("principal123"),
                full_name="Prof. Principal & Academic Dean",
                role="DEAN"
            )
            db.add(principal_user)
        else:
            principal_user.password_hash = get_password_hash("principal123")
            principal_user.role = "DEAN"

        await db.flush()

        # Step 3: Setup Departments & Dedicated HOD Credentials
        print("[3/4] Creating/updating departments and dedicated HOD accounts...")
        credentials_roster = [
            {"role": "SUPER ADMIN", "dept": "ALL DEPARTMENTS", "email": "admin@anits.edu.in", "pw": "admin123"},
            {"role": "PRINCIPAL / DEAN", "dept": "COLLEGE OVERSEER", "email": "principal@anits.edu.in", "pw": "principal123"}
        ]

        for config in DEPARTMENTS_CONFIG:
            # Check or create Department
            d_res = await db.execute(select(Department).where(Department.code == config["code"]))
            dept = d_res.scalars().first()
            if not dept:
                dept = Department(
                    id=str(uuid.uuid4()),
                    name=config["name"],
                    code=config["code"]
                )
                db.add(dept)
                await db.flush()

            # Check or create HOD User
            h_res = await db.execute(select(User).where(User.email == config["hod_email"]))
            hod_user = h_res.scalars().first()
            if not hod_user:
                hod_user = User(
                    id=str(uuid.uuid4()),
                    email=config["hod_email"],
                    password_hash=get_password_hash(config["pw"]),
                    full_name=config["hod_name"],
                    role="HOD"
                )
                db.add(hod_user)
                await db.flush()
            else:
                hod_user.password_hash = get_password_hash(config["pw"])
                hod_user.role = "HOD"
                await db.flush()

            # Check or create HOD Faculty Profile
            fp_res = await db.execute(select(FacultyProfile).where(FacultyProfile.user_id == hod_user.id))
            hod_prof = fp_res.scalars().first()
            if not hod_prof:
                hod_prof = FacultyProfile(
                    id=str(uuid.uuid4()),
                    user_id=hod_user.id,
                    department_id=dept.id,
                    designation="Professor & HOD",
                    is_hod=True,
                    max_weekly_workload=14
                )
                db.add(hod_prof)
            else:
                hod_prof.department_id = dept.id
                hod_prof.is_hod = True

            credentials_roster.append({
                "role": f"HOD ({config['code']})",
                "dept": config["name"],
                "email": config["hod_email"],
                "pw": config["pw"]
            })

        await db.commit()

        # Step 4: Summary Output
        print("[4/4] Setup completed successfully!")
        print("=" * 75)
        print("=== OFFICIAL CREDENTIALS ROSTER ===")
        print(f"{'ROLE / TITLE':<25} | {'DEPARTMENT':<35} | {'EMAIL ADDRESS':<28} | {'PASSWORD':<12}")
        print("-" * 105)
        for cred in credentials_roster:
            print(f"{cred['role']:<25} | {cred['dept']:<35} | {cred['email']:<28} | {cred['pw']:<12}")
        print("=" * 75)

if __name__ == "__main__":
    asyncio.run(clean_database_and_seed_credentials())
