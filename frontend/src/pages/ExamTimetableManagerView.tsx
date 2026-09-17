import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { facultyService } from '../services/facultyService';
import { classroomService } from '../services/classroomService';
import { timetableService } from '../services/timetableService';
import { academicCalendarService } from '../services/academicCalendarService';
import { importService } from '../services/importService';
import type { Department, Subject, FacultyProfile } from '../services/facultyService';
import type { Classroom } from '../services/classroomService';
import type { ExamTimetableEntry } from '../services/timetableService';
import { 
  PrintableExamTimetableTemplate, 
  OfficialCircularSheet, 
  getDeptOfficialTitle, 
  getRomanYear,
  type DeptYearCircularGroup,
  type CircularRowItem
} from '../components/PrintableExamTimetableTemplate';
import { 
  Calendar, Sparkles, ShieldCheck, FileSpreadsheet, Plus, X, 
  AlertTriangle, CheckCircle2, ArrowLeft, Upload, UploadCloud,
  Trash2, Table, Printer, FileText, Building2, CalendarDays
} from 'lucide-react';

interface ExamTimetableManagerViewProps {
  onBack: () => void;
}

export const ExamTimetableManagerView: React.FC<ExamTimetableManagerViewProps> = ({ onBack }) => {
  const { user } = useAuth();

  // Base Data
  const [departments, setDepartments] = useState<Department[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [facultyProfiles, setFacultyProfiles] = useState<FacultyProfile[]>([]);
  const [exams, setExams] = useState<ExamTimetableEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Calendar Exam Dates
  const [calExamDates, setCalExamDates] = useState<{
    academic_year: string | null;
    semester: string | null;
    mid1_start_date: string | null;
    mid2_start_date: string | null;
    end_sem_exam_start_date: string | null;
    by_year?: Record<string, {
      mid1_start_date: string | null;
      mid2_start_date: string | null;
      end_sem_exam_start_date: string | null;
    }>;
  } | null>(null);

  // Tabs & Modes
  const [examTabCategory, setExamTabCategory] = useState<'MID' | 'SEM_END'>('MID');
  const [examTabType, setExamTabType] = useState<'MID_1' | 'MID_2' | 'SEM_END'>('MID_1');

  // Generator Wizard Modal
  const [isGenerateExamModalOpen, setIsGenerateExamModalOpen] = useState(false);
  const [isGeneratingExams, setIsGeneratingExams] = useState(false);
  const [genCategory, setGenCategory] = useState<'MID' | 'SEM_END'>('MID');
  const [genExamType, setGenExamType] = useState<'MID_1' | 'MID_2' | 'SEM_END'>('MID_1');
  const [genStartDate, setGenStartDate] = useState('');
  const [genSemester, setGenSemester] = useState<number>(1);
  const [genTargetDeptId, setGenTargetDeptId] = useState('ALL');
  const [genError, setGenError] = useState('');
  const [genSuccess, setGenSuccess] = useState('');

  // Manual Session Add Modal
  const [isAddExamModalOpen, setIsAddExamModalOpen] = useState(false);
  const [newExamType, setNewExamType] = useState('MID_1');
  const [newAcademicYear, setNewAcademicYear] = useState(1);
  const [newSemester, setNewSemester] = useState(1);
  const [newExamSubjectId, setNewExamSubjectId] = useState('');
  const [newExamClassroomId, setNewExamClassroomId] = useState('');
  const [newExamInvigilatorId, setNewExamInvigilatorId] = useState('');
  const [newExamDate, setNewExamDate] = useState('');
  const [newExamTimeSlot, setNewExamTimeSlot] = useState(1);
  const [newExamError, setNewExamError] = useState('');
  const [isSavingExam, setIsSavingExam] = useState(false);

  // File Upload Modal
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFileType, setUploadFileType] = useState<'calendar' | 'department'>('calendar');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');

  // View Filters
  const [examViewMode, setExamViewMode] = useState<'daywise' | 'circular' | 'table' | 'grid' | 'roster'>('daywise');
  const [examFilterDeptId, setExamFilterDeptId] = useState('ALL');
  const [examFilterYear, setExamFilterYear] = useState('ALL');
  const [examFilterSemester, setExamFilterSemester] = useState<number>(1);
  const [examFilterSearch, setExamFilterSearch] = useState('');
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Helper for accurate department exam matching
  const isExamMatchDept = (ex: ExamTimetableEntry, deptId: string, deptCode: string) => {
    // 1. Primary authority: subject's explicit department ID
    const subjDeptId = ex.subject?.department_id || ex.subject?.department?.id;
    if (subjDeptId) {
      return subjDeptId === deptId;
    }
    // 2. Secondary authority: subject's department code
    if (ex.subject?.department?.code) {
      return ex.subject.department.code.toUpperCase() === deptCode.toUpperCase();
    }
    // 3. Strict fallback only if subject has no department ID at all
    const code = ex.subject?.code?.toUpperCase() || '';
    if (deptCode === 'CSD') return code.startsWith('23CD') || ex.subject?.name?.toLowerCase().includes('data science') || false;
    if (deptCode === 'CSE') return code.startsWith('CS') && !code.startsWith('CSD');
    if (deptCode === 'IT') return code.startsWith('IT');
    if (deptCode === 'EEE') return code.startsWith('EE');
    if (deptCode === 'CIVIL') return code.startsWith('CIV') || code.startsWith('CE');
    if (deptCode === 'CHE') return code.startsWith('CHE') || code.startsWith('CH');
    if (deptCode === 'BT') return code.startsWith('BT');
    return false;
  };

  const getDeptExamsCount = (deptId: string, deptCode: string) => {
    return exams.filter(ex => {
      if (examTabCategory === 'MID' && !ex.exam_type?.includes('MID')) return false;
      if (examTabCategory === 'SEM_END' && ex.exam_type !== 'SEM_END') return false;
      if (examTabType && ex.exam_type !== examTabType) return false;
      if (ex.semester && ex.semester !== examFilterSemester) return false;
      return isExamMatchDept(ex, deptId, deptCode);
    }).length;
  };

  const totalCategoryExamsCount = exams.filter(ex => {
    if (examTabCategory === 'MID' && !ex.exam_type?.includes('MID')) return false;
    if (examTabCategory === 'SEM_END' && ex.exam_type !== 'SEM_END') return false;
    if (examTabType && ex.exam_type !== examTabType) return false;
    if (ex.semester && ex.semester !== examFilterSemester) return false;
    return true;
  }).length;


  // Memoized Department-Wise, Year-Wise, Day-Wise Circular Groups
  const printCircularGroups = useMemo<DeptYearCircularGroup[]>(() => {
    let targetDepts = departments;
    if (examFilterDeptId !== 'ALL') {
      targetDepts = departments.filter(d => d.id === examFilterDeptId);
    }

    let targetYears = [1, 2, 3, 4];
    if (examFilterYear !== 'ALL') {
      targetYears = [parseInt(examFilterYear)];
    }

    const result: DeptYearCircularGroup[] = [];

    targetDepts.forEach(dept => {
      targetYears.forEach(yr => {
        const deptExams = exams.filter(ex => {
          if (examTabCategory === 'MID' && !ex.exam_type?.includes('MID')) return false;
          if (examTabCategory === 'SEM_END' && ex.exam_type !== 'SEM_END') return false;
          if (examTabType && ex.exam_type !== examTabType) return false;
          if (ex.semester && ex.semester !== examFilterSemester) return false;

          const matchDept = isExamMatchDept(ex, dept.id, dept.code);
          if (!matchDept) return false;

          const exYr = ex.academic_year || 1;
          if (exYr !== yr) return false;

          return true;
        });


        if (deptExams.length === 0) return;

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
          if (examTabCategory === 'SEM_END') {
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

        const sortedRows = Array.from(slotMap.values()).sort((a, b) => {
          const tA = a.rawDate ? a.rawDate.getTime() : 0;
          const tB = b.rawDate ? b.rawDate.getTime() : 0;
          if (tA !== tB) return tA - tB;
          return a.slot - b.slot;
        });

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
  }, [departments, exams, examFilterDeptId, examFilterYear, examFilterSemester, examTabCategory, examTabType]);


  const handleUploadScheduleFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setUploadError('Please select a CSV or Excel file to upload.');
      return;
    }
    setUploadError('');
    setUploadSuccess('');
    setIsUploading(true);
    try {
      if (uploadFileType === 'calendar') {
        const res = await academicCalendarService.uploadAcademicCalendarCsv(uploadFile);
        setUploadSuccess(res.message || 'Academic Calendar & Exam Dates uploaded successfully!');
      } else {
        const res = await importService.uploadDepartmentData(uploadFile);
        setUploadSuccess(`Successfully imported master schedule records from ${res.file_name}!`);
      }
      await loadBaseData();
      setTimeout(() => {
        setIsUploadModalOpen(false);
        setUploadFile(null);
        setUploadSuccess('');
      }, 1500);
    } catch (err: any) {
      setUploadError(err.response?.data?.detail || 'Failed to upload file. Please check file format and columns.');
    } finally {
      setIsUploading(false);
    }
  };

  const loadBaseData = async () => {
    try {
      setIsLoading(true);
      const [deptsData, subjsData, roomsData, facultyData, examsData, calDatesData] = await Promise.all([
        facultyService.getDepartments(),
        facultyService.getSubjects(),
        classroomService.getClassrooms(),
        facultyService.getFacultyProfiles(),
        timetableService.getExamSchedule(),
        timetableService.getExamCalendarDates(examFilterSemester)
      ]);

      setDepartments(deptsData);
      setSubjects(subjsData);
      setClassrooms(roomsData);
      setFacultyProfiles(facultyData);
      setExams(examsData);
      setCalExamDates(calDatesData);
    } catch (err) {
      console.error('Failed to load exam data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBaseData();
  }, []);

  useEffect(() => {
    const updateDates = async () => {
      try {
        const calData = await timetableService.getExamCalendarDates(examFilterSemester);
        setCalExamDates(calData);
      } catch (err) {
        console.error('Failed to reload calendar dates for semester:', err);
      }
    };
    updateDates();
  }, [examFilterSemester]);


  const [directStartDate, setDirectStartDate] = useState('');

  const getDefaultExamDate = (type: 'MID_1' | 'MID_2' | 'SEM_END', year?: string) => {
    if (calExamDates) {
      if (calExamDates.by_year) {
        const yrKey = year && year !== 'ALL' ? year : (examFilterYear !== 'ALL' ? examFilterYear : '4');
        const yrData = calExamDates.by_year[yrKey] || calExamDates.by_year['4'] || calExamDates.by_year['3'];
        if (yrData) {
          if (type === 'MID_1' && yrData.mid1_start_date) return yrData.mid1_start_date.split('T')[0];
          if (type === 'MID_2' && yrData.mid2_start_date) return yrData.mid2_start_date.split('T')[0];
          if (type === 'SEM_END' && yrData.end_sem_exam_start_date) return yrData.end_sem_exam_start_date.split('T')[0];
        }
      }
      if (type === 'MID_1' && calExamDates.mid1_start_date) return calExamDates.mid1_start_date.split('T')[0];
      if (type === 'MID_2' && calExamDates.mid2_start_date) return calExamDates.mid2_start_date.split('T')[0];
      if (type === 'SEM_END' && calExamDates.end_sem_exam_start_date) return calExamDates.end_sem_exam_start_date.split('T')[0];
    }
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilNextMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
    const nextMon = new Date();
    nextMon.setDate(today.getDate() + daysUntilNextMonday);
    return nextMon.toISOString().split('T')[0];
  };

  useEffect(() => {
    setDirectStartDate(getDefaultExamDate(examTabType));
  }, [examTabType, calExamDates]);

  useEffect(() => {
    if (isGenerateExamModalOpen) {
      setGenStartDate(getDefaultExamDate(genExamType));
    }
  }, [genExamType, calExamDates, isGenerateExamModalOpen]);

  const handleGenerateExams = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenError('');
    setGenSuccess('');
    setIsGeneratingExams(true);
    try {
      const targetDeptIds = genTargetDeptId === 'ALL' ? undefined : [genTargetDeptId];
      const startIso = genStartDate ? `${genStartDate}T00:00:00` : undefined;
      await timetableService.generateExamSchedule({
        category: genCategory,
        exam_type: genExamType,
        start_date: startIso,
        semester: genSemester,
        department_ids: targetDeptIds
      });
      const allExams = await timetableService.getExamSchedule();
      setExams(allExams);
      setExamTabCategory(genCategory);
      setExamTabType(genExamType);
      setExamFilterSemester(genSemester);
      if (genTargetDeptId !== 'ALL') {
        setExamFilterDeptId(genTargetDeptId);
      }
      setIsGenerateExamModalOpen(false);
      setExamViewMode('daywise');
      setIsPrintModalOpen(false);
    } catch (err: any) {
      setGenError(err.response?.data?.detail || 'Failed to generate exam schedule.');
    } finally {
      setIsGeneratingExams(false);
    }
  };

  const handleDirectGenerate = async () => {
    try {
      setIsLoading(true);
      const targetDeptIds = examFilterDeptId && examFilterDeptId !== 'ALL' ? [examFilterDeptId] : undefined;
      const targetYear = examFilterYear && examFilterYear !== 'ALL' ? parseInt(examFilterYear) : undefined;
      await timetableService.generateExamSchedule({
        category: examTabCategory,
        exam_type: examTabType,
        start_date: directStartDate ? `${directStartDate}T00:00:00` : undefined,
        semester: examFilterSemester,
        department_ids: targetDeptIds,
        academic_year: targetYear
      });
      const allExams = await timetableService.getExamSchedule();
      setExams(allExams);
      setExamViewMode('daywise');
      setIsPrintModalOpen(false);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Direct exam generation failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearExams = async () => {
    const semLabel = examFilterSemester === 2 ? 'Semester 2' : 'Semester 1';
    const label = examTabCategory === 'MID' ? `Mid Exam (${examTabType} - ${semLabel})` : `Semester End Exam (${semLabel})`;
    if (!window.confirm(`Are you sure you want to purge scheduled ${label} entries?`)) return;
    try {
      setIsLoading(true);
      await timetableService.clearExamSchedule({
        exam_type: examTabType,
        semester: examFilterSemester,
        department_id: examFilterDeptId === 'ALL' ? undefined : examFilterDeptId
      });
      const updated = await timetableService.getExamSchedule();
      setExams(updated);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to clear exam schedule.');
    } finally {
      setIsLoading(false);
    }
  };


  const handlePurgeExamDatabase = async () => {
    if (!window.confirm('⚠️ WARNING: Are you sure you want to PERMANENTLY PURGE ALL exam entries from the database? This cannot be undone.')) return;
    try {
      setIsLoading(true);
      await timetableService.clearExamSchedule({ purge_all: true });
      setExams([]);
      alert('All exam entries have been successfully purged from the database.');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to purge exam database.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateExamEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewExamError('');
    if (!newExamSubjectId || !newExamClassroomId || !newExamDate) {
      setNewExamError('Please select Subject, Classroom, and Exam Date.');
      return;
    }
    setIsSavingExam(true);
    try {
      const created = await timetableService.createExamEntry({
        exam_type: newExamType,
        academic_year: newAcademicYear,
        semester: newSemester,
        exam_date: new Date(newExamDate).toISOString(),
        time_slot: newExamTimeSlot,
        subject_id: newExamSubjectId,
        classroom_id: newExamClassroomId,
        invigilator_id: newExamInvigilatorId || null
      });
      setExams(prev => [...prev, created]);
      setIsAddExamModalOpen(false);
      setNewExamSubjectId('');
      setNewExamClassroomId('');
      setNewExamInvigilatorId('');
      setNewExamDate('');
    } catch (err: any) {
      setNewExamError(err.response?.data?.detail || 'Failed to save exam session.');
    } finally {
      setIsSavingExam(false);
    }
  };

  const handleDeleteExam = async (examId: string) => {
    if (!window.confirm('Remove this exam session entry?')) return;
    try {
      await timetableService.deleteExamEntry(examId);
      setExams(prev => prev.filter(e => e.id !== examId));
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to delete exam session.');
    }
  };

  const handleExportExamsCSV = () => {
    const selectedDept = departments.find(d => d.id === examFilterDeptId);
    const targetExams = exams.filter(ex => {
      if (examTabCategory === 'MID' && !ex.exam_type?.includes('MID')) return false;
      if (examTabCategory === 'SEM_END' && ex.exam_type !== 'SEM_END') return false;
      if (examTabType && ex.exam_type !== examTabType) return false;
      if (selectedDept && !isExamMatchDept(ex, selectedDept.id, selectedDept.code)) return false;
      if (examFilterYear !== 'ALL' && ex.academic_year !== parseInt(examFilterYear)) return false;
      return true;
    });

    if (targetExams.length === 0) {
      alert('No exam sessions scheduled to export for current selection.');
      return;
    }
    let csv = "Category,Type,Year,Semester,Date,Slot,Time,Department,Subject Code,Subject Name,Classroom,Invigilator\n";
    targetExams.forEach(ex => {
      const dateStr = ex.exam_date ? new Date(ex.exam_date).toLocaleDateString() : 'TBA';
      const slotTime = ex.time_slot === 1 ? "09:30 - 11:30 AM" : ex.time_slot === 2 ? "01:00 - 03:00 PM" : ex.time_slot === 3 ? "03:45 - 05:45 PM" : `Slot ${ex.time_slot}`;
      csv += `"${ex.exam_type?.includes('MID') ? 'MID' : 'SEM_END'}","${ex.exam_type || 'MID_1'}","Year ${ex.academic_year || 1}","Sem ${ex.semester || 1}","${dateStr}","Slot ${ex.time_slot}","${slotTime}","${ex.subject?.department?.code || ''}","${ex.subject?.code || ''}","${ex.subject?.name || ''}","${ex.classroom?.room_number || ''}","${ex.invigilator?.user?.full_name || 'Unassigned'}"\n`;
    });

    const filename = selectedDept 
      ? `${selectedDept.code}_${examTabType || 'Mid'}_Examination_Timetable.csv`
      : `All_Departments_${examTabType || 'Mid'}_Examination_Timetable.csv`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 print:p-0 print:m-0 print:max-w-none">
      {/* Interactive Web UI (Hidden completely when printing) */}
      <div className="print:hidden">
        {/* Top Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-xs font-extrabold text-slate-700 hover:text-slate-900 transition-all mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500 text-white shadow-md">
              <Calendar className="w-6 h-6" />
            </div>
            Examination Preparation & Invigilation Duty Portal
          </h2>
          <p className="text-xs md:text-sm text-slate-600 font-semibold mt-1">
            Directly schedule Mid & Semester End Examinations using uploaded subject details and Academic Calendar start dates.
          </p>
        </div>
      </div>

      {/* Main Examination View Content */}
      <div className="space-y-6">
        {/* Top Category Tabs: Mid Exams vs Semester End Exams */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-100 p-2 border border-slate-300 rounded-2xl shadow-inner">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setExamTabCategory('MID');
                setExamTabType('MID_1');
              }}
              className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 ${
                examTabCategory === 'MID'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                  : 'bg-white text-slate-700 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Mid Examinations (Mid-1 & Mid-2)
            </button>

            <button
              type="button"
              onClick={() => {
                setExamTabCategory('SEM_END');
                setExamTabType('SEM_END');
              }}
              className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 ${
                examTabCategory === 'SEM_END'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-white text-slate-700 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              Semester End Examinations
            </button>
          </div>

          {/* Sub-toggle for Mid-1 vs Mid-2 if MID category active */}
          {examTabCategory === 'MID' && (
            <div className="flex items-center gap-1.5 bg-white p-1 border border-slate-300 rounded-xl shadow-sm">
              <button
                type="button"
                onClick={() => setExamTabType('MID_1')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                  examTabType === 'MID_1' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Mid-1 Schedule
              </button>
              <button
                type="button"
                onClick={() => setExamTabType('MID_2')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                  examTabType === 'MID_2' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                Mid-2 Schedule
              </button>
            </div>
          )}

          {/* Semester Selector Pill (2 Semesters Per Academic Year) */}
          <div className="flex items-center gap-1.5 bg-white p-1 border border-slate-300 rounded-xl shadow-sm">
            <span className="text-[11px] font-black text-slate-500 pl-2 pr-1 flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5 text-indigo-600" /> Sem:
            </span>
            <button
              type="button"
              onClick={() => setExamFilterSemester(1)}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1 ${
                examFilterSemester === 1
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Semester-I (Odd)
            </button>
            <button
              type="button"
              onClick={() => setExamFilterSemester(2)}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1 ${
                examFilterSemester === 2
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Semester-II (Even)
            </button>
          </div>
        </div>

        {/* Action Control Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 border border-slate-300 rounded-2xl shadow-sm">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              {examTabCategory === 'MID'
                ? `${examTabType === 'MID_1' ? 'First Mid-Term (Mid-1)' : 'Second Mid-Term (Mid-2)'} • Semester ${examFilterSemester} Timetable`
                : `Semester ${examFilterSemester === 2 ? 'II' : 'I'} End Examination Timetable (Interleaved Gap Schedule)`}
            </h3>
            <p className="text-xs text-slate-600 font-semibold mt-0.5">
              {examTabCategory === 'MID'
                ? '2 Sessions Daily (Morning: 09:30-11:30 AM & Afternoon: 01:00-03:00 PM) • Skips Sundays & DB Holidays'
                : 'Mandatory 1-Day Preparation Gap Between Consecutive Exams • Alternate Days Interleaving • Skips Sundays & Public Holidays from DB'}
            </p>
          </div>


          <div className="flex items-center gap-2.5 flex-wrap">
            {(user?.role === 'HOD' || user?.role === 'ADMIN') && (
              <>
                <div className="flex items-center gap-1.5 bg-slate-50 border border-amber-300 rounded-xl px-2.5 py-1 shadow-sm">
                  <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <input
                    type="date"
                    value={directStartDate}
                    onChange={e => setDirectStartDate(e.target.value)}
                    className="bg-transparent text-slate-900 text-xs outline-none font-extrabold cursor-pointer"
                    title="Exam Start Date"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleDirectGenerate}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold shadow-md shadow-amber-600/20 transition-all disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  Generate Timetable
                </button>

                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-md shadow-blue-600/20 transition-all"
                >
                  <Upload className="w-4 h-4" />
                  Upload File
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setNewExamType(examTabType);
                    setIsAddExamModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-900 text-xs font-extrabold hover:bg-slate-200 transition-all shadow-sm"
                >
                  <Plus className="w-4 h-4 text-emerald-600" />
                  Add Session
                </button>

                <button
                  type="button"
                  onClick={handleClearExams}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-900 text-xs font-extrabold hover:bg-slate-200 transition-all shadow-sm"
                  title="Clear entries for current active type"
                >
                  <Trash2 className="w-4 h-4 text-amber-600" />
                  Clear Type
                </button>

                <button
                  type="button"
                  onClick={handlePurgeExamDatabase}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 border border-red-300 text-red-700 text-xs font-extrabold transition-all shadow-sm"
                  title="Purge all exam entries from the database"
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                  Delete DB
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleExportExamsCSV}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-900 text-xs font-extrabold hover:bg-slate-200 transition-all shadow-sm"
              title="Export schedule as CSV"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              Export CSV
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-xs font-extrabold shadow-md shadow-amber-600/20 transition-all"
              title="Print current timetable"
            >
              <Printer className="w-4 h-4" />
              Print Timetable
            </button>
          </div>
        </div>

        {/* Department-Wise Timetable Navigator (Option for Showing Each Dept Separately) */}
        <div className="bg-white border border-slate-300 p-5 rounded-2xl shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-700">
                  <Building2 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                  Department-Wise Examination Timetables
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                  Separate Branch Views
                </span>
              </div>
              <p className="text-xs text-slate-500 font-semibold mt-1">
                Select any branch below to display its {examTabCategory === 'MID' ? (examTabType === 'MID_2' ? 'Mid-II' : 'Mid-I') : 'End-Sem'} timetable separately, or choose All Branches for combined view.
              </p>
            </div>

            {/* Quick Search */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <input
                type="text"
                value={examFilterSearch}
                onChange={e => setExamFilterSearch(e.target.value)}
                placeholder="Search subject code, name, room..."
                className="px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-bold placeholder-slate-400 outline-none focus:border-amber-600 w-full md:w-64 shadow-inner"
              />
            </div>
          </div>

          {/* Department Selection Tabs Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 pt-1">
            {/* All Departments Option */}
            <button
              type="button"
              onClick={() => setExamFilterDeptId('ALL')}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all text-center ${
                examFilterDeptId === 'ALL'
                  ? 'bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-600/20 ring-2 ring-amber-400/50'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-800'
              }`}
            >
              <Building2 className="w-4 h-4 mb-1 opacity-80" />
              <span className="text-xs font-black">All Branches</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${
                examFilterDeptId === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {totalCategoryExamsCount} Exams
              </span>
            </button>

            {/* Individual Department Cards */}
            {departments.map(dept => {
              const count = getDeptExamsCount(dept.id, dept.code);
              const isSelected = examFilterDeptId === dept.id;
              return (
                <button
                  key={dept.id}
                  type="button"
                  onClick={() => setExamFilterDeptId(dept.id)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all text-center ${
                    isSelected
                      ? 'bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-600/20 ring-2 ring-amber-400/50'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-800'
                  }`}
                >
                  <span className="text-xs font-black uppercase font-mono">{dept.code}</span>
                  <span className="text-[10px] font-semibold truncate max-w-full opacity-85">
                    {dept.code === 'CSD' ? 'Data Science' : dept.name.split(' ')[0]}
                  </span>
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full mt-1 ${
                    isSelected ? 'bg-white/20 text-white' : (count > 0 ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-slate-200 text-slate-500')
                  }`}>
                    {count} {count === 1 ? 'Exam' : 'Exams'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* View Mode & Year Filter Sub-Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-3 border border-slate-300 rounded-xl shadow-sm">
          {/* Year Filter Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-wrap">
            <span className="text-xs font-bold text-slate-400 flex items-center gap-1 mr-1">
              <Calendar className="w-3.5 h-3.5 text-amber-600" /> Year:
            </span>
            <button
              type="button"
              onClick={() => setExamFilterYear('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                examFilterYear === 'ALL'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Years
            </button>
            {[1, 2, 3, 4].map(y => (
              <button
                key={y}
                type="button"
                onClick={() => setExamFilterYear(String(y))}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                  examFilterYear === String(y)
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {y === 1 ? '1st Year (I/IV)' : y === 2 ? '2nd Year (II/IV)' : y === 3 ? '3rd Year (III/IV)' : '4th Year (IV/IV)'}
              </button>
            ))}
          </div>

          {/* View Mode Buttons */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-300 rounded-xl shadow-inner flex-wrap">
            <button
              type="button"
              onClick={() => setExamViewMode('daywise')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                examViewMode === 'daywise' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Day-Wise Schedule
            </button>
            <button
              type="button"
              onClick={() => setExamViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                examViewMode === 'table' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              Timetable Table
            </button>
            <button
              type="button"
              onClick={() => setExamViewMode('circular')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
                examViewMode === 'circular' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Official Circular
            </button>
            <button
              type="button"
              onClick={() => setExamViewMode('roster')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all ${
                examViewMode === 'roster' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              Faculty Roster
            </button>
          </div>
        </div>

        {/* Active Department Spotlight Banner (When a specific department is chosen) */}
        {(() => {
          const activeDept = departments.find(d => d.id === examFilterDeptId);
          if (!activeDept) return null;
          const activeDeptCount = getDeptExamsCount(activeDept.id, activeDept.code);
          return (
            <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 border-2 border-amber-500/30 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-600 to-orange-600 text-white flex items-center justify-center font-black text-xl shadow-md shadow-amber-600/30 shrink-0">
                  {activeDept.code}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-amber-700 tracking-wider">
                      Exclusive Department Schedule
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-xs font-bold text-slate-500">
                      {examTabCategory === 'MID' ? (examTabType === 'MID_2' ? 'Mid-II Examination' : 'Mid-I Examination') : 'Semester-End Examination'}
                    </span>
                  </div>
                  <h2 className="text-lg md:text-xl font-black text-slate-900">
                    DEPARTMENT OF {getDeptOfficialTitle(activeDept.code, activeDept.name)}
                  </h2>
                  <p className="text-xs text-slate-600 font-semibold mt-0.5">
                    Showing {activeDeptCount} Scheduled Sessions • 2 Sessions Daily (Morning: 09:30-11:30 AM & Afternoon: 01:00-03:00 PM)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setExamFilterDeptId('ALL')}
                  className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-extrabold transition-all shadow-xs"
                >
                  View All Branches
                </button>
                <button
                  type="button"
                  onClick={handleExportExamsCSV}
                  className="px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-xs font-extrabold transition-all shadow-xs flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  Export {activeDept.code} CSV
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold transition-all shadow-md shadow-amber-600/20 flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  Print {activeDept.code}
                </button>
              </div>
            </div>
          );
        })()}

        {/* Exam Content Views */}
        {(() => {
          const filtered = exams.filter(ex => {
            if (examTabCategory === 'MID' && !ex.exam_type?.includes('MID')) return false;
            if (examTabCategory === 'SEM_END' && ex.exam_type !== 'SEM_END') return false;
            if (examTabCategory === 'MID' && ex.exam_type !== examTabType) return false;
            if (ex.semester && ex.semester !== examFilterSemester) return false;


            if (examFilterDeptId !== 'ALL') {
              const targetDept = departments.find(d => d.id === examFilterDeptId);
              if (targetDept && !isExamMatchDept(ex, targetDept.id, targetDept.code)) {
                return false;
              }
            }
            if (examFilterYear !== 'ALL' && ex.academic_year !== parseInt(examFilterYear)) {
              return false;
            }
            if (examFilterSearch.trim()) {
              const q = examFilterSearch.toLowerCase();
              const matchSubj = ex.subject?.name?.toLowerCase().includes(q) || ex.subject?.code?.toLowerCase().includes(q);
              const matchRoom = ex.classroom?.room_number?.toLowerCase().includes(q);
              const matchInvig = ex.invigilator?.user?.full_name?.toLowerCase().includes(q);
              return matchSubj || matchRoom || matchInvig;
            }
            return true;
          });

          if (filtered.length === 0) {
            return (
              <div className="glass-panel p-12 text-center text-slate-500 bg-white border border-slate-300 rounded-2xl shadow-sm">
                <Calendar className="w-12 h-12 mx-auto mb-3 text-amber-600 opacity-60" />
                <h4 className="text-base font-black text-slate-900 mb-1">No Exam Sessions Found</h4>
                <p className="text-xs text-slate-600 font-semibold max-w-md mx-auto mb-6">
                  Click "Generate Timetable" to automatically schedule clash-free examinations directly from uploaded subject details and Academic Calendar start dates.
                </p>
                {(user?.role === 'HOD' || user?.role === 'ADMIN') && (
                  <button
                    type="button"
                    onClick={handleDirectGenerate}
                    className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold transition-all shadow-md shadow-amber-600/20"
                  >
                    Generate Exam Timetable Now
                  </button>
                )}
              </div>
            );
          }

          if (examViewMode === 'daywise') {
            let targetDepts = departments;
            if (examFilterDeptId !== 'ALL') {
              targetDepts = departments.filter(d => d.id === examFilterDeptId);
            }

            let targetYears = [1, 2, 3, 4];
            if (examFilterYear !== 'ALL') {
              targetYears = [parseInt(examFilterYear)];
            }

            const daywiseGroups: Array<{
              deptId: string;
              deptCode: string;
              deptName: string;
              deptOfficialTitle: string;
              academicYear: number;
              romanYear: string;
              days: Array<{
                dayNumber: number;
                dateStr: string;
                weekday: string;
                sessions: ExamTimetableEntry[];
              }>;
            }> = [];

            targetDepts.forEach(dept => {
              targetYears.forEach(yr => {
                const deptExams = exams.filter(ex => {
                  if (examTabCategory === 'MID' && !ex.exam_type?.includes('MID')) return false;
                  if (examTabCategory === 'SEM_END' && ex.exam_type !== 'SEM_END') return false;
                  if (examTabType && ex.exam_type !== examTabType) return false;
                  if (ex.semester && ex.semester !== examFilterSemester) return false;

                  const matchDept = isExamMatchDept(ex, dept.id, dept.code);
                  if (!matchDept) return false;

                  const exYr = ex.academic_year || 1;
                  if (exYr !== yr) return false;

                  return true;
                });


                if (deptExams.length === 0) return;

                // Group by unique date
                const dateMap = new Map<string, ExamTimetableEntry[]>();
                deptExams.forEach(ex => {
                  const dKey = ex.exam_date ? ex.exam_date.slice(0, 10) : 'TBA';
                  if (!dateMap.has(dKey)) dateMap.set(dKey, []);
                  dateMap.get(dKey)!.push(ex);
                });

                const sortedDates = Array.from(dateMap.keys()).sort();

                const days = sortedDates.map((dKey, idx) => {
                  const allSessions = dateMap.get(dKey)!;
                  
                  // Deduplicate by (slot, subject_id) so each scheduled subject slot appears cleanly
                  const uniqueSlotMap = new Map<string, ExamTimetableEntry>();
                  allSessions.forEach(s => {
                    const k = `${s.time_slot}_${s.subject_id || s.subject?.code}`;
                    if (!uniqueSlotMap.has(k)) {
                      uniqueSlotMap.set(k, s);
                    }
                  });

                  const sessions = Array.from(uniqueSlotMap.values()).sort((a, b) => (a.time_slot || 1) - (b.time_slot || 1));

                  let dateFormatted = dKey;
                  let weekday = '';
                  if (dKey !== 'TBA') {
                    const d = new Date(dKey);
                    if (!isNaN(d.getTime())) {
                      const dd = String(d.getDate()).padStart(2, '0');
                      const mm = String(d.getMonth() + 1).padStart(2, '0');
                      const yyyy = d.getFullYear();
                      dateFormatted = `${dd}-${mm}-${yyyy}`;
                      weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
                    }
                  }

                  return {
                    dayNumber: idx + 1,
                    dateStr: dateFormatted,
                    weekday,
                    sessions
                  };
                });

                daywiseGroups.push({
                  deptId: dept.id,
                  deptCode: dept.code,
                  deptName: dept.name,
                  deptOfficialTitle: getDeptOfficialTitle(dept.code, dept.name),
                  academicYear: yr,
                  romanYear: getRomanYear(yr),
                  days
                });
              });
            });

            return (
              <div className="flex flex-col gap-6 w-full">
                {/* Combined Overview Banner when All Depts Active */}
                {examFilterDeptId === 'ALL' && (
                  <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center justify-between gap-3 text-xs text-amber-900 font-bold flex-wrap shadow-xs">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>Showing all {daywiseGroups.length} department batches combined. Click any branch tab above to view its timetable separately.</span>
                    </div>
                    <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-amber-200/80 text-amber-950">
                      {daywiseGroups.reduce((acc, g) => acc + g.days.reduce((a, d) => a + d.sessions.length, 0), 0)} Total Exam Sessions
                    </span>
                  </div>
                )}

                {/* Day-Wise Batches Render */}
                {daywiseGroups.length === 0 ? (
                  <div className="bg-white border border-slate-300 rounded-2xl p-12 text-center text-slate-500 shadow-sm">
                    <CalendarDays className="w-12 h-12 text-amber-600/50 mx-auto mb-3" />
                    <h4 className="text-base font-bold text-slate-900 mb-1">No Schedule Entries Found</h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Please generate or select a department with scheduled exam sessions.
                    </p>
                  </div>
                ) : (
                  daywiseGroups.map(group => (
                    <div
                      key={`${group.deptCode}_${group.academicYear}`}
                      className="bg-white border border-slate-300 rounded-2xl p-6 shadow-sm flex flex-col gap-5"
                    >
                      {/* Department & Year Banner */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-amber-600 text-white flex items-center justify-center font-black text-sm shadow-sm">
                            {group.deptCode}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black uppercase text-amber-600 tracking-wider">
                                {group.romanYear}/IV B.Tech
                              </span>
                              <span className="text-slate-300">•</span>
                              <span className="text-xs font-bold text-slate-500">
                                {examTabCategory === 'MID' ? (examTabType === 'MID_2' ? 'Mid-II Exam' : 'Mid-I Exam') : 'Semester-End Exam'}
                              </span>
                            </div>
                            <h3 className="text-base font-black text-slate-900">
                              DEPARTMENT OF {group.deptOfficialTitle}
                            </h3>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700">
                            {group.days.reduce((acc, d) => acc + d.sessions.length, 0)} Total Subjects
                          </span>
                          <span className="px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg text-xs font-extrabold text-amber-800">
                            {group.days.length} Days Timeline
                          </span>
                        </div>
                      </div>

                      {/* Day-Wise Sequence Flow */}
                      <div className="space-y-4">
                        {group.days.map(day => (
                          <div
                            key={day.dayNumber}
                            className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 transition-all hover:border-amber-400"
                          >
                            {/* Day Header */}
                            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2.5 mb-3 flex-wrap">
                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 rounded-md bg-amber-600 text-white text-xs font-black shadow-xs">
                                  Day {day.dayNumber}
                                </span>
                                <span className="text-xs sm:text-sm font-black text-slate-900">
                                  {day.dateStr}
                                </span>
                                {day.weekday && (
                                  <span className="text-xs font-semibold text-slate-500">
                                    ({day.weekday})
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] font-bold text-slate-600">
                                {day.sessions.length} {day.sessions.length === 1 ? 'Session' : 'Sessions'}
                              </span>
                            </div>

                            {/* Session Cards (Morning & Afternoon) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {day.sessions.map((sess, sIdx) => {
                                const isMorning = sess.time_slot === 1;
                                const slotTime = examTabCategory === 'SEM_END'
                                  ? (isMorning ? '09:30 AM - 12:30 PM' : '01:30 PM - 04:30 PM')
                                  : (isMorning ? '09:30 AM - 11:30 AM' : (sess.time_slot === 3 ? '02:15 PM - 03:15 PM' : '01:00 PM - 03:00 PM'));

                                return (
                                  <div
                                    key={sess.id || sIdx}
                                    className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs hover:shadow-sm transition-all flex flex-col justify-between"
                                  >
                                    <div>
                                      {/* Slot and Time badge */}
                                      <div className="flex items-center justify-between gap-2 mb-1.5">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide ${
                                          isMorning
                                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                            : 'bg-orange-50 text-orange-700 border border-orange-200'
                                        }`}>
                                          {isMorning ? 'Morning Slot 1' : `Afternoon Slot ${sess.time_slot}`}
                                        </span>
                                        <span className="text-xs font-extrabold text-slate-700">
                                          {slotTime}
                                        </span>
                                      </div>

                                      {/* Subject Code & Name */}
                                      <div className="mt-1">
                                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold">
                                          {sess.subject?.code || 'CODE'}
                                        </span>
                                        <h4 className="text-xs sm:text-sm font-black text-slate-900 mt-1 uppercase leading-snug">
                                          {sess.subject?.name}
                                        </h4>
                                      </div>
                                    </div>

                                    {/* Hall & Invigilator */}
                                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600 gap-2 flex-wrap">
                                      <div className="flex items-center gap-1">
                                        <span className="text-slate-400 font-medium">Hall:</span>
                                        <span className="font-extrabold text-slate-900">
                                          Room {sess.classroom?.room_number || 'TBA'}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span className="text-slate-400 font-medium">Invigilator:</span>
                                        <span className="font-bold text-slate-800">
                                          {sess.invigilator?.user?.full_name || 'Assigned'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          }

          if (examViewMode === 'circular') {
            const examShort = examTabCategory === 'MID' ? (examTabType === 'MID_2' ? 'Mid-II' : 'Mid-I') : 'Sem-End';
            const examFull = examTabCategory === 'MID' ? (examTabType === 'MID_2' ? 'MID-II Examination' : 'MID-I Examination') : 'Semester-End Examination';

            return (
              <div className="flex flex-col items-center justify-center w-full">
                {/* Navigation Header Bar */}
                <div className="w-full max-w-4xl flex flex-col gap-3 bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl mb-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-amber-600" />
                      <div>
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide">
                          Official Examination Circulars Preview
                        </h4>
                        <p className="text-[11px] text-slate-600 font-semibold">
                          Showing {printCircularGroups.length} Department-Wise • Year-Wise • Day-Wise Official Timetables
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold shadow-sm transition-all"
                    >
                      <Printer className="w-4 h-4" />
                      Print Circular Sheet / PDF
                    </button>
                  </div>

                  {/* Quick Department Filter Chips */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-1 scrollbar-none flex-wrap">
                    <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1 mr-1">
                      <Building2 className="w-3.5 h-3.5 text-amber-600" /> Dept:
                    </span>
                    <button
                      type="button"
                      onClick={() => setExamFilterDeptId('ALL')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all ${
                        examFilterDeptId === 'ALL'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      All Depts ({departments.length})
                    </button>
                    {departments.map(d => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setExamFilterDeptId(d.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all ${
                          examFilterDeptId === d.id
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {d.code}
                      </button>
                    ))}
                  </div>

                  {/* Quick Year Filter Chips */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pt-1 scrollbar-none flex-wrap">
                    <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1 mr-1">
                      <CalendarDays className="w-3.5 h-3.5 text-amber-600" /> Year:
                    </span>
                    <button
                      type="button"
                      onClick={() => setExamFilterYear('ALL')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all ${
                        examFilterYear === 'ALL'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      All Years
                    </button>
                    {[1, 2, 3, 4].map(y => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => setExamFilterYear(String(y))}
                        className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all ${
                          examFilterYear === String(y)
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {y === 1 ? '1st Year (I/IV)' : y === 2 ? '2nd Year (II/IV)' : y === 3 ? '3rd Year (III/IV)' : '4th Year (IV/IV)'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Render Circulars Dept-Wise, Year-Wise, Day-Wise Without Signatures Below */}
                {printCircularGroups.length === 0 ? (
                  <div className="w-full max-w-4xl bg-white border border-slate-300 p-8 text-center text-slate-500 rounded-2xl my-4">
                    No examination sessions found for the selected department and year. Please click "Generate Timetable".
                  </div>
                ) : (
                  printCircularGroups.map(group => (
                    <OfficialCircularSheet
                      key={`${group.deptCode}_${group.academicYear}`}
                      group={group}
                      circularDate="21/01/2026"
                      academicYearSpan={calExamDates?.academic_year || '2026-27'}
                      semesterNumber={examFilterSemester === 2 ? 'II' : 'I'}
                      submissionDate="23-01-2026"
                      coordinatorsText="Mrs. G.Y. Gayathri, Ms. B. Renuka Sai"
                      hodNameText="Prof. S. Adi Narayana"
                      noteText=""
                      examShortName={examShort}
                      examFullName={examFull}
                      showSignatures={false}
                    />
                  ))
                )}
              </div>
            );
          }

          if (examViewMode === 'table') {
            const sorted = [...filtered].sort((a, b) => {
              const yearDiff = (b.academic_year || 1) - (a.academic_year || 1);
              if (yearDiff !== 0) return yearDiff;
              const dateA = a.exam_date ? new Date(a.exam_date).getTime() : 0;
              const dateB = b.exam_date ? new Date(b.exam_date).getTime() : 0;
              if (dateA !== dateB) return dateA - dateB;
              return a.time_slot - b.time_slot;
            });

            // Group by Academic Year -> Date
            const groupedByYear = new Map<number, Map<string, ExamTimetableEntry[]>>();
            sorted.forEach(entry => {
              const yr = entry.academic_year || 1;
              if (!groupedByYear.has(yr)) {
                groupedByYear.set(yr, new Map());
              }
              const dateKey = entry.exam_date 
                ? new Date(entry.exam_date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })
                : 'Date To Be Announced (TBA)';
              
              const yearMap = groupedByYear.get(yr)!;
              if (!yearMap.has(dateKey)) {
                yearMap.set(dateKey, []);
              }
              yearMap.get(dateKey)!.push(entry);
            });

            const yrLabels: Record<number, string> = {
              1: '1st Year (B.Tech)',
              2: '2nd Year (B.Tech)',
              3: '3rd Year (B.Tech)',
              4: '4th Year (B.Tech)'
            };

            return (
              <div className="space-y-8">
                {Array.from(groupedByYear.entries()).map(([yr, datesMap]) => {
                  const totalYrExams = Array.from(datesMap.values()).reduce((sum, list) => sum + list.length, 0);

                  return (
                    <div key={yr} className="space-y-4">
                      {/* Year Section Header */}
                      <div className="flex items-center justify-between bg-white px-5 py-3.5 border border-slate-300 rounded-2xl shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-300 flex items-center justify-center text-amber-800 font-black text-sm shadow-sm">
                            Y{yr}
                          </div>
                          <div>
                            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                              🎓 {yrLabels[yr] || `Year ${yr}`} Examination Schedule
                            </h3>
                            <p className="text-xs text-slate-600 font-semibold">
                              Chronological Date-wise & Slot-wise Exam Timetable for {yrLabels[yr] || `Year ${yr}`}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-black px-3 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-300">
                          {totalYrExams} Exam Sessions
                        </span>
                      </div>

                      {/* Datewise Cards for this Year */}
                      <div className="space-y-4 pl-0 md:pl-2">
                        {Array.from(datesMap.entries()).map(([dateStr, entries]) => (
                          <div key={dateStr} className="glass-panel overflow-hidden border border-slate-300 bg-white rounded-2xl shadow-sm">
                            <div className="bg-slate-50 px-5 py-3 border-b border-slate-300 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-amber-600" />
                                <h4 className="text-sm font-black text-slate-900">{dateStr}</h4>
                              </div>
                              <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-300">
                                {entries.length} Sessions
                              </span>
                            </div>

                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-100 text-slate-800 uppercase text-[10px] font-black tracking-wider border-b border-slate-300">
                                  <tr>
                                    <th className="py-3 px-4">Session / Time Slot</th>
                                    <th className="py-3 px-4">Dept & Year</th>
                                    <th className="py-3 px-4">Subject Code & Name</th>
                                    <th className="py-3 px-4">Exam Hall</th>
                                    <th className="py-3 px-4">Invigilator</th>
                                    {(user?.role === 'HOD' || user?.role === 'ADMIN') && (
                                      <th className="py-3 px-4 text-right">Actions</th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 text-slate-900 font-bold">
                                  {entries.map(ex => (
                                    <tr key={ex.id} className="hover:bg-slate-50 transition-colors">
                                      <td className="py-3 px-4 whitespace-nowrap">
                                        <span className="font-extrabold text-amber-900 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-300 text-[11px]">
                                          Slot {ex.time_slot} ({examTabCategory === 'SEM_END' ? (ex.time_slot === 1 ? '09:30 AM - 12:30 PM (3 Hours)' : '01:30 PM - 04:30 PM (3 Hours)') : (ex.time_slot === 1 ? '09:30 AM - 11:30 AM' : '01:00 PM - 03:00 PM')})
                                        </span>
                                      </td>
                                      <td className="py-3 px-4 whitespace-nowrap">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200">
                                            {ex.subject?.department?.code || 'DEPT'}
                                          </span>
                                          <span className="text-[10px] font-black text-indigo-900 px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200">
                                            Year {ex.academic_year}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="py-3 px-4">
                                        <div>
                                          <span className="font-black text-slate-900 text-xs block">{ex.subject?.name}</span>
                                          <span className="text-[10px] text-slate-600 font-mono font-bold">{ex.subject?.code}</span>
                                        </div>
                                      </td>
                                      <td className="py-3 px-4 whitespace-nowrap">
                                        <span className="text-xs font-black text-indigo-900 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                                          Hall {ex.classroom?.room_number || 'TBA'}
                                        </span>
                                      </td>
                                      <td className="py-3 px-4 whitespace-nowrap">
                                        <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-black">
                                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                          <span>{ex.invigilator?.user?.full_name || 'Unassigned'}</span>
                                        </div>
                                      </td>
                                      {(user?.role === 'HOD' || user?.role === 'ADMIN') && (
                                        <td className="py-3 px-4 text-right whitespace-nowrap">
                                          <button
                                            onClick={() => handleDeleteExam(ex.id)}
                                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all"
                                            title="Delete session entry"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          }

          if (examViewMode === 'roster') {
            const invigMap = new Map<string, { faculty: FacultyProfile | null, assignments: ExamTimetableEntry[] }>();
            filtered.forEach(ex => {
              const key = ex.invigilator_id || 'UNASSIGNED';
              if (!invigMap.has(key)) {
                invigMap.set(key, { faculty: ex.invigilator || null, assignments: [] });
              }
              invigMap.get(key)!.assignments.push(ex);
            });

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from(invigMap.values()).map(({ faculty, assignments }) => (
                  <div key={faculty?.id || 'unassigned'} className="glass-panel p-5 border border-dark-800 rounded-2xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-3 border-b border-dark-850 pb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-extrabold text-xs">
                            {faculty?.user?.full_name ? faculty.user.full_name.charAt(0) : '?'}
                          </div>
                          <div>
                            <h4 className="text-xs font-extrabold text-white">{faculty?.user?.full_name || 'Unassigned Invigilators'}</h4>
                            <span className="text-[10px] text-dark-400 font-semibold">{faculty?.designation || 'Faculty Member'}</span>
                          </div>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/25">
                          {assignments.length} Duties
                        </span>
                      </div>

                      <div className="space-y-2">
                        {assignments.map(a => (
                          <div key={a.id} className="p-2.5 rounded-xl bg-dark-950/60 border border-dark-850 text-xs flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-1 mb-0.5">
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-primary-500/20 text-primary-300">
                                  Yr {a.academic_year}
                                </span>
                                <span className="text-[10px] text-amber-400 font-bold">
                                  {a.exam_date ? new Date(a.exam_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', weekday: 'short' }) : 'TBA'}
                                </span>
                              </div>
                              <span className="font-extrabold text-white text-[11px] truncate block max-w-[140px]">{a.subject?.name}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-dark-900 text-dark-300 font-bold block border border-dark-800">
                                Slot {a.time_slot} ({a.time_slot === 1 ? '09:30 AM' : a.time_slot === 2 ? '01:30 PM' : '03:45 PM'})
                              </span>
                              <span className="text-[10px] font-black text-indigo-400 block mt-0.5">Hall {a.classroom?.room_number}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          }

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(exam => (
                <div key={exam.id} className="glass-panel p-5 border border-dark-800 relative flex flex-col justify-between min-h-[175px] rounded-2xl hover:border-amber-500/30 transition-all group">
                  {(user?.role === 'HOD' || user?.role === 'ADMIN') && (
                    <button
                      onClick={() => handleDeleteExam(exam.id)}
                      className="absolute top-3 right-3 p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete exam entry"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <div>
                    <div className="flex justify-between items-start mb-2 pr-6">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className="text-[9px] font-black tracking-wider uppercase px-2 py-0.5 rounded bg-primary-500/10 text-primary-400 border border-primary-500/20">
                            {exam.subject?.department?.code || 'DEPT'}
                          </span>
                          <span className="text-[9px] font-extrabold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            Year {exam.academic_year}
                          </span>
                          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-dark-900 text-dark-300 border border-dark-800">
                            {exam.exam_type}
                          </span>
                        </div>
                        <h4 className="text-sm font-extrabold text-white leading-tight">{exam.subject?.name}</h4>
                        <span className="text-[10px] text-dark-400 font-semibold">{exam.subject?.code}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {exam.exam_date ? new Date(exam.exam_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'TBA'}
                      </span>
                      <span className="text-[10px] font-extrabold px-2 py-1 rounded-lg bg-dark-950 text-white border border-dark-800 uppercase">
                        Slot {exam.time_slot} ({exam.time_slot === 1 ? '09:30-11:30' : '13:00-15:00'})
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center border-t border-dark-850/60 pt-3 mt-4 text-xs">
                    <div className="flex items-center gap-1.5 text-dark-300">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span className="truncate max-w-[170px]">Invigilator: <strong>{exam.invigilator?.user?.full_name || 'Unassigned'}</strong></span>
                    </div>
                    <span className="text-xs font-black text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-lg border border-indigo-500/20">
                      Hall {exam.classroom?.room_number}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Mid & Semester End Exam Automated Scheduler Generator Modal */}
      {isGenerateExamModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg p-6 relative border border-dark-800 rounded-2xl">
            <button
              onClick={() => setIsGenerateExamModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-400 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-extrabold text-white mb-1 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              {genCategory === 'MID' ? `Mid Exam Generator (${genExamType})` : `Semester End Exam Generator (Sem ${genSemester})`}
            </h3>
            <p className="text-xs text-dark-400 mb-4">
              {genCategory === 'MID'
                ? 'Schedules Mid Exams starting on exact year-specific dates from Academic Calendar DB (e.g. 4th Year: Sep 1, 2nd/3rd Year: Aug 20).'
                : 'Schedules Semester End Exams: 4th Year completes first, 3rd & 2nd Year run on consecutive days, 1st Year finishes last.'}
            </p>

            {calExamDates?.by_year && (
              <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-300">
                  <Calendar className="w-3.5 h-3.5" />
                  Academic Calendar DB Start Dates:
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] font-semibold pt-1">
                  <div className="bg-dark-950/60 p-1.5 rounded-lg border border-dark-800">
                    <span className="text-amber-400 block font-bold">4th Year:</span>
                    {genExamType === 'MID_1' ? calExamDates.by_year['4']?.mid1_start_date || 'Sep 01, 2026' :
                     genExamType === 'MID_2' ? calExamDates.by_year['4']?.mid2_start_date || 'Nov 16, 2026' :
                     calExamDates.by_year['4']?.end_sem_exam_start_date || 'Nov 24, 2026'}
                  </div>
                  <div className="bg-dark-950/60 p-1.5 rounded-lg border border-dark-800">
                    <span className="text-amber-400 block font-bold">3rd & 2nd Year:</span>
                    {genExamType === 'MID_1' ? calExamDates.by_year['3']?.mid1_start_date || 'Aug 20, 2026' :
                     genExamType === 'MID_2' ? calExamDates.by_year['3']?.mid2_start_date || 'Oct 15, 2026' :
                     calExamDates.by_year['3']?.end_sem_exam_start_date || 'Oct 28, 2026'}
                  </div>
                  <div className="bg-dark-950/60 p-1.5 rounded-lg border border-dark-800">
                    <span className="text-amber-400 block font-bold">1st Year:</span>
                    {genExamType === 'MID_1' ? calExamDates.by_year['1']?.mid1_start_date || 'Sep 01, 2026' :
                     genExamType === 'MID_2' ? calExamDates.by_year['1']?.mid2_start_date || 'Nov 16, 2026' :
                     calExamDates.by_year['1']?.end_sem_exam_start_date || 'Nov 24, 2026'}
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleGenerateExams} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5">Exam Category</label>
                  <select
                    value={genCategory}
                    onChange={e => {
                      const cat = e.target.value as 'MID' | 'SEM_END';
                      setGenCategory(cat);
                      setGenExamType(cat === 'MID' ? 'MID_1' : 'SEM_END');
                    }}
                    className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-amber-500/50"
                  >
                    <option value="MID">Mid Examinations</option>
                    <option value="SEM_END">Semester End Examinations</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5">Exam Schedule Type</label>
                  <select
                    value={genExamType}
                    onChange={e => setGenExamType(e.target.value as 'MID_1' | 'MID_2' | 'SEM_END')}
                    className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-amber-500/50"
                  >
                    {genCategory === 'MID' ? (
                      <>
                        <option value="MID_1">Mid-1 Exam</option>
                        <option value="MID_2">Mid-2 Exam</option>
                      </>
                    ) : (
                      <option value="SEM_END">Semester End Exam</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-amber-400 block mb-1.5 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    Exam Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={genStartDate}
                    onChange={e => setGenStartDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-dark-950 border border-amber-500/40 rounded-xl text-white text-xs outline-none focus:border-amber-400 font-semibold"
                  />
                  <p className="text-[10px] text-dark-400 mt-1">Pick start date (Pre-filled from Academic Calendar if available).</p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5">Academic Semester</label>
                  <select
                    value={genSemester}
                    onChange={e => setGenSemester(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-amber-500/50"
                  >
                    <option value={1}>Semester 1 (Odd Sem)</option>
                    <option value={2}>Semester 2 (Even Sem)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Target Department Scope</label>
                <select
                  value={genTargetDeptId}
                  onChange={e => setGenTargetDeptId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-amber-500/50"
                >
                  <option value="ALL">All Departments & Branches</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.code} - {d.name}</option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-dark-950/60 border border-dark-850 rounded-xl text-xs space-y-1.5 text-dark-300">
                <p className="font-bold text-amber-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Engine Guarantee
                </p>
                {genCategory === 'MID' ? (
                  <>
                    <p>• <strong>Yr 1</strong>: Slot 1 (09:30 AM)</p>
                    <p>• <strong>Yr 2 & 3</strong>: Slot 2 (01:30 PM) Concurrent</p>
                    <p>• <strong>Yr 4</strong>: Slot 3 (03:45 PM)</p>
                  </>
                ) : (
                  <>
                    <p>• <strong>Rotation</strong>: Day 1 (Yr 1), Day 2 (Yr 2), Day 3 (Yr 3), Day 4 (Yr 4 Sem 1)</p>
                    <p>• <strong>Holidays Guard</strong>: Automatically skips Sundays & Academic Holidays</p>
                  </>
                )}
              </div>

              {genSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{genSuccess}</span>
                </div>
              )}

              {genError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{genError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isGeneratingExams}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-bold shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
              >
                {isGeneratingExams ? 'Generating Clash-Free Timetable...' : 'Generate Exam Timetable'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Manual Exam Session Modal */}
      {isAddExamModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md p-6 relative border border-dark-800 rounded-2xl">
            <button
              onClick={() => setIsAddExamModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-400 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold text-white mb-2">Add Manual Exam Session</h3>
            <p className="text-xs text-dark-400 mb-6">Schedule an examination session with real-time room and invigilator clash protection.</p>

            <form onSubmit={handleCreateExamEntry} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5">Exam Type</label>
                  <select
                    value={newExamType}
                    onChange={e => setNewExamType(e.target.value)}
                    className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs focus:border-amber-500/50 outline-none"
                  >
                    <option value="MID_1">Mid-1 Exam</option>
                    <option value="MID_2">Mid-2 Exam</option>
                    <option value="SEM_END">Semester End Exam</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5">Academic Year</label>
                  <select
                    value={newAcademicYear}
                    onChange={e => setNewAcademicYear(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs focus:border-amber-500/50 outline-none"
                  >
                    <option value={1}>1st Year</option>
                    <option value={2}>2nd Year</option>
                    <option value={3}>3rd Year</option>
                    <option value={4}>4th Year</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Academic Semester</label>
                <select
                  value={newSemester}
                  onChange={e => setNewSemester(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs focus:border-amber-500/50 outline-none"
                >
                  <option value={1}>Semester 1 (Odd Sem)</option>
                  <option value={2}>Semester 2 (Even Sem)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Subject Course</label>
                <select
                  value={newExamSubjectId}
                  onChange={e => setNewExamSubjectId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs focus:border-amber-500/50 outline-none"
                >
                  <option value="">Select Subject ({subjects.length} available in DB)</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code}) — Year {s.academic_year || 1} [{s.subject_type}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5">Exam Date</label>
                  <input
                    type="date"
                    value={newExamDate}
                    onChange={e => setNewExamDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs focus:border-amber-500/50 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5">Time Slot</label>
                  <select
                    value={newExamTimeSlot}
                    onChange={e => setNewExamTimeSlot(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs focus:border-amber-500/50 outline-none"
                  >
                    <option value={1}>Session 1: Morning (09:30 AM - 11:30 AM)</option>
                    <option value={2}>Session 2: Afternoon (01:00 PM - 03:00 PM)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Exam Classroom Hall</label>
                <select
                  value={newExamClassroomId}
                  onChange={e => setNewExamClassroomId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs focus:border-amber-500/50 outline-none"
                >
                  <option value="">Select Room</option>
                  {classrooms.map(c => <option key={c.id} value={c.id}>{c.room_number} ({c.room_type})</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Assigned Invigilator Faculty</label>
                <select
                  value={newExamInvigilatorId}
                  onChange={e => setNewExamInvigilatorId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs focus:border-amber-500/50 outline-none"
                >
                  <option value="">Unassigned / Select Faculty</option>
                  {facultyProfiles.map(f => <option key={f.id} value={f.id}>{f.user?.full_name || f.employee_id} {f.is_hod ? '(HOD)' : ''}</option>)}
                </select>
              </div>

              {newExamError && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-2 text-xs text-red-400 font-semibold mt-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{newExamError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSavingExam}
                className="w-full mt-4 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-bold shadow-lg shadow-amber-500/15 disabled:opacity-50"
              >
                {isSavingExam ? 'Saving Exam Session...' : 'Save Exam Session'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* File Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md p-6 relative border border-dark-800 rounded-2xl">
            <button
              onClick={() => setIsUploadModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-400 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-extrabold text-white mb-1 flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-400" />
              Upload Examination & Master Data File
            </h3>
            <p className="text-xs text-dark-400 mb-5">
              Upload Academic Calendar or Department Subject Master CSV/Excel files to synchronize exam dates and subjects.
            </p>

            <form onSubmit={handleUploadScheduleFile} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">File Category</label>
                <select
                  value={uploadFileType}
                  onChange={e => setUploadFileType(e.target.value as 'calendar' | 'department')}
                  className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-blue-500/50"
                >
                  <option value="calendar">Academic Calendar CSV (Exam Start Dates & Holidays)</option>
                  <option value="department">Master Data CSV (Subjects, Depts & Roster)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Select CSV/Excel File</label>
                <div className="border-2 border-dashed border-dark-750 hover:border-blue-500/50 rounded-xl p-6 text-center cursor-pointer bg-dark-950/50 transition-all">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        setUploadFile(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                    id="exam-file-upload-input"
                  />
                  <label htmlFor="exam-file-upload-input" className="cursor-pointer block">
                    <UploadCloud className="w-10 h-10 mx-auto text-blue-400 mb-2 opacity-80" />
                    {uploadFile ? (
                      <div>
                        <span className="text-xs font-extrabold text-white block">{uploadFile.name}</span>
                        <span className="text-[10px] text-dark-400 font-semibold">{(uploadFile.size / 1024).toFixed(1)} KB</span>
                      </div>
                    ) : (
                      <div>
                        <span className="text-xs font-bold text-blue-400 block mb-0.5">Click to browse or drag file here</span>
                        <span className="text-[10px] text-dark-400">Supports .csv, .xlsx files</span>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              {uploadSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{uploadSuccess}</span>
                </div>
              )}

              {uploadError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isUploading || !uploadFile}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-xs font-bold shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                {isUploading ? 'Uploading & Processing File...' : 'Upload & Synchronize File'}
              </button>
            </form>
          </div>
        </div>
      )}

        {isPrintModalOpen && (
          <PrintableExamTimetableTemplate
            category={examTabCategory}
            examType={examTabType}
            exams={exams}
            departments={departments}
            activeDeptId={examFilterDeptId}
            activeYear={examFilterYear}
            activeSemester={examFilterSemester}
            academicYearSpan={calExamDates?.academic_year || '2026-27'}
            onClose={() => setIsPrintModalOpen(false)}
          />
        )}
      </div>

      {/* Official Aligned Timetable Document (Visible ONLY when printing) */}
      <div className="hidden print:block w-full">
        {printCircularGroups.length === 0 ? (
          <div className="p-12 text-center text-black font-serif text-sm">
            No examination schedule entries available for print. Please click Generate Timetable first.
          </div>
        ) : (
          printCircularGroups.map(group => (
            <OfficialCircularSheet
              key={`print_sheet_${group.deptCode}_${group.academicYear}`}
              group={group}
              circularDate={new Date().toLocaleDateString('en-GB')}
              academicYearSpan={calExamDates?.academic_year || '2026-27'}
              semesterNumber={examFilterSemester === 2 ? 'II' : 'I'}
              submissionDate="23-01-2026"
              coordinatorsText="Mrs. G.Y. Gayathri, Ms. B. Renuka Sai"
              hodNameText="Prof. S. Adi Narayana"
              noteText=""
              examShortName={examTabCategory === 'MID' ? (examTabType === 'MID_2' ? 'Mid-II' : 'Mid-I') : 'Sem-End'}
              examFullName={examTabCategory === 'MID' ? (examTabType === 'MID_2' ? 'MID-II Examination' : 'MID-I Examination') : 'Semester-End Examination'}
              showSignatures={false}
            />
          ))
        )}
      </div>

    </div>
  );
};
