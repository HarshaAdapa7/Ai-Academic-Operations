import axios from 'axios';
import { API_URL } from '../context/AuthContext';

export interface AcademicHoliday {
  id: string;
  calendar_id?: string | null;
  academic_year?: string | null;
  date: string;
  name: string;
  description?: string | null;
  is_holiday: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AcademicHolidayInput {
  calendar_id?: string;
  academic_year?: string;
  date: string;
  name: string;
  description?: string;
  is_holiday: boolean;
}

export type AcademicCalendarEvent = AcademicHoliday;
export type AcademicCalendarEventInput = AcademicHolidayInput;

export interface ExaminationSchedule {
  id: string;
  calendar_id?: string | null;
  academic_year?: string | null;
  semester?: string | null;
  exam_type: string;
  exam_name: string;
  start_date: string;
  end_date: string;
  session_timing?: string | null;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ExaminationScheduleInput {
  calendar_id?: string;
  academic_year?: string;
  semester?: string;
  exam_type: string;
  exam_name: string;
  start_date: string;
  end_date: string;
  session_timing?: string;
  description?: string;
}

export interface AcademicCalendar {
  id: string;
  academic_year: string;
  semester: string;
  semester_start_date: string;
  semester_end_date: string;
  orientation_start_date?: string | null;
  orientation_end_date?: string | null;
  class_commencement_date: string;
  mid1_start_date?: string | null;
  mid1_end_date?: string | null;
  mid2_start_date?: string | null;
  mid2_end_date?: string | null;
  practical_exam_start_date?: string | null;
  practical_exam_end_date?: string | null;
  end_sem_exam_start_date?: string | null;
  end_sem_exam_end_date?: string | null;
  result_declaration_date?: string | null;
  semester_closing_date: string;
  working_days_count?: number | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  holidays?: AcademicHoliday[];
  events?: AcademicHoliday[];
}

export interface AcademicCalendarInput {
  academic_year: string;
  semester: string;
  semester_start_date: string;
  semester_end_date: string;
  orientation_start_date?: string;
  orientation_end_date?: string;
  class_commencement_date: string;
  mid1_start_date?: string;
  mid1_end_date?: string;
  mid2_start_date?: string;
  mid2_end_date?: string;
  practical_exam_start_date?: string;
  practical_exam_end_date?: string;
  end_sem_exam_start_date?: string;
  end_sem_exam_end_date?: string;
  result_declaration_date?: string;
  semester_closing_date: string;
  working_days_count?: number;
  is_active: boolean;
}

export interface ImportPreviewResponse {
  import_type: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  field_mapping: Record<string, string>;
  sample_parsed_data: any[];
  errors: string[];
}

export const academicCalendarService = {
  async getAcademicCalendars(academic_year?: string): Promise<AcademicCalendar[]> {
    const res = await axios.get(`${API_URL}/academic-calendar`, {
      params: academic_year ? { academic_year } : {}
    });
    return res.data;
  },

  async getActiveAcademicCalendar(): Promise<AcademicCalendar | null> {
    const res = await axios.get(`${API_URL}/academic-calendar/active`);
    return res.data;
  },

  async createAcademicCalendar(calendar: AcademicCalendarInput): Promise<AcademicCalendar> {
    const res = await axios.post(`${API_URL}/academic-calendar`, calendar);
    return res.data;
  },

  async updateAcademicCalendar(id: string, calendar: Partial<AcademicCalendarInput>): Promise<AcademicCalendar> {
    const res = await axios.put(`${API_URL}/academic-calendar/${id}`, calendar);
    return res.data;
  },

  async setActiveAcademicCalendar(id: string): Promise<AcademicCalendar> {
    const res = await axios.put(`${API_URL}/academic-calendar/${id}/set-active`);
    return res.data;
  },

  async deleteAcademicCalendar(id: string): Promise<void> {
    await axios.delete(`${API_URL}/academic-calendar/${id}`);
  },

  async clearAllAcademicCalendars(academicYear?: string): Promise<{ message: string; deleted_count: number }> {
    const res = await axios.delete(`${API_URL}/academic-calendar/clear-all`, {
      params: academicYear ? { academic_year: academicYear } : {}
    });
    return res.data;
  },

  async runImportEngine(file: File, preview: boolean = false, calendarId?: string, importType?: string): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    const params = new URLSearchParams();
    if (preview) params.append('preview', 'true');
    if (calendarId) params.append('calendar_id', calendarId);
    if (importType) params.append('import_type', importType);

    const res = await axios.post(`${API_URL}/academic-calendar/import-engine?${params.toString()}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return res.data;
  },

  async uploadAcademicCalendarCsv(file: File): Promise<{ message: string; imported_count: number }> {
    return this.runImportEngine(file, false);
  },

  // Dedicated Holidays Database APIs
  async getHolidays(academicYear?: string): Promise<AcademicHoliday[]> {
    const res = await axios.get(`${API_URL}/academic-calendar/holidays/list`, {
      params: academicYear ? { academic_year: academicYear } : {}
    });
    return res.data;
  },

  async createHoliday(holiday: AcademicHolidayInput): Promise<AcademicHoliday> {
    const res = await axios.post(`${API_URL}/academic-calendar/holidays`, holiday);
    return res.data;
  },

  async updateHoliday(id: string, holiday: Partial<AcademicHolidayInput>): Promise<AcademicHoliday> {
    const res = await axios.put(`${API_URL}/academic-calendar/holidays/${id}`, holiday);
    return res.data;
  },

  async deleteHoliday(id: string): Promise<void> {
    await axios.delete(`${API_URL}/academic-calendar/holidays/${id}`);
  },

  async uploadHolidaysCsv(file: File, calendarId?: string): Promise<{ message: string; imported_count: number }> {
    const formData = new FormData();
    formData.append('file', file);
    const params = new URLSearchParams();
    if (calendarId) params.append('calendar_id', calendarId);

    const res = await axios.post(`${API_URL}/academic-calendar/holidays/upload?${params.toString()}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data;
  },

  // Event Aliases for backward compatibility
  async createEvent(calendarId: string, event: AcademicHolidayInput): Promise<AcademicHoliday> {
    return this.createHoliday({ ...event, calendar_id: calendarId });
  },

  async updateEvent(id: string, event: Partial<AcademicHolidayInput>): Promise<AcademicHoliday> {
    return this.updateHoliday(id, event);
  },

  async deleteEvent(id: string): Promise<void> {
    return this.deleteHoliday(id);
  },

  async uploadEventsCsv(calendarId: string, file: File): Promise<{ message: string; imported_count: number }> {
    return this.uploadHolidaysCsv(file, calendarId);
  },

  async clearAllHolidays(academicYear?: string): Promise<{ message: string; deleted_count: number }> {
    const params = new URLSearchParams();
    if (academicYear) params.append('academic_year', academicYear);
    const res = await axios.delete(`${API_URL}/academic-calendar/holidays/clear-all?${params.toString()}`);
    return res.data;
  }
};



