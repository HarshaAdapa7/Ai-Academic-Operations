import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { facultyService } from '../services/facultyService';
import type { Department } from '../services/facultyService';
import { importService } from '../services/importService';
import type { ImportHistoryItem, StagingRecord, UploadResponse } from '../services/importService';
import { 
  ChevronLeft, Upload, FileSpreadsheet, AlertTriangle, ShieldCheck, 
  CheckCircle2, Clock, RefreshCw, Database, FileText, 
  AlertCircle, Lock, Download, Edit3, Trash2
} from 'lucide-react';

import { getUserDeptId, isUserAdminOrDean } from '../utils/security';

interface DepartmentDataImportViewProps {
  onBack: () => void;
}

export const DepartmentDataImportView: React.FC<DepartmentDataImportViewProps> = ({ onBack }) => {
  const { user } = useAuth();
  
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  
  // File upload & staging states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  
  // Staging preview states
  const [activeImportId, setActiveImportId] = useState<string | null>(null);
  const [stagingRecords, setStagingRecords] = useState<StagingRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [entityFilter, setEntityFilter] = useState<string>('ALL');
  const [isLoadingStaging, setIsLoadingStaging] = useState(false);
  
  // Inline edit / remediation modal state
  const [editRecord, setEditRecord] = useState<StagingRecord | null>(null);
  const [editFormData, setEditFormData] = useState<Record<string, any>>({});
  const [isSavingRemediation, setIsSavingRemediation] = useState(false);

  // Commit workflow states
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<any | null>(null);

  // Clear Department Data states
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isClearingData, setIsClearingData] = useState(false);
  const [clearSuccessMsg, setClearSuccessMsg] = useState('');

  // Import history states
  const [historyItems, setHistoryItems] = useState<ImportHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Load departments & user context
  useEffect(() => {
    const initData = async () => {
      try {
        const depts = await facultyService.getDepartments();
        setDepartments(depts);
        
        const userDeptId = getUserDeptId(user, depts);
        const isAdmin = isUserAdminOrDean(user);

        if (!isAdmin && userDeptId) {
          setSelectedDeptId(userDeptId);
        } else if (userDeptId) {
          setSelectedDeptId(userDeptId);
        } else if (depts.length > 0) {
          setSelectedDeptId(depts[0].id);
        }
      } catch (err) {
        console.error('Failed to load departments:', err);
      }
    };
    initData();
  }, [user]);

  // Load import history
  const loadHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const res = await importService.getImportHistory(selectedDeptId || undefined);
      setHistoryItems(res.history);
    } catch (err) {
      console.error('Failed to load import audit history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [selectedDeptId]);

  const activeDepartment = departments.find(d => d.id === selectedDeptId);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  // Handle File Upload & Parsing
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Please select a CSV or Excel file to upload.');
      return;
    }
    setUploadError('');
    setIsUploading(true);
    try {
      const res = await importService.uploadDepartmentData(selectedFile, selectedDeptId);
      setUploadResult(res);
      setActiveImportId(res.import_id);
      await loadStagingPreview(res.import_id);
      await loadHistory();
    } catch (err: any) {
      setUploadError(err.response?.data?.detail || 'Failed to parse and stage uploaded file.');
    } finally {
      setIsUploading(false);
    }
  };

  // Load Staging Preview
  const loadStagingPreview = async (importId: string, sFilter?: string, eFilter?: string) => {
    try {
      setIsLoadingStaging(true);
      const data = await importService.getStagingPreview(
        importId,
        sFilter !== 'ALL' ? sFilter : undefined,
        eFilter !== 'ALL' ? eFilter : undefined
      );
      setStagingRecords(data.records);
    } catch (err) {
      console.error('Failed to load staging preview:', err);
    } finally {
      setIsLoadingStaging(false);
    }
  };

  useEffect(() => {
    if (activeImportId) {
      loadStagingPreview(activeImportId, statusFilter, entityFilter);
    }
  }, [activeImportId, statusFilter, entityFilter]);

  // Open Remediation Modal
  const handleOpenRemediate = (rec: StagingRecord) => {
    setEditRecord(rec);
    setEditFormData({ ...rec.raw_data });
  };

  // Submit Remediation
  const handleSaveRemediation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRecord || !activeImportId) return;
    setIsSavingRemediation(true);
    try {
      await importService.remediateRecord(activeImportId, editRecord.id, editFormData);
      setEditRecord(null);
      await loadStagingPreview(activeImportId, statusFilter, entityFilter);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save record remediation.');
    } finally {
      setIsSavingRemediation(false);
    }
  };

  // Confirm Commit to Production
  const handleConfirmCommit = async () => {
    if (!activeImportId) return;
    setIsCommitting(true);
    try {
      const res = await importService.confirmCommit(activeImportId);
      setCommitResult(res);
      setIsConfirmModalOpen(false);
      await loadHistory();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to commit records to production.');
    } finally {
      setIsCommitting(false);
    }
  };

  // Clear Department Data for New Semester
  const handleClearDepartmentData = async () => {
    setIsClearingData(true);
    setClearSuccessMsg('');
    try {
      const res = await importService.clearDepartmentData(selectedDeptId || undefined);
      setClearSuccessMsg(res.message || `Successfully cleared all semester data (${res.deleted_sections} sections, ${res.deleted_subjects} subjects, ${res.deleted_faculty_users} faculty users). You can now import fresh semester data!`);
      setIsClearModalOpen(false);
      setActiveImportId(null);
      setUploadResult(null);
      setStagingRecords([]);
      await loadHistory();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to clear department data.');
    } finally {
      setIsClearingData(false);
    }
  };

  // Download Sample Template CSV helper
  const handleDownloadSampleTemplate = (type: 'faculty' | 'subject' | 'section' | 'classroom' | 'master') => {
    let csvContent = "";
    let fileName = "";

    if (type === 'master') {
      fileName = "csd_master_import.csv";
      csvContent = "Department,DepartmentName,AcademicYear,SectionName,SubjectCode,SubjectName,SubjectType,FacultyEmail,FacultyName,Designation,IsHOD,IsDean,IsClassTeacher,MentorEmail,RoomNumber,Capacity,RoomType,Lectures per week,Labs per week,Lab duration\n" +
                 "CSD,Computer Science & Data Science,2,CSD 2-A,23CD4111,DATA STRUCTURES(DS),THEORY,y.satish.kumar@anits.edu.in,Mr. Y Satish Kumar,Assistant Professor,FALSE,FALSE,FALSE,,I-503,60,THEORY,4,0,1\n" +
                 "CSD,Computer Science & Data Science,2,CSD 2-A,23CD4211,CN & OS LAB,LAB,y.satish.kumar@anits.edu.in,Mr. Y Satish Kumar,Assistant Professor,FALSE,FALSE,FALSE,,I-508,60,LAB,0,1,3\n" +
                 "CSD,Computer Science & Data Science,3,CSD 3-A,23CD9204,R PROGRAMMING,THEORY,s.aruna.jyothi@anits.edu.in,Mrs. S Aruna Jyothi,Assistant Professor,FALSE,FALSE,FALSE,,I-506,60,THEORY,4,0,1\n";
    } else if (type === 'faculty') {
      fileName = "sample_faculty_import.csv";
      csvContent = "full_name,email,designation,max_weekly_workload\n" +
                 "Dr. A. Srinivas Rao,srinivas_cse@anits.edu.in,Professor,16\n" +
                 "Mrs. K. Swathi,swathi_cse@anits.edu.in,Assistant Professor,18\n";
    } else if (type === 'subject') {
      fileName = "sample_subjects_hours_import.csv";
      csvContent = "subject_code,subject_name,credits,subject_type,weekly_hours,academic_year\n" +
                 "23CS4111,Data Structures & Algorithms,4,THEORY,4,2\n" +
                 "23CS4211,Data Structures Lab,2,LAB,3,2\n" +
                 "23CT2101,Quantitative Aptitude - I,2,THEORY,2,2\n";
    } else if (type === 'section') {
      fileName = "sample_sections_import.csv";
      csvContent = "section_name,academic_year\n" +
                 "CSE 2-A,2\n" +
                 "CSE 2-B,2\n" +
                 "CSE 3-A,3\n";
    } else if (type === 'classroom') {
      fileName = "sample_classrooms_import.csv";
      csvContent = "room_number,building_name,capacity,room_type\n" +
                 "C-207,Main Block,60,THEORY\n" +
                 "LAB-301,IT Block,35,LAB\n";
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-6">
      {/* Top Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/80 p-4 rounded-xl border border-slate-800 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <button 
            onClick={onBack}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-400" />
              Department Data Collection & Secure Import Portal
            </h1>
            <p className="text-xs text-slate-400">
              Department-wise secure ingestion, validation staging, and production database commit
            </p>
          </div>
        </div>

        {/* Security Isolation Badge */}
        <div className="flex items-center space-x-3">
          {user?.role === 'ADMIN' && departments.length > 0 && (
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400 font-medium">Select Dept:</span>
              <select
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="bg-slate-800 text-white text-xs border border-slate-700 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500"
              >
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 bg-indigo-950/60 border border-indigo-700/50 text-indigo-300 text-xs px-3 py-1.5 rounded-lg">
            <Lock className="w-3.5 h-3.5 text-indigo-400" />
            <span>Scope: <strong className="text-white">{activeDepartment?.name || 'All Departments'}</strong></span>
          </div>

          <button
            onClick={() => setIsClearModalOpen(true)}
            className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm"
            title="Clear department section, subject, classroom and faculty data for new semester import"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Semester Data</span>
          </button>
        </div>
      </div>

      {/* Clear Department Data Success Banner */}
      {clearSuccessMsg && (
        <div className="bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 p-4 rounded-xl flex items-center justify-between text-sm shadow-lg animate-in fade-in">
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{clearSuccessMsg}</span>
          </div>
          <button 
            onClick={() => setClearSuccessMsg('')}
            className="text-xs bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 px-3 py-1 rounded-lg transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Security Lock Banner Notice */}
      <div className="bg-gradient-to-r from-indigo-950/40 via-slate-900 to-purple-950/40 p-4 rounded-xl border border-indigo-800/40 flex items-start gap-3">
        <ShieldCheck className="w-6 h-6 text-indigo-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <h3 className="font-semibold text-indigo-200 text-sm">Enterprise Security Scoping Active</h3>
          <p className="text-slate-300">
            Records uploaded via this portal are automatically scoped to <strong>{activeDepartment?.name || 'your department'} ({activeDepartment?.code})</strong>. Cross-department dataset tampering or header overrides are strictly blocked at the backend level.
          </p>
        </div>
      </div>

      {/* Section 1: File Upload & Staging Zone */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Upload className="w-5 h-5 text-indigo-400" />
              1. Upload Department File (CSV or Excel)
            </h2>
            <p className="text-xs text-slate-400">
              Upload your department's Faculty, Subjects & Weekly Hours, Sections, and Classrooms
            </p>
          </div>

          {/* Download Sample Templates */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">Download Templates:</span>
            <button 
              onClick={() => handleDownloadSampleTemplate('master')}
              className="text-xs bg-indigo-900/80 hover:bg-indigo-800 text-indigo-200 font-semibold px-3 py-1 rounded border border-indigo-700/60 flex items-center gap-1 shadow-sm"
              title="Download full 20-column Master CSV template for all department data"
            >
              <Download className="w-3 h-3 text-indigo-400" /> Master All-in-One CSV (20 Cols)
            </button>
            <button 
              onClick={() => handleDownloadSampleTemplate('faculty')}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1"
            >
              <Download className="w-3 h-3 text-indigo-400" /> Faculty
            </button>
            <button 
              onClick={() => handleDownloadSampleTemplate('subject')}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1"
            >
              <Download className="w-3 h-3 text-emerald-400" /> Subjects & Hours
            </button>
            <button 
              onClick={() => handleDownloadSampleTemplate('section')}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1"
            >
              <Download className="w-3 h-3 text-amber-400" /> Sections
            </button>
            <button 
              onClick={() => handleDownloadSampleTemplate('classroom')}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1"
            >
              <Download className="w-3 h-3 text-cyan-400" /> Rooms
            </button>
          </div>
        </div>

        <form onSubmit={handleFileUpload} className="space-y-4">
          <div 
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="border-2 border-dashed border-slate-700 hover:border-indigo-500 transition-colors rounded-xl p-6 text-center cursor-pointer bg-slate-950/40"
          >
            <input 
              type="file" 
              accept=".csv, .xlsx, .xls"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="hidden" 
              id="file-upload-input" 
            />
            <label htmlFor="file-upload-input" className="cursor-pointer space-y-2 block">
              <FileSpreadsheet className="w-10 h-10 text-indigo-400 mx-auto" />
              <div>
                <span className="text-sm font-medium text-white">
                  {selectedFile ? selectedFile.name : 'Click to select or drag & drop file'}
                </span>
                <p className="text-xs text-slate-400">Supports .csv, .xlsx, and .xls spreadsheets</p>
              </div>
            </label>
          </div>

          {uploadError && (
            <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!selectedFile || isUploading}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm rounded-lg flex items-center gap-2 transition-colors shadow-lg shadow-indigo-600/20"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Parsing & Staging File...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Stage File for Validation
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Section 2: Missing Data Alerts & Validation Preview */}
      {uploadResult && (
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                2. Validation Staging Preview & Missing Data Checklist
              </h2>
              <p className="text-xs text-slate-400">
                Staged file: <strong className="text-white">{uploadResult.file_name}</strong>
              </p>
            </div>

            <button
              onClick={() => setIsConfirmModalOpen(true)}
              disabled={uploadResult.failed_records > 0 || uploadResult.valid_records === 0}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg flex items-center gap-2 transition-colors shadow-lg shadow-emerald-600/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              Confirm & Commit {uploadResult.valid_records} Records to Production
            </button>
          </div>

          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-1">
              <span className="text-xs text-slate-400">Total Staged Records</span>
              <div className="text-2xl font-bold text-white">{uploadResult.total_records}</div>
            </div>

            <div className="bg-emerald-950/30 p-4 rounded-xl border border-emerald-800/40 space-y-1">
              <span className="text-xs text-emerald-400">Valid Records</span>
              <div className="text-2xl font-bold text-emerald-300">{uploadResult.valid_records}</div>
            </div>

            <div className="bg-amber-950/30 p-4 rounded-xl border border-amber-800/40 space-y-1">
              <span className="text-xs text-amber-400">Missing Fields / Warnings</span>
              <div className="text-2xl font-bold text-amber-300">{uploadResult.missing_fields_count}</div>
            </div>

            <div className="bg-red-950/30 p-4 rounded-xl border border-red-800/40 space-y-1">
              <span className="text-xs text-red-400">Validation Errors</span>
              <div className="text-2xl font-bold text-red-300">{uploadResult.failed_records}</div>
            </div>
          </div>

          {/* Missing Data Checklist Panel */}
          {uploadResult.missing_fields_count > 0 && (
            <div className="bg-amber-950/40 border border-amber-800/60 p-4 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-amber-300 text-sm font-semibold">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                <span>Missing Data Reminders Checklist for Upload Person</span>
              </div>
              <p className="text-xs text-slate-300">
                The validation engine identified {uploadResult.missing_fields_count} missing values in your dataset. You can inline-edit the yellow rows below to complete missing fields before confirming commit.
              </p>
            </div>
          )}

          {/* Validation Filters */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            {/* Status Filter */}
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-slate-400 font-medium">Status Filter:</span>
              {['ALL', 'VALID', 'MISSING_DATA', 'INVALID'].map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 rounded-md text-xs transition-colors ${
                    statusFilter === st 
                      ? 'bg-indigo-600 text-white font-medium' 
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Entity Filter */}
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-slate-400 font-medium">Entity Filter:</span>
              {['ALL', 'FACULTY', 'SUBJECT', 'SECTION', 'CLASSROOM'].map(ef => (
                <button
                  key={ef}
                  onClick={() => setEntityFilter(ef)}
                  className={`px-3 py-1 rounded-md text-xs transition-colors ${
                    entityFilter === ef 
                      ? 'bg-indigo-600 text-white font-medium' 
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {ef}
                </button>
              ))}
            </div>
          </div>

          {/* Staging Preview Table */}
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-xs text-left text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-medium uppercase border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Row #</th>
                  <th className="px-4 py-3">Entity Type</th>
                  <th className="px-4 py-3">Parsed Details</th>
                  <th className="px-4 py-3">Validation Status</th>
                  <th className="px-4 py-3">Errors / Reminders</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
                {isLoadingStaging ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">Loading staging records...</td>
                  </tr>
                ) : stagingRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">No staging records match filter.</td>
                  </tr>
                ) : (
                  stagingRecords.map(rec => (
                    <tr key={rec.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-400">{rec.row_number}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-slate-800 text-indigo-300 rounded font-semibold text-[10px]">
                          {rec.entity_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-white">
                        {rec.entity_type === 'FACULTY' && (
                          <span>{rec.raw_data.full_name || rec.raw_data.name} ({rec.raw_data.email || 'NO EMAIL'})</span>
                        )}
                        {rec.entity_type === 'SUBJECT' && (
                          <span>{rec.raw_data.subject_code || rec.raw_data.code} - {rec.raw_data.subject_name || rec.raw_data.name} ({rec.raw_data.weekly_hours || rec.raw_data.lectures_per_week || 4} hrs/wk)</span>
                        )}
                        {rec.entity_type === 'SECTION' && (
                          <span>Section: {rec.raw_data.section_name || rec.raw_data.section} (Yr {rec.raw_data.academic_year || 1})</span>
                        )}
                        {rec.entity_type === 'CLASSROOM' && (
                          <span>Room: {rec.raw_data.room_number || rec.raw_data.room} (Cap: {rec.raw_data.capacity || 60})</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {rec.validation_status === 'VALID' && (
                          <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded font-semibold text-[10px]">VALID</span>
                        )}
                        {rec.validation_status === 'MISSING_DATA' && (
                          <span className="px-2 py-0.5 bg-amber-950 text-amber-300 border border-amber-800 rounded font-semibold text-[10px]">MISSING DATA</span>
                        )}
                        {rec.validation_status === 'INVALID' && (
                          <span className="px-2 py-0.5 bg-red-950 text-red-300 border border-red-800 rounded font-semibold text-[10px]">INVALID</span>
                        )}
                        {rec.validation_status === 'WARNING' && (
                          <span className="px-2 py-0.5 bg-yellow-950 text-yellow-300 border border-yellow-800 rounded font-semibold text-[10px]">WARNING</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300">
                        {rec.error_messages?.length > 0 ? (
                          <span className="text-red-400 font-medium">{rec.error_messages.join(', ')}</span>
                        ) : rec.missing_fields?.length > 0 ? (
                          <span className="text-amber-400 font-medium">Missing: {rec.missing_fields.join(', ')}</span>
                        ) : (
                          <span className="text-emerald-400 font-medium">Ready for commit</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleOpenRemediate(rec)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded border border-slate-700 text-[11px] flex items-center gap-1 ml-auto"
                        >
                          <Edit3 className="w-3 h-3" /> Fix / Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Section 3: Import Audit Trail & History */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-400" />
              3. Department Import Audit History
            </h2>
            <p className="text-xs text-slate-400">
              Audit trail of all data uploads, staging validations, and production commits
            </p>
          </div>

          <button
            onClick={loadHistory}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh History
          </button>
        </div>

        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-xs text-left text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-medium uppercase border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">File Name</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Uploaded By</th>
                <th className="px-4 py-3">Upload Time</th>
                <th className="px-4 py-3">Total / Valid / Errors</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
              {isLoadingHistory ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-slate-400">Loading import audit history...</td>
                </tr>
              ) : historyItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-slate-400">No previous import logs found.</td>
                </tr>
              ) : (
                historyItems.map(h => (
                  <tr key={h.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-white flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-indigo-400 shrink-0" />
                      {h.file_name}
                    </td>
                    <td className="px-4 py-3">{h.department_name} ({h.department_code})</td>
                    <td className="px-4 py-3">{h.uploaded_by}</td>
                    <td className="px-4 py-3 text-slate-400">{new Date(h.upload_time).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className="text-white font-semibold">{h.total_records}</span> total / <span className="text-emerald-400 font-semibold">{h.successful_records}</span> valid / <span className="text-red-400 font-semibold">{h.failed_records}</span> errors
                    </td>
                    <td className="px-4 py-3">
                      {h.import_status === 'CONFIRMED' && (
                        <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded font-semibold text-[10px]">CONFIRMED</span>
                      )}
                      {h.import_status === 'STAGED' && (
                        <span className="px-2 py-0.5 bg-indigo-950 text-indigo-300 border border-indigo-800 rounded font-semibold text-[10px]">STAGED</span>
                      )}
                      {h.import_status === 'VALIDATED' && (
                        <span className="px-2 py-0.5 bg-blue-950 text-blue-300 border border-blue-800 rounded font-semibold text-[10px]">VALIDATED</span>
                      )}
                      {h.import_status === 'NEEDS_REMEDIATION' && (
                        <span className="px-2 py-0.5 bg-amber-950 text-amber-300 border border-amber-800 rounded font-semibold text-[10px]">NEEDS REMEDIATION</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Remediation Edit Modal */}
      {editRecord && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-indigo-400" />
                Remediate Missing Data (Row {editRecord.row_number})
              </h3>
              <button onClick={() => setEditRecord(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSaveRemediation} className="space-y-3">
              {Object.keys(editFormData).map(key => (
                <div key={key} className="space-y-1">
                  <label className="text-slate-400 font-medium capitalize">{key.replace('_', ' ')}:</label>
                  <input
                    type="text"
                    value={editFormData[key] || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, [key]: e.target.value })}
                    className="w-full bg-slate-950 text-white border border-slate-800 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              ))}

              <div className="flex justify-end space-x-2 border-t border-slate-800 pt-3">
                <button
                  type="button"
                  onClick={() => setEditRecord(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingRemediation}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg flex items-center gap-1"
                >
                  {isSavingRemediation ? 'Saving...' : 'Save Remediation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 text-xs text-center">
            <Database className="w-12 h-12 text-emerald-400 mx-auto" />
            <h3 className="text-lg font-bold text-white">Confirm Production Database Commit</h3>
            <p className="text-slate-300">
              Are you sure you want to commit <strong>{uploadResult?.valid_records} valid records</strong> to the live production database for <strong>{activeDepartment?.name}</strong>?
            </p>
            <p className="text-xs text-amber-400 bg-amber-950/40 p-3 rounded-lg border border-amber-800/40">
              ⚡ This action executes inside an atomic database transaction.
            </p>

            <div className="flex justify-center space-x-3 pt-2">
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCommit}
                disabled={isCommitting}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg flex items-center gap-2 shadow-lg shadow-emerald-600/20"
              >
                {isCommitting ? 'Committing to DB...' : 'Confirm & Commit Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Commit Result Modal */}
      {commitResult && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-800/60 rounded-xl max-w-md w-full p-6 space-y-4 text-xs text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
            <h3 className="text-lg font-bold text-white">Production Commit Successful!</h3>
            <p className="text-slate-300">{commitResult.message}</p>
            
            <div className="bg-slate-950/80 p-4 rounded-xl text-left space-y-1 text-slate-300 font-mono">
              <div>Faculty Members Committed: <strong className="text-emerald-400">{commitResult.committed_faculty}</strong></div>
              <div>Subjects & Hours Committed: <strong className="text-emerald-400">{commitResult.committed_subjects}</strong></div>
              <div>Sections Committed: <strong className="text-emerald-400">{commitResult.committed_sections}</strong></div>
              <div>Classrooms Committed: <strong className="text-emerald-400">{commitResult.committed_rooms}</strong></div>
            </div>

            <button
              onClick={() => setCommitResult(null)}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg"
            >
              Done / Return to Portal
            </button>
          </div>
        </div>
      )}

      {/* Clear Department Data Confirmation Modal */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-800/80 rounded-2xl max-w-lg w-full p-6 space-y-5 text-slate-300 shadow-2xl">
            <div className="flex items-center space-x-3 text-rose-400">
              <AlertTriangle className="w-8 h-8 shrink-0" />
              <div>
                <h3 className="text-lg font-bold text-white">Clear Semester Data</h3>
                <p className="text-xs text-rose-300 font-medium">Action for New Semester Reset</p>
              </div>
            </div>

            <div className="bg-rose-950/40 border border-rose-900/50 rounded-xl p-4 text-xs space-y-2 leading-relaxed">
              <p className="text-rose-200 font-semibold">
                Are you sure you want to clear all semester database records for <strong className="text-white">{activeDepartment?.name || 'this department'}</strong>?
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-300 font-mono">
                <li>Wipes all Sections & Student configs for this department</li>
                <li>Wipes all Subjects & Weekly Hours rules for this department</li>
                <li>Wipes all Classrooms & Labs assigned to this department</li>
                <li>Deletes non-HOD Faculty login user accounts for this department</li>
                <li><strong className="text-emerald-400">HOD and Admin accounts will remain preserved and active!</strong></li>
              </ul>
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setIsClearModalOpen(false)}
                disabled={isClearingData}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleClearDepartmentData}
                disabled={isClearingData}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg text-xs flex items-center gap-2 shadow-lg shadow-rose-600/20 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                {isClearingData ? 'Clearing Semester Data...' : 'Yes, Clear All Semester Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
