import React, { useState, useMemo } from 'react';
import type { ExamTimetableEntry } from '../services/timetableService';
import type { Department } from '../services/facultyService';
import { X, Printer, ArrowLeft, Sliders, Layers, Building2, CalendarDays } from 'lucide-react';

interface PrintableExamTimetableTemplateProps {
  category: 'MID' | 'SEM_END';
  examType: 'MID_1' | 'MID_2' | 'SEM_END';
  exams: ExamTimetableEntry[];
  departments: Department[];
  activeDeptId?: string;
  activeYear?: string;
  activeSemester?: number;
  academicYearSpan?: string;
  onClose: () => void;
}

export interface CircularRowItem {
  date: string;
  dayName: string;
  dayNumber: number;
  rawDate: Date | null;
  slot: number;
  timeStr: string;
  subjectName: string;
  subjectCode: string;
}

export interface DeptYearCircularGroup {
  deptId: string;
  deptCode: string;
  deptName: string;
  deptOfficialTitle: string;
  academicYear: number;
  romanYear: string;
  rows: CircularRowItem[];
}

// Vector SVG for authentic ANITS Emblem Logo
export const AnitsOfficialEmblem: React.FC<{ className?: string }> = ({ className = 'w-24 h-22' }) => (
  <div className="flex flex-col items-center justify-center text-center select-none">
    <svg viewBox="0 0 160 125" className={className} fill="none">
      {/* Arched Motto Path */}
      <path id="archMottoPath" d="M 18,66 A 65,50 0 0,1 142,66" stroke="none" fill="none" />
      <text fontSize="7" fontWeight="bold" letterSpacing="1.2" fill="#111827" fontFamily="'Times New Roman', Times, serif">
        <textPath href="#archMottoPath" startOffset="50%" textAnchor="middle">
          PRAGNANAM BRAHMA
        </textPath>
      </text>

      {/* Lotus Flower Outline & Layers */}
      <g stroke="#111827" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 80,44 C 74,28 86,28 80,44 Z" fill="#f8fafc" />
        <path d="M 80,44 C 64,30 76,20 80,44 Z" />
        <path d="M 80,44 C 96,30 84,20 80,44 Z" />
        <path d="M 80,44 C 54,34 68,22 80,44 Z" />
        <path d="M 80,44 C 106,34 92,22 80,44 Z" />
        <path d="M 80,44 C 44,42 56,28 80,44 Z" />
        <path d="M 80,44 C 116,42 104,28 80,44 Z" />
        <path d="M 44,48 C 62,56 98,56 116,48" strokeWidth="1.8" />
        <path d="M 52,52 C 68,58 92,58 108,52" strokeWidth="1.2" />
      </g>

      {/* ANITS Text in Serif Typography */}
      <text
        x="80"
        y="92"
        textAnchor="middle"
        fontSize="22"
        fontFamily="'Times New Roman', Times, Georgia, serif"
        fontWeight="bold"
        fill="#091e42"
        letterSpacing="2.5"
      >
        ANITS
      </text>
    </svg>
  </div>
);

// Realistic Authentic Signatures Vector Art
export const CoordinatorSignatureSvg: React.FC = () => (
  <svg viewBox="0 0 170 45" className="w-36 h-9 -mb-1" fill="none">
    <path
      d="M 8,32 Q 22,8 36,24 T 58,14 T 82,28 T 104,18 T 128,26 T 155,12"
      stroke="#1e3a8a"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M 24,18 Q 42,35 70,30 T 115,34"
      stroke="#1e3a8a"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
);

