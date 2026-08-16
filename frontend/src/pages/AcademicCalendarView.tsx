import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { academicCalendarService } from '../services/academicCalendarService';
import type { 
  AcademicCalendar, 
  AcademicCalendarInput, 
  AcademicCalendarEvent, 
  AcademicCalendarEventInput,
  AcademicHoliday,
  AcademicHolidayInput,
  ImportPreviewResponse
} from '../services/academicCalendarService';
import { 
  ChevronLeft, 
  Calendar as CalendarIcon, 
  Plus, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  Award, 
  BookOpen, 
  Edit3, 
  Trash2, 
  X, 
  AlertCircle,
  Check,
  Upload,
  FileSpreadsheet,
  PartyPopper,
  Download,
  Eye,
  Table,
  ArrowRight,
  CalendarOff
} from 'lucide-react';

interface AcademicCalendarViewProps {
  onBack: () => void;
}

export interface GroupedHoliday {
  startDate: string;
  endDate: string;
  name: string;
  description?: string;
  is_holiday?: boolean;
  ids: string[];
  sampleHoliday: AcademicHoliday;
}

const formatHolidayDateRange = (startStr: string, endStr: string) => {
  if (!startStr) return '';
  const formatSingle = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  if (!endStr || startStr === endStr) return formatSingle(startStr);

  try {
    const pStart = startStr.split('-').map(Number);
    const pEnd = endStr.split('-').map(Number);
    const dStart = new Date(pStart[0], pStart[1] - 1, pStart[2]);
    const dEnd = new Date(pEnd[0], pEnd[1] - 1, pEnd[2]);

    const startM = dStart.toLocaleDateString('en-US', { month: 'short' });
    const startDay = dStart.getDate();
    const startYr = dStart.getFullYear();

    const endM = dEnd.toLocaleDateString('en-US', { month: 'short' });
    const endDay = dEnd.getDate();
    const endYr = dEnd.getFullYear();

    if (startYr === endYr) {
      if (startM === endM) {
        return `${startM} ${startDay} – ${endDay}, ${startYr}`;
      }
      return `${startM} ${startDay} – ${endM} ${endDay}, ${startYr}`;
    }
    return `${startM} ${startDay}, ${startYr} – ${endM} ${endDay}, ${endYr}`;
  } catch {
    return `${formatSingle(startStr)} – ${formatSingle(endStr)}`;
  }
};

const groupConsecutiveHolidays = (list: AcademicHoliday[]): GroupedHoliday[] => {
  if (!list || list.length === 0) return [];

  const sorted = [...list].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const grouped: GroupedHoliday[] = [];

  for (const item of sorted) {
    const lastGroup = grouped[grouped.length - 1];
    if (lastGroup && lastGroup.name.trim().toLowerCase() === item.name.trim().toLowerCase()) {
      const prevParts = lastGroup.endDate.split('-').map(Number);
      const currParts = item.date.split('-').map(Number);
      const prevDate = new Date(prevParts[0], prevParts[1] - 1, prevParts[2]);
      const currDate = new Date(currParts[0], currParts[1] - 1, currParts[2]);
      const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 3600 * 24));
      if (diffDays === 1) {
        lastGroup.endDate = item.date;
        lastGroup.ids.push(item.id);
        continue;
      }
    }
    grouped.push({
      startDate: item.date,
      endDate: item.date,
      name: item.name,
      description: item.description || undefined,
      is_holiday: item.is_holiday,
      ids: [item.id],
      sampleHoliday: item
    });
  }

  return grouped;
};

