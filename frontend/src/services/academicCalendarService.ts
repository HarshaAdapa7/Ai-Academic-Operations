import axios from 'axios';
import { API_URL } from '../context/AuthContext';

export interface AcademicCalendarEvent {
  id: string;
  calendar_id: string;
  date: string;
  name: string;
  description?: string | null;
  is_holiday: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AcademicCalendarEventInput {
  date: string;
  name: string;
  description?: string;
  is_holiday: boolean;
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
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  events?: AcademicCalendarEvent[];
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
  is_active: boolean;
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

  async uploadAcademicCalendarCsv(file: File): Promise<{ message: string; imported_count: number }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await axios.post(`${API_URL}/academic-calendar/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return res.data;
  },

  async getCalendarEvents(calendarId: string): Promise<AcademicCalendarEvent[]> {
    const res = await axios.get(`${API_URL}/academic-calendar/${calendarId}/events`);
    return res.data;
  },

  async createEvent(calendarId: string, event: AcademicCalendarEventInput): Promise<AcademicCalendarEvent> {
    const res = await axios.post(`${API_URL}/academic-calendar/${calendarId}/events`, event);
    return res.data;
  },

  async updateEvent(eventId: string, event: Partial<AcademicCalendarEventInput>): Promise<AcademicCalendarEvent> {
    const res = await axios.put(`${API_URL}/academic-calendar/events/${eventId}`, event);
    return res.data;
  },

  async deleteEvent(eventId: string): Promise<void> {
    await axios.delete(`${API_URL}/academic-calendar/events/${eventId}`);
  },

  async uploadEventsCsv(calendarId: string, file: File): Promise<{ message: string; imported_count: number }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await axios.post(`${API_URL}/academic-calendar/${calendarId}/events/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return res.data;
  }
};
