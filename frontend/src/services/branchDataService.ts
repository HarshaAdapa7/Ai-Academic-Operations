import axios from 'axios';
import { API_URL } from '../context/AuthContext';
import type { Subject } from './facultyService';

export interface SectionSubjectTeacherLink {
  section_id: string;
  section_name: string;
  subject_id: string;
  subject_code: string;
  subject_name: string;
  faculty_id: string;
  faculty_name: string;
  faculty_email: string;
}

export const branchDataService = {
  async getSectionSubjectTeachers(departmentId?: string): Promise<SectionSubjectTeacherLink[]> {
    const params: any = {};
    if (departmentId) params.department_id = departmentId;
    const res = await axios.get(`${API_URL}/section-subject-teachers`, { params });
    return res.data;
  },

  async assignSectionSubjectTeacher(data: {
    section_id: string;
    subject_id: string;
    faculty_id: string;
  }): Promise<any> {
    const res = await axios.post(`${API_URL}/section-subject-teachers`, data);
    return res.data;
  },

  async deleteSectionSubjectTeacher(sectionId: string, subjectId: string, facultyId: string): Promise<any> {
    const res = await axios.delete(`${API_URL}/section-subject-teachers`, {
      params: {
        section_id: sectionId,
        subject_id: subjectId,
        faculty_id: facultyId
      }
    });
    return res.data;
  },

  async updateSubject(id: string, data: any): Promise<Subject> {
    const res = await axios.put(`${API_URL}/subjects/${id}`, data);
    return res.data;
  }
};
