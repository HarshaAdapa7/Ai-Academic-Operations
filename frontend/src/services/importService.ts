import axios from 'axios';
import { API_URL } from '../context/AuthContext';

export interface ImportHistoryItem {
  id: string;
  department_name: string;
  department_code: string;
  uploaded_by: string;
  file_name: string;
  file_type: string;
  upload_time: string;
  total_records: number;
  successful_records: number;
  failed_records: number;
  warning_records: number;
  missing_fields_count: number;
  import_status: string;
  errors_preview?: string[];
}

export interface StagingRecord {
  id: string;
  row_number: number;
  entity_type: string;
  raw_data: Record<string, any>;
  validation_status: string;
  missing_fields: string[];
  error_messages: string[];
}

export interface UploadResponse {
  import_id: string;
  department: { id: string; name: string; code: string };
  file_name: string;
  total_records: number;
  valid_records: number;
  failed_records: number;
  warning_records: number;
  missing_fields_count: number;
  import_status: string;
  validation_errors: string[];
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

export const importService = {
  async uploadDepartmentData(file: File, departmentId?: string): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (departmentId) {
      formData.append('department_id', departmentId);
    }
    const res = await axios.post(`${API_URL}/import/upload`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
        ...getAuthHeaders().headers
      }
    });
    return res.data;
  },

  async getStagingPreview(importId: string, statusFilter?: string, entityFilter?: string) {
    const params: Record<string, string> = {};
    if (statusFilter) params.status_filter = statusFilter;
    if (entityFilter) params.entity_filter = entityFilter;

    const res = await axios.get(`${API_URL}/import/staging/${importId}`, {
      params,
      ...getAuthHeaders()
    });
    return res.data;
  },

  async remediateRecord(importId: string, recordId: string, updatedData: Record<string, any>) {
    const res = await axios.put(`${API_URL}/import/staging/${importId}/record/${recordId}`, updatedData, getAuthHeaders());
    return res.data;
  },

  async confirmCommit(importId: string) {
    const res = await axios.post(`${API_URL}/import/confirm/${importId}`, {}, getAuthHeaders());
    return res.data;
  },

  async getImportHistory(departmentId?: string): Promise<{ history: ImportHistoryItem[] }> {
    const params = departmentId ? { department_id: departmentId } : {};
    const res = await axios.get(`${API_URL}/import/history`, {
      params,
      ...getAuthHeaders()
    });
    return res.data;
  },

  async clearDepartmentData(departmentId?: string): Promise<{ message: string; deleted_sections: number; deleted_subjects: number; deleted_faculty_users: number }> {
    const res = await axios.post(`${API_URL}/import/clear-department-data`, { department_id: departmentId }, getAuthHeaders());
    return res.data;
  }
};
