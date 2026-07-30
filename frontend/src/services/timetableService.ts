import axios from 'axios';
import { API_URL } from '../context/AuthContext';
import type { Department, Subject, FacultyProfile } from './facultyService';
import type { Classroom } from './classroomService';

export interface SchedulingRule {
  id: string;
  department_id: string | null;
  slots_per_day: number;
  days_active: string;
  allow_classroom_overlap: boolean;
  allow_faculty_overlap: boolean;
  lunch_slot: number | null;
  activity_blocks: string | null;
  created_at: string;
  department?: Department | null;
}

export interface SubjectSchedulingRule {
  id: string;
  subject_id: string;
  lectures_per_week: number;
  labs_per_week: number;
  lab_duration: number;
  created_at: string;
  subject?: Subject | null;
}

export interface TimetableEntry {
  id: string;
  department_id: string;
  section: string;
  academic_year: number;
  day_of_week: string;
  time_slot: number;
  subject_id: string;
  faculty_id: string;
  classroom_id: string;
  lab_batch: string;
  created_at: string;
  department?: Department | null;
  subject?: Subject | null;
  faculty?: FacultyProfile | null;
  classroom?: Classroom | null;
}

export interface ExamTimetableEntry {
  id: string;
  exam_type: string;
  academic_year: number;
  semester: number;
  exam_date: string;
  time_slot: number;
  subject_id: string;
  classroom_id: string;
  invigilator_id: string | null;
  created_at: string;
  subject?: Subject | null;
  classroom?: Classroom | null;
  invigilator?: FacultyProfile | null;
}

export const timetableService = {
  async getSchedulingRule(departmentId?: string): Promise<SchedulingRule> {
    const params = departmentId ? { department_id: departmentId } : {};
    const res = await axios.get(`${API_URL}/timetable/rules`, { params });
    return res.data;
  },

  async saveSchedulingRule(data: {
    department_id: string | null;
    slots_per_day: number;
    days_active: string;
    allow_classroom_overlap: boolean;
    allow_faculty_overlap: boolean;
    lunch_slot: number | null;
    activity_blocks: string | null;
  }): Promise<SchedulingRule> {
    const res = await axios.post(`${API_URL}/timetable/rules`, data);
    return res.data;
  },

  async getSubjectSchedulingRule(subjectId: string): Promise<SubjectSchedulingRule> {
    const res = await axios.get(`${API_URL}/timetable/subject-rules/${subjectId}`);
    return res.data;
  },

  async saveSubjectSchedulingRule(data: {
    subject_id: string;
    lectures_per_week: number;
    labs_per_week: number;
    lab_duration: number;
  }): Promise<SubjectSchedulingRule> {
    const res = await axios.post(`${API_URL}/timetable/subject-rules`, data);
    return res.data;
  },

  async generateMasterTimetable(data: {
    department_ids?: string[];
    sections: string[];
  }): Promise<TimetableEntry[]> {
    const res = await axios.post(`${API_URL}/timetable/generate-master`, data);
    return res.data;
  },

  async getTimetable(filters?: {
    department_id?: string;
    section?: string;
    academic_year?: number;
    faculty_id?: string;
    classroom_id?: string;
  }): Promise<TimetableEntry[]> {
    const res = await axios.get(`${API_URL}/timetable`, { params: filters });
    return res.data;
  },

  async createTimetableEntry(data: {
    department_id: string;
    section: string;
    academic_year?: number;
    day_of_week: string;
    time_slot: number;
    subject_id: string;
    faculty_id: string;
    classroom_id: string;
    lab_batch?: string;
  }): Promise<TimetableEntry> {
    const res = await axios.post(`${API_URL}/timetable`, data);
    return res.data;
  },

  async deleteTimetableEntry(id: string): Promise<any> {
    const res = await axios.delete(`${API_URL}/timetable/${id}`);
    return res.data;
  },

  async getExamCalendarDates(): Promise<{
    academic_year: string | null;
    semester: string | null;
    mid1_start_date: string | null;
    mid2_start_date: string | null;
    end_sem_exam_start_date: string | null;
  }> {
    const res = await axios.get(`${API_URL}/timetable/exam-calendar-dates`);
    return res.data;
  },

  async getExamSchedule(filters?: {
    category?: string;
    exam_type?: string;
    academic_year?: number;
    department_id?: string;
  }): Promise<ExamTimetableEntry[]> {
    const res = await axios.get(`${API_URL}/timetable/exams`, { params: filters });
    return res.data;
  },

  async generateExamSchedule(data: {
    category: string;
    exam_type: string;
    start_date?: string;
    semester?: number;
    department_ids?: string[];
  }): Promise<ExamTimetableEntry[]> {
    const res = await axios.post(`${API_URL}/timetable/generate-exams`, data);
    return res.data;
  },

  async clearExamSchedule(filters?: { exam_type?: string; department_id?: string; purge_all?: boolean }): Promise<any> {
    const res = await axios.delete(`${API_URL}/timetable/exams-clear`, { params: filters });
    return res.data;
  },

  async createExamEntry(data: {
    exam_type?: string;
    academic_year?: number;
    semester?: number;
    exam_date: string;
    time_slot: number;
    subject_id: string;
    classroom_id: string;
    invigilator_id?: string | null;
  }): Promise<ExamTimetableEntry> {
    const res = await axios.post(`${API_URL}/timetable/exams`, data);
    return res.data;
  },

  async deleteExamEntry(id: string): Promise<any> {
    const res = await axios.delete(`${API_URL}/timetable/exams/${id}`);
    return res.data;
  }
};

