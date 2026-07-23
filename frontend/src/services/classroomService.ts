import axios from 'axios';
import { API_URL } from '../context/AuthContext';
import type { Subject, Department } from './facultyService';

export interface Classroom {
  id: string;
  room_number: string;
  capacity: number;
  rows: number;
  cols: number;
  room_type: string;
  department_id: string | null;
  created_at: string;
  department?: Department | null;
}

export interface SeatingAssignment {
  id: string;
  seating_plan_id: string;
  classroom_id: string;
  student_roll_no: string;
  student_name: string;
  subject_id: string;
  row_index: number;
  col_index: number;
  classroom: Classroom;
  subject: Subject;
}

export interface SeatingPlan {
  id: string;
  exam_date: string;
  time_slot: number;
  created_at: string;
  assignments: SeatingAssignment[];
}

export interface StudentInfo {
  roll_no: string;
  name: string;
}

export interface CourseStudentInput {
  subject_id: string;
  students: StudentInfo[];
}

export const classroomService = {
  async getClassrooms(): Promise<Classroom[]> {
    const res = await axios.get(`${API_URL}/classrooms`);
    return res.data;
  },

  async createClassroom(data: {
    room_number: string;
    capacity: number;
    rows: number;
    cols: number;
    room_type: string;
    department_id: string | null;
  }): Promise<Classroom> {
    const res = await axios.post(`${API_URL}/classrooms`, data);
    return res.data;
  },

  async updateClassroom(id: string, data: {
    room_number: string;
    capacity: number;
    rows: number;
    cols: number;
    room_type: string;
    department_id: string | null;
  }): Promise<Classroom> {
    const res = await axios.put(`${API_URL}/classrooms/${id}`, data);
    return res.data;
  },

  async deleteClassroom(id: string): Promise<any> {
    const res = await axios.delete(`${API_URL}/classrooms/${id}`);
    return res.data;
  },

  async generateSeatingPlan(data: {
    exam_date: string;
    time_slot: number;
    classroom_ids: string[];
    courses: CourseStudentInput[];
  }): Promise<SeatingPlan> {
    const res = await axios.post(`${API_URL}/seating-plans/generate`, data);
    return res.data;
  },

  async getSeatingPlans(): Promise<SeatingPlan[]> {
    const res = await axios.get(`${API_URL}/seating-plans`);
    return res.data;
  },

  async getSeatingPlan(id: string): Promise<SeatingPlan> {
    const res = await axios.get(`${API_URL}/seating-plans/${id}`);
    return res.data;
  }
};
