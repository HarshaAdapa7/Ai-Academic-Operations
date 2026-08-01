import axios from 'axios';
import { API_URL } from '../context/AuthContext';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  category: string;
  priority: string;
  action_url?: string;
  action_payload?: any;
  is_read: boolean;
  created_at: string;
}

export interface DepartmentLeaveCount {
  department_id: string;
  department_code: string;
  department_name: string;
  absent_faculty_count: number;
}

export const notificationService = {
  async getNotifications(filters?: { category?: string; unread_only?: boolean }): Promise<AppNotification[]> {
    const res = await axios.get(`${API_URL}/notifications`, { params: filters });
    return res.data;
  },

  async getUnreadCount(): Promise<number> {
    const res = await axios.get(`${API_URL}/notifications/unread-count`);
    return res.data.unread_count || 0;
  },

  async getDepartmentLeaveCounts(): Promise<DepartmentLeaveCount[]> {
    const res = await axios.get(`${API_URL}/notifications/dept-leave-counts`);
    return res.data;
  },

  async markRead(notificationIds: string[]): Promise<void> {
    await axios.post(`${API_URL}/notifications/mark-read`, { notification_ids: notificationIds });
  },

  async markAllRead(): Promise<void> {
    await axios.post(`${API_URL}/notifications/mark-all-read`);
  },

  async deleteNotification(id: string): Promise<void> {
    await axios.delete(`${API_URL}/notifications/${id}`);
  },

  async triggerDailyEmails(): Promise<any> {
    const res = await axios.post(`${API_URL}/notifications/dispatch-daily-emails`);
    return res.data;
  }
};
