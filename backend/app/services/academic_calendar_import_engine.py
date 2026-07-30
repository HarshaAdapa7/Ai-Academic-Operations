import io
import csv
import re
from datetime import datetime, date
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, or_
from sqlalchemy.orm import selectinload

from app.models.academic_calendar import AcademicCalendar, AcademicHoliday

# ==============================================================================
# Academic Calendar Dedicated Import Engine
# Dedicated strictly to Academic Calendar Schedules, Holidays DB, & Examination DB.
# Does NOT touch or rely on general department import engines.
# ==============================================================================

# Mapping dictionary for Academic Calendar Schedule fields
# Mapping dictionary for Academic Calendar Schedule fields
CALENDAR_SCHEDULE_FIELD_MAP = {
    # Academic Year
    "academic_year": "academic_year",
    "academic_year_designation": "academic_year",
    "academicyear": "academic_year",
    "ay": "academic_year",
    "year": "academic_year",
    "session": "academic_year",
    
    # Semester / Class
    "semester": "semester",
    "semester_designation": "semester",
    "sem": "semester",
    "term": "semester",
    "class": "semester",
    "class_name": "semester",
    "year_sem": "semester",
    "class_sem": "semester",

    # Semester Start Date
    "semester_start_date": "semester_start_date",
    "semester_start": "semester_start_date",
    "start_date": "semester_start_date",
    "sem_start": "semester_start_date",
    "term_start": "semester_start_date",
    "semester_from": "semester_start_date",

    # Semester End Date
    "semester_end_date": "semester_end_date",
    "semester_end": "semester_end_date",
    "end_date": "semester_end_date",
    "sem_end": "semester_end_date",
    "term_end": "semester_end_date",
    "semester_to": "semester_end_date",

    # Orientation Start / End
    "orientation_start_date": "orientation_start_date",
    "orientation_start": "orientation_start_date",
    "orientation_from": "orientation_start_date",
    "orientation_end_date": "orientation_end_date",
    "orientation_end": "orientation_end_date",
    "orientation_to": "orientation_end_date",

    # Class Commencement
    "class_commencement_date": "class_commencement_date",
    "class_commencement": "class_commencement_date",
    "classes_start": "class_commencement_date",
    "commencement_date": "class_commencement_date",
    "instruction_start": "class_commencement_date",
    "teaching_start": "class_commencement_date",
    "date_of_commencement_of_class_work": "class_commencement_date",
    "date_of_commencement_of_classes": "class_commencement_date",
    "commencement_of_class_work": "class_commencement_date",

    # Mid 1 Exam
    "mid1_start_date": "mid1_start_date",
    "mid1_start": "mid1_start_date",
    "mid_1_start": "mid1_start_date",
    "midterm_1_start": "mid1_start_date",
    "mid1_from": "mid1_start_date",
    "date_of_commencement_of_first_mid_exam": "mid1_start_date",
    "date_of_commencement_of_1st_mid_exam": "mid1_start_date",
    "first_mid_exam": "mid1_start_date",
    "mid1_end_date": "mid1_end_date",
    "mid1_end": "mid1_end_date",
    "mid_1_end": "mid1_end_date",
    "midterm_1_end": "mid1_end_date",
    "mid1_to": "mid1_end_date",

    # Mid 2 Exam
    "mid2_start_date": "mid2_start_date",
    "mid2_start": "mid2_start_date",
    "mid_2_start": "mid2_start_date",
    "midterm_2_start": "mid2_start_date",
    "mid2_from": "mid2_start_date",
    "date_of_commencement_of_second_mid_exam": "mid2_start_date",
    "date_of_commencement_of_2nd_mid_exam": "mid2_start_date",
    "second_mid_exam": "mid2_start_date",
    "mid2_end_date": "mid2_end_date",
    "mid2_end": "mid2_end_date",
    "mid_2_end": "mid2_end_date",
    "midterm_2_end": "mid2_end_date",
    "mid2_to": "mid2_end_date",

    # Practical / External Exam
    "practical_exam_start_date": "practical_exam_start_date",
    "practical_exam_start": "practical_exam_start_date",
    "practical_start": "practical_exam_start_date",
    "lab_exam_start": "practical_exam_start_date",
    "external_exam_start_date": "practical_exam_start_date",
    "external_exam_start": "practical_exam_start_date",
    "external_exams_start": "practical_exam_start_date",
    "external_examination_start": "practical_exam_start_date",
    "date_of_commencement_of_practical_exams": "practical_exam_start_date",
    "date_of_commencement_of_practicals": "practical_exam_start_date",
    "practical_exam_end_date": "practical_exam_end_date",
    "practical_exam_end": "practical_exam_end_date",
    "practical_end": "practical_exam_end_date",
    "lab_exam_end": "practical_exam_end_date",
    "external_exam_end_date": "practical_exam_end_date",
    "external_exam_end": "practical_exam_end_date",
    "external_exams_end": "practical_exam_end_date",
    "external_examination_end": "practical_exam_end_date",

    # End Sem Exam
    "end_sem_exam_start_date": "end_sem_exam_start_date",
    "end_sem_exam_start": "end_sem_exam_start_date",
    "end_sem_start": "end_sem_exam_start_date",
    "final_exam_start": "end_sem_exam_start_date",
    "theory_exam_start": "end_sem_exam_start_date",
    "date_of_commencement_of_sem_end_exams": "end_sem_exam_start_date",
    "date_of_commencement_of_sem_end": "end_sem_exam_start_date",
    "end_sem_exam_end_date": "end_sem_exam_end_date",
    "end_sem_exam_end": "end_sem_exam_end_date",
    "end_sem_end": "end_sem_exam_end_date",
    "final_exam_end": "end_sem_exam_end_date",
    "theory_exam_end": "end_sem_exam_end_date",

    # Working Days Count
    "working_days_count": "working_days_count",
    "working_days": "working_days_count",
    "no_of_working_days": "working_days_count",
    "no_of_working_days_including_mid_exams": "working_days_count",
    "noof_worldn4_days_including_mid_r_cms": "working_days_count",

    # Result Declaration
    "result_declaration_date": "result_declaration_date",
    "result_declaration": "result_declaration_date",
    "results_date": "result_declaration_date",
    "result_date": "result_declaration_date",

    # Semester Closing
    "semester_closing_date": "semester_closing_date",
    "semester_closing": "semester_closing_date",
    "closing_date": "semester_closing_date",
    "last_working_day": "semester_closing_date",
    "date_of_closing_of_instructions": "semester_closing_date",
    "closing_of_instructions": "semester_closing_date",

    # Status
    "is_active": "is_active",
    "active": "is_active",
    "status": "is_active"
}