export const AcademicCalendarView: React.FC<AcademicCalendarViewProps> = ({ onBack }) => {
  const { user } = useAuth();
  const isAdminOrHod = user?.role === 'ADMIN' || user?.role === 'HOD';

  // Main Active Tab State: 'SCHEDULES' | 'HOLIDAYS_DB'
  const [activeMainTab, setActiveMainTab] = useState<'SCHEDULES' | 'HOLIDAYS_DB'>('SCHEDULES');

  // Calculate current running year and next year dynamically
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed (5 = June)
  const currentStart = currentMonth < 5 ? currentYear - 1 : currentYear;
  const currentAY = `${currentStart}–${currentStart + 1}`;
  const nextAY = `${currentStart + 1}–${currentStart + 2}`;

  const [calendars, setCalendars] = useState<AcademicCalendar[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>(currentAY);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Dedicated Holidays Database State
  const [holidaysList, setHolidaysList] = useState<AcademicHoliday[]>([]);
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState<boolean>(false);
  const [editingHoliday, setEditingHoliday] = useState<AcademicHoliday | null>(null);
  const [holidayEndDate, setHolidayEndDate] = useState<string>('');
  const [holidayFormData, setHolidayFormData] = useState<AcademicHolidayInput>({
    date: new Date().toISOString().split('T')[0],
    name: '',
    description: '',
    is_holiday: true,
    academic_year: currentAY
  });
  const [_holidayFilter, _setHolidayFilter] = useState<'ALL' | 'HOLIDAY' | 'OCCASION'>('ALL');

  // Calendar Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingCalendar, setEditingCalendar] = useState<AcademicCalendar | null>(null);

  // Calendar Import CSV State
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ message: string; imported_count: number } | null>(null);

  const [selectedYearCohort, setSelectedYearCohort] = useState<'ALL' | '1ST_YEAR' | '2ND_YEAR' | '3RD_YEAR' | '4TH_YEAR'>('ALL');

  // Calendar Form State
  const [formData, setFormData] = useState<AcademicCalendarInput>({
    academic_year: '2026–2027',
    semester: '1st Year - Odd Semester (Sem I)',
    semester_start_date: '2026-06-15',
    semester_end_date: '2026-10-31',
    orientation_start_date: '2026-06-15',
    orientation_end_date: '2026-06-17',
    class_commencement_date: '2026-06-18',
    mid1_start_date: '2026-08-10',
    mid1_end_date: '2026-08-14',
    mid2_start_date: '2026-10-05',
    mid2_end_date: '2026-10-09',
    end_sem_exam_start_date: '2026-10-12',
    end_sem_exam_end_date: '2026-10-23',
    practical_exam_start_date: '2026-10-26',
    practical_exam_end_date: '2026-10-31',
    result_declaration_date: '',
    semester_closing_date: '',
    is_active: true
  });

  // Event Modal & Upload State
  const [isEventModalOpen, setIsEventModalOpen] = useState<boolean>(false);
  const [selectedCalendarForEvent, _setSelectedCalendarForEvent] = useState<string | null>(null);
  const [editingEvent, _setEditingEvent] = useState<AcademicCalendarEvent | null>(null);
  const [eventFormData, setEventFormData] = useState<AcademicCalendarEventInput>({
    date: '',
    name: '',
    description: '',
    is_holiday: true
  });

  const [isEventImportModalOpen, setIsEventImportModalOpen] = useState<boolean>(false);
  const [selectedEventFile, setSelectedEventFile] = useState<File | null>(null);
  const [isUploadingEventCsv, setIsUploadingEventCsv] = useState<boolean>(false);
  const [eventImportError, setEventImportError] = useState<string | null>(null);
  const [eventImportResult, setEventImportResult] = useState<{ message: string; imported_count: number } | null>(null);


  // Live Import Preview Engine State
  const [previewData, setPreviewData] = useState<ImportPreviewResponse | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);


  const handleDownloadScheduleTemplate = () => {
    const csvContent = "academic_year,semester,semester_start_date,semester_end_date,orientation_start_date,orientation_end_date,class_commencement_date,mid1_start_date,mid1_end_date,mid2_start_date,mid2_end_date,end_sem_exam_start_date,end_sem_exam_end_date,external_exam_start_date,external_exam_end_date,is_active\n" +
      "2026–2027,1st Year - Odd Semester (Sem I),2026-06-15,2026-10-31,2026-06-15,2026-06-17,2026-06-18,2026-08-10,2026-08-14,2026-10-05,2026-10-09,2026-10-12,2026-10-23,2026-10-26,2026-10-31,true\n" +
      "2026–2027,2nd Year - Odd Semester (Sem III),2026-06-15,2026-10-31,2026-06-15,2026-06-17,2026-06-18,2026-08-10,2026-08-14,2026-10-05,2026-10-09,2026-10-12,2026-10-23,2026-10-26,2026-10-31,true\n" +
      "2026–2027,3rd Year - Odd Semester (Sem V),2026-06-15,2026-10-31,2026-06-15,2026-06-17,2026-06-18,2026-08-10,2026-08-14,2026-10-05,2026-10-09,2026-10-12,2026-10-23,2026-10-26,2026-10-31,true\n" +
      "2026–2027,4th Year - Odd Semester (Sem VII),2026-06-15,2026-10-31,2026-06-15,2026-06-17,2026-06-18,2026-08-10,2026-08-14,2026-10-05,2026-10-09,2026-10-12,2026-10-23,2026-10-26,2026-10-31,true\n";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'academic_calendar_schedule_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadEventsTemplate = () => {
    const csvContent = "Tentative List of Holidays\n" +
      "S. No.,Date,Occasion\n" +
      "1,16-06-2026,Moharram\n" +
      "2,15-08-2026,Independence Day\n" +
      "3,19-10-2026 to 21-10-2026,Dussehra Holidays\n" +
      "4,11-01-2027 to 16-01-2027,Pongal Holidays\n" +
      "5,26-01-2027,Republic Day\n";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'academic_holidays_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportCalendarToCsv = (cal: AcademicCalendar) => {
    let csvContent = `academic_year,semester,semester_start_date,semester_end_date,class_commencement_date,semester_closing_date,is_active\n`;
    csvContent += `"${cal.academic_year}","${cal.semester}","${cal.semester_start_date}","${cal.semester_end_date}","${cal.class_commencement_date}","${cal.semester_closing_date}",${cal.is_active}\n\n`;
    csvContent += `date,reason\n`;
    (cal.events || []).forEach(ev => {
      csvContent += `"${ev.date}","${ev.name}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `academic_calendar_${cal.academic_year.replace(/\s+/g, '_')}_${cal.semester.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePreviewFile = async (fileToPreview: File, calendarId?: string, importType: string = 'HOLIDAYS_DB') => {
    setIsPreviewLoading(true);
    setImportError(null);
    setEventImportError(null);
    setPreviewData(null);
    try {
      const res = await academicCalendarService.runImportEngine(fileToPreview, true, calendarId, importType);
      setPreviewData(res);
    } catch (err: any) {
      console.error('Preview failed:', err);
      const errMsg = err.response?.data?.detail || 'Failed to preview file.';
      if (calendarId || isEventImportModalOpen) {
        setEventImportError(errMsg);
      } else {
        setImportError(errMsg);
      }
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleDownloadHolidaysTemplate = () => {
    const csvContent = "Tentative List of Holidays\n" +
      "S. No.,Date,Occasion\n" +
      "1,16-06-2026,Moharram\n" +
      "2,15-08-2026,Independence Day\n" +
      "3,19-10-2026 to 21-10-2026,Dussehra Holidays\n" +
      "4,11-01-2027 to 16-01-2027,Pongal Holidays\n" +
      "5,26-01-2027,Republic Day\n";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'academic_holidays_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportHolidaysCsv = () => {
    let csvContent = "date,reason\n";
    holidaysList.forEach(h => {
      csvContent += `"${h.date}","${h.name}"\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `academic_holidays_${selectedYear.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const loadCalendars = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await academicCalendarService.getAcademicCalendars();
      setCalendars(data);
    } catch (err: any) {
      console.error('Failed to load academic calendars:', err);
      const detailMsg = typeof err.response?.data?.detail === 'string' 
        ? err.response.data.detail 
        : (err.message || '');
      setError(`Failed to load academic calendar configurations. ${detailMsg ? `(${detailMsg})` : 'Please check connection or backend state.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadHolidays = async () => {
    try {
      const data = await academicCalendarService.getHolidays(selectedYear);
      setHolidaysList(data);
    } catch (err: any) {
      console.error('Failed to load holidays database:', err);
    }
  };

  useEffect(() => {
    loadCalendars();
    loadHolidays();
  }, [selectedYear]);

  // Holiday DB Handlers
  const handleOpenHolidayModal = (holidayToEdit?: AcademicHoliday) => {
    setHolidayEndDate('');
    if (holidayToEdit) {
      setEditingHoliday(holidayToEdit);
      setHolidayFormData({
        date: holidayToEdit.date,
        name: holidayToEdit.name,
        description: holidayToEdit.description || '',
        is_holiday: holidayToEdit.is_holiday,
        academic_year: holidayToEdit.academic_year || selectedYear
      });
    } else {
      setEditingHoliday(null);
      setHolidayFormData({
        date: new Date().toISOString().split('T')[0],
        name: '',
        description: '',
        is_holiday: true,
        academic_year: selectedYear
      });
    }
    setIsHolidayModalOpen(true);
  };

  const handleSaveHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingHoliday) {
        await academicCalendarService.updateHoliday(editingHoliday.id, holidayFormData);
      } else {
        if (holidayEndDate && holidayEndDate > holidayFormData.date) {
          const st = new Date(holidayFormData.date);
          const en = new Date(holidayEndDate);
          const curr = new Date(st);
          while (curr <= en) {
            const dateStr = curr.toISOString().split('T')[0];
            await academicCalendarService.createHoliday({
              ...holidayFormData,
              date: dateStr
            });
            curr.setDate(curr.getDate() + 1);
          }
        } else {
          await academicCalendarService.createHoliday(holidayFormData);
        }
      }
      setIsHolidayModalOpen(false);
      setHolidayEndDate('');
      loadHolidays();
      loadCalendars();
    } catch (err: any) {
      console.error('Failed to save holiday:', err);
      alert(err.response?.data?.detail || 'Failed to save holiday.');
    }
  };

  const handleEditGroupedHoliday = (group: GroupedHoliday) => {
    setEditingHoliday(group.sampleHoliday);
    setHolidayFormData({
      date: group.startDate,
      name: group.name,
      description: group.description || '',
      is_holiday: group.is_holiday ?? true,
      academic_year: group.sampleHoliday.academic_year || selectedYear
    });
    setHolidayEndDate(group.startDate !== group.endDate ? group.endDate : '');
    setIsHolidayModalOpen(true);
  };

  const handleDeleteGroupedHoliday = async (group: GroupedHoliday) => {
    const rangeLabel = formatHolidayDateRange(group.startDate, group.endDate);
    if (!window.confirm(`Are you sure you want to delete "${group.name}" (${rangeLabel}) from the database?`)) return;
    try {
      for (const id of group.ids) {
        await academicCalendarService.deleteHoliday(id);
      }
      loadHolidays();
      loadCalendars();
    } catch (err: any) {
      console.error('Failed to delete holiday group:', err);
      alert('Failed to delete holiday.');
    }
  };

  const handleClearAllHolidays = async () => {
    if (!window.confirm(`Are you sure you want to delete ALL ${holidaysList.length} holiday record(s) for A.Y. ${selectedYear} from the database? This action cannot be undone.`)) return;
    try {
      const res = await academicCalendarService.clearAllHolidays(selectedYear);
      alert(res.message || 'Successfully cleared all holiday records.');
      loadHolidays();
      loadCalendars();
    } catch (err: any) {
      console.error('Failed to clear holidays:', err);
      alert(err.response?.data?.detail || 'Failed to clear holidays.');
    }
  };

  const handleClearAllCalendars = async (clearOverall: boolean = false) => {
    const yrLabel = clearOverall ? 'ALL Academic Years' : `A.Y. ${selectedYear}`;
    if (!window.confirm(`Are you sure you want to delete ALL academic calendar schedule entries for ${yrLabel} from the database? This action cannot be undone.`)) return;
    try {
      const res = await academicCalendarService.clearAllAcademicCalendars(clearOverall ? 'ALL' : selectedYear);
      alert(res.message || 'Successfully cleared schedule entries.');
      loadCalendars();
    } catch (err: any) {
      console.error('Failed to clear academic calendars:', err);
      alert(err.response?.data?.detail || 'Failed to clear academic calendars.');
    }
  };

  // Limit to current running year and next year
  const availableYears = [currentAY, nextAY];

  const filteredCalendars = calendars.filter(c => {
    const norm = (s: string) => {
      if (!s) return '';
      const digits = s.match(/\d{4}|\d{2}/g);
      if (digits && digits.length >= 2) {
        const y1 = digits[0].length === 2 ? `20${digits[0]}` : digits[0];
        const y2 = digits[1].length === 2 ? `20${digits[1]}` : digits[1];
        return `${y1}-${y2}`;
      }
      return s.replace(/–/g, '-').replace(/—/g, '-').trim();
    };
    return norm(c.academic_year) === norm(selectedYear);
  }).filter((cal, index, self) => {
    const normAY = (s: string) => (s || '').replace(/–/g, '-').replace(/—/g, '-').trim();
    return index === self.findIndex((t) => normAY(t.academic_year) === normAY(cal.academic_year) && t.semester.trim().toLowerCase() === cal.semester.trim().toLowerCase());
  }).sort((a, b) => {
    return a.semester.localeCompare(b.semester, undefined, { numeric: true, sensitivity: 'base' });
  });

  const cohortCalendars = filteredCalendars.filter(cal => {
    if (selectedYearCohort === 'ALL') return true;
    const semLower = cal.semester.toLowerCase();
    if (selectedYearCohort === '1ST_YEAR') return semLower.includes('1st') || semLower.includes('i/iv') || semLower.includes('i b.tech') || semLower.includes('1 year');
    if (selectedYearCohort === '2ND_YEAR') return semLower.includes('2nd') || semLower.includes('ii/iv') || semLower.includes('ii b.tech') || semLower.includes('2 year');
    if (selectedYearCohort === '3RD_YEAR') return semLower.includes('3rd') || semLower.includes('iii/iv') || semLower.includes('iii b.tech') || semLower.includes('3 year');
    if (selectedYearCohort === '4TH_YEAR') return semLower.includes('4th') || semLower.includes('iv/iv') || semLower.includes('iv/i') || semLower.includes('iv b.tech') || semLower.includes('4 year');
    return true;
  });



  const handleOpenModal = (calendarToEdit?: AcademicCalendar) => {
    if (calendarToEdit) {
      setEditingCalendar(calendarToEdit);
      setFormData({
        academic_year: calendarToEdit.academic_year,
        semester: calendarToEdit.semester,
        semester_start_date: calendarToEdit.semester_start_date,
        semester_end_date: calendarToEdit.semester_end_date,
        orientation_start_date: calendarToEdit.orientation_start_date || '',
        orientation_end_date: calendarToEdit.orientation_end_date || '',
        class_commencement_date: calendarToEdit.class_commencement_date,
        mid1_start_date: calendarToEdit.mid1_start_date || '',
        mid1_end_date: calendarToEdit.mid1_end_date || '',
        mid2_start_date: calendarToEdit.mid2_start_date || '',
        mid2_end_date: calendarToEdit.mid2_end_date || '',
        practical_exam_start_date: calendarToEdit.practical_exam_start_date || '',
        practical_exam_end_date: calendarToEdit.practical_exam_end_date || '',
        end_sem_exam_start_date: calendarToEdit.end_sem_exam_start_date || '',
        end_sem_exam_end_date: calendarToEdit.end_sem_exam_end_date || '',
        result_declaration_date: calendarToEdit.result_declaration_date || '',
        semester_closing_date: calendarToEdit.semester_closing_date || '',
        working_days_count: calendarToEdit.working_days_count || 90,
        is_active: calendarToEdit.is_active
      });
    } else {
      setEditingCalendar(null);
      setFormData({
        academic_year: selectedYear || currentAY,
        semester: '1st Year - Sem 1',
        semester_start_date: '2026-06-15',
        semester_end_date: '2026-10-31',
        orientation_start_date: '2026-06-15',
        orientation_end_date: '2026-06-17',
        class_commencement_date: '2026-06-18',
        mid1_start_date: '2026-08-10',
        mid1_end_date: '2026-08-14',
        mid2_start_date: '2026-10-05',
        mid2_end_date: '2026-10-09',
        end_sem_exam_start_date: '2026-10-12',
        end_sem_exam_end_date: '2026-10-23',
        practical_exam_start_date: '2026-10-26',
        practical_exam_end_date: '2026-10-31',
        result_declaration_date: '',
        semester_closing_date: '2026-10-10',
        working_days_count: 90,
        is_active: false
      });
    }
    setIsModalOpen(true);
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setImportError('Please select a CSV or Excel file first.');
      return;
    }
    
    setIsUploading(true);
    setImportError(null);
    setImportResult(null);
    
    try {
      const result = await academicCalendarService.runImportEngine(selectedFile, false, undefined, 'CALENDAR_SCHEDULE');
      setImportResult(result);
      loadCalendars();
      setTimeout(() => {
        setIsImportModalOpen(false);
        setSelectedFile(null);
        setImportResult(null);
      }, 3000);
    } catch (err: any) {
      console.error('CSV/Excel import failed:', err);
      setImportError(err.response?.data?.detail || 'Failed to import CSV/Excel file. Please check format.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingCalendar) {
        await academicCalendarService.updateAcademicCalendar(editingCalendar.id, formData);
      } else {
        await academicCalendarService.createAcademicCalendar(formData);
      }
      setIsModalOpen(false);
      loadCalendars();
    } catch (err: any) {
      console.error('Failed to save academic calendar:', err);
      alert(err.response?.data?.detail || 'Failed to save academic calendar.');
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      await academicCalendarService.setActiveAcademicCalendar(id);
      loadCalendars();
    } catch (err: any) {
      console.error('Failed to set active calendar:', err);
      if (err.response?.status === 404) {
        alert('This calendar record was not found in the database (or was recently cleared). Refreshing calendar list...');
      } else {
        alert(err.response?.data?.detail || 'Failed to set active calendar.');
      }
      loadCalendars();
    }
  };

  const handleDelete = async (id: string, semesterName?: string) => {
    const label = semesterName ? `for "${semesterName}"` : 'configuration';
    if (!window.confirm(`Are you sure you want to clear/delete the academic calendar DB schedule entry ${label}? This action cannot be undone.`)) return;
    try {
      await academicCalendarService.deleteAcademicCalendar(id);
      loadCalendars();
    } catch (err: any) {
      console.error('Failed to delete calendar:', err);
      if (err.response?.status === 404) {
        alert('This calendar record was not found in the database. Refreshing calendar list...');
      } else {
        alert(err.response?.data?.detail || 'Failed to delete calendar.');
      }
      loadCalendars();
    }
  };

  // Event Handlers
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCalendarForEvent && !editingEvent) return;

    try {
      if (editingEvent) {
        await academicCalendarService.updateEvent(editingEvent.id, eventFormData);
      } else if (selectedCalendarForEvent) {
        await academicCalendarService.createEvent(selectedCalendarForEvent, eventFormData);
      }
      setIsEventModalOpen(false);
      loadCalendars();
    } catch (err: any) {
      console.error('Failed to save calendar event:', err);
      alert(err.response?.data?.detail || 'Failed to save event/holiday.');
    }
  };

  const handleEventImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventFile) {
      setEventImportError('Please select a CSV or Excel file first.');
      return;
    }

    setIsUploadingEventCsv(true);
    setEventImportError(null);
    setEventImportResult(null);

    try {
      const result = await academicCalendarService.uploadHolidaysCsv(selectedEventFile, selectedCalendarForEvent || undefined);
      setEventImportResult(result);
      loadCalendars();
      loadHolidays();
      setTimeout(() => {
        setIsEventImportModalOpen(false);
        setSelectedEventFile(null);
        setEventImportResult(null);
      }, 3000);
    } catch (err: any) {
      console.error('Event CSV import failed:', err);
      setEventImportError(err.response?.data?.detail || 'Failed to import CSV file. Please check format.');
    } finally {
      setIsUploadingEventCsv(false);
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'N/A';
    const dateObj = new Date(dateStr);
    return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateRange = (start?: string | null, end?: string | null) => {
    if (!start && !end) return 'Not Scheduled';
    if (start && !end) return formatDate(start);
    if (!start && end) return formatDate(end);
    if (start === end) return formatDate(start);
    return `${formatDate(start)} – ${formatDate(end)}`;
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 hover:bg-slate-200 transition-all font-bold shadow-sm"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                Academic Calendar & Databases
              </h2>
            </div>
            <p className="text-slate-600 text-xs font-semibold mt-1">
              Centralized academic management for semester schedules, dedicated holidays database, and examination dates
            </p>
          </div>
        </div>

        {isAdminOrHod && (
          <div className="flex items-center gap-2.5">
            {activeMainTab === 'SCHEDULES' && (
              <>
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-900 font-extrabold text-xs transition-all shadow-sm"
                >
                  <Upload className="w-4 h-4 text-indigo-600" />
                  Import Schedule (CSV / Excel)
                </button>
                {calendars.length > 0 && (
                  <>
                    {selectedYearCohort === 'ALL' ? (
                      <button
                        onClick={() => handleClearAllCalendars(true)}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-700 hover:bg-rose-100 font-extrabold text-xs transition-all shadow-sm"
                        title="Clear ALL academic calendar schedule DB entries across ALL years at once"
                      >
                        <CalendarOff className="w-3.5 h-3.5 text-rose-600" />
                        Clear Overall DB ({calendars.length})
                      </button>
                    ) : (
                      <button
                        onClick={() => handleClearAllCalendars(false)}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-700 hover:bg-rose-100 font-extrabold text-xs transition-all shadow-sm"
                        title={`Clear academic calendar schedule DB entries for A.Y. ${selectedYear}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        Clear Schedules DB ({cohortCalendars.length})
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={() => handleOpenModal()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-md shadow-indigo-600/20 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Configure Academic Calendar
                </button>
              </>
            )}

            {activeMainTab === 'HOLIDAYS_DB' && (
              <>
                <button
                  onClick={handleDownloadHolidaysTemplate}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 text-xs font-extrabold shadow-sm"
                >
                  <Download className="w-3.5 h-3.5 text-rose-600" />
                  CSV Template
                </button>
                <button
                  onClick={() => setIsEventImportModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 text-xs font-extrabold shadow-sm"
                >
                  <Upload className="w-3.5 h-3.5 text-purple-600" />
                  Import Holidays (CSV / Excel)
                </button>
                <button
                  onClick={handleExportHolidaysCsv}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 hover:bg-slate-50 text-xs font-extrabold shadow-sm"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  Export CSV
                </button>
                {holidaysList.length > 0 && (
                  <button
                    onClick={handleClearAllHolidays}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 border border-rose-300 text-rose-700 hover:bg-rose-100 text-xs font-extrabold transition-all shadow-sm"
                    title="Clear all holiday records for selected Academic Year"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    Clear All ({holidaysList.length})
                  </button>
                )}
                <button
                  onClick={() => handleOpenHolidayModal()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md shadow-rose-600/20"
                >
                  <Plus className="w-4 h-4" />
                  Add Holiday Entry
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-slate-300 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveMainTab('SCHEDULES')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all border ${
            activeMainTab === 'SCHEDULES'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20'
              : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-900'
          }`}
        >
          <CalendarIcon className="w-4 h-4" />
          Semester Timelines
        </button>
        <button
          onClick={() => setActiveMainTab('HOLIDAYS_DB')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all border ${
            activeMainTab === 'HOLIDAYS_DB'
              ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/20'
              : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-900'
          }`}
        >
          <PartyPopper className="w-4 h-4" />
          Academic Holidays
          <span className="px-2 py-0.5 rounded-full bg-white text-[10px] border border-rose-300 text-rose-700 font-black">
            {holidaysList.length} Records
          </span>
        </button>
      </div>

      {/* Academic Year Filter Pills */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mr-1">Academic Year:</span>
        {availableYears.map(year => (
          <button
            key={year}
            onClick={() => setSelectedYear(year)}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all border ${
              selectedYear === year
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-900'
            }`}
          >
            A.Y. {year}
          </button>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <button
            onClick={() => {
              loadCalendars();
              loadHolidays();
            }}
            className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all shadow-sm flex items-center gap-1.5 whitespace-nowrap self-end sm:self-auto"
          >
            Retry Loading
          </button>
        </div>
      )}

      {/* TAB 1: SEMESTER SCHEDULES VIEW */}
      {activeMainTab === 'SCHEDULES' && (
        isLoading ? (
          <div className="glass-panel p-12 text-center text-dark-400 text-sm">
            <Clock className="w-6 h-6 animate-spin mx-auto text-indigo-500 mb-2" />
            Loading Academic Calendar schedules...
          </div>
        ) : filteredCalendars.length === 0 ? (
          <div className="glass-panel p-12 text-center border border-dashed border-dark-800">
            <CalendarIcon className="w-12 h-12 text-dark-500 mx-auto mb-4" />
            <h3 className="text-base font-bold text-white mb-2">No Academic Calendar Configured</h3>
            <p className="text-dark-400 text-xs max-w-md mx-auto mb-6">
              Configure semester start/end dates, orientation days, class commencement, mid-term examinations, holidays, and campus occasions.
            </p>
            {isAdminOrHod && (
              <button
                onClick={() => handleOpenModal()}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg"
              >
                Create First Academic Calendar
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {/* Year Schedule Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2.5 border border-slate-300 rounded-2xl shadow-sm">
              <span className="text-xs text-slate-700 font-extrabold px-2 uppercase tracking-wider">Year Filter:</span>
              {[
                { key: 'ALL', label: 'All Years' },
                { key: '1ST_YEAR', label: '1st Year' },
                { key: '2ND_YEAR', label: '2nd Year' },
                { key: '3RD_YEAR', label: '3rd Year' },
                { key: '4TH_YEAR', label: '4th Year' },
              ].map(yr => (
                <button
                  key={yr.key}
                  onClick={() => setSelectedYearCohort(yr.key as any)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all border ${
                    selectedYearCohort === yr.key
                      ? 'bg-indigo-600 text-white border-indigo-700 shadow-md shadow-indigo-600/20'
                      : 'bg-white border-slate-300 text-slate-800 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {yr.label}
                </button>
              ))}
            </div>

            {/* Official Academic Calendar Master Table matching Database Fields */}
            <div className="bg-white p-6 border border-slate-300 rounded-2xl shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Table className="w-5 h-5 text-indigo-600" />
                    Official Academic Calendar Master Table (A.Y. {selectedYear})
                  </h3>
                  <p className="text-xs text-slate-600 font-semibold mt-1">
                    Official institutional schedule specifying key academic milestone commencement dates and instruction periods.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-300 rounded-2xl shadow-sm">
                <table className="w-full text-left text-xs text-slate-900">
                  <thead className="bg-slate-100 text-slate-800 font-black uppercase tracking-wider border-b border-slate-300">
                    <tr>
                      <th className="p-3 pl-4 text-center w-12">S. No</th>
                      <th className="p-3 font-black text-slate-900 min-w-[130px]">Class</th>
                      <th className="p-3 min-w-[160px]">Date of commencement of class work</th>
                      <th className="p-3 min-w-[160px]">Date of commencement of first mid exam</th>
                      <th className="p-3 min-w-[160px]">Date of commencement of second mid exam</th>
                      <th className="p-3 min-w-[160px]">Date of closing of instructions</th>
                      <th className="p-3 text-center min-w-[150px]">No of working days including mid exams</th>
                      <th className="p-3 min-w-[160px]">Date of commencement of sem end exams</th>
                      <th className="p-3 min-w-[160px]">Date of commencement of practical exams</th>
                      {isAdminOrHod && <th className="p-3 text-right pr-4 w-28">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white font-bold text-slate-900">
                    {cohortCalendars.map((cal, idx) => (
                      <tr key={cal.id} className={`hover:bg-slate-50 transition-colors ${cal.is_active ? 'bg-indigo-50/50' : ''}`}>
                        <td className="p-3.5 text-center font-bold text-slate-600">{idx + 1}</td>
                        <td className="p-3.5 font-black text-slate-900 whitespace-nowrap">{cal.semester}</td>
                        <td className="p-3.5 font-black text-emerald-800 whitespace-nowrap">{formatDate(cal.class_commencement_date)}</td>
                        <td className="p-3.5 font-black text-amber-800 whitespace-nowrap">{formatDate(cal.mid1_start_date)}</td>
                        <td className="p-3.5 font-black text-amber-800 whitespace-nowrap">{formatDate(cal.mid2_start_date)}</td>
                        <td className="p-3.5 font-black text-rose-800 whitespace-nowrap">{formatDate(cal.semester_closing_date || cal.semester_end_date)}</td>
                        <td className="p-3.5 text-center font-black text-blue-900">{cal.working_days_count || 90}</td>
                        <td className="p-3.5 font-black text-purple-800 whitespace-nowrap">{formatDate(cal.end_sem_exam_start_date)}</td>
                        <td className="p-3.5 font-black text-indigo-800 whitespace-nowrap">{formatDate(cal.practical_exam_start_date)}</td>
                        {isAdminOrHod && (
                          <td className="p-3.5 text-right pr-4 whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenModal(cal)}
                                className="p-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 hover:text-slate-900 transition-all shadow-sm"
                                title="Edit Calendar Row"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(cal.id, cal.semester)}
                                className="px-2 py-1.5 rounded-lg bg-rose-50 border border-rose-300 text-rose-700 hover:bg-rose-100 text-[11px] font-extrabold transition-all flex items-center gap-1 shadow-sm"
                                title={`Clear DB entry for ${cal.semester}`}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                <span className="hidden xl:inline">Clear Sem</span>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Detailed Cards View for active calendars */}
            {filteredCalendars
              .filter(cal => {
                if (selectedYearCohort === 'ALL') return true;
                const semLower = cal.semester.toLowerCase();
                if (selectedYearCohort === '1ST_YEAR') return semLower.includes('1st') || semLower.includes('i/iv') || semLower.includes('i b.tech') || semLower.includes('1 year');
                if (selectedYearCohort === '2ND_YEAR') return semLower.includes('2nd') || semLower.includes('ii/iv') || semLower.includes('ii b.tech') || semLower.includes('2 year');
                if (selectedYearCohort === '3RD_YEAR') return semLower.includes('3rd') || semLower.includes('iii/iv') || semLower.includes('iii b.tech') || semLower.includes('3 year');
                if (selectedYearCohort === '4TH_YEAR') return semLower.includes('4th') || semLower.includes('iv/iv') || semLower.includes('iv/i') || semLower.includes('iv b.tech') || semLower.includes('4 year');
                return true;
              })
              .map(cal => (
              <div 
                key={cal.id} 
                className={`p-6 rounded-2xl bg-white border border-slate-300 shadow-sm transition-all ${
                  cal.is_active 
                    ? 'border-indigo-400 bg-indigo-50/20' 
                    : ''
                }`}
              >
                {/* Card Top Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="px-3.5 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 font-black text-xs">
                      A.Y. {cal.academic_year}
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">{cal.semester}</h3>
                      <p className="text-slate-600 text-xs font-semibold">
                        Duration: <span className="text-slate-900 font-extrabold">{formatDateRange(cal.semester_start_date, cal.semester_end_date)}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {cal.is_active ? (
                      <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-900 font-black text-[11px] flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Active Operational Calendar
                      </span>
                    ) : isAdminOrHod ? (
                      <button
                        onClick={() => handleSetActive(cal.id)}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 hover:bg-slate-200 text-xs font-extrabold transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        Set Active
                      </button>
                    ) : null}

                    <button
                      onClick={() => handleExportCalendarToCsv(cal)}
                      className="p-2 px-3 rounded-xl bg-slate-100 border border-slate-300 text-slate-900 hover:bg-slate-200 transition-all flex items-center gap-1.5 text-xs font-extrabold shadow-sm"
                      title="Export & Download Stored Calendar CSV"
                    >
                      <Download className="w-4 h-4 text-indigo-600" />
                      <span className="hidden sm:inline">Export CSV</span>
                    </button>

                    {isAdminOrHod && (
                      <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
                        <button
                          onClick={() => handleOpenModal(cal)}
                          className="p-2 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 hover:bg-slate-200 transition-all shadow-sm"
                          title="Edit Calendar Configuration"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(cal.id, cal.semester)}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-700 hover:bg-rose-100 text-xs font-extrabold transition-all flex items-center gap-1.5 shadow-sm"
                          title={`Clear DB entry for ${cal.semester}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          <span>Clear Sem DB</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Milestone Timeline Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
                  {/* 1. Orientation Days */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-300 space-y-1 shadow-sm">
                    <div className="flex items-center gap-2 text-indigo-900 text-xs font-black">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <span>Orientation Days</span>
                    </div>
                    <p className="text-xs text-slate-900 font-black pt-1">
                      {formatDateRange(cal.orientation_start_date, cal.orientation_end_date)}
                    </p>
                    <p className="text-[10px] text-slate-600 font-extrabold">Student Induction & Briefings</p>
                  </div>

                  {/* 2. Class Commencement */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-300 space-y-1 shadow-sm">
                    <div className="flex items-center gap-2 text-emerald-900 text-xs font-black">
                      <BookOpen className="w-4 h-4 text-emerald-600" />
                      <span>Class Commencement</span>
                    </div>
                    <p className="text-xs text-slate-900 font-black pt-1">
                      {formatDate(cal.class_commencement_date)}
                    </p>
                    <p className="text-[10px] text-slate-600 font-extrabold">Instructional Work Begins</p>
                  </div>

                  {/* 3. Mid 1 Exams */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-300 space-y-1 shadow-sm">
                    <div className="flex items-center gap-2 text-amber-900 text-xs font-black">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <span>Mid-I Examinations</span>
                    </div>
                    <p className="text-xs text-slate-900 font-black pt-1">
                      {formatDateRange(cal.mid1_start_date, cal.mid1_end_date)}
                    </p>
                    <p className="text-[10px] text-slate-600 font-extrabold">First Internal Assessment</p>
                  </div>

                  {/* 4. Mid 2 Exams */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-300 space-y-1 shadow-sm">
                    <div className="flex items-center gap-2 text-amber-900 text-xs font-black">
                      <Clock className="w-4 h-4 text-amber-600" />
                      <span>Mid-II Examinations</span>
                    </div>
                    <p className="text-xs text-slate-900 font-black pt-1">
                      {formatDateRange(cal.mid2_start_date, cal.mid2_end_date)}
                    </p>
                    <p className="text-[10px] text-slate-600 font-extrabold">Second Internal Assessment</p>
                  </div>

                  {/* 5. End Sem Exams */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-300 space-y-1 shadow-sm">
                    <div className="flex items-center gap-2 text-rose-900 text-xs font-black">
                      <Award className="w-4 h-4 text-rose-600" />
                      <span>End Semester Exams</span>
                    </div>
                    <p className="text-xs text-slate-900 font-black pt-1">
                      {formatDateRange(cal.end_sem_exam_start_date, cal.end_sem_exam_end_date)}
                    </p>
                    <p className="text-[10px] text-slate-600 font-extrabold">Final Theory Examinations</p>
                  </div>

                  {/* 6. External Examinations */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-300 space-y-1 shadow-sm">
                    <div className="flex items-center gap-2 text-purple-900 text-xs font-black">
                      <Clock className="w-4 h-4 text-purple-600" />
                      <span>External Examinations</span>
                    </div>
                    <p className="text-xs text-slate-900 font-black pt-1">
                      {formatDateRange(cal.practical_exam_start_date, cal.practical_exam_end_date)}
                    </p>
                    <p className="text-[10px] text-slate-600 font-extrabold">Laboratory & External Viva Evaluation</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* TAB 2: DEDICATED HOLIDAYS DATABASE VIEW */}
      {activeMainTab === 'HOLIDAYS_DB' && (
        <div className="bg-white p-6 border border-slate-300 rounded-2xl shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <PartyPopper className="w-5 h-5 text-rose-600" />
                Academic Holidays (`academic_holidays`)
              </h3>
              <p className="text-xs text-slate-600 font-semibold mt-1">
                Central holiday schedule containing official holiday dates and reason for the holiday.
              </p>
            </div>
          </div>

          {/* Holiday List Table (2 Columns: Date & Reason for Holiday) */}
          {holidaysList.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-slate-300 rounded-2xl text-slate-600 text-xs font-bold">
              <CalendarOff className="w-10 h-10 mx-auto text-slate-400 mb-3" />
              <p className="font-black text-slate-900 text-sm mb-1">No Holiday Records Found</p>
              <p>Upload a holiday CSV/Excel file (with columns: <code className="text-rose-700">date, reason</code>) or add holiday entries directly.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-300 rounded-2xl shadow-sm">
              <table className="w-full text-left text-xs text-slate-900">
                <thead className="bg-slate-100 text-slate-800 font-black uppercase tracking-wider border-b border-slate-300">
                  <tr>
                    <th className="p-3.5 pl-5 w-44">Holiday Date</th>
                    <th className="p-3.5">Reason for Holiday</th>
                    {isAdminOrHod && <th className="p-3.5 text-right pr-5 w-32">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white font-bold text-slate-900">
                  {groupConsecutiveHolidays(holidaysList).map((group, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="p-3.5 pl-5 font-black text-rose-800 whitespace-nowrap">
                        {formatDateRange(group.startDate, group.endDate)}
                      </td>
                      <td className="p-3.5 font-black text-slate-900">
                        {group.name}
                      </td>
                      {isAdminOrHod && (
                        <td className="p-3.5 text-right pr-5 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleEditGroupedHoliday(group)}
                              className="p-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 hover:text-slate-900 transition-all shadow-sm"
                              title="Edit Holiday"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteGroupedHoliday(group)}
                              className="p-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 hover:text-rose-600 transition-all shadow-sm"
                              title="Delete Holiday"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}



      {/* Admin Configure / Edit Calendar Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md overflow-y-auto">
          <div className="glass-panel w-full max-w-2xl p-6 relative border border-dark-800 my-8">
            <div className="flex justify-between items-center pb-4 border-b border-dark-800 mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-indigo-400" />
                {editingCalendar ? 'Edit Academic Calendar' : 'Configure New Academic Calendar'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
              {/* Basic Meta */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-dark-300 block mb-1.5">Academic Year</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 2026–2027"
                    value={formData.academic_year}
                    onChange={e => setFormData({ ...formData, academic_year: e.target.value })}
                    className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-dark-300 block mb-1.5">Semester Designation</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-2">
                    {[
                      '1st Year - Sem 1',
                      '2nd Year - Sem 1',
                      '3rd Year - Sem 1',
                      '4th Year - Sem 1',
                      '1st Year - Sem 2',
                      '2nd Year - Sem 2',
                      '3rd Year - Sem 2',
                      '4th Year - Sem 2'
                    ].map(preset => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setFormData({ ...formData, semester: preset })}
                        className={`px-2 py-1.5 rounded-lg text-[10px] font-bold border transition-all text-left truncate ${
                          formData.semester === preset
                            ? 'bg-indigo-600 text-white border-indigo-500'
                            : 'bg-dark-900 border-dark-800 text-dark-300 hover:text-white'
                        }`}
                        title={preset}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 1st Year - Sem 1"
                    value={formData.semester}
                    onChange={e => setFormData({ ...formData, semester: e.target.value })}
                    className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Semester Duration */}
              <div className="p-4 rounded-xl bg-dark-950/40 border border-dark-850 space-y-3">
                <h4 className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider">Overall Semester Duration</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold text-dark-300 block mb-1">Semester Start Date</label>
                    <input
                      type="date"
                      required
                      value={formData.semester_start_date}
                      onChange={e => setFormData({ ...formData, semester_start_date: e.target.value })}
                      className="w-full px-3 py-2 bg-dark-900 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-dark-300 block mb-1">Semester End Date</label>
                    <input
                      type="date"
                      required
                      value={formData.semester_end_date}
                      onChange={e => setFormData({ ...formData, semester_end_date: e.target.value })}
                      className="w-full px-3 py-2 bg-dark-900 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Orientation & Commencement */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-dark-300 block mb-1.5">Orientation Start</label>
                  <input
                    type="date"
                    value={formData.orientation_start_date || ''}
                    onChange={e => setFormData({ ...formData, orientation_start_date: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-dark-300 block mb-1.5">Orientation End</label>
                  <input
                    type="date"
                    value={formData.orientation_end_date || ''}
                    onChange={e => setFormData({ ...formData, orientation_end_date: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-dark-300 block mb-1.5">Class Commencement</label>
                  <input
                    type="date"
                    required
                    value={formData.class_commencement_date}
                    onChange={e => setFormData({ ...formData, class_commencement_date: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Mid term Exams */}
              <div className="p-4 rounded-xl bg-dark-950/40 border border-dark-850 space-y-3">
                <h4 className="text-xs font-extrabold text-amber-400 uppercase tracking-wider">Mid Examinations</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold text-dark-300 block mb-1">Mid-I (Start – End)</label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={formData.mid1_start_date || ''}
                        onChange={e => setFormData({ ...formData, mid1_start_date: e.target.value })}
                        className="w-1/2 px-2.5 py-1.5 bg-dark-900 border border-dark-800 rounded-lg text-white text-xs outline-none focus:border-indigo-500"
                      />
                      <input
                        type="date"
                        value={formData.mid1_end_date || ''}
                        onChange={e => setFormData({ ...formData, mid1_end_date: e.target.value })}
                        className="w-1/2 px-2.5 py-1.5 bg-dark-900 border border-dark-800 rounded-lg text-white text-xs outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-dark-300 block mb-1">Mid-II (Start – End)</label>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={formData.mid2_start_date || ''}
                        onChange={e => setFormData({ ...formData, mid2_start_date: e.target.value })}
                        className="w-1/2 px-2.5 py-1.5 bg-dark-900 border border-dark-800 rounded-lg text-white text-xs outline-none focus:border-indigo-500"
                      />
                      <input
                        type="date"
                        value={formData.mid2_end_date || ''}
                        onChange={e => setFormData({ ...formData, mid2_end_date: e.target.value })}
                        className="w-1/2 px-2.5 py-1.5 bg-dark-900 border border-dark-800 rounded-lg text-white text-xs outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* End Semester & External Examinations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-dark-300 block mb-1.5">End Sem Exams (Start – End)</label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={formData.end_sem_exam_start_date || ''}
                      onChange={e => setFormData({ ...formData, end_sem_exam_start_date: e.target.value })}
                      className="w-1/2 px-2.5 py-2 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-indigo-500"
                    />
                    <input
                      type="date"
                      value={formData.end_sem_exam_end_date || ''}
                      onChange={e => setFormData({ ...formData, end_sem_exam_end_date: e.target.value })}
                      className="w-1/2 px-2.5 py-2 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-dark-300 block mb-1.5">External Examinations (Start – End)</label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={formData.practical_exam_start_date || ''}
                      onChange={e => setFormData({ ...formData, practical_exam_start_date: e.target.value })}
                      className="w-1/2 px-2.5 py-2 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-indigo-500"
                    />
                    <input
                      type="date"
                      value={formData.practical_exam_end_date || ''}
                      onChange={e => setFormData({ ...formData, practical_exam_end_date: e.target.value })}
                      className="w-1/2 px-2.5 py-2 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Working Days & Active Switch */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-dark-300 block mb-1.5">No of working days including mid exams</label>
                  <input
                    type="number"
                    placeholder="e.g. 90"
                    value={formData.working_days_count || ''}
                    onChange={e => setFormData({ ...formData, working_days_count: parseInt(e.target.value) || undefined })}
                    className="w-full px-4 py-2 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <input
                    type="checkbox"
                    id="isActiveCheck"
                    checked={formData.is_active}
                    onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-dark-900 border-dark-700"
                  />
                  <label htmlFor="isActiveCheck" className="text-xs font-bold text-white cursor-pointer">
                    Set as Active Operational Calendar for the Institution
                  </label>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-dark-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 text-xs font-bold hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg"
                >
                  {editingCalendar ? 'Update Calendar' : 'Save Calendar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Calendar CSV/Excel Modal with Dedicated Preview Engine */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md overflow-y-auto">
          <div className="glass-panel w-full max-w-2xl p-6 relative border border-dark-800 my-8 space-y-6">
            <button
              onClick={() => {
                setIsImportModalOpen(false);
                setSelectedFile(null);
                setPreviewData(null);
              }}
              className="absolute top-4 right-4 p-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
                  <Upload className="w-5 h-5 text-indigo-400" />
                  Import Academic Calendar (CSV / Excel)
                </h3>
                <p className="text-xs text-dark-400 mt-0.5">
                  Supports both <code className="text-indigo-300">.csv</code> and <code className="text-indigo-300">.xlsx / .xls</code> formats with auto field mapping.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadScheduleTemplate}
                className="px-3.5 py-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                Template (CSV)
              </button>
            </div>

            {/* Template Info & Accepted Format */}
            <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-900/30 text-[11px] text-dark-300 space-y-2">
              <div className="flex items-center justify-between font-bold text-indigo-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4" />
                  Expected Columns (Flexible Headers Supported)
                </span>
              </div>
              <div className="bg-dark-950/85 p-3 rounded-lg overflow-x-auto font-mono text-[10px] text-dark-200 border border-dark-850">
                <p className="text-indigo-400">academic_year, semester, semester_start_date, semester_end_date, class_commencement_date, semester_closing_date, is_active</p>
                <p className="mt-1 text-dark-300">Supports aliases: AY, Year, Sem, Start Date, End Date, Commencement Date, Active Status</p>
              </div>
            </div>

            <form onSubmit={handleImportSubmit} className="space-y-5">
              <div>
                <label className="text-xs font-bold text-dark-300 block mb-2">Select CSV or Excel File</label>
                <div className="flex gap-3">
                  <input
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    required
                    onChange={e => {
                      const f = e.target.files?.[0] || null;
                      setSelectedFile(f);
                      setPreviewData(null);
                      if (f) handlePreviewFile(f, undefined, 'CALENDAR_SCHEDULE');
                    }}
                    className="w-full px-4 py-3 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-indigo-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-extrabold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 file:cursor-pointer"
                  />
                  {selectedFile && (
                    <button
                      type="button"
                      onClick={() => handlePreviewFile(selectedFile, undefined, 'CALENDAR_SCHEDULE')}
                      disabled={isPreviewLoading}
                      className="px-4 py-2.5 rounded-xl bg-dark-900 border border-dark-750 text-indigo-300 hover:text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Eye className="w-4 h-4" />
                      {isPreviewLoading ? 'Analyzing...' : 'Re-Preview'}
                    </button>
                  )}
                </div>
              </div>

              {/* Live Preview Engine Box */}
              {previewData && (
                <div className="p-4 rounded-xl bg-dark-950/80 border border-dark-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-dark-800 pb-3">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <Table className="w-4 h-4 text-indigo-400" />
                      Engine Validation Summary ({previewData.import_type})
                    </span>
                    <div className="flex gap-2 text-[11px] font-extrabold">
                      <span className="px-2.5 py-0.5 rounded-md bg-dark-900 border border-dark-750 text-dark-300">
                        Total: {previewData.total_rows}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                        Valid: {previewData.valid_rows}
                      </span>
                      {previewData.invalid_rows > 0 && (
                        <span className="px-2.5 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-300">
                          Invalid: {previewData.invalid_rows}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Header Field Mapping Badges */}
                  <div>
                    <p className="text-[11px] font-bold text-dark-400 mb-1.5 uppercase tracking-wider">Field Mapping Engine Matrix</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(previewData.field_mapping || {}).map(([orig, mapped]) => (
                        <span key={orig} className="px-2.5 py-1 rounded-lg bg-dark-900 border border-dark-800 text-[10px] text-dark-200 font-mono flex items-center gap-1">
                          <span className="text-indigo-400">{orig}</span>
                          <ArrowRight className="w-3 h-3 text-dark-500" />
                          <span className={mapped === 'unmapped' ? 'text-rose-400' : 'text-emerald-400 font-bold'}>{mapped}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Sample Data Table */}
                  {previewData.sample_parsed_data && previewData.sample_parsed_data.length > 0 && (
                    <div className="overflow-x-auto border border-dark-850 rounded-lg">
                      <table className="w-full text-left text-[11px] font-mono">
                        <thead className="bg-dark-900 text-dark-400 border-b border-dark-800">
                          <tr>
                            <th className="p-2">Academic Year</th>
                            <th className="p-2">Semester</th>
                            <th className="p-2">Start Date</th>
                            <th className="p-2">End Date</th>
                            <th className="p-2">Classes Start</th>
                            <th className="p-2">Active</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-dark-850 text-dark-200">
                          {previewData.sample_parsed_data.map((row: any, idx: number) => (
                            <tr key={idx} className="hover:bg-dark-900/50">
                              <td className="p-2 font-bold text-white">{row.academic_year}</td>
                              <td className="p-2">{row.semester}</td>
                              <td className="p-2 text-indigo-300">{row.semester_start_date}</td>
                              <td className="p-2 text-indigo-300">{row.semester_end_date}</td>
                              <td className="p-2 text-emerald-300">{row.class_commencement_date}</td>
                              <td className="p-2 font-bold">{row.is_active ? '✅ True' : '❌ False'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Validation Error Warnings */}
                  {previewData.errors && previewData.errors.length > 0 && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-1">
                      <p className="font-bold flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4 text-rose-400" />
                        Validation Issues Detected ({previewData.errors.length}):
                      </p>
                      <ul className="list-disc list-inside text-[11px] space-y-0.5">
                        {previewData.errors.map((err, errIdx) => (
                          <li key={errIdx}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {importResult && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 space-y-1">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{importResult.message}</span>
                  </div>
                </div>
              )}

              {importError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex gap-2 text-xs text-rose-300 font-semibold leading-normal">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-450" />
                  <span>{importError}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-dark-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setSelectedFile(null);
                    setPreviewData(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 text-xs font-bold hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg disabled:opacity-50 flex items-center gap-2"
                >
                  {isUploading ? 'Importing & Syncing DB...' : 'Confirm & Commit to DB'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Event Modal */}
      {isEventModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md overflow-y-auto">
          <div className="glass-panel w-full max-w-md p-6 relative border border-dark-800 my-8">
            <div className="flex justify-between items-center pb-4 border-b border-dark-800 mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <PartyPopper className="w-5 h-5 text-purple-400" />
                {editingEvent ? 'Edit Holiday / Campus Event' : 'Add Holiday / Campus Event'}
              </h3>
              <button
                onClick={() => setIsEventModalOpen(false)}
                className="p-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-dark-300 block mb-1.5">Event / Holiday Date</label>
                <input
                  type="date"
                  required
                  value={eventFormData.date}
                  onChange={e => setEventFormData({ ...eventFormData, date: e.target.value })}
                  className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-dark-300 block mb-1.5">Title / Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Independence Day, Annual Tech Fest"
                  value={eventFormData.name}
                  onChange={e => setEventFormData({ ...eventFormData, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-dark-300 block mb-1.5">Description (Optional)</label>
                <textarea
                  rows={3}
                  placeholder="e.g. Mandatory holiday for all departments or Cultural activities starting at 10 AM"
                  value={eventFormData.description || ''}
                  onChange={e => setEventFormData({ ...eventFormData, description: e.target.value })}
                  className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-purple-500"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-dark-950/60 border border-dark-800 space-y-2">
                <label className="text-xs font-bold text-white block mb-1">Event Type Classification</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="is_holiday"
                      checked={eventFormData.is_holiday === true}
                      onChange={() => setEventFormData({ ...eventFormData, is_holiday: true })}
                      className="text-rose-500 focus:ring-rose-500 bg-dark-900"
                    />
                    <span className="text-xs font-semibold text-rose-300">🛑 Official Holiday (No Classes)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="is_holiday"
                      checked={eventFormData.is_holiday === false}
                      onChange={() => setEventFormData({ ...eventFormData, is_holiday: false })}
                      className="text-purple-500 focus:ring-purple-500 bg-dark-900"
                    />
                    <span className="text-xs font-semibold text-purple-300">🎉 Campus Occasion (Classes/Events)</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-dark-800">
                <button
                  type="button"
                  onClick={() => setIsEventModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 text-xs font-bold hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg"
                >
                  {editingEvent ? 'Update Event' : 'Save Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Event CSV/Excel Modal */}
      {isEventImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md overflow-y-auto">
          <div className="glass-panel w-full max-w-2xl p-6 relative border border-dark-800 my-8 space-y-6">
            <button
              onClick={() => {
                setIsEventImportModalOpen(false);
                setSelectedEventFile(null);
                setPreviewData(null);
              }}
              className="absolute top-4 right-4 p-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
                  <Upload className="w-5 h-5 text-purple-400" />
                  Import Holidays & Occasions (CSV / Excel)
                </h3>
                <p className="text-xs text-dark-400 mt-0.5">
                  Upload custom public holidays and campus events in <code className="text-purple-300">.csv</code> or <code className="text-purple-300">.xlsx / .xls</code> format.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadEventsTemplate}
                className="px-3.5 py-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                Template (CSV)
              </button>
            </div>

            {/* Template Info */}
            <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-900/30 text-[11px] text-dark-300 space-y-2">
              <div className="flex items-center justify-between font-bold text-purple-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4" />
                  Flexible Holiday Columns & Ranges Supported
                </span>
              </div>
              <div className="bg-dark-950/85 p-3 rounded-lg overflow-x-auto font-mono text-[10px] text-dark-200 border border-dark-850 space-y-1">
                <p className="text-purple-400">Tentative List of Holidays</p>
                <p className="text-purple-400">S. No., Date, Occasion</p>
                <p className="text-dark-300">1, 16-06-2026, Moharram</p>
                <p className="text-dark-300">2, 15-08-2026, Independence Day</p>
                <p className="text-dark-300">3, 19-10-2026 to 21-10-2026, Dussehra Holidays</p>
                <p className="text-dark-300">4, 11-01-2027 to 16-01-2027, Pongal Holidays</p>
              </div>
            </div>

            <form onSubmit={handleEventImportSubmit} className="space-y-5">
              <div>
                <label className="text-xs font-bold text-dark-300 block mb-2">Select Holidays CSV or Excel File</label>
                <div className="flex gap-3">
                  <input
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    required
                    onChange={e => {
                      const f = e.target.files?.[0] || null;
                      setSelectedEventFile(f);
                      setPreviewData(null);
                      if (f) handlePreviewFile(f, selectedCalendarForEvent || undefined, 'HOLIDAYS_DB');
                    }}
                    className="w-full px-4 py-3 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-purple-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-extrabold file:bg-purple-600 file:text-white hover:file:bg-purple-500 file:cursor-pointer"
                  />
                  {selectedEventFile && (
                    <button
                      type="button"
                      onClick={() => handlePreviewFile(selectedEventFile, selectedCalendarForEvent || undefined, 'HOLIDAYS_DB')}
                      disabled={isPreviewLoading}
                      className="px-4 py-2.5 rounded-xl bg-dark-900 border border-dark-750 text-purple-300 hover:text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Eye className="w-4 h-4" />
                      {isPreviewLoading ? 'Analyzing...' : 'Re-Preview'}
                    </button>
                  )}
                </div>
              </div>

              {/* Live Preview Box */}
              {previewData && (
                <div className="p-4 rounded-xl bg-dark-950/80 border border-dark-800 space-y-3">
                  <div className="flex items-center justify-between border-b border-dark-800 pb-3">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <Table className="w-4 h-4 text-purple-400" />
                      Holidays Preview Summary ({previewData.import_type})
                    </span>
                    <div className="flex gap-2 text-[11px] font-extrabold">
                      <span className="px-2.5 py-0.5 rounded-md bg-dark-900 border border-dark-750 text-dark-300">
                        Total: {previewData.total_rows}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                        Valid: {previewData.valid_rows}
                      </span>
                      {previewData.invalid_rows > 0 && (
                        <span className="px-2.5 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-300">
                          Skipped: {previewData.invalid_rows}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Skipped Row Error Details */}
                  {previewData.errors && previewData.errors.length > 0 && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-[11px] text-rose-300 space-y-1 font-mono">
                      <p className="font-bold text-rose-400">Skipped Rows Breakdown:</p>
                      {previewData.errors.map((errMessage: string, errIdx: number) => (
                        <p key={errIdx}>• {errMessage}</p>
                      ))}
                    </div>
                  )}

                  {/* Sample Events Table */}
                  {previewData.sample_parsed_data && previewData.sample_parsed_data.length > 0 && (
                    <div className="overflow-x-auto border border-dark-850 rounded-lg">
                      <table className="w-full text-left text-[11px] font-mono">
                        <thead className="bg-dark-900 text-dark-400 border-b border-dark-800">
                          <tr>
                            <th className="p-2 w-36">Holiday Date</th>
                            <th className="p-2">Reason for Holiday</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-dark-850 text-dark-200">
                          {previewData.sample_parsed_data.map((row: any, idx: number) => (
                            <tr key={idx} className="hover:bg-dark-900/50">
                              <td className="p-2 font-bold text-purple-300">{row.date}</td>
                              <td className="p-2 text-white font-bold">{row.reason || row.name}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {eventImportResult && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 space-y-1">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{eventImportResult.message}</span>
                  </div>
                </div>
              )}

              {eventImportError && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex gap-2 text-xs text-rose-300 font-semibold leading-normal">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-450" />
                  <span>{eventImportError}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-dark-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsEventImportModalOpen(false);
                    setSelectedEventFile(null);
                    setPreviewData(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 text-xs font-bold hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploadingEventCsv}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg disabled:opacity-50 flex items-center gap-2"
                >
                  {isUploadingEventCsv ? 'Importing & Syncing DB...' : 'Confirm & Commit Events to DB'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Holiday Database Entry Modal */}
      {isHolidayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md overflow-y-auto">
          <div className="glass-panel w-full max-w-md p-6 relative border border-dark-800 my-8">
            <div className="flex justify-between items-center pb-4 border-b border-dark-800 mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <PartyPopper className="w-5 h-5 text-rose-400" />
                {editingHoliday ? 'Edit Holiday Database Entry' : 'Add Holiday Entry to Database'}
              </h3>
              <button
                onClick={() => setIsHolidayModalOpen(false)}
                className="p-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveHoliday} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-dark-300 block mb-1.5">Start Date</label>
                  <input
                    type="date"
                    required
                    value={holidayFormData.date}
                    onChange={e => setHolidayFormData({ ...holidayFormData, date: e.target.value })}
                    className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-rose-500"
                  />
                </div>
                {!editingHoliday && (
                  <div>
                    <label className="text-xs font-bold text-dark-300 block mb-1.5">End Date (Optional Range)</label>
                    <input
                      type="date"
                      min={holidayFormData.date}
                      placeholder="Leave empty for single-day"
                      value={holidayEndDate}
                      onChange={e => setHolidayEndDate(e.target.value)}
                      className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-rose-500"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-dark-300 block mb-1.5">Reason for Holiday / Occasion</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Independence Day, Diwali Vacation, Dussehra Holidays"
                  value={holidayFormData.name}
                  onChange={e => setHolidayFormData({ ...holidayFormData, name: e.target.value, is_holiday: true })}
                  className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-dark-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsHolidayModalOpen(false);
                    setHolidayEndDate('');
                  }}
                  className="px-4 py-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 text-xs font-bold hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg"
                >
                  {editingHoliday ? 'Update Holiday' : 'Save Holiday Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};


