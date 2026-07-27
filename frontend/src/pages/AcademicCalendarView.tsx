import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { academicCalendarService } from '../services/academicCalendarService';
import type { 
  AcademicCalendar, 
  AcademicCalendarInput, 
  AcademicCalendarEvent, 
  AcademicCalendarEventInput 
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
  Flag,
  Check,
  Upload,
  FileSpreadsheet,
  PartyPopper,
  CalendarOff,
  Filter
} from 'lucide-react';

interface AcademicCalendarViewProps {
  onBack: () => void;
}

export const AcademicCalendarView: React.FC<AcademicCalendarViewProps> = ({ onBack }) => {
  const { user } = useAuth();
  const isAdminOrHod = user?.role === 'ADMIN' || user?.role === 'HOD';

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

  // Calendar Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingCalendar, setEditingCalendar] = useState<AcademicCalendar | null>(null);

  // Calendar Import CSV State
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ message: string; imported_count: number } | null>(null);

  // Calendar Form State
  const [formData, setFormData] = useState<AcademicCalendarInput>({
    academic_year: '2026–2027',
    semester: 'Odd Semester (Sem I / III / V / VII)',
    semester_start_date: '2026-06-15',
    semester_end_date: '2026-10-31',
    orientation_start_date: '2026-06-15',
    orientation_end_date: '2026-06-17',
    class_commencement_date: '2026-06-18',
    mid1_start_date: '2026-08-10',
    mid1_end_date: '2026-08-14',
    mid2_start_date: '2026-10-05',
    mid2_end_date: '2026-10-09',
    practical_exam_start_date: '2026-10-12',
    practical_exam_end_date: '2026-10-16',
    end_sem_exam_start_date: '2026-10-19',
    end_sem_exam_end_date: '2026-10-30',
    result_declaration_date: '2026-11-20',
    semester_closing_date: '2026-10-31',
    is_active: true
  });

  // Event Modal & Upload State
  const [isEventModalOpen, setIsEventModalOpen] = useState<boolean>(false);
  const [selectedCalendarForEvent, setSelectedCalendarForEvent] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<AcademicCalendarEvent | null>(null);
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

  // Event Filter per calendar Tab: 'ALL' | 'HOLIDAY' | 'OCCASION'
  const [eventFilterMap, setEventFilterMap] = useState<Record<string, 'ALL' | 'HOLIDAY' | 'OCCASION'>>({});

  const loadCalendars = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await academicCalendarService.getAcademicCalendars();
      setCalendars(data);
    } catch (err: any) {
      console.error('Failed to load academic calendars:', err);
      setError('Failed to load academic calendar configurations.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCalendars();
  }, []);

  // Limit to current running year and next year
  const availableYears = [currentAY, nextAY];

  const filteredCalendars = calendars.filter(c => {
    const norm = (s: string) => s.replace(/–/g, '-').trim();
    return norm(c.academic_year) === norm(selectedYear);
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
        semester_closing_date: calendarToEdit.semester_closing_date,
        is_active: calendarToEdit.is_active
      });
    } else {
      setEditingCalendar(null);
      setFormData({
        academic_year: selectedYear || currentAY,
        semester: 'Odd Semester (Sem I / III / V / VII)',
        semester_start_date: '2026-06-15',
        semester_end_date: '2026-10-31',
        orientation_start_date: '2026-06-15',
        orientation_end_date: '2026-06-17',
        class_commencement_date: '2026-06-18',
        mid1_start_date: '2026-08-10',
        mid1_end_date: '2026-08-14',
        mid2_start_date: '2026-10-05',
        mid2_end_date: '2026-10-09',
        practical_exam_start_date: '2026-10-12',
        practical_exam_end_date: '2026-10-16',
        end_sem_exam_start_date: '2026-10-19',
        end_sem_exam_end_date: '2026-10-30',
        result_declaration_date: '2026-11-20',
        semester_closing_date: '2026-10-31',
        is_active: false
      });
    }
    setIsModalOpen(true);
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setImportError('Please select a CSV file first.');
      return;
    }
    
    setIsUploading(true);
    setImportError(null);
    setImportResult(null);
    
    try {
      const result = await academicCalendarService.uploadAcademicCalendarCsv(selectedFile);
      setImportResult(result);
      loadCalendars();
      setTimeout(() => {
        setIsImportModalOpen(false);
        setSelectedFile(null);
        setImportResult(null);
      }, 3000);
    } catch (err: any) {
      console.error('CSV import failed:', err);
      setImportError(err.response?.data?.detail || 'Failed to import CSV file. Please check format.');
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
      alert('Failed to set active calendar.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this academic calendar entry?')) return;
    try {
      await academicCalendarService.deleteAcademicCalendar(id);
      loadCalendars();
    } catch (err: any) {
      console.error('Failed to delete calendar:', err);
      alert('Failed to delete calendar.');
    }
  };

  // Event Handlers
  const handleOpenEventModal = (calendarId: string, eventToEdit?: AcademicCalendarEvent) => {
    setSelectedCalendarForEvent(calendarId);
    if (eventToEdit) {
      setEditingEvent(eventToEdit);
      setEventFormData({
        date: eventToEdit.date,
        name: eventToEdit.name,
        description: eventToEdit.description || '',
        is_holiday: eventToEdit.is_holiday
      });
    } else {
      setEditingEvent(null);
      setEventFormData({
        date: new Date().toISOString().split('T')[0],
        name: '',
        description: '',
        is_holiday: true
      });
    }
    setIsEventModalOpen(true);
  };

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

  const handleDeleteEvent = async (eventId: string) => {
    if (!window.confirm('Are you sure you want to delete this event/holiday?')) return;
    try {
      await academicCalendarService.deleteEvent(eventId);
      loadCalendars();
    } catch (err: any) {
      console.error('Failed to delete event:', err);
      alert('Failed to delete event/holiday.');
    }
  };

  const handleOpenEventImportModal = (calendarId: string) => {
    setSelectedCalendarForEvent(calendarId);
    setSelectedEventFile(null);
    setEventImportError(null);
    setEventImportResult(null);
    setIsEventImportModalOpen(true);
  };

  const handleEventImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCalendarForEvent || !selectedEventFile) {
      setEventImportError('Please select a CSV file first.');
      return;
    }

    setIsUploadingEventCsv(true);
    setEventImportError(null);
    setEventImportResult(null);

    try {
      const result = await academicCalendarService.uploadEventsCsv(selectedCalendarForEvent, selectedEventFile);
      setEventImportResult(result);
      loadCalendars();
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2.5 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white hover:border-dark-700 transition-all shadow-md"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">
                Academic Calendar Module
              </h2>
            </div>
            <p className="text-dark-400 text-xs mt-1">
              Centralized academic timeline manager for multi-year semester schedules, holidays, and campus occasions
            </p>
          </div>
        </div>

        {isAdminOrHod && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-dark-900 border border-dark-750 hover:border-indigo-500/40 text-dark-200 hover:text-white font-bold text-xs transition-all shadow-md"
            >
              <Upload className="w-4 h-4 text-indigo-400" />
              Import Calendar CSV
            </button>
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              Configure Academic Calendar
            </button>
          </div>
        )}
      </div>

      {/* Academic Year Filter Pills */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <span className="text-xs font-bold text-dark-400 uppercase tracking-wider mr-1">Academic Year:</span>
        {availableYears.map(year => (
          <button
            key={year}
            onClick={() => setSelectedYear(year)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
              selectedYear === year
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                : 'bg-dark-900 border-dark-800 text-dark-300 hover:text-white hover:border-dark-700'
            }`}
          >
            A.Y. {year}
          </button>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="glass-panel p-12 text-center text-dark-400 text-sm">
          <Clock className="w-6 h-6 animate-spin mx-auto text-indigo-500 mb-2" />
          Loading Academic Calendar schedules...
        </div>
      ) : filteredCalendars.length === 0 ? (
        /* Empty State */
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
        /* Calendar Entries Cards List */
        <div className="space-y-8">
          {filteredCalendars.map(cal => (
            <div 
              key={cal.id} 
              className={`glass-panel p-6 border transition-all ${
                cal.is_active 
                  ? 'border-indigo-500/60 bg-gradient-to-b from-indigo-950/20 to-dark-900/60 shadow-xl shadow-indigo-500/5' 
                  : 'border-dark-800'
              }`}
            >
              {/* Card Top Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-dark-800">
                <div className="flex items-center gap-3">
                  <div className="px-3.5 py-1.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-extrabold text-xs">
                    A.Y. {cal.academic_year}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">{cal.semester}</h3>
                    <p className="text-dark-400 text-xs">
                      Duration: <span className="text-dark-200 font-semibold">{formatDateRange(cal.semester_start_date, cal.semester_end_date)}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {cal.is_active ? (
                    <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold text-[11px] flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Active Operational Calendar
                    </span>
                  ) : isAdminOrHod ? (
                    <button
                      onClick={() => handleSetActive(cal.id)}
                      className="px-3 py-1.5 rounded-lg bg-dark-900 border border-dark-750 hover:border-emerald-500/40 text-dark-300 hover:text-emerald-300 text-xs font-bold transition-all flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Set Active
                    </button>
                  ) : null}

                  {isAdminOrHod && (
                    <div className="flex items-center gap-1.5 border-l border-dark-800 pl-3">
                      <button
                        onClick={() => handleOpenModal(cal)}
                        className="p-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-300 hover:text-white hover:border-dark-700 transition-all"
                        title="Edit Calendar Configuration"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(cal.id)}
                        className="p-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-300 hover:text-rose-400 hover:border-rose-500/30 transition-all"
                        title="Delete Calendar Configuration"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Milestone Timeline Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                {/* 1. Orientation Days */}
                <div className="p-4 rounded-xl bg-dark-950/40 border border-dark-850 space-y-1">
                  <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold">
                    <Sparkles className="w-4 h-4" />
                    <span>Orientation Days</span>
                  </div>
                  <p className="text-xs text-white font-extrabold pt-1">
                    {formatDateRange(cal.orientation_start_date, cal.orientation_end_date)}
                  </p>
                  <p className="text-[10px] text-dark-400">Student Induction & Briefings</p>
                </div>

                {/* 2. Class Commencement */}
                <div className="p-4 rounded-xl bg-dark-950/40 border border-dark-850 space-y-1">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                    <BookOpen className="w-4 h-4" />
                    <span>Class Commencement</span>
                  </div>
                  <p className="text-xs text-white font-extrabold pt-1">
                    {formatDate(cal.class_commencement_date)}
                  </p>
                  <p className="text-[10px] text-dark-400">Instructional Work Begins</p>
                </div>

                {/* 3. Mid 1 Exams */}
                <div className="p-4 rounded-xl bg-dark-950/40 border border-dark-850 space-y-1">
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
                    <Clock className="w-4 h-4" />
                    <span>Mid-I Examinations</span>
                  </div>
                  <p className="text-xs text-white font-extrabold pt-1">
                    {formatDateRange(cal.mid1_start_date, cal.mid1_end_date)}
                  </p>
                  <p className="text-[10px] text-dark-400">First Internal Assessment</p>
                </div>

                {/* 4. Mid 2 Exams */}
                <div className="p-4 rounded-xl bg-dark-950/40 border border-dark-850 space-y-1">
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
                    <Clock className="w-4 h-4" />
                    <span>Mid-II Examinations</span>
                  </div>
                  <p className="text-xs text-white font-extrabold pt-1">
                    {formatDateRange(cal.mid2_start_date, cal.mid2_end_date)}
                  </p>
                  <p className="text-[10px] text-dark-400">Second Internal Assessment</p>
                </div>

                {/* 5. Practical Exams */}
                <div className="p-4 rounded-xl bg-dark-950/40 border border-dark-850 space-y-1">
                  <div className="flex items-center gap-2 text-purple-400 text-xs font-bold">
                    <Clock className="w-4 h-4" />
                    <span>Practical Exams</span>
                  </div>
                  <p className="text-xs text-white font-extrabold pt-1">
                    {formatDateRange(cal.practical_exam_start_date, cal.practical_exam_end_date)}
                  </p>
                  <p className="text-[10px] text-dark-400">Laboratory & Viva Evaluation</p>
                </div>

                {/* 6. End Sem Exams */}
                <div className="p-4 rounded-xl bg-dark-950/40 border border-dark-850 space-y-1">
                  <div className="flex items-center gap-2 text-rose-400 text-xs font-bold">
                    <Award className="w-4 h-4" />
                    <span>End Semester Exams</span>
                  </div>
                  <p className="text-xs text-white font-extrabold pt-1">
                    {formatDateRange(cal.end_sem_exam_start_date, cal.end_sem_exam_end_date)}
                  </p>
                  <p className="text-[10px] text-dark-400">Final Theory Examinations</p>
                </div>

                {/* 7. Result Declaration */}
                <div className="p-4 rounded-xl bg-dark-950/40 border border-dark-850 space-y-1">
                  <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold">
                    <Flag className="w-4 h-4" />
                    <span>Result Declaration</span>
                  </div>
                  <p className="text-xs text-white font-extrabold pt-1">
                    {formatDate(cal.result_declaration_date)}
                  </p>
                  <p className="text-[10px] text-dark-400">Grade Sheet Publishing</p>
                </div>

                {/* 8. Semester Closing Date */}
                <div className="p-4 rounded-xl bg-dark-950/40 border border-dark-850 space-y-1">
                  <div className="flex items-center gap-2 text-dark-300 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 text-dark-400" />
                    <span>Semester Closing Date</span>
                  </div>
                  <p className="text-xs text-white font-extrabold pt-1">
                    {formatDate(cal.semester_closing_date)}
                  </p>
                  <p className="text-[10px] text-dark-400">Term End & Recess</p>
                </div>
              </div>

              {/* Holidays & Campus Occasions Section */}
              <div className="mt-8 pt-6 border-t border-dark-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <PartyPopper className="w-5 h-5 text-purple-400" />
                      <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                        Holidays & Campus Occasions
                      </h4>
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 font-extrabold text-[11px] border border-rose-500/30">
                        {(cal.events || []).filter(e => e.is_holiday).length} Holidays
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 font-extrabold text-[11px] border border-purple-500/30">
                        {(cal.events || []).filter(e => !e.is_holiday).length} Campus Occasions
                      </span>
                    </div>
                    <p className="text-dark-400 text-xs mt-1">
                      Public holidays, festivals, tech fests, sports days, and scheduled campus occasions
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {isAdminOrHod && (
                      <>
                        <button
                          onClick={() => handleOpenEventImportModal(cal.id)}
                          className="px-3 py-1.5 rounded-xl bg-dark-900 border border-dark-750 hover:border-dark-700 text-dark-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5"
                        >
                          <Upload className="w-3.5 h-3.5 text-indigo-400" />
                          Import CSV
                        </button>
                        <button
                          onClick={() => handleOpenEventModal(cal.id)}
                          className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-purple-600/20"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Holiday/Event
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[11px] font-bold text-dark-400 flex items-center gap-1">
                    <Filter className="w-3 h-3 text-dark-400" /> Filter:
                  </span>
                  {(['ALL', 'HOLIDAY', 'OCCASION'] as const).map(tab => {
                    const currentFilter = eventFilterMap[cal.id] || 'ALL';
                    const label = tab === 'ALL' ? 'All Events' : tab === 'HOLIDAY' ? 'Official Holidays' : 'Campus Occasions';
                    return (
                      <button
                        key={tab}
                        onClick={() => setEventFilterMap(prev => ({ ...prev, [cal.id]: tab }))}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                          currentFilter === tab
                            ? 'bg-purple-600/30 text-purple-200 border-purple-500/50'
                            : 'bg-dark-900 border-dark-800 text-dark-400 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Events Grid */}
                {(() => {
                  const filterMode = eventFilterMap[cal.id] || 'ALL';
                  const filteredEvents = (cal.events || []).filter(e => {
                    if (filterMode === 'HOLIDAY') return e.is_holiday;
                    if (filterMode === 'OCCASION') return !e.is_holiday;
                    return true;
                  });

                  if (filteredEvents.length === 0) {
                    return (
                      <div className="p-6 rounded-xl border border-dashed border-dark-800 text-center text-dark-400 text-xs bg-dark-950/20">
                        <CalendarOff className="w-6 h-6 mx-auto text-dark-500 mb-2" />
                        <p>No {filterMode === 'HOLIDAY' ? 'holidays' : filterMode === 'OCCASION' ? 'occasions' : 'events or holidays'} configured for this academic calendar.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filteredEvents.map(ev => (
                        <div
                          key={ev.id}
                          className={`p-3.5 rounded-xl border transition-all relative group ${
                            ev.is_holiday
                              ? 'bg-rose-950/10 border-rose-900/30 hover:border-rose-700/50'
                              : 'bg-purple-950/10 border-purple-900/30 hover:border-purple-700/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <span className="px-2 py-0.5 rounded-md bg-dark-900 border border-dark-800 text-white font-extrabold text-[10px]">
                              {formatDate(ev.date)}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                ev.is_holiday
                                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                                  : 'bg-purple-500/15 border-purple-500/30 text-purple-300'
                              }`}
                            >
                              {ev.is_holiday ? '🛑 Official Holiday' : '🎉 Campus Occasion'}
                            </span>
                          </div>

                          <h5 className="text-xs font-bold text-white tracking-wide">{ev.name}</h5>
                          {ev.description && (
                            <p className="text-[11px] text-dark-400 mt-1 leading-relaxed">
                              {ev.description}
                            </p>
                          )}

                          {isAdminOrHod && (
                            <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-dark-800/60 justify-end">
                              <button
                                onClick={() => handleOpenEventModal(cal.id, ev)}
                                className="p-1 rounded-md bg-dark-900 text-dark-300 hover:text-white hover:bg-dark-800 text-[10px] font-semibold flex items-center gap-1 px-2 border border-dark-800"
                              >
                                <Edit3 className="w-3 h-3" /> Edit
                              </button>
                              <button
                                onClick={() => handleDeleteEvent(ev.id)}
                                className="p-1 rounded-md bg-dark-900 text-dark-300 hover:text-rose-400 hover:bg-dark-800 text-[10px] font-semibold flex items-center gap-1 px-2 border border-dark-800"
                              >
                                <Trash2 className="w-3 h-3" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}
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
                  <input
                    type="text"
                    required
                    placeholder="e.g. Odd Semester (Sem I/III/V/VII)"
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

              {/* End Semester & Practical Exams */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-dark-300 block mb-1.5">Practical Exams (Start – End)</label>
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
              </div>

              {/* Result Declaration & Closing */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-dark-300 block mb-1.5">Result Declaration Date</label>
                  <input
                    type="date"
                    value={formData.result_declaration_date || ''}
                    onChange={e => setFormData({ ...formData, result_declaration_date: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-dark-300 block mb-1.5">Semester Closing Date</label>
                  <input
                    type="date"
                    required
                    value={formData.semester_closing_date}
                    onChange={e => setFormData({ ...formData, semester_closing_date: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Active Switch */}
              <div className="flex items-center gap-3 pt-2">
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

      {/* Import Calendar CSV Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md overflow-y-auto">
          <div className="glass-panel w-full max-w-lg p-6 relative border border-dark-800 my-8">
            <button
              onClick={() => setIsImportModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2.5">
              <Upload className="w-5 h-5 text-indigo-400" />
              Import Academic Calendar (CSV)
            </h3>
            <p className="text-xs text-dark-400 mb-6">
              Upload a CSV file containing academic calendar timelines.
            </p>

            {/* Template Info */}
            <div className="mb-6 p-4 rounded-xl bg-indigo-950/20 border border-indigo-900/30 text-[11px] text-dark-300 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-indigo-400 uppercase tracking-wider">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Expected CSV Headers & Sample Row</span>
              </div>
              <div className="bg-dark-950/85 p-3 rounded-lg overflow-x-auto font-mono text-[10px] text-dark-200 border border-dark-850">
                <p className="text-indigo-400">academic_year,semester,semester_start_date,semester_end_date,class_commencement_date,semester_closing_date,is_active</p>
                <p className="mt-1">2026–2027,Odd Semester,2026-06-15,2026-10-31,2026-06-18,2026-10-31,true</p>
              </div>
            </div>

            <form onSubmit={handleImportSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-dark-300 block mb-2">Select CSV File</label>
                <input
                  type="file"
                  accept=".csv"
                  required
                  onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-3 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-indigo-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-extrabold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 file:cursor-pointer"
                />
              </div>

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
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 text-xs font-bold hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg disabled:opacity-50"
                >
                  {isUploading ? 'Importing...' : 'Upload & Sync'}
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

      {/* Import Event CSV Modal */}
      {isEventImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-md overflow-y-auto">
          <div className="glass-panel w-full max-w-lg p-6 relative border border-dark-800 my-8">
            <button
              onClick={() => setIsEventImportModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2.5">
              <Upload className="w-5 h-5 text-purple-400" />
              Import Holidays & Occasions (CSV)
            </h3>
            <p className="text-xs text-dark-400 mb-6">
              Upload a CSV file containing custom public holidays and campus events linked to this calendar.
            </p>

            {/* Template Info */}
            <div className="mb-6 p-4 rounded-xl bg-purple-950/20 border border-purple-900/30 text-[11px] text-dark-300 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-purple-400 uppercase tracking-wider">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Expected CSV Headers & Sample Rows</span>
              </div>
              <div className="bg-dark-950/85 p-3 rounded-lg overflow-x-auto font-mono text-[10px] text-dark-200 border border-dark-850">
                <p className="text-purple-400">date,name,description,is_holiday</p>
                <p className="mt-1">2026-08-15,Independence Day,National Public Holiday,true</p>
                <p className="mt-0.5">2026-09-25,Annual Sports Fest,Inter-departmental competitions,false</p>
              </div>
            </div>

            <form onSubmit={handleEventImportSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-dark-300 block mb-2">Select Events CSV File</label>
                <input
                  type="file"
                  accept=".csv"
                  required
                  onChange={e => setSelectedEventFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-3 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-purple-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-extrabold file:bg-purple-600 file:text-white hover:file:bg-purple-500 file:cursor-pointer"
                />
              </div>

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
                  onClick={() => setIsEventImportModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 text-xs font-bold hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploadingEventCsv}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg disabled:opacity-50"
                >
                  {isUploadingEventCsv ? 'Importing...' : 'Upload & Sync Events'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
