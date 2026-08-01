import logging
import asyncio
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import aiosmtplib

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import async_session_maker
from app.models.user import User, UserRole
from app.models.faculty import FacultyProfile, Subject, Department
from app.models.classroom import Classroom
from app.models.timetable import TimetableEntry, ExamTimetableEntry
from app.models.leave import LeaveRequest, SubstitutionProposal
from app.models.academic_calendar import AcademicCalendar, AcademicHoliday

logger = logging.getLogger("daily-schedule-dispatcher")

DAYS_MAP = {
    0: "Monday",
    1: "Tuesday",
    2: "Wednesday",
    3: "Thursday",
    4: "Friday",
    5: "Saturday",
    6: "Sunday"
}

def build_daily_schedule_html_email(
    faculty_name: str,
    date_str: str,
    day_name: str,
    class_entries: List[Dict[str, Any]],
    substitutions: List[Dict[str, Any]],
    invigilations: List[Dict[str, Any]],
    leave_info: Optional[Dict[str, Any]]
) -> str:
    total_classes = len(class_entries)
    total_subs = len(substitutions)
    total_invigs = len(invigilations)

    leave_badge_html = ""
    if leave_info:
        status_color = "#10B981" if leave_info["status"] in ["APPROVED", "Approved"] else "#F59E0B" if leave_info["status"] in ["PENDING", "Pending"] else "#EF4444"
        leave_badge_html = f"""
        <div style="background-color: rgba(255,255,255,0.05); border: 1px solid {status_color}; border-radius: 12px; padding: 14px 18px; margin-bottom: 20px;">
            <div style="font-size: 13px; font-weight: bold; color: {status_color}; text-transform: uppercase; letter-spacing: 0.5px;">
                📋 Leave Status Notice ({leave_info['status']})
            </div>
            <div style="font-size: 14px; color: #E2E8F0; margin-top: 6px;">
                Type: <strong>{leave_info['leave_type']}</strong> | Reason: <em>{leave_info['reason']}</em>
            </div>
        </div>
        """

    schedule_rows_html = ""
    if class_entries:
        for c in class_entries:
            type_badge = "#8B5CF6" if c["subject_type"] == "LAB" else "#3B82F6"
            schedule_rows_html += f"""
            <tr style="border-bottom: 1px solid #1E293B;">
                <td style="padding: 12px 16px; font-weight: 600; color: #F8FAFC;">Slot {c['time_slot']} <br/><span style="font-size: 11px; color: #94A3B8;">{c['slot_time']}</span></td>
                <td style="padding: 12px 16px; color: #F8FAFC;">
                    <strong>{c['subject_code']}</strong> - {c['subject_name']}
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: bold; background-color: {type_badge}; color: white; margin-left: 6px;">{c['subject_type']}</span>
                </td>
                <td style="padding: 12px 16px; color: #CBD5E1; font-weight: 500;">{c['section']}</td>
                <td style="padding: 12px 16px; color: #38BDF8; font-weight: 700;">{c['room_number']}</td>
            </tr>
            """
    else:
        schedule_rows_html = """
        <tr>
            <td colspan="4" style="padding: 24px; text-align: center; color: #94A3B8; font-style: italic;">
                No regular classes scheduled for today.
            </td>
        </tr>
        """

    subs_html = ""
    if substitutions:
        subs_rows = ""
        for s in substitutions:
            subs_rows += f"""
            <li style="margin-bottom: 8px; color: #F8FAFC;">
                Covering for <strong>{s['absent_faculty_name']}</strong>: Slot {s['time_slot']} | {s['subject_name']} in <span style="color: #38BDF8; font-weight: bold;">{s['room_number']}</span> ({s['section']})
            </li>
            """
        subs_html = f"""
        <div style="background-color: #1E1B4B; border: 1px solid #6366F1; border-radius: 12px; padding: 16px; margin-top: 20px;">
            <div style="font-size: 14px; font-weight: bold; color: #A5B4FC; margin-bottom: 8px;">🔄 Assigned Cover / Substitution Classes ({total_subs}):</div>
            <ul style="margin: 0; padding-left: 20px; font-size: 13px;">{subs_rows}</ul>
        </div>
        """

    invig_html = ""
    if invigilations:
        invig_rows = ""
        for iv in invigilations:
            invig_rows += f"""
            <li style="margin-bottom: 8px; color: #F8FAFC;">
                Exam: <strong>{iv['exam_type']}</strong> | Slot {iv['time_slot']} | Hall: <span style="color: #F59E0B; font-weight: bold;">{iv['room_number']}</span> ({iv['subject_name']})
            </li>
            """
        invig_html = f"""
        <div style="background-color: #312E81; border: 1px solid #F59E0B; border-radius: 12px; padding: 16px; margin-top: 20px;">
            <div style="font-size: 14px; font-weight: bold; color: #FCD34D; margin-bottom: 8px;">📝 Assigned Exam Invigilation Duties ({total_invigs}):</div>
            <ul style="margin: 0; padding-left: 20px; font-size: 13px;">{invig_rows}</ul>
        </div>
        """

    return f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"/></head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0F172A; color: #F8FAFC; margin: 0; padding: 20px;">
        <div style="max-width: 650px; margin: 0 auto; background-color: #1E293B; border-radius: 16px; border: 1px solid #334155; padding: 28px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
            <div style="border-bottom: 1px solid #334155; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <h2 style="margin: 0; color: #6366F1; font-size: 22px;">⚡ AcadOps Daily Schedule Digest</h2>
                    <div style="font-size: 13px; color: #94A3B8; margin-top: 4px;">{day_name}, {date_str}</div>
                </div>
            </div>

            <div style="font-size: 16px; color: #F8FAFC; margin-bottom: 16px;">
                Hello <strong>{faculty_name}</strong>,
            </div>

            {leave_badge_html}

            <div style="background-color: #0F172A; border-radius: 12px; padding: 16px; margin-bottom: 20px; border: 1px solid #334155;">
                <div style="font-size: 13px; font-weight: bold; color: #94A3B8; text-transform: uppercase; margin-bottom: 10px;">📅 Today's Schedule Overview:</div>
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                    <thead>
                        <tr style="border-bottom: 2px solid #334155; color: #94A3B8;">
                            <th style="padding: 8px 16px;">Slot</th>
                            <th style="padding: 8px 16px;">Subject</th>
                            <th style="padding: 8px 16px;">Section</th>
                            <th style="padding: 8px 16px;">Room</th>
                        </tr>
                    </thead>
                    <tbody>
                        {schedule_rows_html}
                    </tbody>
                </table>
            </div>

            {subs_html}
            {invig_html}

            <div style="margin-top: 30px; text-align: center; border-top: 1px solid #334155; padding-top: 20px;">
                <div style="font-size: 12px; color: #94A3B8;">
                    AI Academic Operations Platform (AcadOps) &bull; Intranet Automated Schedule Dispatcher
                </div>
            </div>
        </div>
    </body>
    </html>
    """

async def send_daily_email(to_email: str, subject: str, html_body: str) -> bool:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM_EMAIL
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    try:
        if settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD:
            await aiosmtplib.send(
                msg,
                hostname=settings.SMTP_HOST,
                port=settings.SMTP_PORT,
                username=settings.SMTP_USER,
                password=settings.SMTP_PASSWORD,
                start_tls=True if settings.SMTP_PORT == 587 else False
            )
            logger.info(f"Daily Schedule Email dispatched successfully to {to_email}")
            return True
        else:
            logger.info(f"\n========================================\n[LOCAL INTRANET EMAIL DISPATCH] To: {to_email}\nSubject: {subject}\n========================================\n")
            return True
    except Exception as err:
        logger.error(f"Failed to dispatch daily email to {to_email}: {err}")
        return False

async def dispatch_daily_faculty_schedules(target_date: Optional[datetime] = None) -> Dict[str, Any]:
    now = target_date or datetime.utcnow()
    check_date = now.date()
    day_idx = now.weekday()
    day_name = DAYS_MAP.get(day_idx, "Monday")

    if day_idx == 6:
        return {"status": "skipped", "reason": "Sunday - No daily schedule emails dispatched."}

    async with async_session_maker() as db:
        hol_res = await db.execute(select(AcademicHoliday).where(AcademicHoliday.date == check_date, AcademicHoliday.is_holiday == True))
        if hol_res.scalars().first():
            return {"status": "skipped", "reason": "Academic Holiday - No daily schedule emails dispatched."}

        profs_stmt = select(FacultyProfile).options(selectinload(FacultyProfile.user))
        profs_res = await db.execute(profs_stmt)
        faculty_profiles = profs_res.scalars().all()

        dispatched_count = 0
        skipped_count = 0

        tt_stmt = (
            select(TimetableEntry)
            .options(selectinload(TimetableEntry.subject), selectinload(TimetableEntry.classroom))
            .where(TimetableEntry.day_of_week == day_name)
        )
        tt_res = await db.execute(tt_stmt)
        all_tt_entries = tt_res.scalars().all()

        subs_stmt = select(SubstitutionProposal).options(
            selectinload(SubstitutionProposal.leave_request).selectinload(LeaveRequest.faculty).selectinload(FacultyProfile.user)
        ).where(SubstitutionProposal.status.in_(["APPROVED", "Approved", "ACCEPTED", "Accepted"]))
        subs_res = await db.execute(subs_stmt)
        all_substitutions = [
            s for s in subs_res.scalars().all() 
            if s.leave_request and s.leave_request.start_date.date() <= check_date <= s.leave_request.end_date.date()
        ]

        ex_stmt = select(ExamTimetableEntry).options(
            selectinload(ExamTimetableEntry.subject), selectinload(ExamTimetableEntry.classroom)
        )
        ex_res = await db.execute(ex_stmt)
        all_exams = [e for e in ex_res.scalars().all() if e.exam_date.date() == check_date]

        leaves_stmt = select(LeaveRequest).options(selectinload(LeaveRequest.faculty))
        leaves_res = await db.execute(leaves_stmt)
        all_leaves = [l for l in leaves_res.scalars().all() if l.start_date.date() <= check_date <= l.end_date.date()]

        for prof in faculty_profiles:
            if not prof.user or not prof.user.email:
                continue

            prof_id = prof.id
            faculty_email = prof.user.email
            faculty_name = prof.user.full_name or "Faculty Member"

            my_classes = []
            for entry in all_tt_entries:
                if entry.faculty_id == prof_id:
                    my_classes.append({
                        "time_slot": entry.time_slot,
                        "slot_time": f"Slot {entry.time_slot}",
                        "subject_code": entry.subject.code if entry.subject else "N/A",
                        "subject_name": entry.subject.name if entry.subject else "Class",
                        "subject_type": entry.subject.subject_type if entry.subject else "THEORY",
                        "section": entry.section,
                        "room_number": entry.classroom.room_number if entry.classroom else "N/A"
                    })

            my_classes.sort(key=lambda x: x["time_slot"])

            my_subs = []
            for sub in all_substitutions:
                if sub.substitute_faculty_id == prof_id:
                    absent_user = sub.leave_request.faculty.user if (sub.leave_request and sub.leave_request.faculty) else None
                    absent_name = absent_user.full_name if absent_user else "Faculty Member"
                    my_subs.append({
                        "time_slot": sub.time_slot if hasattr(sub, "time_slot") else 1,
                        "absent_faculty_name": absent_name,
                        "subject_name": sub.subject_name if hasattr(sub, "subject_name") else "Subject",
                        "room_number": sub.room_number if hasattr(sub, "room_number") else "Assigned Room",
                        "section": sub.section if hasattr(sub, "section") else "Section"
                    })

            my_invigs = []
            for ex in all_exams:
                if ex.invigilator_id == prof_id:
                    my_invigs.append({
                        "exam_type": ex.exam_type,
                        "time_slot": ex.time_slot,
                        "room_number": ex.classroom.room_number if ex.classroom else "Exam Hall",
                        "subject_name": ex.subject.name if ex.subject else "Subject"
                    })

            my_leave_info = None
            prof_leaves = [l for l in all_leaves if l.faculty_id == prof_id]
            if prof_leaves:
                top_leave = prof_leaves[0]
                status_str = top_leave.status.value if hasattr(top_leave.status, 'value') else str(top_leave.status)
                type_str = top_leave.leave_type.value if hasattr(top_leave.leave_type, 'value') else str(top_leave.leave_type)
                my_leave_info = {
                    "status": status_str,
                    "leave_type": type_str,
                    "reason": top_leave.reason or "Applied Leave"
                }

            html_body = build_daily_schedule_html_email(
                faculty_name=faculty_name,
                date_str=check_date.strftime("%B %d, %Y"),
                day_name=day_name,
                class_entries=my_classes,
                substitutions=my_subs,
                invigilations=my_invigs,
                leave_info=my_leave_info
            )

            subject = f"📅 AcadOps Daily Schedule Digest - {day_name}, {check_date.strftime('%b %d')}"
            success = await send_daily_email(faculty_email, subject, html_body)
            if success:
                dispatched_count += 1
            else:
                skipped_count += 1

        return {
            "status": "success",
            "date": check_date.isoformat(),
            "dispatched": dispatched_count,
            "failed": skipped_count
        }

async def start_automated_daily_schedule_loop():
    logger.info("Automated Daily Schedule Email Dispatcher loop initialized.")
    while True:
        try:
            now = datetime.utcnow()
            next_run = now.replace(hour=7, minute=0, second=0, microsecond=0)
            if now >= next_run:
                next_run += timedelta(days=1)
            
            sleep_seconds = (next_run - now).total_seconds()
            logger.info(f"Daily schedule dispatcher sleeping for {int(sleep_seconds)} seconds until next run ({next_run.isoformat()}).")
            await asyncio.sleep(sleep_seconds)

            res = await dispatch_daily_faculty_schedules()
            logger.info(f"Daily schedule dispatch result: {res}")
        except asyncio.CancelledError:
            logger.info("Daily schedule dispatcher loop cancelled.")
            break
        except Exception as err:
            logger.error(f"Error in daily schedule dispatcher loop: {err}")
            await asyncio.sleep(3600)