# Mapping dictionary for Academic Holiday fields
HOLIDAY_FIELD_MAP = {
    "s_no": "s_no",
    "sno": "s_no",
    "sl_no": "s_no",
    "slno": "s_no",
    "sr_no": "s_no",
    "srno": "s_no",
    "no": "s_no",
    "number": "s_no",
    "serial_no": "s_no",
    "serial_number": "s_no",

    "date": "date",
    "holiday_date": "date",
    "event_date": "date",
    "day_date": "date",
    "dates": "date",
    "day": "date",
    "dt": "date",

    "start_date": "start_date",
    "from_date": "start_date",
    "start": "start_date",
    "end_date": "end_date",
    "to_date": "end_date",
    "end": "end_date",

    "name": "name",
    "reason": "name",
    "holiday_reason": "name",
    "reason_for_holiday": "name",
    "event_reason": "name",
    "holiday_name": "name",
    "event_name": "name",
    "occasion": "name",
    "festival": "name",
    "particulars": "name",
    "title": "name",
    "events": "name",

    "description": "description",
    "details": "description",
    "notes": "description",
    "remarks": "description",

    "is_holiday": "is_holiday",
    "holiday": "is_holiday",
    "type": "is_holiday",
    "is_public_holiday": "is_holiday",

    "academic_year": "academic_year",
    "ay": "academic_year",
    "calendar_id": "calendar_id"
}

# Mapping dictionary for Examination Schedule fields
EXAM_FIELD_MAP = {
    "exam_type": "exam_type",
    "type": "exam_type",
    "examination_type": "exam_type",

    "exam_name": "exam_name",
    "name": "exam_name",
    "exam_title": "exam_name",
    "title": "exam_name",

    "start_date": "start_date",
    "exam_start_date": "start_date",
    "from_date": "start_date",

    "end_date": "end_date",
    "exam_end_date": "end_date",
    "to_date": "end_date",

    "session_timing": "session_timing",
    "session": "session_timing",
    "timing": "session_timing",
    "time": "session_timing",

    "description": "description",
    "details": "description",
    "notes": "description",

    "academic_year": "academic_year",
    "ay": "academic_year",
    "semester": "semester",
    "sem": "semester",
    "calendar_id": "calendar_id"
}

# Backward compatibility event field map
EVENT_FIELD_MAP = HOLIDAY_FIELD_MAP

def clean_header(h: str) -> str:
    """Normalize string header for matching."""
    if not h:
        return ""
    h_clean = str(h).strip().lower()
    h_clean = re.sub(r'[^a-z0-9\s\-\_\.\,\/]', '', h_clean)
    h_clean = re.sub(r'[\s\-\_\.\,\/]+', '_', h_clean).strip('_')
    return h_clean

def normalize_academic_year(val: Any) -> str:
    """Normalize academic year strings like 2026-2027, 2026-27, AY 2026/27 to standard year format."""
    if not val:
        return "2026–2027"
    val_str = str(val).strip()
    digits = re.findall(r'\d{4}|\d{2}', val_str)
    if len(digits) >= 2:
        y1 = digits[0] if len(digits[0]) == 4 else f"20{digits[0]}"
        y2 = digits[1] if len(digits[1]) == 4 else f"20{digits[1]}"
        sep = "–" if "–" in val_str else "-"
        return f"{y1}{sep}{y2}"
    elif len(digits) == 1 and len(digits[0]) == 4:
        y1 = int(digits[0])
        return f"{y1}–{y1+1}"
    return val_str

