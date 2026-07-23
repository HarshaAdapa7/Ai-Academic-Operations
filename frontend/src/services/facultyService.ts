import axios from 'axios';
import { API_URL } from '../context/AuthContext';

export interface Department {
  id: string;
  name: string;
  code: string;
  created_at: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  department_id: string;
  credits: number;
  subject_type: 'THEORY' | 'LAB' | 'ELECTIVE' | 'COUNSELLING' | 'SPORTS_LIBRARY';
  is_parallel_lab: boolean;
  parallel_subject_id: string | null;
  academic_year: number;
  created_at: string;
  parallel_subject?: Subject | null;
}

export interface UserMini {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

export interface FacultyProfile {
  id: string;
  user_id: string;
  department_id: string | null;
  designation: string;
  is_hod: boolean;
  is_dean: boolean;
  max_weekly_workload: number;
  current_weekly_workload: number;
  office_hours: string | null;
  created_at: string;
  user: UserMini;
  department: Department | null;
  subjects: Subject[];
}

export interface SectionConfig {
  id: string;
  department_id: string;
  academic_year: number;
  name: string;
  class_teacher_id?: string | null;
  created_at: string;
  department?: Department | null;
  class_teacher?: FacultyProfile | null;
  counseling_mentors?: FacultyProfile[];
}

export interface AvailabilityItem {
  day_of_week: string;
  time_slot: number;
  is_available: boolean;
}

export const facultyService = {
  // Users
  async getUsers(): Promise<UserMini[]> {
    const res = await axios.get(`${API_URL}/users`);
    return res.data;
  },

  // Departments
  async getDepartments(): Promise<Department[]> {
    const res = await axios.get(`${API_URL}/departments`);
    return res.data;
  },

  async createDepartment(data: { name: string; code: string }): Promise<Department> {
    const res = await axios.post(`${API_URL}/departments`, data);
    return res.data;
  },

  async updateDepartment(id: string, data: { name: string; code: string }): Promise<Department> {
    const res = await axios.put(`${API_URL}/departments/${id}`, data);
    return res.data;
  },

  async deleteDepartment(id: string): Promise<any> {
    const res = await axios.delete(`${API_URL}/departments/${id}`);
    return res.data;
  },

  // Subjects
  async getSubjects(departmentId?: string): Promise<Subject[]> {
    const params = departmentId ? { department_id: departmentId } : {};
    const res = await axios.get(`${API_URL}/subjects`, { params });
    return res.data;
  },

  async createSubject(data: {
    name: string;
    code: string;
    department_id: string;
    credits?: number;
    subject_type?: string;
    is_parallel_lab?: boolean;
    parallel_subject_id?: string | null;
    academic_year?: number;
  }): Promise<Subject> {
    const res = await axios.post(`${API_URL}/subjects`, data);
    return res.data;
  },

  async updateSubject(
    id: string,
    data: {
      name: string;
      code: string;
      department_id: string;
      credits?: number;
      subject_type?: string;
      is_parallel_lab?: boolean;
      parallel_subject_id?: string | null;
      academic_year?: number;
    }
  ): Promise<Subject> {
    const res = await axios.put(`${API_URL}/subjects/${id}`, data);
    return res.data;
  },

  async deleteSubject(id: string): Promise<any> {
    const res = await axios.delete(`${API_URL}/subjects/${id}`);
    return res.data;
  },

  // Faculty Profiles
  async getFacultyProfiles(departmentId?: string): Promise<FacultyProfile[]> {
    const params = departmentId ? { department_id: departmentId } : {};
    const res = await axios.get(`${API_URL}/faculty`, { params });
    return res.data;
  },

  async createFacultyProfile(data: {
    user_id: string;
    department_id?: string;
    designation: string;
    is_hod?: boolean;
    is_dean?: boolean;
    max_weekly_workload?: number;
    office_hours?: string;
    subject_ids?: string[];
  }): Promise<FacultyProfile> {
    const res = await axios.post(`${API_URL}/faculty`, data);
    return res.data;
  },

  async updateFacultyProfile(
    id: string,
    data: {
      department_id?: string;
      designation: string;
      is_hod?: boolean;
      is_dean?: boolean;
      max_weekly_workload?: number;
      office_hours?: string;
      subject_ids?: string[];
    }
  ): Promise<FacultyProfile> {
    const res = await axios.put(`${API_URL}/faculty/${id}`, data);
    return res.data;
  },

  async deleteFacultyProfile(id: string): Promise<any> {
    const res = await axios.delete(`${API_URL}/faculty/${id}`);
    return res.data;
  },

  // Section Configs & Mentors
  async getSectionConfigs(): Promise<SectionConfig[]> {
    const res = await axios.get(`${API_URL}/sections/configs`);
    return res.data;
  },

  async saveSectionConfig(data: {
    department_id: string;
    academic_year: number;
    name: string;
    class_teacher_id?: string | null;
    counseling_mentor_ids?: string[];
  }): Promise<SectionConfig> {
    const res = await axios.post(`${API_URL}/sections/configs`, data);
    return res.data;
  },

  // CSV, Excel & Picture OCR Importers
  async importFacultyCSV(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await axios.post(`${API_URL}/import/master-data`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data;
  },

  async importMasterExcelCSV(file: File): Promise<any> {
    return this.importFacultyCSV(file);
  },

  async clearSemesterData(keepFaculty: boolean = true): Promise<any> {
    const res = await axios.delete(`${API_URL}/faculty/clear-semester-data?keep_faculty=${keepFaculty}`);
    return res.data;
  },

  async importFacultyOCR(file: File): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await axios.post(`${API_URL}/import/ocr`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return res.data;
  },

  // Faculty Availability
  async getFacultyAvailability(facultyId: string): Promise<AvailabilityItem[]> {
    const res = await axios.get(`${API_URL}/faculty/${facultyId}/availability`);
    return res.data;
  },

  async getAvailability(facultyId: string): Promise<AvailabilityItem[]> {
    return this.getFacultyAvailability(facultyId);
  },

  async updateFacultyAvailability(facultyId: string, availabilities: AvailabilityItem[]): Promise<any> {
    const res = await axios.put(`${API_URL}/faculty/${facultyId}/availability`, { availabilities });
    return res.data;
  },

  async updateAvailability(facultyId: string, availabilities: AvailabilityItem[]): Promise<any> {
    return this.updateFacultyAvailability(facultyId, availabilities);
  }
};
