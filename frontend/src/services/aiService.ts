import axios from 'axios';
import { API_URL } from '../context/AuthContext';

export interface AcademicPolicy {
  id: string;
  title: string;
  category: string;
  content: string;
  tags?: string | null;
  created_at: string;
}

export interface AISuggestedAction {
  action_type: string; // APPLY_SUBSTITUTION, AUTO_SOLVE_TIMETABLE, VIEW_FACULTY_AVAILABILITY, VIEW_ROOM_GRID
  label: string;
  payload_json: string;
}

export interface AIMessage {
  id: string;
  sender_role: 'user' | 'assistant';
  content: string;
  suggested_actions_json?: string | null;
  created_at: string;
}

export interface AIConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: AIMessage[];
}

export interface AIChatOutput {
  conversation_id: string;
  reply: string;
  suggested_actions: AISuggestedAction[];
}

export interface FacultyWorkloadMetric {
  faculty_id: string;
  faculty_name: string;
  department_code: string;
  assigned_slots: number;
  max_weekly_workload: number;
  utilization_percentage: number;
  status: 'OVERUTILIZED' | 'OPTIMAL' | 'UNDERUTILIZED';
}

export interface ClassroomUtilizationMetric {
  classroom_id: string;
  room_number: string;
  room_type: string;
  capacity: number;
  booked_slots: number;
  total_available_slots: number;
  occupancy_percentage: number;
}

export interface AnalyticsDashboardOutput {
  total_faculty: number;
  total_classrooms: number;
  total_timetable_slots: number;
  average_faculty_utilization: number;
  average_room_occupancy: number;
  workload_metrics: FacultyWorkloadMetric[];
  classroom_metrics: ClassroomUtilizationMetric[];
}

export const aiService = {
  async sendChatMessage(prompt: string, conversationId?: string, departmentId?: string): Promise<AIChatOutput> {
    const res = await axios.post(`${API_URL}/ai/chat`, {
      prompt,
      conversation_id: conversationId || null,
      department_id: departmentId || null
    });
    return res.data;
  },

  async getConversations(): Promise<AIConversation[]> {
    const res = await axios.get(`${API_URL}/ai/conversations`);
    return res.data;
  },

  async getAnalyticsDashboard(departmentId?: string): Promise<AnalyticsDashboardOutput> {
    const params = departmentId ? { department_id: departmentId } : {};
    const res = await axios.get(`${API_URL}/ai/analytics/dashboard`, { params });
    return res.data;
  },

  async getAcademicPolicies(category?: string): Promise<AcademicPolicy[]> {
    const params = category ? { category } : {};
    const res = await axios.get(`${API_URL}/ai/policies`, { params });
    return res.data;
  },

  async createAcademicPolicy(data: {
    title: string;
    category: string;
    content: string;
    tags?: string;
  }): Promise<AcademicPolicy> {
    const res = await axios.post(`${API_URL}/ai/policies`, data);
    return res.data;
  }
};