def parse_academic_date(val: Any) -> Optional[date]:
    """Extensive date parser supporting ISO, Indian, US, text, ordinal suffixes, and Excel date types."""
    if val is None:
        return None
    
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val

    val_str = str(val).strip()
    if not val_str or val_str.lower() in ["none", "null", "n/a", "", "undefined"]:
        return None

    # Handle Excel float/integer serial dates if passed as string
    if val_str.replace('.', '', 1).isdigit() and len(val_str) <= 6:
        try:
            excel_date = float(val_str)
            # Excel base date starts 1899-12-30
            return datetime.fromordinal(datetime(1899, 12, 30).toordinal() + int(excel_date)).date()
        except Exception:
            pass

    # Clean string: remove day names in parentheses or standalone, ordinal suffixes (15th -> 15)
    clean_s = re.sub(r'\([^\)]*\)', '', val_str)
    clean_s = re.sub(r'\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b', '', clean_s, flags=re.IGNORECASE)
    clean_s = re.sub(r'(\d+)(st|nd|rd|th)\b', r'\1', clean_s, flags=re.IGNORECASE)
    clean_s = clean_s.strip(' ,-./')

    # Repair truncated 3-digit year like "19-10-202" -> "19-10-2026" or "11-01-202" -> "11-01-2027"
    m_yr = re.search(r'(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](202)\b', clean_s)
    if m_yr:
        m_month = int(m_yr.group(2))
        corr_year = "2027" if m_month <= 5 else "2026"
        clean_s = re.sub(r'(\d{1,2}[\-\/\.]\d{1,2}[\-\/\.])202\b', r'\g<1>' + corr_year, clean_s)

    date_formats = [
        "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y",
        "%Y/%m/%d", "%d.%m.%Y", "%b %d, %Y", "%d %b %Y",
        "%B %d, %Y", "%d %B %Y", "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%d %H:%M:%S",
        "%d/%m/%Y %H:%M:%S", "%d-%m-%Y %H:%M:%S",
        "%Y-%m-%d %H:%M:%S.%f", "%Y/%m/%d %H:%M:%S",
        "%d-%b-%Y", "%d-%B-%Y", "%d-%b-%y", "%d/%m/%y", "%d-%m-%y", "%d.%m.%y"
    ]
    
    for fmt in date_formats:
        try:
            return datetime.strptime(clean_s, fmt).date()
        except ValueError:
            continue

    for fmt in date_formats:
        try:
            return datetime.strptime(val_str, fmt).date()
        except ValueError:
            continue

    return None

from datetime import timedelta

def expand_date_range(start_d: date, end_d: date) -> List[date]:
    """Return list of dates between start_d and end_d inclusive (capped at 60 days max)."""
    if start_d > end_d:
        start_d, end_d = end_d, start_d
    delta_days = (end_d - start_d).days
    if delta_days > 60:
        delta_days = 60
    return [start_d + timedelta(days=i) for i in range(delta_days + 1)]

def parse_holiday_dates(row_mapped: Dict[str, Any]) -> List[date]:
    """
    Parse one or multiple holiday dates from a mapped row.
    Supports:
    - Separate start_date and end_date fields (e.g. 2026-10-20 to 2026-10-25)
    - Date range strings in date field ("2026-10-20 to 2026-10-25 (Monday to Saturday)")
    - Short range formats ("19th to 24th October 2026")
    - Comma/semicolon/slash separated list of dates ("2026-10-20, 2026-10-21, 2026-10-22")
    - Single date values
    """
    # 1. Check if separate start_date and end_date columns exist
    st_val = row_mapped.get("start_date") or row_mapped.get("from_date") or row_mapped.get("start")
    en_val = row_mapped.get("end_date") or row_mapped.get("to_date") or row_mapped.get("end")

    if st_val:
        d_start = parse_academic_date(st_val)
        d_end = parse_academic_date(en_val) if en_val else d_start
        if d_start and d_end:
            return expand_date_range(d_start, d_end)
        elif d_start:
            return [d_start]

    date_raw = row_mapped.get("date")
    if not date_raw:
        return []

    if isinstance(date_raw, (date, datetime)):
        d_parsed = parse_academic_date(date_raw)
        return [d_parsed] if d_parsed else []

    date_str = str(date_raw).strip()
    if not date_str or date_str.lower() in ["none", "null", "n/a", ""]:
        return []

    # Pre-clean parenthetical notes like (Monday to Saturday) or (6 Days) to prevent split confusion
    clean_date_str = re.sub(r'\([^\)]*\)', '', date_str).strip()
    if not clean_date_str:
        clean_date_str = date_str

    # 2. Check for short date range pattern ("19th to 24th Oct 2026", "19 to 24 October 2026")
    m_short = re.match(r'^(\d+)(?:st|nd|rd|th)?\s+(?:to|-|till|[–—])\s+(\d+)(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})$', clean_date_str, re.IGNORECASE)
    if m_short:
        d1 = parse_academic_date(f"{m_short.group(1)} {m_short.group(3)} {m_short.group(4)}")
        d2 = parse_academic_date(f"{m_short.group(2)} {m_short.group(3)} {m_short.group(4)}")
        if d1 and d2:
            return expand_date_range(d1, d2)

    # 3. Check for date range separator keywords (" to ", " till ", " through ", " & ", " and ", " - ", " – ", " — ")
    range_match = re.split(r'\s+to\s+|\s+till\s+|\s+through\s+|\s*\&\s*|\s+and\s+|\s+[–—]\s+|\s+-\s+', clean_date_str, flags=re.IGNORECASE)
    if len(range_match) == 2:
        d1 = parse_academic_date(range_match[0])
        d2 = parse_academic_date(range_match[1])
        if d1 and d2:
            return expand_date_range(d1, d2)

    # 4. Check for comma or semicolon or slash separated list of multiple dates
    if ',' in clean_date_str or ';' in clean_date_str:
        tokens = re.split(r'[,;]+', clean_date_str)
        dates_found = []
        for tok in tokens:
            parsed = parse_academic_date(tok)
            if parsed:
                dates_found.append(parsed)
        if dates_found:
            return dates_found

    # 5. Fallback to single date parser
    single_d = parse_academic_date(clean_date_str)
    return [single_d] if single_d else []

