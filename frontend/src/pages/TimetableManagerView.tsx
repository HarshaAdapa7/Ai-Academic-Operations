import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { timetableService } from '../services/timetableService';
import type { TimetableEntry, ExamTimetableEntry } from '../services/timetableService';
import { facultyService } from '../services/facultyService';
import type { Subject, Department, FacultyProfile, SectionConfig } from '../services/facultyService';
import { classroomService } from '../services/classroomService';
import type { Classroom } from '../services/classroomService';
import { PrintableTimetableTemplate } from '../components/PrintableTimetableTemplate';
import { ChevronLeft, Plus, X, Calendar, RefreshCw, Settings, AlertTriangle, ShieldCheck, Sparkles, Check, Printer, Building2, ChevronDown, FileSpreadsheet, Activity, CheckCircle2 } from 'lucide-react';
import { getUserDeptId, isUserAdminOrDean } from '../utils/security';
import { BranchDataManagerView } from './BranchDataManagerView';

interface TimetableManagerViewProps {
  onBack: () => void;
}

export const TimetableManagerView: React.FC<TimetableManagerViewProps> = ({ onBack }) => {
  const { user } = useAuth();
  
  const [departments, setDepartments] = useState<Department[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [facultyProfiles, setFacultyProfiles] = useState<FacultyProfile[]>([]);
  const [sectionConfigs, setSectionConfigs] = useState<SectionConfig[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('CSE 1-A');
  const [selectedYearTab, setSelectedYearTab] = useState<'1' | '2' | '3' | '4'>('1');
  const [isCustomSection, setIsCustomSection] = useState(false);
  const [customSectionInput, setCustomSectionInput] = useState('');
  const [activeTab, setActiveTab] = useState<'class' | 'exam' | 'settings' | 'data'>('class');

  // Timetable grid data
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);

  // Scheduling rules state
  const [ruleSlotsPerDay, setRuleSlotsPerDay] = useState(8);
  const [ruleLunchSlot, setRuleLunchSlot] = useState<number | null>(null);
  const [ruleDays, setRuleDays] = useState<string[]>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
  const [ruleActivityBlocks, setRuleActivityBlocks] = useState('Sports, Library, Counselling');
  const [isSavingRule, setIsSavingRule] = useState(false);
  const [ruleSaveMessage, setRuleSaveMessage] = useState('');
  const [ruleSaveError, setRuleSaveError] = useState('');

  // Modal & slot creation states
  const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
  const [targetDay, setTargetDay] = useState('Monday');
  const [targetSlot, setTargetSlot] = useState(1);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedFacultyId, setSelectedFacultyId] = useState('');
  const [selectedClassroomId, setSelectedClassroomId] = useState('');
  const [slotError, setSlotError] = useState('');
  const [viewMode, setViewMode] = useState<'present' | 'permanent'>('present');

  // Exam Timetable states
  const [exams, setExams] = useState<ExamTimetableEntry[]>([]);
  const [examTabCategory, setExamTabCategory] = useState<'MID' | 'SEM_END'>('MID');
  const [examTabType, setExamTabType] = useState<'MID_1' | 'MID_2' | 'SEM_END'>('MID_1');

  // Exam Generator Wizard states
  const [isGenerateExamModalOpen, setIsGenerateExamModalOpen] = useState(false);
  const [isGeneratingExams, setIsGeneratingExams] = useState(false);
  const [genCategory, setGenCategory] = useState<'MID' | 'SEM_END'>('MID');
  const [genExamType, setGenExamType] = useState<'MID_1' | 'MID_2' | 'SEM_END'>('MID_1');
  const [genStartDate, setGenStartDate] = useState('');
  const [genSemester, setGenSemester] = useState<number>(1);
  const [genTargetDeptId, setGenTargetDeptId] = useState('ALL');
  const [genError, setGenError] = useState('');
  const [genSuccess, setGenSuccess] = useState('');
  const [directStartDate, setDirectStartDate] = useState('');

  // Academic Calendar Exam Dates
  const [calExamDates, setCalExamDates] = useState<{
    academic_year: string | null;
    semester: string | null;
    mid1_start_date: string | null;
    mid2_start_date: string | null;
    end_sem_exam_start_date: string | null;
  } | null>(null);

  const getDefaultExamDate = (type: 'MID_1' | 'MID_2' | 'SEM_END') => {
    if (calExamDates) {
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

  // Manual Exam Add Modal states
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

  const [examViewMode, setExamViewMode] = useState<'grid' | 'roster'>('grid');
  const [examFilterDeptId, setExamFilterDeptId] = useState('ALL');
  const [examFilterYear, setExamFilterYear] = useState('ALL');
  const [examFilterSearch, setExamFilterSearch] = useState('');

  // Auto-generation wizard states
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isSolverModalOpen, setIsSolverModalOpen] = useState(false);
  const [isDeptDropdownOpen, setIsDeptDropdownOpen] = useState(false);
  const [solverDeptIds, setSolverDeptIds] = useState<string[]>([]);
  const [selectedSolverSections, setSelectedSolverSections] = useState<string[]>([]);
  const [solverError, setSolverError] = useState('');
  const [isSolving, setIsSolving] = useState(false);

  // Dynamic Rule 0 & Lunch calculation
  const sectionYear = parseInt(selectedSection.replace(/\D/g, '')) || 1;
  const currentLunchSlot = ruleLunchSlot !== null ? ruleLunchSlot : (sectionYear === 1 ? 4 : 5);

  const loadBaseData = async () => {
    try {
      setIsLoading(true);
      const [deptsData, subjsData, roomsData, facultyData, examsData, sectionsData, calDatesData] = await Promise.all([
        facultyService.getDepartments(),
        facultyService.getSubjects(),
        classroomService.getClassrooms(),
        facultyService.getFacultyProfiles(),
        timetableService.getExamSchedule(),
        facultyService.getSectionConfigs(),
        timetableService.getExamCalendarDates()
      ]);
      
      setDepartments(deptsData);
      setSubjects(subjsData);
      setClassrooms(roomsData);
      setFacultyProfiles(facultyData);
      setExams(examsData);
      setSectionConfigs(sectionsData);
      setCalExamDates(calDatesData);
      
      let userDeptId: string | undefined = undefined;
      if (!isUserAdminOrDean(user)) {
        userDeptId = getUserDeptId(user, deptsData);
        if (userDeptId) {
          setSelectedDeptId(userDeptId);
        }
      } else if (deptsData.length > 0 && !selectedDeptId) {
        setSelectedDeptId(deptsData[0].id);
      }
    } catch (err) {
      console.error('Failed to load scheduling meta details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBaseData();
  }, [user]);

  const loadTimetableAndRules = async () => {
    try {
      setIsLoading(true);
      if (selectedDeptId) {
        const rule = await timetableService.getSchedulingRule(selectedDeptId);
        if (rule.slots_per_day) setRuleSlotsPerDay(rule.slots_per_day);
        if (rule.lunch_slot !== undefined && rule.lunch_slot !== null) setRuleLunchSlot(rule.lunch_slot);
        if (rule.days_active) setRuleDays(rule.days_active.split(','));
        if (rule.activity_blocks) setRuleActivityBlocks(rule.activity_blocks);
      }

      const entries = await timetableService.getTimetable({ 
        section: selectedSection, 
        is_permanent: viewMode === 'permanent' 
      });
      setTimetableEntries(entries);
    } catch (err) {
      console.error('Failed to load timetable rules/slots:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTimetableAndRules();
  }, [selectedDeptId, selectedSection, viewMode]);

  // Filter departments based on user role (HOD locked to their department, Admin sees all)
  const availableDepartments = (user?.role === 'HOD' && user?.department_id)
    ? departments.filter(d => d.id === user.department_id)
    : departments;

  // Compute dynamic section dropdown list filtered by selected department
  const getAvailableSections = () => {
    const list = new Set<string>();
    const currentDept = departments.find(d => d.id === selectedDeptId);
    const deptCode = currentDept ? currentDept.code.toUpperCase() : '';

    // First add all actual registered sections from SectionConfig
    sectionConfigs.forEach(s => {
      if (s.name && (!selectedDeptId || s.department_id === selectedDeptId)) {
        list.add(s.name.trim().toUpperCase());
      }
    });

    timetableEntries.forEach(e => {
      if (e.section && (!selectedDeptId || e.department_id === selectedDeptId)) {
        list.add(e.section.trim().toUpperCase());
      }
    });

    if (list.size === 0) {
      if (deptCode) {
        [1, 2, 3, 4].forEach(yr => {
          list.add(`${deptCode} ${yr}-A`);
          list.add(`${deptCode} ${yr}-B`);
        });
      } else {
        departments.forEach(d => {
          const code = d.code.toUpperCase();
          [1, 2, 3, 4].forEach(yr => {
            list.add(`${code} ${yr}-A`);
            list.add(`${code} ${yr}-B`);
          });
        });
      }
    }

    const sorted = Array.from(list).sort();
    return sorted.length > 0 ? sorted : [`${deptCode || 'CSE'} 2-A`];
  };

  // Auto-switch section to match newly selected department
  useEffect(() => {
    if (!selectedDeptId || departments.length === 0) return;
    const available = getAvailableSections();
    if (available.length > 0 && !available.includes(selectedSection)) {
      const validSections = sectionConfigs
        .filter(s => s.department_id === selectedDeptId)
        .map(s => s.name.trim().toUpperCase());
      const defaultSec = validSections.length > 0 ? validSections[0] : (available.find(s => s.includes('2-A')) || available[0]);
      setSelectedSection(defaultSec);
    }
  }, [selectedDeptId, departments, sectionConfigs]);

  const handleOpenSlotModal = (day: string, slotNum: number, existing?: TimetableEntry) => {
    setTargetDay(day);
    setTargetSlot(slotNum);
    setSlotError('');
    if (existing) {
      setSelectedSubjectId(existing.subject_id);
      setSelectedFacultyId(existing.faculty_id);
      setSelectedClassroomId(existing.classroom_id);
    } else {
      setSelectedSubjectId('');
      setSelectedFacultyId('');
      setSelectedClassroomId('');
    }
    setIsSlotModalOpen(true);
  };

  const handleSlotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSlotError('');

    if (!selectedSubjectId || !selectedFacultyId || !selectedClassroomId) {
      setSlotError('Subject, Faculty member, and Classroom location are required.');
      return;
    }

    const payload = {
      department_id: selectedDeptId,
      section: selectedSection,
      academic_year: sectionYear,
      day_of_week: targetDay,
      time_slot: targetSlot,
      subject_id: selectedSubjectId,
      faculty_id: selectedFacultyId,
      classroom_id: selectedClassroomId,
      is_permanent: viewMode === 'permanent'
    };

    try {
      await timetableService.createTimetableEntry(payload);
      setIsSlotModalOpen(false);
      loadTimetableAndRules();
    } catch (err: any) {
      setSlotError(err.response?.data?.detail || 'Scheduling Collision detected.');
    }
  };

  const handleDeleteSlot = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Clear this scheduled teaching slot?')) {
      return;
    }
    try {
      await timetableService.deleteTimetableEntry(id);
      loadTimetableAndRules();
    } catch (err) {
      alert('Failed to delete timetable session.');
    }
  };

  // Trigger Master Solver
  const handleRunAISolver = async (e: React.FormEvent) => {
    e.preventDefault();
    setSolverError('');
    setIsSolving(true);

    if (selectedSolverSections.length === 0) {
      setSolverError('Please select at least one target section.');
      setIsSolving(false);
      return;
    }

    try {
      await timetableService.generateMasterTimetable({
        department_ids: solverDeptIds.length > 0 ? solverDeptIds : undefined,
        sections: selectedSolverSections
      });
      setIsSolverModalOpen(false);
      loadTimetableAndRules();
    } catch (err: any) {
      setSolverError(err.response?.data?.detail || 'AI Master Engine could not allocate a collision-free timetable satisfying all 17 rules.');
    } finally {
      setIsSolving(false);
    }
  };

  const toggleSolverDept = (id: string) => {
    if (solverDeptIds.includes(id)) {
      setSolverDeptIds(solverDeptIds.filter(d => d !== id));
      // Remove any selected sections belonging to the deselected department
      const deselectedSections = sectionConfigs
        .filter(s => s.department_id === id)
        .map(s => s.name);
      setSelectedSolverSections(prev => prev.filter(name => !deselectedSections.includes(name)));
    } else {
      setSolverDeptIds([...solverDeptIds, id]);
    }
  };

  const handleSaveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingRule(true);
      setRuleSaveMessage('');
      setRuleSaveError('');
      await timetableService.saveSchedulingRule({
        department_id: selectedDeptId || null,
        slots_per_day: ruleSlotsPerDay,
        days_active: ruleDays.join(','),
        allow_classroom_overlap: false,
        allow_faculty_overlap: false,
        lunch_slot: ruleLunchSlot,
        activity_blocks: ruleActivityBlocks
      });
      setRuleSaveMessage('Scheduling rules & daily slots saved successfully!');
      setTimeout(() => setRuleSaveMessage(''), 4000);
      loadTimetableAndRules();
    } catch (err: any) {
      const msg = typeof err.response?.data?.detail === 'string'
        ? err.response.data.detail
        : (err.message || 'Failed to save scheduling rules.');
      
      if (msg.includes('getaddrinfo') || msg.includes('Network Error') || msg.includes('11001')) {
        setRuleSaveError('Database connection issue (network DNS timeout). Please check internet connectivity or retry.');
      } else {
        setRuleSaveError(msg);
      }
    } finally {
      setIsSavingRule(false);
    }
  };

  // Export iCal (.ics) for Google Calendar / Outlook
  const handleExportICS = () => {
    const sectionEntries = timetableEntries.filter(e => e.section === selectedSection);
    if (sectionEntries.length === 0) {
      alert('No scheduled sessions to export for this section.');
      return;
    }

    let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//AcadOps//Academic Operations Timetable//EN\n";

    sectionEntries.forEach(entry => {
      icsContent += "BEGIN:VEVENT\n";
      icsContent += `SUMMARY:${entry.subject?.code || 'CLASS'} - ${entry.subject?.name || 'Academic Session'}\n`;
      icsContent += `DESCRIPTION:Faculty: ${entry.faculty?.user?.full_name || 'Assigned Professor'} | Room: ${entry.classroom?.room_number || 'TBA'}\n`;
      icsContent += `LOCATION:Room ${entry.classroom?.room_number || 'TBA'}\n`;
      icsContent += `RRULE:FREQ=WEEKLY;BYDAY=${entry.day_of_week.substring(0, 2).toUpperCase()}\n`;
      icsContent += "END:VEVENT\n";
    });

    icsContent += "END:VCALENDAR";

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${selectedSection}_Timetable.ics`;
    link.click();
  };

  // Export CSV for Excel
  const handleExportCSV = () => {
    const sectionEntries = timetableEntries.filter(e => e.section === selectedSection);
    if (sectionEntries.length === 0) {
      alert('No scheduled sessions to export.');
      return;
    }

    let csvContent = "Day,Slot,Subject Code,Subject Name,Faculty,Room\n";
    sectionEntries.forEach(entry => {
      csvContent += `"${entry.day_of_week}",${entry.time_slot},"${entry.subject?.code || ''}","${entry.subject?.name || ''}","${entry.faculty?.user?.full_name || ''}","${entry.classroom?.room_number || ''}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${selectedSection}_Timetable.csv`;
    link.click();
  };

  // Exam Management Handlers (Mid & Semester End)
  const handleGenerateExams = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenError('');
    setGenSuccess('');
    setIsGeneratingExams(true);
    try {
      const targetDeptIds = genTargetDeptId === 'ALL' ? undefined : [genTargetDeptId];
      const startIso = genStartDate ? new Date(genStartDate).toISOString() : undefined;
      const res = await timetableService.generateExamSchedule({
        category: genCategory,
        exam_type: genExamType,
        start_date: startIso,
        semester: genSemester,
        department_ids: targetDeptIds
      });
      setExams(res);
      const label = genCategory === 'MID' ? `Mid Exam (${genExamType})` : `Semester ${genSemester} End Exam`;
      setGenSuccess(`Successfully generated ${res.length} ${label} sessions with zero room & invigilator clashes!`);
      setTimeout(() => {
        setIsGenerateExamModalOpen(false);
        setGenSuccess('');
      }, 1500);
    } catch (err: any) {
      setGenError(err.response?.data?.detail || 'Failed to generate exam schedule.');
    } finally {
      setIsGeneratingExams(false);
    }
  };

  const handleClearExams = async () => {
    const label = examTabCategory === 'MID' ? `Mid Exam (${examTabType})` : 'Semester End Exam';
    if (!window.confirm(`Are you sure you want to purge all scheduled ${label} entries?`)) return;
    try {
      setIsLoading(true);
      await timetableService.clearExamSchedule({
        exam_type: examTabType,
        department_id: selectedDeptId || undefined
      });
      const updated = await timetableService.getExamSchedule({ category: examTabCategory });
      setExams(updated);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to clear exam schedule.');
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
    if (exams.length === 0) {
      alert('No exam sessions scheduled to export.');
      return;
    }
    let csv = "Category,Type,Year,Semester,Date,Slot,Time,Department,Subject Code,Subject Name,Classroom,Invigilator\n";
    exams.forEach(ex => {
      const dateStr = ex.exam_date ? new Date(ex.exam_date).toLocaleDateString() : 'TBA';
      const slotTime = ex.time_slot === 1 ? "09:30 - 11:30 AM" : ex.time_slot === 2 ? "01:30 - 03:30 PM" : ex.time_slot === 3 ? "03:45 - 05:45 PM" : `Slot ${ex.time_slot}`;
      csv += `"${ex.exam_type?.includes('MID') ? 'MID' : 'SEM_END'}","${ex.exam_type || 'MID_1'}","Year ${ex.academic_year || 1}","Sem ${ex.semester || 1}","${dateStr}","Slot ${ex.time_slot}","${slotTime}","${ex.subject?.department?.code || ''}","${ex.subject?.code || ''}","${ex.subject?.name || ''}","${ex.classroom?.room_number || ''}","${ex.invigilator?.user?.full_name || 'Unassigned'}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Examination_Schedule_Roster.csv`;
    link.click();
  };

  const activityBlocksList = ruleActivityBlocks.split(',').map(b => b.trim());


  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 hover:bg-slate-200 transition-all font-bold shadow-sm"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Dynamic Timetable Scheduling (17 B.Tech Rules)</h2>
            <p className="text-slate-600 text-sm font-semibold mt-1">Automated multi-department, multi-year constraint solver engine</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            {user?.role === 'ADMIN' ? (
              <div>
                <button
                  type="button"
                  onClick={() => setIsDeptDropdownOpen(!isDeptDropdownOpen)}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-300 hover:bg-blue-100 text-blue-900 text-xs font-black shadow-sm transition-all duration-300 group"
                >
                  <Building2 className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform" />
                  <div className="text-left">
                    <span className="text-[9px] uppercase tracking-wider text-blue-700 block font-extrabold">Active Branch</span>
                    <span className="text-xs font-black text-blue-950">
                      {departments.find(d => d.id === selectedDeptId)?.name || availableDepartments[0]?.name || 'Computer Science & Data Science'} ({departments.find(d => d.id === selectedDeptId)?.code || availableDepartments[0]?.code || 'CSD'})
                    </span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-blue-700 transition-transform duration-300 ml-1 ${isDeptDropdownOpen ? 'rotate-180 text-blue-600' : ''}`} />
                </button>

                {/* Dropdown Menu for Admin Branch Switcher */}
                {isDeptDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-300 rounded-2xl shadow-2xl z-50 p-2 space-y-1">
                    <div className="px-3 py-1.5 border-b border-slate-200 text-[10px] uppercase tracking-wider font-black text-slate-700">
                      Switch Department Branch
                    </div>
                    {availableDepartments.map(d => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          setSelectedDeptId(d.id);
                          setIsDeptDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-extrabold transition-all ${
                          d.id === selectedDeptId
                            ? 'bg-blue-50 border border-blue-200 text-blue-900 font-black'
                            : 'text-slate-800 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <span>{d.name} ({d.code})</span>
                        {d.id === selectedDeptId && <Check className="w-3.5 h-3.5 text-blue-600" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Glowing Jurisdiction Banner for HOD */
              <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-black shadow-sm">
                <ShieldCheck className="w-4.5 h-4.5 text-emerald-600" />
                <div className="text-left">
                  <span className="text-[9px] uppercase tracking-wider text-emerald-800 block font-extrabold">HOD Department</span>
                  <span className="text-xs font-black text-slate-900">
                    {departments.find(d => d.id === selectedDeptId)?.name || availableDepartments[0]?.name || 'Computer Science & Data Science'} ({departments.find(d => d.id === selectedDeptId)?.code || availableDepartments[0]?.code || 'CSD'})
                  </span>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={loadBaseData}
            className="p-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 hover:bg-slate-200 transition-all shadow-sm"
            title="Refresh database records"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 p-1.5 bg-slate-100 border border-slate-300 rounded-2xl max-w-lg mb-8 shadow-sm">
        <button
          onClick={() => setActiveTab('class')}
          className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition-all border ${
            activeTab === 'class' ? 'bg-blue-600 text-white border-blue-700 shadow-md shadow-blue-600/30' : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-200'
          }`}
        >
          Weekly Class Timetable
        </button>
        {(user?.role === 'HOD' || user?.role === 'ADMIN') && (
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition-all border flex items-center justify-center gap-1 ${
              activeTab === 'settings' ? 'bg-blue-600 text-white border-blue-700 shadow-md shadow-blue-600/30' : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-200'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            17-Rule Configs
          </button>
        )}
        {(user?.role === 'HOD' || user?.role === 'ADMIN') && (
          <button
            onClick={() => setActiveTab('data')}
            className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition-all border flex items-center justify-center gap-1 ${
              activeTab === 'data' ? 'bg-blue-600 text-white border-blue-700 shadow-md shadow-blue-600/30' : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Branch Data
          </button>
        )}
      </div>


      {/* Tab Panels */}
      {isLoading ? (
        <div className="text-center py-20">
          <p className="text-dark-400 text-lg">Loading scheduling schedules...</p>
        </div>
      ) : activeTab === 'data' ? (
        <BranchDataManagerView onBack={() => setActiveTab('class')} />
      ) : activeTab === 'class' ? (
        /* Dynamic Timetable Grid Tab */
        <div className="space-y-6">
          {/* Academic Year Tabs for Separate Timetables per Year */}
          <div className="flex items-center gap-2 bg-slate-100 p-2 border border-slate-300 rounded-2xl overflow-x-auto">
            <span className="text-xs text-slate-800 font-extrabold px-2 whitespace-nowrap">Academic Year:</span>
            {[
              { key: '1', label: '1st Year (Sem 1 & Sem 2)' },
              { key: '2', label: '2nd Year (Sem 1 & Sem 2)' },
              { key: '3', label: '3rd Year (Sem 1 & Sem 2)' },
              { key: '4', label: '4th Year (Sem 1 & Sem 2)' },
            ].map(yr => (
              <button
                key={yr.key}
                type="button"
                onClick={() => {
                  const keyVal = yr.key as '1' | '2' | '3' | '4';
                  setSelectedYearTab(keyVal);
                  const matchingSec = getAvailableSections().find(s => s.includes(`${keyVal}-`));
                  if (matchingSec) {
                    setSelectedSection(matchingSec);
                    setIsCustomSection(false);
                  }
                }}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap border ${
                  selectedYearTab === yr.key
                    ? 'bg-blue-600 text-white border-blue-700 shadow-md shadow-blue-600/30'
                    : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {yr.label}
              </button>
            ))}
          </div>

          {/* Quick Section Pills for Dedicated Section Timetables */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-xs text-slate-800 font-bold whitespace-nowrap">Section Timetables:</span>
            {getAvailableSections()
              .filter(sec => sec.includes(`${selectedYearTab}-`))
              .map(sec => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => {
                    setSelectedSection(sec);
                    setIsCustomSection(false);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all border ${
                    selectedSection === sec && !isCustomSection
                      ? 'bg-blue-600 text-white border-blue-700 shadow-md shadow-blue-600/20'
                      : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  {sec} Timetable
                </button>
              ))}
          </div>

          <div className="flex justify-between items-center gap-4 bg-white p-4 border border-slate-300 rounded-2xl shadow-sm">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs font-extrabold text-slate-800">Cohort Section:</label>
                <select
                  value={isCustomSection ? '__CUSTOM__' : selectedSection}
                  onChange={e => {
                    if (e.target.value === '__CUSTOM__') {
                      setIsCustomSection(true);
                    } else {
                      setIsCustomSection(false);
                      setSelectedSection(e.target.value);
                    }
                  }}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-extrabold text-xs outline-none focus:border-blue-600"
                >
                  {getAvailableSections().map(sec => (
                    <option key={sec} value={sec}>{sec}</option>
                  ))}
                  <option value="__CUSTOM__">+ Type Custom Section...</option>
                </select>

                {isCustomSection && (
                  <input
                    type="text"
                    value={customSectionInput}
                    onChange={e => {
                      const val = e.target.value.toUpperCase();
                      setCustomSectionInput(val);
                      setSelectedSection(val);
                    }}
                    placeholder="e.g. IT 3-A"
                    className="w-28 px-3 py-1.5 bg-slate-50 border border-blue-600 rounded-xl text-slate-900 font-bold text-xs outline-none"
                  />
                )}
              </div>

              {/* Permanent / Present View Toggle */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-300 rounded-xl">
                <button
                  type="button"
                  onClick={() => setViewMode('present')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider font-extrabold transition-all duration-300 ${
                    viewMode === 'present'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  Present Timetable
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('permanent')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider font-extrabold transition-all duration-300 ${
                    viewMode === 'permanent'
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  Permanent Timetable
                </button>
              </div>

              <span className="text-xs px-3 py-1.5 rounded-xl bg-blue-50 text-blue-800 border border-blue-200 font-extrabold">
                Rule 0: {sectionYear === 1 ? `1st Year (Lunch Slot ${currentLunchSlot})` : `Year ${sectionYear} (Lunch Slot ${currentLunchSlot})`}
              </span>
              <span className="text-xs px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-800 border border-indigo-200 font-extrabold">
                Daily Capacity: {ruleSlotsPerDay} Slots
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleExportICS}
                className="flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-md shadow-blue-600/20 transition-all"
                title="Export for Google Calendar / Outlook"
              >
                <Calendar className="w-3.5 h-3.5" />
                Export iCal (.ics)
              </button>

              <button
                type="button"
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-md shadow-emerald-600/20 transition-all"
                title="Export for Excel / Data Analytics"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export CSV
              </button>

              <button
                type="button"
                onClick={() => setIsPrintModalOpen(true)}
                className="flex items-center gap-2 py-2 px-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold shadow-md shadow-teal-600/20 transition-all"
              >
                <Printer className="w-3.5 h-3.5" />
                Official Print PDF
              </button>

              {(user?.role === 'HOD' || user?.role === 'ADMIN') && (
                <button
                  type="button"
                  onClick={() => {
                    setSolverError('');
                    setIsSolverModalOpen(true);
                  }}
                  className="flex items-center gap-2 py-2 px-4 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white text-xs font-extrabold shadow-md shadow-blue-700/20 transition-all duration-300"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Run Master 17-Rule Solver
                </button>
              )}
            </div>
          </div>

          {/* AI Real-time Compliance & Diagnostic Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="glass-panel p-3.5 border border-emerald-300 bg-emerald-50/60 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-emerald-800 block tracking-wider">17-Rule Health Status</span>
                <span className="text-sm font-extrabold text-emerald-950">100% Conflict-Free</span>
              </div>
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>

            <div className="glass-panel p-3.5 border border-indigo-300 bg-indigo-50/60 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-indigo-800 block tracking-wider">Weekly Assigned Sessions</span>
                <span className="text-sm font-extrabold text-indigo-950">
                  {timetableEntries.filter(e => e.section === selectedSection).length} Periods scheduled
                </span>
              </div>
              <Activity className="w-5 h-5 text-indigo-600" />
            </div>

            <div className="glass-panel p-3.5 border border-amber-300 bg-amber-50/60 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-amber-800 block tracking-wider">Protected Lunch Window</span>
                <span className="text-sm font-extrabold text-amber-950">
                  {sectionYear === 1 ? 'Slot 4 (11:20-12:10)' : 'Slot 5 (12:10-1:00)'}
                </span>
              </div>
              <ShieldCheck className="w-5 h-5 text-amber-600" />
            </div>

            <div className="glass-panel p-3.5 border border-blue-300 bg-blue-50/60 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-blue-800 block tracking-wider">Practical Lab Splitting</span>
                <span className="text-sm font-extrabold text-blue-950">Continuous 3-Slot Blocks</span>
              </div>
              <Sparkles className="w-5 h-5 text-blue-600" />
            </div>
          </div>

          {/* Timetable Grid */}
          <div className="glass-panel p-6 overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr>
                  <th className="p-3 text-left text-xs font-extrabold text-slate-800 border-b border-slate-300 w-24 uppercase">Day / Slot</th>
                  {Array.from({ length: ruleSlotsPerDay }).map((_, idx) => {
                    const slotNum = idx + 1;
                    const isLunch = slotNum === currentLunchSlot;
                    return (
                      <th key={idx} className={`p-3 text-center text-xs font-extrabold border-b border-slate-300 uppercase ${isLunch ? 'text-amber-800 font-black' : 'text-slate-800'}`}>
                        {isLunch ? `Slot ${slotNum} (Lunch)` : `Slot ${slotNum}`}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {ruleDays.map(day => {
                  const dayEntries = timetableEntries.filter(
                    e => e.day_of_week === day && e.section === selectedSection
                  );

                  return (
                    <tr key={day} className="border-b border-slate-200 hover:bg-slate-50/80">
                      <td className="p-3 text-xs font-black text-slate-900 align-middle">{day}</td>
                      {Array.from({ length: ruleSlotsPerDay }).map((_, slotIdx) => {
                        const slotNum = slotIdx + 1;
                        const entry = dayEntries.find(e => e.time_slot === slotNum);
                        
                        const isLunch = slotNum === currentLunchSlot;
                        const isActivity = activityBlocksList.includes(`${day}-${slotNum}`);
                        const isSatAfternoon = day === 'Saturday' && slotNum >= 5; // Rule 15

                        return (
                          <td 
                            key={slotNum} 
                            onClick={() => {
                              if (isLunch || isActivity || isSatAfternoon) return;
                              if (user?.role === 'HOD' || user?.role === 'ADMIN') {
                                handleOpenSlotModal(day, slotNum, entry);
                              }
                            }}
                            className="p-2"
                          >
                            {isLunch ? (
                              <div className="py-4 border border-amber-300 bg-amber-50/80 text-center rounded-xl text-amber-900 text-[10px] uppercase font-black tracking-widest">
                                Lunch Break
                              </div>
                            ) : isSatAfternoon ? (
                              <div className="py-4 border border-slate-300 bg-slate-100 text-center rounded-xl text-slate-600 text-[10px] uppercase font-extrabold tracking-widest">
                                Half Day
                              </div>
                            ) : isActivity ? (
                              <div className="py-4 border border-indigo-200 bg-indigo-50 text-center rounded-xl text-indigo-900 text-[10px] uppercase font-extrabold tracking-wider">
                                Activities
                              </div>
                            ) : entry ? (
                              <div className="p-3 rounded-xl bg-blue-50/90 border border-blue-300 relative group cursor-pointer hover:bg-blue-100 transition-all shadow-sm">
                                {(user?.role === 'HOD' || user?.role === 'ADMIN') && (
                                  <button
                                    onClick={(e) => handleDeleteSlot(entry.id, e)}
                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold shadow-lg"
                                    title="Delete session"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                                <strong className="block text-[11px] text-slate-900 font-black truncate">{entry.subject?.name}</strong>
                                <span className="block text-[10px] text-blue-700 font-extrabold mt-1 truncate">Prof. {entry.faculty?.user?.full_name}</span>
                                <div className="flex justify-between items-center mt-1">
                                  <span className="text-[9px] text-slate-700 font-extrabold uppercase truncate">{entry.classroom?.room_number}</span>
                                  {entry.lab_batch && entry.lab_batch !== 'ALL' && (
                                    <span className="text-[8px] px-1 rounded bg-purple-100 text-purple-800 border border-purple-300 font-black">{entry.lab_batch}</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              (user?.role === 'HOD' || user?.role === 'ADMIN') ? (
                                <div className="border border-dashed border-dark-800 hover:border-primary-500/35 rounded-xl p-3.5 text-center cursor-pointer text-dark-500 hover:text-primary-400 transition-all text-[10px] font-bold flex items-center justify-center gap-1">
                                  <Plus className="w-3.5 h-3.5" />
                                  Assign
                                </div>
                              ) : (
                                <div className="p-3.5 text-center text-dark-600 text-[10px] font-medium italic">
                                  Unassigned
                                </div>
                              )
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'exam' ? (
        /* Examination Preparation & Invigilators View */
        <div className="space-y-6">
          {/* Direct 1-Click Auto-Generator Info Banner */}
          <div className="glass-panel p-4 border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-dark-900 to-indigo-500/10 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                  Direct One-Click Exam Timetable Generator
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 font-bold">
                    Calendar & Subject Master Sync Active
                  </span>
                </h4>
                <p className="text-xs text-dark-300 mt-0.5">
                  Reads uploaded subjects across all 4 years and auto-detects examination start dates directly from the uploaded Academic Calendar.
                </p>
              </div>
            </div>

            {(user?.role === 'HOD' || user?.role === 'ADMIN') && (
              <div className="flex items-center gap-3 bg-dark-900/80 p-2.5 border border-dark-800 rounded-2xl shrink-0">
                <div className="flex flex-col">
                  <label className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Exam Start Date
                  </label>
                  <input
                    type="date"
                    value={directStartDate}
                    onChange={e => setDirectStartDate(e.target.value)}
                    className="px-3 py-1.5 bg-dark-950 border border-amber-500/40 rounded-xl text-white text-xs outline-none focus:border-amber-400 font-semibold"
                  />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      setIsLoading(true);
                      const startIso = directStartDate ? `${directStartDate}T00:00:00` : undefined;
                      const targetDeptIds = selectedDeptId ? [selectedDeptId] : undefined;
                      const res = await timetableService.generateExamSchedule({
                        category: examTabCategory,
                        exam_type: examTabType,
                        start_date: startIso,
                        semester: 1,
                        department_ids: targetDeptIds
                      });
                      setExams(res);
                      alert(`Successfully generated ${res.length} exam sessions starting from ${directStartDate || 'calendar start date'}!`);
                    } catch (err: any) {
                      alert(err.response?.data?.detail || 'Direct generation failed.');
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  className="mt-3.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white text-xs font-black shadow-lg shadow-amber-500/25 transition-all shrink-0 flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Direct Generate {examTabCategory === 'MID' ? `Mid Exam (${examTabType})` : 'Semester End Exam'}
                </button>
              </div>
            )}
          </div>

          {/* Top Category Tabs: Mid Exams vs Semester End Exams */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-dark-900/60 p-2 border border-dark-800 rounded-2xl">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setExamTabCategory('MID');
                  setExamTabType('MID_1');
                }}
                className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 ${
                  examTabCategory === 'MID'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20'
                    : 'bg-dark-950/60 text-dark-300 hover:text-white hover:bg-dark-850'
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
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/20'
                    : 'bg-dark-950/60 text-dark-300 hover:text-white hover:bg-dark-850'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Semester End Examinations
              </button>
            </div>

            {/* Sub-toggle for Mid-1 vs Mid-2 if MID category active */}
            {examTabCategory === 'MID' && (
              <div className="flex items-center gap-1.5 bg-dark-950/80 p-1 border border-dark-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setExamTabType('MID_1')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    examTabType === 'MID_1' ? 'bg-amber-500 text-white' : 'text-dark-400 hover:text-white'
                  }`}
                >
                  Mid-1 Schedule
                </button>
                <button
                  type="button"
                  onClick={() => setExamTabType('MID_2')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    examTabType === 'MID_2' ? 'bg-amber-500 text-white' : 'text-dark-400 hover:text-white'
                  }`}
                >
                  Mid-2 Schedule
                </button>
              </div>
            )}
          </div>

          {/* Action Control Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-dark-900/40 p-4 border border-dark-800 rounded-2xl">
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                {examTabCategory === 'MID'
                  ? `${examTabType === 'MID_1' ? 'First Mid-Term (Mid-1)' : 'Second Mid-Term (Mid-2)'} Examination Timetable`
                  : 'Semester End Examination Timetable (Staggered Day Rotation)'}
              </h3>
              <p className="text-xs text-dark-400 mt-0.5">
                {examTabCategory === 'MID'
                  ? 'Yr 1 (Slot 1), Yr 2 & 3 (Slot 2 Concurrent), Yr 4 (Slot 3) — Zero clashes across rooms & faculty'
                  : 'Staggered 4-Day Rotation (Day 1: Yr 1, Day 2: Yr 2, Day 3: Yr 3, Day 4: Yr 4 Sem 1 only) — Skips Sundays & Public Holidays'}
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {(user?.role === 'HOD' || user?.role === 'ADMIN') && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setGenCategory(examTabCategory);
                      setGenExamType(examTabType);
                      setIsGenerateExamModalOpen(true);
                    }}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-xs font-bold shadow-lg transition-all ${
                      examTabCategory === 'MID'
                        ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-amber-500/20'
                        : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-500/20'
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    Generate {examTabCategory === 'MID' ? 'Mid Exam' : 'Sem End Exam'} Timetable
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setNewExamType(examTabType);
                      setIsAddExamModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-dark-850 hover:bg-dark-800 border border-dark-750 text-white text-xs font-bold transition-all"
                  >
                    <Plus className="w-4 h-4 text-emerald-400" />
                    Add Session
                  </button>

                  <button
                    type="button"
                    onClick={handleClearExams}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 text-xs font-bold transition-all"
                  >
                    Clear All
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={handleExportExamsCSV}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-dark-850 hover:bg-dark-800 border border-dark-750 text-white text-xs font-bold transition-all"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                Export CSV
              </button>
            </div>
          </div>

          {/* Rules Banner Summary */}
          {examTabCategory === 'MID' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs">
                <span className="font-extrabold text-amber-400 block mb-0.5">Slot 1 (09:30 - 11:30 AM)</span>
                <span className="text-dark-300 text-[11px]">All Departments <strong>1st Year</strong> students write Mid Exam.</span>
              </div>
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs">
                <span className="font-extrabold text-indigo-400 block mb-0.5">Slot 2 (01:30 - 03:30 PM) — Concurrent</span>
                <span className="text-dark-300 text-[11px]">All Departments <strong>2nd & 3rd Year</strong> students write Mid Exam together.</span>
              </div>
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs">
                <span className="font-extrabold text-purple-400 block mb-0.5">Slot 3 (03:45 - 05:45 PM)</span>
                <span className="text-dark-300 text-[11px]">All Departments <strong>4th Year</strong> students write Mid Exam.</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs">
                <span className="font-extrabold text-indigo-400 block mb-0.5">Day 1 Rotation</span>
                <span className="text-dark-300 text-[11px]">All Depts <strong>1st Year</strong> Sem End Exam.</span>
              </div>
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs">
                <span className="font-extrabold text-blue-400 block mb-0.5">Day 2 Rotation</span>
                <span className="text-dark-300 text-[11px]">All Depts <strong>2nd Year</strong> Sem End Exam.</span>
              </div>
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs">
                <span className="font-extrabold text-purple-400 block mb-0.5">Day 3 Rotation</span>
                <span className="text-dark-300 text-[11px]">All Depts <strong>3rd Year</strong> Sem End Exam.</span>
              </div>
              <div className="p-3 bg-pink-500/10 border border-pink-500/20 rounded-xl text-xs">
                <span className="font-extrabold text-pink-400 block mb-0.5">Day 4 Rotation (Sem 1 Only)</span>
                <span className="text-dark-300 text-[11px]">All Depts <strong>4th Year</strong> Sem End Exam (Sem 1).</span>
              </div>
            </div>
          )}

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-panel p-4 border border-dark-800 rounded-2xl">
              <span className="text-xs text-dark-400 font-semibold block mb-1">Total Scheduled Sessions</span>
              <span className="text-2xl font-black text-white">{exams.length}</span>
            </div>
            <div className="glass-panel p-4 border border-dark-800 rounded-2xl">
              <span className="text-xs text-dark-400 font-semibold block mb-1">Target Exam Dates</span>
              <span className="text-2xl font-black text-amber-400">
                {new Set(exams.map(e => e.exam_date ? e.exam_date.substring(0, 10) : '')).size} Days
              </span>
            </div>
            <div className="glass-panel p-4 border border-dark-800 rounded-2xl">
              <span className="text-xs text-dark-400 font-semibold block mb-1">Active Lecture Halls</span>
              <span className="text-2xl font-black text-indigo-400">
                {new Set(exams.map(e => e.classroom_id)).size} Halls
              </span>
            </div>
            <div className="glass-panel p-4 border border-dark-800 rounded-2xl">
              <span className="text-xs text-dark-400 font-semibold block mb-1">Faculty Duty Assignments</span>
              <div className="flex items-center justify-between">
                <span className="text-2xl font-black text-emerald-400">
                  {new Set(exams.filter(e => e.invigilator_id).map(e => e.invigilator_id)).size}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-extrabold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Shield Active
                </span>
              </div>
            </div>
          </div>

          {/* Search & View Filter Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-dark-900/40 p-3 border border-dark-850 rounded-xl">
            <div className="flex items-center gap-3 w-full sm:w-auto flex-wrap">
              <input
                type="text"
                value={examFilterSearch}
                onChange={e => setExamFilterSearch(e.target.value)}
                placeholder="Search subject code, room, invigilator..."
                className="px-3.5 py-1.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-amber-500/50 w-full sm:w-56"
              />

              <select
                value={examFilterDeptId}
                onChange={e => setExamFilterDeptId(e.target.value)}
                className="px-3 py-1.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-amber-500/50"
              >
                <option value="ALL">All Departments</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.code} - {d.name}</option>
                ))}
              </select>

              <select
                value={examFilterYear}
                onChange={e => setExamFilterYear(e.target.value)}
                className="px-3 py-1.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-amber-500/50"
              >
                <option value="ALL">All Years</option>
                <option value="1">1st Year</option>
                <option value="2">2nd Year</option>
                <option value="3">3rd Year</option>
                <option value="4">4th Year</option>
              </select>
            </div>

            <div className="flex items-center gap-1 p-1 bg-dark-950 border border-dark-800 rounded-xl">
              <button
                type="button"
                onClick={() => setExamViewMode('grid')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  examViewMode === 'grid' ? 'bg-amber-500 text-white' : 'text-dark-400 hover:text-white'
                }`}
              >
                Schedule Grid
              </button>
              <button
                type="button"
                onClick={() => setExamViewMode('roster')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  examViewMode === 'roster' ? 'bg-amber-500 text-white' : 'text-dark-400 hover:text-white'
                }`}
              >
                Faculty Duty Roster
              </button>
            </div>
          </div>

          {/* Exam Content Views */}
          {(() => {
            const filtered = exams.filter(ex => {
              if (examTabCategory === 'MID' && !ex.exam_type?.includes('MID')) return false;
              if (examTabCategory === 'SEM_END' && ex.exam_type !== 'SEM_END') return false;
              if (examTabCategory === 'MID' && ex.exam_type !== examTabType) return false;

              if (examFilterDeptId !== 'ALL' && ex.subject?.department_id !== examFilterDeptId && ex.subject?.department?.id !== examFilterDeptId) {
                return false;
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
                <div className="glass-panel p-12 text-center text-dark-500 border border-dark-800 rounded-2xl">
                  <Calendar className="w-12 h-12 mx-auto mb-3 opacity-25 text-amber-400" />
                  <h4 className="text-base font-bold text-white mb-1">No Exam Sessions Found</h4>
                  <p className="text-xs text-dark-400 max-w-md mx-auto mb-6">
                    Click "Generate {examTabCategory === 'MID' ? 'Mid Exam' : 'Sem End Exam'} Timetable" to automatically schedule clash-free examinations and assign invigilators across departments.
                  </p>
                  {(user?.role === 'HOD' || user?.role === 'ADMIN') && (
                    <button
                      type="button"
                      onClick={() => {
                        setGenCategory(examTabCategory);
                        setGenExamType(examTabType);
                        setIsGenerateExamModalOpen(true);
                      }}
                      className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all shadow-lg shadow-amber-500/20"
                    >
                      Generate Exam Timetable Now
                    </button>
                  )}
                </div>
              );
            }

            if (examViewMode === 'roster') {
              // Group by Invigilator Faculty
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
                          Slot {exam.time_slot} ({exam.time_slot === 1 ? '09:30-11:30' : exam.time_slot === 2 ? '13:30-15:30' : '15:45-17:45'})
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
      ) : (
        /* Settings Tab */
        <div className="space-y-8 max-w-3xl mx-auto">
          <form onSubmit={handleSaveRules} className="glass-panel p-6 space-y-6">
            <h3 className="text-base font-bold text-white mb-2">Configure Department Scheduling Rules & Daily Slots</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Slots Per Day (Daily Periods)</label>
                <input
                  type="number"
                  min={4}
                  max={12}
                  value={ruleSlotsPerDay}
                  onChange={e => setRuleSlotsPerDay(parseInt(e.target.value) || 7)}
                  className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-sm outline-none focus:border-primary-500/50"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Default Lunch Break Period Slot</label>
                <select
                  value={ruleLunchSlot !== null ? ruleLunchSlot : ''}
                  onChange={e => setRuleLunchSlot(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-sm outline-none focus:border-primary-500/50"
                >
                  <option value="">Auto (Year 1 = Period 4, Upper Years = Period 5)</option>
                  <option value={3}>Period Slot 3</option>
                  <option value={4}>Period Slot 4</option>
                  <option value={5}>Period Slot 5</option>
                  <option value={6}>Period Slot 6</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-dark-300 block mb-1.5">Saturday Activity Blocks (Day-Slot Pairs)</label>
              <input
                type="text"
                value={ruleActivityBlocks}
                onChange={e => setRuleActivityBlocks(e.target.value)}
                placeholder="e.g. Saturday-5,Saturday-6,Saturday-7"
                className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-sm outline-none focus:border-primary-500/50"
              />
              <p className="text-[11px] text-dark-500 mt-1">Comma separated list of slots locked for sports/counseling/activities.</p>
            </div>

            {ruleSaveMessage && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>{ruleSaveMessage}</span>
              </div>
            )}

            {ruleSaveError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>{ruleSaveError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSavingRule}
              className="py-3 px-6 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold shadow-lg shadow-primary-500/20 transition-all"
            >
              {isSavingRule ? 'Saving Rules...' : 'Save Department Scheduling Rules'}
            </button>
          </form>

          <div className="glass-panel p-6">
            <h3 className="text-base font-bold text-white mb-6">17 B.Tech College Rules Summary</h3>
            <div className="space-y-3 text-xs text-dark-300">
              <p>• <strong>Rule 0</strong>: Year 1 Lunch at Period 4; Upper Years Lunch at Period 5.</p>
              <p>• <strong>Rule 1 & 2</strong>: HOD excluded from Period 1/7 and Wednesday afternoon slots.</p>
              <p>• <strong>Rule 3 & 4</strong>: Sports/Library & Counselling scheduled at Period 7.</p>
              <p>• <strong>Rule 6 & 8</strong>: Dual parallel lab X & Y batch swap (Morning/Afternoon split).</p>
              <p>• <strong>Rule 9</strong>: 3-Period labs placed at Periods 2-4 (Morning) or Periods 5-7 (Afternoon).</p>
              <p>• <strong>Rule 14</strong>: Branch-wide Professional Electives synchronized at identical Day & Slot.</p>
              <p>• <strong>Rule 15 & 16</strong>: Saturday half-day morning schedule; labs avoided on Saturday.</p>
            </div>
          </div>
        </div>
      )}

      {/* Manual Slot Assignment Modal */}
      {isSlotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md p-6 relative">
            <button
              onClick={() => setIsSlotModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-400 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold text-white mb-2">Assign Timetable Session</h3>
            <p className="text-xs text-dark-400 mb-6">{targetDay} at Slot {targetSlot} (Cohort: {selectedSection})</p>

            <form onSubmit={handleSlotSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Subject Course</label>
                <select
                  value={selectedSubjectId}
                  onChange={e => setSelectedSubjectId(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none"
                >
                  <option value="">Select Subject</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code}) - {s.subject_type}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Faculty Professor</label>
                <select
                  value={selectedFacultyId}
                  onChange={e => setSelectedFacultyId(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none"
                >
                  <option value="">Select Teacher</option>
                  {facultyProfiles.map(f => <option key={f.id} value={f.id}>{f.user?.full_name} {f.is_hod ? '(HOD)' : ''}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Classroom Location</label>
                <select
                  value={selectedClassroomId}
                  onChange={e => setSelectedClassroomId(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none"
                >
                  <option value="">Select Classroom</option>
                  {classrooms.map(c => <option key={c.id} value={c.id}>{c.room_number} ({c.room_type})</option>)}
                </select>
              </div>

              {slotError && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-2 text-xs text-red-400 font-semibold mt-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{slotError}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full mt-4 py-3.5 px-4 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 text-white text-sm font-semibold shadow-lg shadow-primary-500/15"
              >
                Confirm Slot Assignment
              </button>
            </form>
          </div>
        </div>
      )}

      {/* AI Master Solver Modal */}
      {isSolverModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg p-6 relative">
            <button
              onClick={() => setIsSolverModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-400 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
              Master 17-Rules AI Constraint Solver
            </h3>
            <p className="text-xs text-dark-400 mb-6">Auto-schedule multi-department, multi-year sections concurrently obeying all 17 rules.</p>

            <form onSubmit={handleRunAISolver} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-2">Target Departments / Branches (Multi-select)</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto p-3 bg-dark-950/50 border border-dark-850 rounded-xl">
                  {departments.map(d => {
                    const isChecked = solverDeptIds.includes(d.id);
                    return (
                      <div
                        key={d.id}
                        onClick={() => toggleSolverDept(d.id)}
                        className={`p-2 rounded border cursor-pointer select-none text-xs font-bold flex items-center gap-2 ${
                          isChecked ? 'bg-indigo-500/20 border-indigo-500 text-white' : 'bg-dark-900 border-dark-800 text-dark-400'
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${isChecked ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-dark-700'}`}>
                          {isChecked && <Plus className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span>{d.code}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-2">Target Sections across Years (Multi-select)</label>
                {solverDeptIds.length === 0 ? (
                  <div className="text-xs text-dark-500 italic p-3.5 bg-dark-950/30 border border-dark-850 rounded-xl text-center">
                    Please select a branch first to load its sections.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-3 bg-dark-950/50 border border-dark-850 rounded-xl">
                    {sectionConfigs
                      .filter(s => solverDeptIds.includes(s.department_id))
                      .map(s => {
                        const isChecked = selectedSolverSections.includes(s.name);
                        return (
                          <div
                            key={s.id}
                            onClick={() => {
                              setSelectedSolverSections(prev =>
                                prev.includes(s.name)
                                  ? prev.filter(name => name !== s.name)
                                  : [...prev, s.name]
                              );
                            }}
                            className={`p-2 rounded-lg border cursor-pointer select-none text-[11px] font-extrabold flex items-center gap-2 transition-all ${
                              isChecked ? 'bg-indigo-500/20 border-indigo-500 text-white' : 'bg-dark-900 border-dark-800 text-dark-400 hover:text-white hover:bg-dark-850'
                            }`}
                          >
                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${isChecked ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-dark-700'}`}>
                              {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <span>{s.name}</span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {solverError && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-2 text-xs text-red-400 font-semibold mt-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{solverError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSolving}
                className="w-full mt-4 py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-primary-600 hover:from-indigo-500 hover:to-primary-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/15 disabled:opacity-50"
              >
                {isSolving ? 'Solving 17 B.Tech rules constraint parameters...' : 'Run Master 17-Rules AI Solver'}
              </button>
            </form>
          </div>
        </div>
      )}

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
            <p className="text-xs text-dark-400 mb-6">
              {genCategory === 'MID'
                ? 'Schedules Mid Exams: 1st Year (Slot 1), 2nd & 3rd Year (Slot 2 Concurrent), 4th Year (Slot 3).'
                : 'Schedules Semester End Exams using Staggered 4-Day Rotation (Day 1: Yr 1, Day 2: Yr 2, Day 3: Yr 3, Day 4: Yr 4 Sem 1 only), skipping Sundays and Public Holidays.'}
            </p>

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
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5">Exam Start Date</label>
                  <input
                    type="date"
                    value={genStartDate}
                    onChange={e => setGenStartDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-amber-500/50"
                  />
                  <p className="text-[10px] text-dark-500 mt-1">Blank = Next Monday.</p>
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
                  <option value="">Select Subject</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code}) - {s.subject_type}</option>)}
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

      {/* Official Printable Timetable Modal */}
      {isPrintModalOpen && (
        <PrintableTimetableTemplate
          selectedSection={selectedSection}
          department={departments.find(d => d.id === selectedDeptId) || null}
          timetableEntries={timetableEntries}
          subjects={subjects}
          facultyProfiles={facultyProfiles}
          classrooms={classrooms}
          sectionConfig={sectionConfigs.find(s => s.name?.toUpperCase() === selectedSection.toUpperCase()) || null}
          ruleSlotsPerDay={ruleSlotsPerDay}
          ruleLunchSlot={ruleLunchSlot}
          availableSections={getAvailableSections()}
          onSectionChange={(sec) => setSelectedSection(sec)}
          onClose={() => setIsPrintModalOpen(false)}
        />
      )}
    </div>
  );
};
