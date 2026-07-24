import React, { useState } from 'react';
import type { TimetableEntry } from '../services/timetableService';
import type { Department, Subject, FacultyProfile, SectionConfig } from '../services/facultyService';
import type { Classroom } from '../services/classroomService';
import { X, Printer, Download } from 'lucide-react';

interface PrintableTimetableTemplateProps {
  selectedSection: string;
  department: Department | null;
  timetableEntries: TimetableEntry[];
  subjects: Subject[];
  facultyProfiles: FacultyProfile[];
  classrooms: Classroom[];
  sectionConfig?: SectionConfig | null;
  ruleSlotsPerDay?: number;
  ruleLunchSlot?: number | null;
  onClose: () => void;
}

export const PrintableTimetableTemplate: React.FC<PrintableTimetableTemplateProps> = ({
  selectedSection,
  department,
  timetableEntries,
  subjects,
  facultyProfiles,
  classrooms,
  sectionConfig,
  ruleSlotsPerDay = 7,
  ruleLunchSlot = null,
  onClose
}) => {
  // Extract Section details
  const sectionYear = parseInt(selectedSection.replace(/\D/g, '')) || 3;
  const yearRoman = sectionYear === 1 ? 'I/IV' : sectionYear === 2 ? 'II/IV' : sectionYear === 3 ? 'III/IV' : 'IV/IV';
  const effectiveLunchSlot = ruleLunchSlot !== null ? ruleLunchSlot : (sectionYear === 1 ? 4 : 5);

  // Dynamic Header Editable States
  const [academicYearText, setAcademicYearText] = useState('2026-2027');
  const [mid1Date, setMid1Date] = useState('20/08/2026');
  const [mid2Date, setMid2Date] = useState('15/10/2026');
  const [semExamDate, setSemExamDate] = useState('28/10/2026');
  const [wefDate, setWefDate] = useState('22/06/2026');

  // Infer Classroom Room Number from section entries
  const sectionEntries = timetableEntries.filter(e => e.section === selectedSection);
  const assignedRoomNo = sectionEntries.find(e => e.classroom?.room_number)?.classroom?.room_number || 'I-506';
  const [roomNumberText, setRoomNumberText] = useState(assignedRoomNo);

  // Infer Class Teacher & Mentors
  const classTeacherName = sectionConfig?.class_teacher?.user?.full_name 
    || facultyProfiles[0]?.user?.full_name 
    || 'Dr. Y Bheem Shankar';

  const mentorsList = sectionConfig?.counseling_mentors?.length 
    ? sectionConfig.counseling_mentors 
    : facultyProfiles.slice(0, 3);

  // Extract unique subjects assigned to this section
  const sectionSubjectIds = Array.from(new Set(sectionEntries.map(e => e.subject_id)));
  const assignedSubjects = subjects.filter(s => sectionSubjectIds.includes(s.id));
  const displaySubjects = assignedSubjects.length > 0 ? assignedSubjects : subjects.slice(0, 8);

  // Standard slot timings
  const getSlotTiming = (slotNum: number) => {
    const timings: Record<number, string> = {
      1: '8.50AM-9.40AM',
      2: '9.40AM-10.30AM',
      3: '10.30AM-11.20AM',
      4: '11.20AM-12.10PM',
      5: '1.00PM-1.50PM',
      6: '1.50PM-2.40PM',
      7: '2.40PM-3.30PM',
      8: '3.30PM-4.20PM'
    };
    return timings[slotNum] || `Slot ${slotNum}`;
  };

  const daysList = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/85 backdrop-blur-md overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto">
      {/* Modal Toolbar (Hidden on Print) */}
      <div className="fixed top-4 right-6 flex items-center gap-3 z-50 print:hidden">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 py-2.5 px-5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold shadow-xl transition-all"
        >
          <Printer className="w-4 h-4" />
          Print / Save PDF
        </button>
        <button
          onClick={onClose}
          className="p-2.5 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white transition-all shadow-xl"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Official ANITS Timetable Printable Document */}
      <div className="w-full max-w-5xl bg-white text-black p-8 rounded-2xl shadow-2xl print:shadow-none print:p-0 print:max-w-none print:w-full font-serif text-[11px] leading-tight border border-gray-300 print:border-none my-12 print:my-0">
        
        {/* Print Styles Injection */}
        <style dangerouslySetInnerHTML={{ __html: `
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

        {/* 2. Main Title Banner */}
        <div className="border border-black text-center py-1 font-bold text-xs uppercase bg-gray-100 mb-2">
          {yearRoman} B. Tech. FIRST SEMESTER TIME TABLE (A. Y. {academicYearText})
        </div>

        {/* 3. Metadata Header Grid */}
        <table className="w-full border-collapse border border-black text-center text-[10px] font-bold mb-2">
          <tbody>
            <tr>
              <td className="border border-black p-1.5 w-1/6">
                Room No. <span className="font-extrabold">{roomNumberText}</span>
              </td>
              <td className="border border-black p-1.5 w-1/6">
                MID-I<br/><span className="font-semibold text-[9px]">{mid1Date}</span>
              </td>
              <td className="border border-black p-1.5 w-1/6">
                MID-II<br/><span className="font-semibold text-[9px]">{mid2Date}</span>
              </td>
              <td className="border border-black p-1.5 w-1/6 text-sm font-black bg-gray-50">
                {department?.code || 'CSD'} - {selectedSection.split(' ').pop() || 'A'}
              </td>
              <td className="border border-black p-1.5 w-1/6">
                Sem End Exam<br/><span className="font-semibold text-[9px]">{semExamDate}</span>
              </td>
              <td className="border border-black p-1.5 w-1/6">
                W.E.F. : <span className="font-semibold">{wefDate}</span>
              </td>
            </tr>
          </tbody>
        </table>

        {/* 4. Dynamic Weekly Timetable Grid Table */}
        <table className="w-full border-collapse border border-black text-center text-[9.5px] font-sans mb-3">
          <thead>
            <tr className="bg-gray-100 font-bold border-b border-black">
              <th className="border border-black p-1.5 uppercase w-20 font-serif text-[10px]">TIME / DAY</th>
              {Array.from({ length: ruleSlotsPerDay }).map((_, idx) => {
                const slotNum = idx + 1;
                const isLunch = slotNum === effectiveLunchSlot;
                return (
                  <th key={idx} className={`border border-black p-1 font-semibold ${isLunch ? 'w-16 bg-gray-200 font-extrabold' : ''}`}>
                    {isLunch ? '12.10PM-1.00PM' : getSlotTiming(slotNum)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {daysList.map(day => {
              const dayEntries = sectionEntries.filter(e => e.day_of_week === day);

              return (
                <tr key={day} className="border-b border-black h-9">
                  <td className="border border-black font-bold p-1 bg-gray-50 font-serif text-[10px]">{day}</td>

                  {Array.from({ length: ruleSlotsPerDay }).map((_, slotIdx) => {
                    const slotNum = slotIdx + 1;
                    const isLunch = slotNum === effectiveLunchSlot;
                    const entry = dayEntries.find(e => e.time_slot === slotNum);
                    const isSatAfternoon = day === 'Saturday' && slotNum >= 5;

                    if (isLunch) {
                      // Render Lunch column only once per row
                      if (day === 'Monday') {
                        return (
                          <td 
                            key={slotNum} 
                            rowSpan={6} 
                            className="border border-black font-black uppercase text-[11px] bg-gray-100 tracking-widest leading-loose align-middle w-16"
                            style={{ writingMode: 'vertical-rl', textOrientation: 'upright' }}
                          >
                            LUNCH BREAK
                          </td>
                        );
                      }
                      return null; // Skip lunch cells for other days as rowSpan=6 handles it
                    }

                    return (
                      <td key={slotNum} className="border border-black p-1 font-semibold text-[10px] align-middle">
                        {isSatAfternoon ? (
                          <span className="text-gray-400 font-serif italic text-[9px]">HALF DAY</span>
                        ) : entry ? (
                          <div className="leading-tight">
                            <strong className="block font-black text-black">{entry.subject?.code || entry.subject?.name}</strong>
                            {entry.lab_batch && entry.lab_batch !== 'ALL' && (
                              <span className="text-[8px] font-bold text-gray-700">({entry.lab_batch})</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* 5. Subject & Faculty Legend Table */}
        <div className="grid grid-cols-12 border border-black mb-4">
          {/* Left Column: Subjects & Faculty List */}
          <div className="col-span-8 border-r border-black p-0">
            <table className="w-full text-left text-[9.5px]">
              <thead>
                <tr className="border-b border-black bg-gray-100 font-bold">
                  <th className="p-1 border-r border-black w-24">Subject Code</th>
                  <th className="p-1 border-r border-black">Subject Name</th>
                  <th className="p-1">Faculty Name</th>
                </tr>
              </thead>
              <tbody>
                {displaySubjects.map(sub => {
                  const assignedFaculty = sectionEntries.find(e => e.subject_id === sub.id)?.faculty?.user?.full_name 
                    || facultyProfiles.find(f => f.subjects?.some(s => s.id === sub.id))?.user?.full_name 
                    || 'Faculty Assigned';

                  return (
                    <tr key={sub.id} className="border-b border-gray-300">
                      <td className="p-1 font-bold border-r border-black">{sub.code}</td>
                      <td className="p-1 border-r border-black uppercase font-medium">{sub.name}</td>
                      <td className="p-1 font-semibold">: {assignedFaculty}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Right Column: Class Teacher & Mentors */}
          <div className="col-span-4 p-2 text-[9.5px]">
            <div className="mb-3">
              <span className="font-bold">Class Teacher</span>
              <span className="font-semibold ml-2">: {classTeacherName}</span>
            </div>

            <table className="w-full border border-black text-left text-[9px]">
              <thead>
                <tr className="border-b border-black bg-gray-100 font-bold">
                  <th className="p-1 border-r border-black">Mentor Name</th>
                  <th className="p-1">Roll Numbers</th>
                </tr>
              </thead>
              <tbody>
                {mentorsList.map((m, idx) => {
                  const rollRanges = [
                    'A24126551001-020',
                    'A24126551021-040',
                    'A24126551041-053 & A24126551161-168'
                  ];
                  return (
                    <tr key={m.id || idx} className="border-b border-gray-200">
                      <td className="p-1 border-r border-black font-semibold">{m.user?.full_name || `Mentor ${idx+1}`}</td>
                      <td className="p-1 font-mono text-[8.5px]">{rollRanges[idx % rollRanges.length]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 6. Footer Signatures */}
        <div className="flex justify-between items-end pt-8 font-bold text-[10px] uppercase">
          <div className="text-left">
            <span className="block border-t border-black pt-1 w-40 text-center">Time Table Coordinator</span>
          </div>
          <div className="text-center">
            <span className="block border-t border-black pt-1 w-40 text-center">H. O. D. Of {department?.code || 'CSD'}</span>
          </div>
          <div className="text-right">
            <span className="block border-t border-black pt-1 w-32 text-center">Principal</span>
          </div>
        </div>
      </div>
    </div>
  );
};