def parse_bool_val(val: Any) -> bool:
    if val is None:
        return False
    if isinstance(val, bool):
        return val
    val_str = str(val).strip().lower()
    if val_str in ["true", "1", "yes", "y", "t", "holiday", "active"]:
        return True
    return False

def match_holiday_field(ch: str) -> str:
    """Smart fuzzy mapping for holiday table headers."""
    if not ch:
        return "unmapped"
    if ch in HOLIDAY_FIELD_MAP:
        return HOLIDAY_FIELD_MAP[ch]
    
    if any(k in ch for k in ["s_no", "sno", "sl_no", "slno", "sr_no", "srno", "serial", "no_"]) or ch == "no":
        return "s_no"
    if "start" in ch or "from" in ch:
        return "start_date"
    if "end" in ch or "to_date" in ch:
        return "end_date"
    if any(k in ch for k in ["date", "day_date", "dates", "dt"]):
        return "date"
    if any(k in ch for k in ["reason", "occasion", "festival", "particular", "name", "holiday", "event", "title"]):
        return "name"
    if any(k in ch for k in ["desc", "detail", "note", "remark"]):
        return "description"
    if any(k in ch for k in ["active", "public", "is_holiday"]):
        return "is_holiday"
    return "unmapped"

def match_calendar_schedule_field(ch: str) -> str:
    """Smart fuzzy mapping for calendar schedule table headers."""
    if not ch:
        return "unmapped"
    if ch in CALENDAR_SCHEDULE_FIELD_MAP:
        return CALENDAR_SCHEDULE_FIELD_MAP[ch]

    if ch in ["class", "class_name", "year", "year_sem", "class_sem", "degree_class"]:
        return "semester"

    if any(k in ch for k in ["class_work", "commencement_of_class", "commencement_of_classes", "class_commence"]):
        return "class_commencement_date"

    if any(k in ch for k in ["first_mid", "1st_mid", "mid_1", "midterm_1", "first_midterm"]):
        return "mid1_start_date"

    if any(k in ch for k in ["second_mid", "2nd_mid", "mid_2", "midterm_2", "second_midterm"]):
        return "mid2_start_date"

    if any(k in ch for k in ["closing_of_instructions", "closing_instructions", "instruction_closing", "closing_date"]):
        return "semester_closing_date"

    if any(k in ch for k in ["working_days", "working_day", "worldn", "mid_r_cms", "noof_days"]):
        return "working_days_count"

    if any(k in ch for k in ["sem_end", "end_sem", "final_exam", "theory_exam"]):
        return "end_sem_exam_start_date"

    if any(k in ch for k in ["practical", "practicals", "lab_exam", "external_exam"]):
        return "practical_exam_start_date"

    if "orientation" in ch:
        return "orientation_start_date"

    if "result" in ch:
        return "result_declaration_date"

    return "unmapped"

def format_schedule_semester_name(sem_val: Any, filename_or_context: str = "") -> str:
    """Format raw Class/Semester string (e.g. II/IV B.Tech, II-II, 2nd Year - Sem II, 2nd Year - Even Sem)."""
    if not sem_val or str(sem_val).strip() == "":
        return "1st Year - Sem 1"
    s_str = str(sem_val).strip()
    s_lower = s_str.lower()
    context_lower = filename_or_context.lower()

    # Determine sem phase: Sem 1 (Odd) vs Sem 2 (Even)
    is_even = False
    if any(k in context_lower for k in ["even", "sem 2", "sem-2", "sem_2", "sem ii", "sem-ii", "sem_ii", "2nd sem", "ii sem", "ii-ii", "iii-ii", "iv-ii", "i-ii"]):
        is_even = True
    elif any(k in s_lower for k in [
        "even", "sem 2", "sem-2", "sem_2", "sem 4", "sem-4", "sem_4", "sem 6", "sem-6", "sem_6", "sem 8", "sem-8", "sem_8",
        "sem ii", "sem-ii", "sem_ii", "sem iv", "sem-iv", "sem_iv", "sem vi", "sem-vi", "sem_vi", "sem viii", "sem-viii", "sem_viii",
        "2nd sem", "ii sem", "4th sem", "iv sem", "6th sem", "vi sem", "8th sem", "viii sem",
        "semester 2", "semester-2", "semester ii", "semester-ii", "semester 4", "semester 6", "semester 8",
        "-ii", "/ii", "-2", "/2", "ii-ii", "iii-ii", "iv-ii", "i-ii", "ii/ii", "iii/ii", "iv/ii", "i/ii"
    ]):
        is_even = True
    elif any(k in s_lower for k in ["odd", "sem 1", "sem-1", "sem_1", "sem i", "sem-i", "1st sem", "i sem", "-i", "/i", "i-i", "ii-i", "iii-i", "iv-i"]):
        is_even = False

    sem_suffix = "Sem 2" if is_even else "Sem 1"

    # Identify Year (1st, 2nd, 3rd, 4th) from Roman numerals before slash/hyphen or full string
    first_part = s_str.split('/')[0].split('-')[0].strip().upper()
    full_upper = s_str.upper()

    year_prefix = None
    if first_part in ["IV", "4", "4TH"] or first_part.startswith("IV ") or "4TH YEAR" in full_upper or "4TH YR" in full_upper or "YEAR 4" in full_upper or "IV-I" in full_upper or "IV-II" in full_upper:
        year_prefix = "4th Year"
    elif first_part in ["III", "3", "3RD"] or first_part.startswith("III ") or "3RD YEAR" in full_upper or "3RD YR" in full_upper or "YEAR 3" in full_upper or "III-I" in full_upper or "III-II" in full_upper:
        year_prefix = "3rd Year"
    elif first_part in ["II", "2", "2ND"] or first_part.startswith("II ") or "2ND YEAR" in full_upper or "2ND YR" in full_upper or "YEAR 2" in full_upper or "II-I" in full_upper or "II-II" in full_upper:
        year_prefix = "2nd Year"
    elif first_part in ["I", "1", "1ST"] or first_part.startswith("I ") or "1ST YEAR" in full_upper or "1ST YR" in full_upper or "YEAR 1" in full_upper or "I-I" in full_upper or "I-II" in full_upper:
        year_prefix = "1st Year"

    if year_prefix:
        return f"{year_prefix} - {sem_suffix}"

    if ("sem" in s_lower or "year" in s_lower) and len(s_str) > 3:
        return s_str

    return f"{s_str} - {sem_suffix}"

