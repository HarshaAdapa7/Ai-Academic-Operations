import axios from 'axios';
import { API_URL } from '../context/AuthContext';
import type { Subject, FacultyProfile } from './facultyService';

export interface LeaveBalance {
  id: string;
  faculty_id: string;
  leave_type: string;
  total_allowed: number;
  taken: number;
}

export interface SubProposal {
  id: string;
  leave_request_id: string;
  day_of_week: string;
  time_slot: number;
  subject_id: string;
  original_faculty_id: string;
  substitute_faculty_id: string;
  status: string;
  created_at: string;
  subject: Subject;
  original_faculty?: FacultyProfile;
  substitute_faculty?: FacultyProfile;
}

export interface LeaveRequest {
  id: string;
  faculty_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  created_at: string;
  substitution_proposals: SubProposal[];
}

export interface DailyBulletin {
  title: string;
  headline: string;
  bullets: string[];
}

export const leaveService = {
  async getLeaveBalances(): Promise<LeaveBalance[]> {
    const res = await axios.get(`${API_URL}/leaves/balances`);
    return res.data;
  },

  async getLeaveRequests(): Promise<LeaveRequest[]> {
    const res = await axios.get(`${API_URL}/leaves`);
    return res.data;
  },

  async applyLeave(data: {
    leave_type: string;
    start_date: string;
    end_date: string;
    reason: string;
    substitution_proposals: {
      day_of_week: string;
      time_slot: number;
      subject_id: string;
      substitute_faculty_id: string;
    }[];
  }): Promise<LeaveRequest> {
    const res = await axios.post(`${API_URL}/leaves`, data);
    return res.data;
  },

  async updateLeaveStatus(id: string, status: 'APPROVED' | 'REJECTED'): Promise<any> {
    const res = await axios.put(`${API_URL}/leaves/${id}/status`, { status });
    return res.data;
  },

  async getEligibleSubstitutes(params: {
    day_of_week: string;
    time_slot: number;
    subject_id: string;
  }): Promise<FacultyProfile[]> {
    const res = await axios.get(`${API_URL}/leaves/substitutes/eligible`, {
      params
    });
    return res.data;
  },

  async getMySubProposals(): Promise<SubProposal[]> {
    const res = await axios.get(`${API_URL}/substitutions/my-proposals`);
    return res.data;
  },

  async respondSubProposal(id: string, status: 'ACCEPTED' | 'DECLINED'): Promise<any> {
    const res = await axios.put(`${API_URL}/substitutions/${id}/status`, null, {
      params: { status_update: status }
    });
    return res.data;
  },

  async getDailyBulletin(): Promise<DailyBulletin> {
    const res = await axios.get(`${API_URL}/dashboard/bulletin`);
    return res.data;
  }
};