export const HodSignatureSvg: React.FC = () => (
  <svg viewBox="0 0 160 48" className="w-32 h-10 -mb-1" fill="none">
    <path
      d="M 18,36 Q 38,6 42,32 T 58,16 T 82,22 Q 106,10 134,28"
      stroke="#1e3a8a"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M 32,38 Q 72,40 138,28"
      stroke="#1e3a8a"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

// Format department display title
export const getDeptOfficialTitle = (code: string, name?: string): string => {
  const c = code.toUpperCase();
  if (c === 'CSD') return 'CSE (Data Science)';
  if (c === 'CSE') return 'COMPUTER SCIENCE & ENGINEERING';
  if (c === 'IT') return 'INFORMATION TECHNOLOGY';
  if (c === 'EEE') return 'ELECTRICAL & ELECTRONICS ENGINEERING';
  if (c === 'CIVIL') return 'CIVIL ENGINEERING';
  if (c === 'CHE') return 'CHEMICAL ENGINEERING';
  if (c === 'BT') return 'BIO-TECHNOLOGY';
  return name?.toUpperCase() || code.toUpperCase();
};

// Convert numeric year to Roman numeral (e.g. 2 -> II)
export const getRomanYear = (yr: number | string): string => {
  const y = typeof yr === 'string' ? parseInt(yr) : yr;
  switch (y) {
    case 1: return 'I';
    case 2: return 'II';
    case 3: return 'III';
    case 4: return 'IV';
    default: return 'II';
  }
};

/**
 * Reusable single official circular sheet matching physical document
 */
export const OfficialCircularSheet: React.FC<{
  group: DeptYearCircularGroup;
  circularDate?: string;
  academicYearSpan?: string;
  semesterNumber?: string;
  submissionDate?: string;
  coordinatorsText?: string;
  hodNameText?: string;
  noteText?: string;
  examShortName?: string;
  examFullName?: string;
  showSignatures?: boolean;
}> = ({
  group,
  circularDate = '21/01/2026',
  academicYearSpan = '2025-26',
  semesterNumber = 'II',
  submissionDate = '23-01-2026',
  coordinatorsText = 'Mrs. G.Y. Gayathri, Ms. B. Renuka Sai',
  hodNameText = 'Prof. S. Adi Narayana',
  noteText = '',
  examShortName = 'Mid-I',
  examFullName = 'MID-I Examination',
  showSignatures = false
}) => {
  return (
    <div className="w-full max-w-4xl bg-white text-black p-8 sm:p-10 rounded-none sm:rounded-xl shadow-none sm:shadow-lg print:shadow-none print:p-0 print:max-w-none print:w-full font-serif text-[11px] leading-tight border border-slate-200 print:border-none mx-auto mb-8 print:mb-0 print:break-after-page">
      {/* Boxed Letterhead Container */}
      <div className="border border-black flex items-stretch">
        {/* Left Column: ANITS Crest Emblem */}
        <div className="w-[22%] sm:w-[20%] border-r border-black flex items-center justify-center p-2.5">
          <AnitsOfficialEmblem className="w-24 h-24" />
        </div>

        {/* Right Column: Official College Affiliation & Contact Details */}
        <div className="w-[78%] sm:w-[80%] flex flex-col justify-center text-center p-2.5 sm:p-3 leading-tight font-serif text-black">
          <h1 className="text-[14px] sm:text-[16px] font-black uppercase tracking-tight text-black font-serif">
            ANIL NEERUKONDA INSTITUTE OF TECHNOLOGY & SCIENCES
          </h1>
          <h2 className="text-[12px] sm:text-[13px] font-black uppercase tracking-wide text-black mt-0.5 font-serif">
            (AUTONOMOUS)
          </h2>
          <p className="text-[9.5px] sm:text-[10px] italic mt-0.5 font-medium font-serif">
            (Affiliated to AU, Approved by AICTE & Accredited by NBA & NAAC with 'A+' Grade)
          </p>
          <p className="text-[9px] sm:text-[9.5px] mt-0.5 font-serif">
            Sangivalasa-531 162, Bheemunipatnam Mandal, Visakhapatnam District
          </p>
          <div className="flex justify-between items-center px-4 sm:px-8 text-[9px] sm:text-[9.5px] mt-0.5 font-serif">
            <span>Phone: 08933-225083/84/87</span>
            <span>Fax: 226395</span>
          </div>
          <div className="flex justify-between items-center px-4 sm:px-8 text-[9px] sm:text-[9.5px] mt-0.5 font-serif">
            <span>Website: <u className="font-semibold">www.anits.edu.in</u></span>
            <span>email: <u className="font-semibold">principal@anits.edu.in</u></span>
          </div>
        </div>
      </div>

      {/* Department Title Header */}
      <div className="mt-4 text-center">
        <h2 className="text-[13px] sm:text-[14px] font-black uppercase tracking-wider underline text-black font-serif">
          DEPARTMENT OF {group.deptOfficialTitle}
        </h2>
        <div className="flex justify-end mt-1 text-[11px] font-bold text-black font-serif">
          Dt: {circularDate}
        </div>
      </div>

      {/* Circular Notice Header */}
      <div className="mt-1 text-center">
        <h3 className="text-[13px] sm:text-[14px] font-black uppercase tracking-widest underline text-black font-serif">
          CIRCULAR
        </h3>
      </div>

      {/* Circular Informational Body Text */}
      <p className="mt-3 text-[11.5px] sm:text-[12px] text-black leading-relaxed text-justify font-serif">
        This is to inform all the faculty members and students of{' '}
        <strong>{group.romanYear}/IV B.Tech. {group.deptCode}</strong> that the exam schedule for{' '}
        <strong>Semester-{semesterNumber} {examFullName}</strong> is as follows:
      </p>

      {/* Timetable Subheader Title */}
      <div className="mt-4 mb-2 text-center text-[11.5px] sm:text-[12px] font-black text-black font-serif">
        {group.romanYear}/IV B.Tech ({group.deptCode}) - SEM-{semesterNumber} {examShortName} Timetable ({academicYearSpan})
      </div>

      {/* 3-Column Official Timetable Table (Dept-wise, Year-wise, Day-wise) */}
      {group.rows.length === 0 ? (
        <div className="border border-black p-6 text-center text-slate-500 font-serif my-4">
          No exam entries scheduled for {group.romanYear}/IV B.Tech ({group.deptCode}). Please click "Generate Timetable" to populate clash-free exam sessions.
        </div>
      ) : (
        <table className="w-full border-collapse border border-black text-black text-[11px] font-serif">
          <thead>
            <tr className="border-b border-black font-black uppercase text-center bg-slate-50/50 print:bg-transparent">
              <th className="border border-black p-2 w-[22%] text-center font-extrabold tracking-wide">
                DATE / DAY
              </th>
              <th className="border border-black p-2 w-[25%] text-center font-extrabold tracking-wide">
                TIME
              </th>
              <th className="border border-black p-2 w-[53%] text-center font-extrabold tracking-wide">
                SUBJECT NAME
              </th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row, idx) => (
              <tr key={idx} className="border-b border-black">
                <td className="border border-black p-2 text-center font-black whitespace-nowrap">
                  <div>{row.date}</div>
                  <div className="text-[10px] font-normal text-black">
                    Day {row.dayNumber} {row.dayName ? `(${row.dayName})` : ''}
                  </div>
                </td>
                <td className="border border-black p-2 text-center font-black whitespace-nowrap">
                  {row.timeStr}
                </td>
                <td className="border border-black p-2 text-center font-black uppercase leading-snug px-3">
                  {row.subjectName} {row.subjectCode && !row.subjectName.includes(row.subjectCode) ? `(${row.subjectCode})` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Optional Signatures Section (Hidden by default as requested) */}
      {showSignatures && (
        <>
          {/* Faculty Question Paper Submission Instruction Note */}
          <p className="mt-2 text-[10.5px] text-black leading-tight font-serif">
            All the faculty members are requested to send the mid questions papers (hard copy) to{' '}
            {group.deptCode} Dept. Exam Cell on or before <strong>Dt.{submissionDate}</strong>.
          </p>

          {/* Signatures Section with realistic handwritten vectors */}
          <div className="flex justify-between items-end mt-8 pt-2 text-[10.5px] text-black font-bold font-serif">
            {/* Exam Coordinators Signature Block */}
            <div className="text-left flex flex-col items-start">
              <CoordinatorSignatureSvg />
              <div className="font-bold text-black mt-1">{coordinatorsText}</div>
              <div className="font-extrabold text-black">Dept. Exam Coordinators</div>
            </div>

            {/* Head of Department Signature Block */}
            <div className="text-right flex flex-col items-end">
              <HodSignatureSvg />
              <div className="font-bold text-black mt-1">{hodNameText}</div>
              <div className="font-extrabold text-black">HoD-{group.deptOfficialTitle}</div>
            </div>
          </div>

          {/* Circular Circulation Routing Footer */}
          <div className="mt-6 text-[10px] text-black leading-snug font-serif">
            <div className="font-bold">Copy to:</div>
            <ol className="list-none space-y-0.5 mt-0.5 font-normal">
              <li>1. Principal (for information)</li>
              <li>2. Exam Section</li>
              <li>3. Circulate to {group.romanYear}/IV {group.deptCode} students, class teachers, concerned faculty & Department Website Co-ordinator.</li>
            </ol>
          </div>

          {/* Special Note Footer */}
          {noteText && (
            <div className="mt-3 text-[10px] text-black leading-snug font-serif">
              <div className="font-bold">Note:</div>
              <div className="pl-2">{noteText}</div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const PrintableExamTimetableTemplate: React.FC<PrintableExamTimetableTemplateProps> = ({
  category,
  examType,
  exams,
  departments,
  activeDeptId = 'ALL',
  activeYear = 'ALL',
  activeSemester = 1,
  academicYearSpan: propAcademicYearSpan,
  onClose
}) => {
  const [filterDept, setFilterDept] = useState<string>(activeDeptId);
  const [filterYear, setFilterYear] = useState<string>(activeYear);
  const [filterSemester, setFilterSemester] = useState<number>(activeSemester);
  const [viewStyle, setViewStyle] = useState<'circular' | 'operational'>('circular');
  const [showCustomizer, setShowCustomizer] = useState(false);

  // Dynamic Editable fields
  const [circularDate, setCircularDate] = useState<string>('21/01/2026');
  const [academicYearSpan, setAcademicYearSpan] = useState<string>(propAcademicYearSpan || '2026-27');
  const [semesterNumber, setSemesterNumber] = useState<string>(activeSemester === 2 ? 'II' : 'I');
  const [submissionDate, setSubmissionDate] = useState<string>('23-01-2026');
  const [coordinatorsText, setCoordinatorsText] = useState<string>('Mrs. G.Y. Gayathri, Ms. B. Renuka Sai');
  const [hodNameText, setHodNameText] = useState<string>('Prof. S. Adi Narayana');
  const [noteText, setNoteText] = useState<string>('1. Mid-I Exam for Lateral entry students will be conducted later.');
  const [showSignatures, setShowSignatures] = useState<boolean>(false);

  React.useEffect(() => {
    if (activeSemester) {
      setFilterSemester(activeSemester);
      setSemesterNumber(activeSemester === 2 ? 'II' : 'I');
    }
  }, [activeSemester]);

  React.useEffect(() => {
    if (propAcademicYearSpan) {
      setAcademicYearSpan(propAcademicYearSpan);
    }
  }, [propAcademicYearSpan]);

  const examShortName = category === 'MID'
    ? (examType === 'MID_2' ? 'Mid-II' : 'Mid-I')
    : 'Sem-End';

  const examFullName = category === 'MID'
    ? (examType === 'MID_2' ? 'MID-II Examination' : 'MID-I Examination')
    : 'Semester-End Examination';

  // Build Department-wise, Year-wise, Day-wise groupings
  const groupedCirculars = useMemo<DeptYearCircularGroup[]>(() => {
    let targetDepts = departments;
    if (filterDept !== 'ALL') {
      targetDepts = departments.filter(d => d.id === filterDept);
    }

    let targetYears = [1, 2, 3, 4];
    if (filterYear !== 'ALL') {
      targetYears = [parseInt(filterYear)];
    }

    const result: DeptYearCircularGroup[] = [];

    targetDepts.forEach(dept => {
      targetYears.forEach(yr => {
        const deptExams = exams.filter(ex => {
          if (category === 'MID' && !ex.exam_type?.includes('MID')) return false;
          if (category === 'SEM_END' && ex.exam_type !== 'SEM_END') return false;
          if (examType && ex.exam_type !== examType) return false;
          if (filterSemester && ex.semester && ex.semester !== filterSemester) return false;

          const subjDeptId = ex.subject?.department_id || ex.subject?.department?.id;
          const matchDept = subjDeptId ? (subjDeptId === dept.id) : (
            ex.subject?.department?.code ? (ex.subject.department.code.toUpperCase() === dept.code.toUpperCase()) : false
          );
          if (!matchDept) return false;

          const exYr = ex.academic_year || 1;
          if (exYr !== yr) return false;

          return true;
        });

        if (deptExams.length === 0) return;

        // Group & deduplicate distinct subject slots for this department and year
        const slotMap = new Map<string, {
          date: string;
          dayName: string;
          rawDate: Date | null;
          slot: number;
          timeStr: string;
          subjectName: string;
          subjectCode: string;
        }>();

        deptExams.forEach(ex => {
          const dObj = ex.exam_date ? new Date(ex.exam_date) : null;
          let dateFormatted = 'TBA';
          let dayName = '';
          if (dObj && !isNaN(dObj.getTime())) {
            const dd = String(dObj.getDate()).padStart(2, '0');
            const mm = String(dObj.getMonth() + 1).padStart(2, '0');
            const yyyy = dObj.getFullYear();
            dateFormatted = `${dd}-${mm}-${yyyy}`;
            dayName = dObj.toLocaleDateString('en-US', { weekday: 'short' });
          }

          let timeStr = '09:30 AM - 11:30 AM';
          if (category === 'SEM_END') {
            timeStr = ex.time_slot === 1 ? '09:30 AM - 12:30 PM' : '01:30 PM - 04:30 PM';
          } else {
            if (ex.time_slot === 1) timeStr = '09:30 AM - 11:30 AM';
            else if (ex.time_slot === 2) timeStr = '01:00 PM - 03:00 PM';
            else if (ex.time_slot === 3) timeStr = '02:15 PM - 03:15 PM';
          }

          const sName = (ex.subject?.name || 'SUBJECT').toUpperCase();
          const sCode = (ex.subject?.code || '').toUpperCase();
          const key = `${dateFormatted}_${ex.time_slot}_${sCode || sName}`;

          if (!slotMap.has(key)) {
            slotMap.set(key, {
              date: dateFormatted,
              dayName,
              rawDate: dObj,
              slot: ex.time_slot || 1,
              timeStr,
              subjectName: sName,
              subjectCode: sCode
            });
          }
        });

        // Chronological sort
        const sortedRows = Array.from(slotMap.values()).sort((a, b) => {
          const tA = a.rawDate ? a.rawDate.getTime() : 0;
          const tB = b.rawDate ? b.rawDate.getTime() : 0;
          if (tA !== tB) return tA - tB;
          return a.slot - b.slot;
        });

        // Day-wise numbering (Day 1, Day 2, Day 3 based on unique sequential dates)
        const uniqueDates = Array.from(new Set(sortedRows.map(r => r.date).filter(d => d !== 'TBA')));
        const dateToDayIndex = new Map<string, number>();
        uniqueDates.forEach((d, idx) => {
          dateToDayIndex.set(d, idx + 1);
        });

        const daywiseRows: CircularRowItem[] = sortedRows.map(r => ({
          ...r,
          dayNumber: dateToDayIndex.get(r.date) || 1
        }));

        result.push({
          deptId: dept.id,
          deptCode: dept.code,
          deptName: dept.name,
          deptOfficialTitle: getDeptOfficialTitle(dept.code, dept.name),
          academicYear: yr,
          romanYear: getRomanYear(yr),
          rows: daywiseRows
        });
      });
    });

    return result;
  }, [departments, exams, filterDept, filterYear, filterSemester, category, examType]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-start p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto">
      {/* Top Floating Control Toolbar (Hidden on Print) */}
      <div className="sticky top-2 z-50 flex items-center justify-between gap-3 bg-slate-900/95 border border-slate-700 px-4 py-3 rounded-2xl shadow-2xl backdrop-blur-md max-w-5xl w-full mb-4 print:hidden flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-2 py-2 px-3.5 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white text-xs font-bold transition-all shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 text-amber-400" />
            Back to Portal
          </button>
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-black text-amber-400 uppercase tracking-wide">
            <Layers className="w-4 h-4" />
            Dept-Wise • Year-Wise • Day-Wise Circulars ({groupedCirculars.length})
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Department Filter Pills / Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 px-2.5 py-1.5 rounded-xl text-xs">
            <Building2 className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400 font-bold">Dept:</span>
            <select
              value={filterDept}
              onChange={e => setFilterDept(e.target.value)}
              className="bg-transparent text-white font-bold outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-white">All Departments (Bundle)</option>
              {departments.map(d => (
                <option key={d.id} value={d.id} className="bg-slate-900 text-white">
                  {d.code} - {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Year Filter Pills / Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 px-2.5 py-1.5 rounded-xl text-xs">
            <CalendarDays className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400 font-bold">Year:</span>
            <select
              value={filterYear}
              onChange={e => setFilterYear(e.target.value)}
              className="bg-transparent text-white font-bold outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-white">All Years (1st - 4th)</option>
              <option value="1" className="bg-slate-900 text-white">1st Year (I/IV)</option>
              <option value="2" className="bg-slate-900 text-white">2nd Year (II/IV)</option>
              <option value="3" className="bg-slate-900 text-white">3rd Year (III/IV)</option>
              <option value="4" className="bg-slate-900 text-white">4th Year (IV/IV)</option>
            </select>
          </div>

          {/* Semester Filter Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 px-2.5 py-1.5 rounded-xl text-xs">
            <span className="text-slate-400 font-bold">Sem:</span>
            <select
              value={filterSemester}
              onChange={e => {
                const s = parseInt(e.target.value);
                setFilterSemester(s);
                setSemesterNumber(s === 2 ? 'II' : 'I');
              }}
              className="bg-transparent text-white font-bold outline-none cursor-pointer"
            >
              <option value={1} className="bg-slate-900 text-white">Sem-I (Odd)</option>
              <option value={2} className="bg-slate-900 text-white">Sem-II (Even)</option>
            </select>
          </div>

          {/* Layout Mode Toggler */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 p-1 rounded-xl">
            <button
              onClick={() => setViewStyle('circular')}
              className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all ${
                viewStyle === 'circular' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Circulars
            </button>
            <button
              onClick={() => setViewStyle('operational')}
              className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all ${
                viewStyle === 'operational' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Duty Roster
            </button>
          </div>

          {/* Customizer Toggle */}
          <button
            onClick={() => setShowCustomizer(!showCustomizer)}
            className={`p-2 rounded-xl border text-xs font-bold transition-all ${
              showCustomizer ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="Customize Dates, Coordinators & Notes"
          >
            <Sliders className="w-4 h-4" />
          </button>

          {/* Print Action */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 py-2 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-extrabold shadow-lg shadow-emerald-900/30 transition-all"
          >
            <Printer className="w-4 h-4" />
            Print Bundle / Save PDF
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-all"
            title="Close Printable Modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick Department Navigation Chips (Hidden on Print) */}
      <div className="max-w-5xl w-full flex items-center gap-2 overflow-x-auto pb-2 mb-2 print:hidden scrollbar-none">
        <button
          onClick={() => setFilterDept('ALL')}
          className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap ${
            filterDept === 'ALL' ? 'bg-amber-600 text-white shadow-md' : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
          }`}
        >
          All Departments Bundle ({departments.length})
        </button>
        {departments.map(d => (
          <button
            key={d.id}
            onClick={() => setFilterDept(d.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap ${
              filterDept === d.id ? 'bg-amber-600 text-white shadow-md' : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            {d.code}
          </button>
        ))}
      </div>

      {/* Inline Metadata Customizer Bar (Collapsible, Hidden on Print) */}
      {showCustomizer && (
        <div className="bg-slate-900 border border-slate-700 p-4 rounded-2xl max-w-5xl w-full mb-4 print:hidden text-xs text-slate-300 shadow-xl grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-slate-400 font-bold mb-1">Circular Date (Dt:):</label>
            <input
              type="text"
              value={circularDate}
              onChange={e => setCircularDate(e.target.value)}
              placeholder="e.g. 21/01/2026"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-bold outline-none"
            />
          </div>
          <div>
            <label className="block text-slate-400 font-bold mb-1">Semester Number:</label>
            <input
              type="text"
              value={semesterNumber}
              onChange={e => setSemesterNumber(e.target.value)}
              placeholder="e.g. I or II"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-bold outline-none"
            />
          </div>
          <div>
            <label className="block text-slate-400 font-bold mb-1">Academic Year Span:</label>
            <input
              type="text"
              value={academicYearSpan}
              onChange={e => setAcademicYearSpan(e.target.value)}
              placeholder="e.g. 2025-26"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-bold outline-none"
            />
          </div>
          <div>
            <label className="block text-slate-400 font-bold mb-1">QP Submission Deadline:</label>
            <input
              type="text"
              value={submissionDate}
              onChange={e => setSubmissionDate(e.target.value)}
              placeholder="e.g. 23-01-2026"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-bold outline-none"
            />
          </div>
          <div>
            <label className="block text-slate-400 font-bold mb-1">Dept. Exam Coordinators:</label>
            <input
              type="text"
              value={coordinatorsText}
              onChange={e => setCoordinatorsText(e.target.value)}
              placeholder="Coordinator names"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-bold outline-none"
            />
          </div>
          <div>
            <label className="block text-slate-400 font-bold mb-1">Head of Department (HoD):</label>
            <input
              type="text"
              value={hodNameText}
              onChange={e => setHodNameText(e.target.value)}
              placeholder="HOD Name"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-bold outline-none"
            />
          </div>
          <div className="sm:col-span-2 md:col-span-3 flex items-center justify-between pt-2 border-t border-slate-800">
            <div>
              <label className="block text-slate-400 font-bold mb-1">Note Text:</label>
              <input
                type="text"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Circular note text"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-bold outline-none"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer pt-4">
              <input
                type="checkbox"
                checked={showSignatures}
                onChange={e => setShowSignatures(e.target.checked)}
                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              <span className="text-slate-300 font-bold">Include Signatures Below</span>
            </label>
          </div>
        </div>
      )}

      {/* Main Printable Canvas */}
      <div className="w-full max-w-4xl flex flex-col items-center">
        {/* CSS Media Print Styling Injections with Page Breaks per Department/Year */}
        <style dangerouslySetInnerHTML={{
          __html: `
          @media print {
            body { background: white !important; color: black !important; font-size: 10pt; }
            .print\\:hidden { display: none !important; }
            @page { size: portrait; margin: 8mm; }
            .print\\:break-after-page { page-break-after: always !important; break-after: page !important; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          }
        ` }} />

        {viewStyle === 'circular' ? (
          groupedCirculars.length === 0 ? (
            <div className="w-full bg-white p-12 text-center text-slate-600 rounded-2xl shadow-xl my-6 border border-slate-300">
              <h3 className="text-base font-bold text-slate-900 mb-1">No Exam Timetables Scheduled</h3>
              <p className="text-xs text-slate-500">
                Please ensure exams are generated for the selected Department and Year filter.
              </p>
            </div>
          ) : (
            groupedCirculars.map(group => (
              <OfficialCircularSheet
                key={`${group.deptCode}_${group.academicYear}`}
                group={group}
                circularDate={circularDate}
                academicYearSpan={academicYearSpan}
                semesterNumber={semesterNumber}
                submissionDate={submissionDate}
                coordinatorsText={coordinatorsText}
                hodNameText={hodNameText}
                noteText={noteText}
                examShortName={examShortName}
                examFullName={examFullName}
                showSignatures={showSignatures}
              />
            ))
          )
        ) : (
          /* Operational Roster View */
          <div className="w-full bg-white text-black p-8 rounded-xl shadow-2xl border border-slate-300">
            <h2 className="text-sm font-black uppercase text-center mb-4">
              All Departments & Years Operational Roster
            </h2>
            {groupedCirculars.map(group => (
              <div key={`${group.deptCode}_${group.academicYear}`} className="mb-6 border-b pb-4">
                <h3 className="text-xs font-bold text-blue-900 uppercase mb-2">
                  {group.deptOfficialTitle} — {group.romanYear}/IV B.Tech
                </h3>
                <table className="w-full border-collapse border border-black text-center text-[10px]">
                  <thead>
                    <tr className="bg-slate-100 font-bold border-b border-black">
                      <th className="border border-black p-1 w-28">Date / Day</th>
                      <th className="border border-black p-1 w-36">Time</th>
                      <th className="border border-black p-1 w-20">Code</th>
                      <th className="border border-black p-1 text-left pl-2">Subject Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((r, i) => (
                      <tr key={i} className="border-b border-black">
                        <td className="border border-black p-1 font-bold">
                          {r.date} (Day {r.dayNumber})
                        </td>
                        <td className="border border-black p-1">{r.timeStr}</td>
                        <td className="border border-black p-1 font-mono">{r.subjectCode}</td>
                        <td className="border border-black p-1 text-left pl-2 font-bold">{r.subjectName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