class AcademicCalendarImportEngine:
    """
    Dedicated Import Engine for Academic Calendars, Holidays DB, & Examinations DB.
    Processes CSV/Excel content, auto-detects fields, validates types, and updates Supabase DB.
    """

    @staticmethod
    def parse_file_bytes(content: bytes, filename: str) -> List[Dict[str, Any]]:
        """Parse binary content into raw dictionary rows supporting CSV and XLSX."""
        raw_rows: List[Dict[str, Any]] = []
        fn_lower = filename.lower()

        def find_header_idx(all_row_tuples):
            for idx, r in enumerate(all_row_tuples[:10]):
                if not r or not any(r):
                    continue
                row_str_cells = [str(c).strip() for c in r if c is not None and str(c).strip()]
                if len(row_str_cells) < 2:
                    continue
                cleaned = [clean_header(c) for c in row_str_cells]
                if any(c.startswith(("tentative_list", "list_of", "academic_calendar", "university_holidays")) for c in cleaned):
                    continue
                has_date = any("date" in c or c in ["dt", "day"] for c in cleaned)
                has_name = any("reason" in c or "occasion" in c or "festival" in c or "name" in c or "particular" in c for c in cleaned)
                has_sno = any("s_no" in c or "sno" in c or "sl_no" in c or c == "no" for c in cleaned)
                has_commencement = any("commencement" in c or "closing" in c or "class" in c for c in cleaned)
                if (has_date and has_name) or (has_date and has_sno) or (has_name and has_sno) or (has_commencement and has_sno) or (has_commencement and has_date):
                    return idx
            return 0

        if fn_lower.endswith((".xlsx", ".xls")):
            try:
                import openpyxl
                wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
                sheet = wb.active
                all_excel_rows = list(sheet.iter_rows(values_only=True))
                if not all_excel_rows:
                    return []
                
                hdr_idx = find_header_idx(all_excel_rows)
                headers = [str(cell).strip() if cell is not None else f"col_{c_idx}" for c_idx, cell in enumerate(all_excel_rows[hdr_idx])]
                
                for idx, row in enumerate(all_excel_rows[hdr_idx + 1:], start=hdr_idx + 2):
                    if not any(row):
                        continue
                    row_dict = {}
                    for c_idx, cell_val in enumerate(row):
                        header_key = headers[c_idx] if c_idx < len(headers) else f"col_{c_idx}"
                        row_dict[header_key] = cell_val
                    raw_rows.append(row_dict)
            except Exception as e:
                raise ValueError(f"Failed to parse Excel file in Academic Calendar Engine: {str(e)}")
        else:
            try:
                decoded = content.decode("utf-8-sig", errors="ignore")
                csv_lines = [l for l in decoded.splitlines() if l.strip()]
                if not csv_lines:
                    return []
                
                # Check for header offset in CSV
                all_csv_tuples = [[cell.strip() for cell in l.split(',')] for l in csv_lines[:10]]
                hdr_idx = find_header_idx(all_csv_tuples)
                
                content_from_hdr = "\n".join(csv_lines[hdr_idx:])
                reader = csv.DictReader(io.StringIO(content_from_hdr))
                for row in reader:
                    cleaned_row = {}
                    for k, v in row.items():
                        clean_k = str(k).strip() if k is not None else "extra_data"
                        if isinstance(v, list):
                            clean_v = ", ".join([str(x).strip() for x in v if x is not None])
                        else:
                            clean_v = str(v).strip() if v is not None else ""
                        cleaned_row[clean_k] = clean_v
                    if not any(str(v).strip() for v in cleaned_row.values()):
                        continue
                    raw_rows.append(cleaned_row)
            except Exception as e:
                raise ValueError(f"Failed to parse CSV file in Academic Calendar Engine: {str(e)}")

        return raw_rows

    @staticmethod
    def detect_import_type(raw_headers: List[str], target_type: Optional[str] = None) -> str:
        """Detect whether row headers match Academic Calendar Schedules, Holidays DB, or Examinations DB."""
        cleaned_headers = [clean_header(h) for h in raw_headers]
        
        has_exam_type = any(ch in ["exam_type", "examination_type", "exam_name", "session_timing"] for ch in cleaned_headers)
        has_calendar_fields = any(
            ch in [
                "semester_start_date", "semester_start", "sem_start",
                "semester_end_date", "semester_end", "sem_end",
                "class_commencement_date", "class_commencement",
                "semester_closing_date", "semester_closing", "mid1_start_date",
                "class", "class_name", "date_of_commencement_of_class_work",
                "date_of_commencement_of_first_mid_exam", "date_of_commencement_of_second_mid_exam",
                "date_of_closing_of_instructions", "date_of_commencement_of_sem_end_exams",
                "date_of_commencement_of_practical_exams", "no_of_working_days_including_mid_exams"
            ] or any(k in ch for k in ["commencement", "closing_of_instructions", "mid_exam", "working_days", "sem_end", "practical"])
            for ch in cleaned_headers
        )
        has_holiday_type = any(ch in [
            "s_no", "sno", "sl_no", "sr_no", "no", "serial_no",
            "holiday_name", "holiday_date", "is_public_holiday",
            "reason", "holiday_reason", "reason_for_holiday",
            "occasion", "festival", "particulars", "date", "event_date"
        ] for ch in cleaned_headers)

        if target_type in ["HOLIDAYS_DB", "CALENDAR_SCHEDULE", "EXAMINATIONS_DB"]:
            # If target_type was passed as CALENDAR_SCHEDULE but the file has ONLY holiday headers and NO calendar fields,
            # override target_type to HOLIDAYS_DB to prevent skipping rows.
            if target_type == "CALENDAR_SCHEDULE" and has_holiday_type and not has_calendar_fields:
                return "HOLIDAYS_DB"
            # Reverse check: if HOLIDAYS_DB passed but file has calendar fields and no holiday-specific fields,
            # override to CALENDAR_SCHEDULE. This prevents holiday-type detection for schedule files.
            if target_type == "HOLIDAYS_DB" and has_calendar_fields and not has_holiday_type:
                return "CALENDAR_SCHEDULE"
            return target_type

        if has_exam_type:
            return "EXAMINATIONS_DB"
        elif has_holiday_type and not has_calendar_fields:
            return "HOLIDAYS_DB"
        elif has_calendar_fields:
            return "CALENDAR_SCHEDULE"
        elif has_holiday_type:
            return "HOLIDAYS_DB"
        return "CALENDAR_SCHEDULE"

    @classmethod
    def preview_import(cls, raw_rows: List[Dict[str, Any]], target_type: Optional[str] = None, filename: Optional[str] = None) -> Dict[str, Any]:
        """Preview and validate mapped fields without committing to DB."""
        if not raw_rows:
            return {
                "import_type": "UNKNOWN",
                "total_rows": 0,
                "valid_rows": 0,
                "invalid_rows": 0,
                "field_mapping": {},
                "sample_parsed_data": [],
                "errors": ["File contains no data rows."]
            }

        headers = list(raw_rows[0].keys())
        import_type = cls.detect_import_type(headers, target_type=target_type)

        field_mapping: Dict[str, str] = {}
        cleaned_headers = {}
        for orig_h in headers:
            ch = clean_header(orig_h)
            cleaned_headers[orig_h] = ch
            if import_type == "CALENDAR_SCHEDULE":
                mapped_db_field = match_calendar_schedule_field(ch)
            elif import_type == "EXAMINATIONS_DB":
                mapped_db_field = EXAM_FIELD_MAP.get(ch, "unmapped")
            else:
                mapped_db_field = match_holiday_field(ch)
            field_mapping[orig_h] = mapped_db_field

        parsed_samples = []
        errors = []
        valid_count = 0
        invalid_count = 0

        for r_idx, row in enumerate(raw_rows, start=1):
            row_mapped: Dict[str, Any] = {}
            for orig_h, val in row.items():
                db_field = field_mapping.get(orig_h)
                if db_field and db_field != "unmapped":
                    row_mapped[db_field] = val

            if import_type == "CALENDAR_SCHEDULE":
                ay = normalize_academic_year(row_mapped.get("academic_year"))
                raw_sem = row_mapped.get("semester")
                context_str = f"{target_type or ''} {filename or ''}"
                sem = format_schedule_semester_name(raw_sem, filename_or_context=context_str)
                
                cls_start = parse_academic_date(row_mapped.get("class_commencement_date"))
                sem_start = parse_academic_date(row_mapped.get("semester_start_date")) or cls_start
                sem_close = parse_academic_date(row_mapped.get("semester_closing_date"))
                sem_end = parse_academic_date(row_mapped.get("semester_end_date")) or sem_close or parse_academic_date(row_mapped.get("end_sem_exam_start_date")) or parse_academic_date(row_mapped.get("practical_exam_start_date")) or cls_start

                missing = []
                if not ay: missing.append("academic_year")
                if not sem: missing.append("semester")
                if not (sem_start or cls_start): missing.append("class_commencement_date / semester_start_date")

                if missing:
                    invalid_count += 1
                    errors.append(f"Row {r_idx}: Missing or invalid required fields: {', '.join(missing)}")
                else:
                    valid_count += 1
                    if len(parsed_samples) < 5:
                        parsed_samples.append({
                            "row": r_idx,
                            "academic_year": ay,
                            "semester": sem,
                            "semester_start_date": str(sem_start or cls_start),
                            "semester_end_date": str(sem_end or sem_close),
                            "class_commencement_date": str(cls_start or sem_start),
                            "semester_closing_date": str(sem_close or sem_end),
                            "is_active": parse_bool_val(row_mapped.get("is_active"))
                        })

            elif import_type == "EXAMINATIONS_DB":
                ex_type = row_mapped.get("exam_type") or "EXAM"
                ex_name = row_mapped.get("exam_name") or row_mapped.get("name")
                st_date = parse_academic_date(row_mapped.get("start_date"))
                en_date = parse_academic_date(row_mapped.get("end_date")) or st_date

                missing = []
                if not ex_name: missing.append("exam_name")
                if not st_date: missing.append("start_date")

                if missing:
                    invalid_count += 1
                    errors.append(f"Row {r_idx}: Missing required examination fields: {', '.join(missing)}")
                else:
                    valid_count += 1
                    if len(parsed_samples) < 5:
                        parsed_samples.append({
                            "row": r_idx,
                            "exam_type": ex_type,
                            "exam_name": str(ex_name),
                            "start_date": str(st_date),
                            "end_date": str(en_date),
                            "session_timing": str(row_mapped.get("session_timing") or ""),
                            "description": str(row_mapped.get("description") or "")
                        })

            else: # HOLIDAYS_DB / CALENDAR_EVENTS
                ev_dates = parse_holiday_dates(row_mapped)
                if not ev_dates:
                    for k, v in row.items():
                        if v:
                            test_dates = parse_holiday_dates({"date": v})
                            if test_dates:
                                ev_dates = test_dates
                                break

                ev_name = row_mapped.get("name") or row_mapped.get("reason") or row_mapped.get("occasion") or row_mapped.get("description")
                if not ev_name:
                    for k, v in row.items():
                        if v and not parse_academic_date(v) and str(v).strip().lower() not in ["s_no", "s.no", "no", "sl_no"]:
                            ev_name = str(v).strip()
                            break

                if not ev_dates or not ev_name:
                    invalid_count += 1
                    errors.append(f"Row {r_idx}: Date and Reason for Holiday are required.")
                else:
                    valid_count += 1
                    for d_item in ev_dates:
                        if len(parsed_samples) < 10:
                            parsed_samples.append({
                                "row": r_idx,
                                "date": str(d_item),
                                "name": str(ev_name),
                                "reason": str(ev_name),
                                "description": str(row_mapped.get("description") or ""),
                                "is_holiday": parse_bool_val(row_mapped.get("is_holiday", True))
                            })

        return {
            "import_type": import_type,
            "total_rows": len(raw_rows),
            "valid_rows": valid_count,
            "invalid_rows": invalid_count,
            "field_mapping": field_mapping,
            "sample_parsed_data": parsed_samples,
            "errors": errors[:20]  # Cap error list
        }

    @classmethod
    async def execute_import(
        cls,
        db: AsyncSession,
        raw_rows: List[Dict[str, Any]],
        calendar_id: Optional[str] = None,
        target_type: Optional[str] = None,
        filename: Optional[str] = None
    ) -> Dict[str, Any]:
        """Execute database imports specifically for Academic Calendar tables."""
        if not raw_rows:
            return {"message": "No data rows provided.", "imported_count": 0}

        headers = list(raw_rows[0].keys())
        import_type = cls.detect_import_type(headers, target_type=target_type)

        field_mapping: Dict[str, str] = {}
        for orig_h in headers:
            ch = clean_header(orig_h)
            if import_type == "CALENDAR_SCHEDULE":
                field_mapping[orig_h] = match_calendar_schedule_field(ch)
            elif import_type == "EXAMINATIONS_DB":
                field_mapping[orig_h] = EXAM_FIELD_MAP.get(ch, "unmapped")
            else:
                field_mapping[orig_h] = match_holiday_field(ch)

        imported_count = 0

        if import_type == "CALENDAR_SCHEDULE":
            has_active_imported = False
            rows_to_insert = []

            for r_idx, row in enumerate(raw_rows, start=1):
                row_mapped: Dict[str, Any] = {}
                for orig_h, val in row.items():
                    db_field = field_mapping.get(orig_h)
                    if db_field and db_field != "unmapped":
                        row_mapped[db_field] = val

                ay = normalize_academic_year(row_mapped.get("academic_year"))
                raw_sem = row_mapped.get("semester")
                context_str = f"{target_type or ''} {filename or ''}"
                sem = format_schedule_semester_name(raw_sem, filename_or_context=context_str)
                
                cls_start = parse_academic_date(row_mapped.get("class_commencement_date"))
                sem_start = parse_academic_date(row_mapped.get("semester_start_date")) or cls_start
                sem_close = parse_academic_date(row_mapped.get("semester_closing_date"))
                sem_end = parse_academic_date(row_mapped.get("semester_end_date")) or sem_close or parse_academic_date(row_mapped.get("end_sem_exam_start_date")) or parse_academic_date(row_mapped.get("practical_exam_start_date")) or cls_start

                if not (sem_start or cls_start):
                    continue

                w_days = row_mapped.get("working_days_count")
                try:
                    working_days_val = int(w_days) if w_days is not None else 90
                except (ValueError, TypeError):
                    working_days_val = 90

                is_active = parse_bool_val(row_mapped.get("is_active"))
                if is_active:
                    has_active_imported = True

                rows_to_insert.append({
                    "academic_year": str(ay).strip(),
                    "semester": str(sem).strip(),
                    "semester_start_date": sem_start or cls_start,
                    "semester_end_date": sem_end or sem_close or cls_start,
                    "orientation_start_date": parse_academic_date(row_mapped.get("orientation_start_date")),
                    "orientation_end_date": parse_academic_date(row_mapped.get("orientation_end_date")),
                    "class_commencement_date": cls_start or sem_start,
                    "mid1_start_date": parse_academic_date(row_mapped.get("mid1_start_date")),
                    "mid1_end_date": parse_academic_date(row_mapped.get("mid1_end_date")),
                    "mid2_start_date": parse_academic_date(row_mapped.get("mid2_start_date")),
                    "mid2_end_date": parse_academic_date(row_mapped.get("mid2_end_date")),
                    "practical_exam_start_date": parse_academic_date(row_mapped.get("practical_exam_start_date")),
                    "practical_exam_end_date": parse_academic_date(row_mapped.get("practical_exam_end_date")),
                    "end_sem_exam_start_date": parse_academic_date(row_mapped.get("end_sem_exam_start_date")),
                    "end_sem_exam_end_date": parse_academic_date(row_mapped.get("end_sem_exam_end_date")),
                    "result_declaration_date": parse_academic_date(row_mapped.get("result_declaration_date")),
                    "semester_closing_date": sem_close or sem_end,
                    "working_days_count": working_days_val,
                    "is_active": is_active
                })

            if has_active_imported:
                await db.execute(update(AcademicCalendar).values(is_active=False))

            for r_data in rows_to_insert:
                ay_hyphen = r_data["academic_year"].replace("–", "-").replace("—", "-").strip()
                ay_endash = r_data["academic_year"].replace("-", "–").strip()
                stmt = select(AcademicCalendar).where(
                    or_(
                        AcademicCalendar.academic_year == r_data["academic_year"],
                        AcademicCalendar.academic_year == ay_hyphen,
                        AcademicCalendar.academic_year == ay_endash
                    ),
                    AcademicCalendar.semester == r_data["semester"]
                )
                res = await db.execute(stmt)
                existing = res.scalars().first()

                if existing:
                    for field_k, field_v in r_data.items():
                        setattr(existing, field_k, field_v)
                else:
                    new_cal = AcademicCalendar(**r_data)
                    db.add(new_cal)
                imported_count += 1

            await db.commit()
            return {
                "message": f"Successfully processed and imported {imported_count} academic calendar schedule(s).",
                "imported_count": imported_count,
                "type": "CALENDAR_SCHEDULE"
            }



        else: # HOLIDAYS_DB / CALENDAR_EVENTS
            target_cal_id = calendar_id
            act_cal = None

            if not target_cal_id:
                active_stmt = select(AcademicCalendar).where(AcademicCalendar.is_active == True)
                act_res = await db.execute(active_stmt)
                act_cal = act_res.scalars().first()
                if act_cal:
                    target_cal_id = act_cal.id
            else:
                cal_stmt = select(AcademicCalendar).where(AcademicCalendar.id == target_cal_id)
                cal_res = await db.execute(cal_stmt)
                act_cal = cal_res.scalars().first()

            for row in raw_rows:
                row_mapped = {}
                for orig_h, val in row.items():
                    db_field = field_mapping.get(orig_h)
                    if db_field and db_field != "unmapped":
                        row_mapped[db_field] = val

                ev_dates = parse_holiday_dates(row_mapped)
                if not ev_dates:
                    for k, v in row.items():
                        if v:
                            test_dates = parse_holiday_dates({"date": v})
                            if test_dates:
                                ev_dates = test_dates
                                break

                ev_name = row_mapped.get("name") or row_mapped.get("reason") or row_mapped.get("occasion") or row_mapped.get("description")
                if not ev_name:
                    for k, v in row.items():
                        if v and not parse_academic_date(v) and str(v).strip().lower() not in ["s_no", "s.no", "no", "sl_no"]:
                            ev_name = str(v).strip()
                            break

                if not ev_dates or not ev_name:
                    continue

                is_holiday = parse_bool_val(row_mapped.get("is_holiday", True))
                desc = row_mapped.get("description")

                for ev_date in ev_dates:
                    ay = row_mapped.get("academic_year")
                    if not ay:
                        if act_cal and act_cal.academic_year:
                            ay = act_cal.academic_year
                        else:
                            yr = ev_date.year
                            ay = f"{yr}–{yr+1}" if ev_date.month >= 6 else f"{yr-1}–{yr}"

                    # Store in dedicated AcademicHoliday database table
                    new_holiday = AcademicHoliday(
                        calendar_id=target_cal_id or row_mapped.get("calendar_id"),
                        academic_year=ay,
                        date=ev_date,
                        name=str(ev_name).strip(),
                        description=str(desc).strip() if desc and str(desc).strip() != str(ev_name).strip() else None,
                        is_holiday=is_holiday
                    )
                    db.add(new_holiday)
                    imported_count += 1

            await db.commit()
            return {
                "message": f"Successfully imported {imported_count} holiday date record(s) into database.",
                "imported_count": imported_count,
                "type": "HOLIDAYS_DB",
                "calendar_id": target_cal_id
            }

