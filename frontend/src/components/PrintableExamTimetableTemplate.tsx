import React, { useState } from 'react';
import type { ExamTimetableEntry } from '../services/timetableService';
import type { Department } from '../services/facultyService';
import { X, Printer, Filter, ArrowLeft } from 'lucide-react';

interface PrintableExamTimetableTemplateProps {
  category: 'MID' | 'SEM_END';
  examType: 'MID_1' | 'MID_2' | 'SEM_END';
  exams: ExamTimetableEntry[];
  departments: Department[];
  activeDeptId?: string;
  onClose: () => void;
}

export const PrintableExamTimetableTemplate: React.FC<PrintableExamTimetableTemplateProps> = ({
  category,
  examType,
  exams,
  departments,
  activeDeptId = 'ALL',
  onClose
}) => {
  const [filterDept, setFilterDept] = useState<string>(activeDeptId);
  const [filterYear, setFilterYear] = useState<string>('ALL');

  // Filter exams based on tab category, exam type, department, and year
  const filteredExams = exams.filter(ex => {
    if (category === 'MID' && !ex.exam_type?.includes('MID')) return false;
    if (category === 'SEM_END' && ex.exam_type !== 'SEM_END') return false;
    if (examType && ex.exam_type !== examType) return false;

    if (filterDept !== 'ALL') {
      if (ex.subject?.department_id !== filterDept && ex.subject?.department?.id !== filterDept) {
        return false;
      }
    }

    if (filterYear !== 'ALL') {
      if (ex.academic_year !== parseInt(filterYear)) {
        return false;
      }
    }

    return true;
  });

  // Sort exams chronologically by Date and Time Slot
  const sortedExams = [...filteredExams].sort((a, b) => {
    const d1 = a.exam_date ? new Date(a.exam_date).getTime() : 0;
    const d2 = b.exam_date ? new Date(b.exam_date).getTime() : 0;
    if (d1 !== d2) return d1 - d2;
    return (a.time_slot || 1) - (b.time_slot || 1);
  });

  const getExamTitle = () => {
    if (category === 'MID') {
      return examType === 'MID_1'
        ? 'MID-TERM 1 EXAMINATION TIMETABLE'
        : 'MID-TERM 2 EXAMINATION TIMETABLE';
    }
    return 'SEMESTER END EXAMINATION TIMETABLE';
  };

  const getSlotTimeString = (slot: number) => {
    if (category === 'SEM_END') {
      if (slot === 1) return '09:30 AM - 12:30 PM (3 Hours)';
      return `Slot ${slot}`;
    }
    if (slot === 1) return '09:30 AM - 11:30 AM (Morning)';
    if (slot === 2) return '01:00 PM - 03:00 PM (Afternoon)';
    return `Slot ${slot}`;
  };

  const handlePrint = () => {
    window.print();
  };

  const selectedDeptObj = departments.find(d => d.id === filterDept);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/85 backdrop-blur-md overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto">
      {/* Printable Modal Controls Bar (Hidden on Print) */}
      <div className="fixed top-4 right-6 left-6 flex items-center justify-between gap-3 z-50 print:hidden flex-wrap">
        <button
          onClick={onClose}
          className="flex items-center gap-2 py-2.5 px-4 rounded-xl bg-dark-900 border border-dark-750 hover:bg-dark-800 text-white text-xs font-bold transition-all shadow-xl"
        >
          <ArrowLeft className="w-4 h-4 text-amber-400" />
          Back to Portal
        </button>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-dark-900 border border-dark-800 px-3 py-1.5 rounded-xl shadow-xl">
            <Filter className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs text-dark-300 font-semibold">Department:</span>
            <select
              value={filterDept}
              onChange={e => setFilterDept(e.target.value)}
              className="bg-dark-950 text-white font-bold text-xs py-1 px-2.5 rounded-lg border border-dark-750 outline-none"
            >
              <option value="ALL">All Departments</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.code} - {d.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-dark-900 border border-dark-800 px-3 py-1.5 rounded-xl shadow-xl">
            <span className="text-xs text-dark-300 font-semibold">Year:</span>
            <select
              value={filterYear}
              onChange={e => setFilterYear(e.target.value)}
              className="bg-dark-950 text-white font-bold text-xs py-1 px-2.5 rounded-lg border border-dark-750 outline-none"
            >
              <option value="ALL">All Years (1st - 4th)</option>
              <option value="4">4th Year</option>
              <option value="3">3rd Year</option>
              <option value="2">2nd Year</option>
              <option value="1">1st Year</option>
            </select>
          </div>

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 py-2.5 px-5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-bold shadow-xl transition-all"
          >
            <Printer className="w-4 h-4" />
            Print / Save PDF
          </button>
          <button
            onClick={onClose}
            className="p-2.5 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white transition-all shadow-xl"
            title="Close Printable View"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Official ANITS Examination Timetable Document Container */}
      <div className="w-full max-w-5xl bg-white text-black p-8 rounded-2xl shadow-2xl print:shadow-none print:p-0 print:max-w-none print:w-full font-serif text-[11px] leading-tight border border-gray-300 print:border-none my-12 print:my-0">

        {/* CSS Media Print Injections */}
        <style dangerouslySetInnerHTML={{
          __html: `
          @media print {
            body { background: white !important; color: black !important; font-size: 10pt; }
            .print\\:hidden { display: none !important; }
            @page { size: landscape; margin: 8mm; }
          }
        ` }} />

        {/* 1. ANITS Official Letterhead Header */}
        <div className="border-b-2 border-black pb-2 mb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="w-16 h-16 flex-shrink-0 flex items-center justify-center border border-navy-900 rounded-full bg-blue-900 text-white font-extrabold text-xs text-center p-1">
              ANITS
            </div>
            <div className="text-center flex-1">
              <h1 className="text-base sm:text-lg font-black uppercase tracking-wide text-gray-900">
                Anil Neerukonda Institute of Technology & Sciences (Autonomous)
              </h1>
              <p className="text-[10px] text-gray-800 font-medium">
                Affiliated to AU, Approved by AICTE & Accredited by NAAC with A+ Grade
              </p>
              <p className="text-[9.5px] text-gray-700">
                Accredited by NBA (B.Tech - ECE, EEE, CSE, IT, MECH, Civil & Chemical)
              </p>
              <p className="text-[9px] text-gray-600">
                Sangivalasa-531 162, Bheemunipatnam Mandal, Visakhapatnam District
              </p>
              <p className="text-[9px] text-gray-600">
                Phone: 8712005999, 8712008222 | Website: www.anits.edu.in | Email: principal@anits.edu.in
              </p>
            </div>
          </div>
        </div>

        {/* 2. Main Examination Banner */}
        <div className="border border-black text-center py-1.5 font-bold text-xs uppercase bg-gray-100 mb-3">
          DEPARTMENT OF {selectedDeptObj ? selectedDeptObj.name.toUpperCase() : 'COMPUTER SCIENCE & DATA SCIENCE (CSD)'}
          <div className="text-sm font-black text-blue-950 mt-0.5 tracking-wider">
            {getExamTitle()} (A.Y. 2026-2027)
          </div>
        </div>

        {/* 3. Metadata Bar */}
        <div className="flex justify-between items-center text-[10px] font-bold border-b border-gray-400 pb-2 mb-3">
          <div>
            Category: <span className="uppercase text-blue-900">{category === 'MID' ? 'Mid Examinations' : 'Semester End Examinations'}</span>
          </div>
          <div>
            Target Branch / Dept: <span className="uppercase">{filterDept === 'ALL' ? 'CSD (Computer Science & Data Science)' : selectedDeptObj?.code}</span>
          </div>
          <div>
            Target Year: <span className="uppercase">{filterYear === 'ALL' ? 'All Years (1st - 4th)' : `${filterYear}th Year`}</span>
          </div>
          <div>
            Total Scheduled Sessions: <span>{sortedExams.length}</span>
          </div>
        </div>

        {/* 4. Structured Printable Exam Table */}
        {sortedExams.length === 0 ? (
          <div className="p-8 text-center text-gray-500 font-sans border border-dashed border-gray-400 rounded-lg my-6">
            No examination entries scheduled for the selected filters.
          </div>
        ) : (
          <table className="w-full border-collapse border border-black text-center text-[9.5px] font-sans mb-4">
            <thead>
              <tr className="bg-gray-200 font-bold border-b border-black text-gray-900">
                <th className="border border-black p-1.5 w-10">S.No</th>
                <th className="border border-black p-1.5 w-32">Date & Day</th>
                <th className="border border-black p-1.5 w-44">Time Session</th>
                <th className="border border-black p-1.5 w-16">Year</th>
                <th className="border border-black p-1.5 w-20">Dept</th>
                <th className="border border-black p-1.5 w-24">Sub Code</th>
                <th className="border border-black p-1.5">Subject Title</th>
                <th className="border border-black p-1.5 w-24">Exam Hall</th>
                <th className="border border-black p-1.5 w-36">Invigilator / Duty Officer</th>
              </tr>
            </thead>
            <tbody>
              {sortedExams.map((ex, idx) => {
                const dateObj = ex.exam_date ? new Date(ex.exam_date) : null;
                const dateStr = dateObj
                  ? dateObj.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' })
                  : 'TBA';
                const dayStr = dateObj ? dateObj.toLocaleDateString(undefined, { weekday: 'short' }) : '';

                return (
                  <tr key={ex.id || idx} className={`border-b border-black ${idx % 2 === 1 ? 'bg-gray-50' : ''}`}>
                    <td className="border border-black p-1.5 font-bold">{idx + 1}</td>
                    <td className="border border-black p-1.5 font-bold text-gray-900">
                      {dateStr} <span className="text-gray-600 font-normal">({dayStr})</span>
                    </td>
                    <td className="border border-black p-1.5 font-semibold text-gray-800">
                      {getSlotTimeString(ex.time_slot)}
                    </td>
                    <td className="border border-black p-1.5 font-extrabold text-blue-900">
                      Year {ex.academic_year || 1}
                    </td>
                    <td className="border border-black p-1.5 font-bold uppercase">
                      {ex.subject?.department?.code || departments.find(d => d.id === ex.subject?.department_id)?.code || 'CSD'}
                    </td>
                    <td className="border border-black p-1.5 font-mono font-bold">
                      {ex.subject?.code || 'SUBJ'}
                    </td>
                    <td className="border border-black p-1.5 text-left font-bold pl-2 uppercase">
                      {ex.subject?.name}
                    </td>
                    <td className="border border-black p-1.5 font-black text-indigo-900">
                      Hall {ex.classroom?.room_number || 'TBA'}
                    </td>
                    <td className="border border-black p-1.5 text-left pl-2 font-medium">
                      {ex.invigilator?.user?.full_name || 'Assigned Officer'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* 5. Instructions Box */}
        <div className="border border-gray-400 p-2 rounded text-[8.5px] font-sans text-gray-700 mb-6">
          <strong className="text-black uppercase block mb-0.5 font-bold">Important Instructions for Candidates & Invigilators:</strong>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Candidates must enter the examination hall 15 minutes before the scheduled time slot.</li>
            <li>No candidate will be permitted into the examination hall after 10 minutes of session commencement.</li>
            <li>Invigilators must collect answer booklets from the Examination Cell 20 minutes prior to session start.</li>
          </ul>
        </div>

        {/* 6. Footer Signatures */}
        <div className="flex justify-between items-end pt-6 font-bold text-[10px] uppercase">
          <div className="text-left">
            <span className="block border-t border-black pt-1 w-44 text-center">Exam Cell Coordinator</span>
          </div>
          <div className="text-center">
            <span className="block border-t border-black pt-1 w-44 text-center">Head of Department (HOD)</span>
          </div>
          <div className="text-right">
            <span className="block border-t border-black pt-1 w-44 text-center">Controller of Examinations</span>
          </div>
        </div>
      </div>
    </div>
  );
};
