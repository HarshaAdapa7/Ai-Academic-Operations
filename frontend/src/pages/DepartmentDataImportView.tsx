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
  const handleDownloadSampleTemplate = async (type: 'faculty' | 'subject' | 'section' | 'classroom' | 'master') => {
    if (type === 'master') {
      try {
        const blob = await importService.exportDepartmentData(selectedDeptId || undefined);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'csd_master_department_export.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err: any) {
        alert(err.response?.data?.detail || 'Failed to export department data.');
      }
      return;
    }

    let csvContent = "";
    let fileName = "";

    if (type === 'faculty') {
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
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-300 shadow-sm">
        <div className="flex items-center space-x-3">
          <button 
            onClick={onBack}
            className="p-2.5 bg-slate-100 border border-slate-300 hover:bg-slate-200 text-slate-800 font-bold rounded-xl transition-all shadow-sm"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Database className="w-5 h-5 text-blue-600" />
              Department Data Collection & Secure Import Portal
            </h1>
            <p className="text-xs text-slate-600 font-semibold">
              Department-wise secure ingestion, validation staging, and production database commit
            </p>
          </div>
        </div>

        {/* Security Isolation Badge */}
        <div className="flex items-center space-x-3">
          {user?.role === 'ADMIN' && departments.length > 0 && (
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-700 font-bold">Select Dept:</span>
              <select
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="bg-slate-50 text-slate-900 text-xs font-extrabold border border-slate-300 rounded-xl px-3 py-2 outline-none focus:border-blue-600 shadow-sm"
              >
                {departments.map(d => (
                  <option key={d.id} value={d.id} className="bg-white text-slate-900 font-bold">{d.name} ({d.code})</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-900 text-xs font-black px-3 py-2 rounded-xl">
            <Lock className="w-3.5 h-3.5 text-blue-600" />
            <span>Scope: <strong className="text-slate-900">{activeDepartment?.name || 'All Departments'}</strong></span>
          </div>

          <button
            onClick={() => setIsClearModalOpen(true)}
            className="flex items-center gap-1.5 bg-red-50 border border-red-300 text-red-700 hover:bg-red-100 text-xs font-extrabold px-3.5 py-2 rounded-xl transition-all shadow-sm"
            title="Clear department section, subject, classroom and faculty data for new semester import"
          >
            <Trash2 className="w-3.5 h-3.5 text-red-600" />
            <span>Clear Semester Data</span>
          </button>
        </div>
      </div>

      {/* Clear Department Data Success Banner */}
      {clearSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 p-4 rounded-2xl flex items-center justify-between text-sm shadow-sm font-bold animate-in fade-in">
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{clearSuccessMsg}</span>
          </div>
          <button 
            onClick={() => setClearSuccessMsg('')}
            className="text-xs bg-emerald-100 hover:bg-emerald-200 text-emerald-900 px-3 py-1 rounded-lg transition-colors font-extrabold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Security Lock Banner Notice */}
      <div className="bg-blue-50 p-4 rounded-2xl border border-blue-200 flex items-start gap-3 shadow-sm">
        <ShieldCheck className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <h3 className="font-black text-blue-950 text-sm">Enterprise Security Scoping Active</h3>
          <p className="text-slate-700 font-semibold">
            Records uploaded via this portal are automatically scoped to <strong>{activeDepartment?.name || 'your department'} ({activeDepartment?.code})</strong>. Cross-department dataset tampering or header overrides are strictly blocked at the backend level.
          </p>
        </div>
      </div>

      {/* Section 1: File Upload & Staging Zone */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-sm p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-600" />
              1. Upload Department File (CSV or Excel)
            </h2>
            <p className="text-xs text-slate-600 font-semibold">
              Upload your department's Faculty, Subjects & Weekly Hours, Sections, and Classrooms
            </p>
          </div>

          {/* Download Sample Templates */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-700 font-bold">Download Templates:</span>
            <button 
              onClick={() => handleDownloadSampleTemplate('master')}
              className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-900 font-black px-3 py-1.5 rounded-xl border border-blue-300 flex items-center gap-1 shadow-sm"
              title="Download full 20-column Master CSV template for all department data"
            >
              <Download className="w-3 h-3 text-blue-600" /> Master All-in-One CSV (20 Cols)
            </button>
            <button 
              onClick={() => handleDownloadSampleTemplate('faculty')}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-900 font-extrabold px-2.5 py-1.5 rounded-xl border border-slate-300 flex items-center gap-1 shadow-sm"
            >
              <Download className="w-3 h-3 text-blue-600" /> Faculty
            </button>
            <button 
              onClick={() => handleDownloadSampleTemplate('subject')}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-900 font-extrabold px-2.5 py-1.5 rounded-xl border border-slate-300 flex items-center gap-1 shadow-sm"
            >
              <Download className="w-3 h-3 text-emerald-600" /> Subjects & Hours
            </button>
            <button 
              onClick={() => handleDownloadSampleTemplate('section')}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-900 font-extrabold px-2.5 py-1.5 rounded-xl border border-slate-300 flex items-center gap-1 shadow-sm"
            >
              <Download className="w-3 h-3 text-amber-600" /> Sections
            </button>
            <button 
              onClick={() => handleDownloadSampleTemplate('classroom')}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-900 font-extrabold px-2.5 py-1.5 rounded-xl border border-slate-300 flex items-center gap-1 shadow-sm"
            >
              <Download className="w-3 h-3 text-indigo-600" /> Rooms
            </button>
          </div>
        </div>

        <form onSubmit={handleFileUpload} className="space-y-4">
          <div 
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="border-2 border-dashed border-slate-300 hover:border-blue-600 transition-colors rounded-2xl p-6 text-center cursor-pointer bg-slate-50"
          >
            <input 
              type="file" 
              accept=".csv, .xlsx, .xls"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="hidden" 
              id="file-upload-input" 
            />
            <label htmlFor="file-upload-input" className="cursor-pointer space-y-2 block">
              <FileSpreadsheet className="w-10 h-10 text-blue-600 mx-auto" />
              <div>
                <span className="text-sm font-black text-slate-900">
                  {selectedFile ? selectedFile.name : 'Click to select or drag & drop file'}
                </span>
                <p className="text-xs text-slate-600 font-semibold">Supports .csv, .xlsx, and .xls spreadsheets</p>
              </div>
            </label>
          </div>

          {uploadError && (
            <div className="p-3 bg-red-50 border border-red-300 text-red-800 text-xs rounded-xl flex items-center gap-2 font-bold">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!selectedFile || isUploading}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold text-sm rounded-xl flex items-center gap-2 transition-all shadow-md shadow-blue-600/20"
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
        <div className="bg-white rounded-2xl border border-slate-300 shadow-sm p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                2. Validation Staging Preview & Missing Data Checklist
              </h2>
              <p className="text-xs text-slate-600 font-semibold">
                Staged file: <strong className="text-slate-900">{uploadResult.file_name}</strong>
              </p>
            </div>

            <button
              onClick={() => setIsConfirmModalOpen(true)}
              disabled={uploadResult.failed_records > 0 || uploadResult.valid_records === 0}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-extrabold rounded-xl flex items-center gap-2 transition-all shadow-md shadow-emerald-600/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              Confirm & Commit {uploadResult.valid_records} Records to Production
            </button>
          </div>

          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-300 space-y-1 shadow-sm">
              <span className="text-xs text-slate-600 font-bold">Total Staged Records</span>
              <div className="text-2xl font-black text-slate-900">{uploadResult.total_records}</div>
            </div>

            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-300 space-y-1 shadow-sm">
              <span className="text-xs text-emerald-800 font-black">Valid Records</span>
              <div className="text-2xl font-black text-emerald-900">{uploadResult.valid_records}</div>
            </div>

            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-300 space-y-1 shadow-sm">
              <span className="text-xs text-amber-800 font-black">Missing Fields / Warnings</span>
              <div className="text-2xl font-black text-amber-900">{uploadResult.missing_fields_count}</div>
            </div>

            <div className="bg-red-50 p-4 rounded-2xl border border-red-300 space-y-1 shadow-sm">
              <span className="text-xs text-red-800 font-black">Validation Errors</span>
              <div className="text-2xl font-black text-red-900">{uploadResult.failed_records}</div>
            </div>
          </div>

          {/* Missing Data Checklist Panel */}
          {uploadResult.missing_fields_count > 0 && (
            <div className="bg-amber-50 border border-amber-300 p-4 rounded-2xl space-y-2 shadow-sm">
              <div className="flex items-center gap-2 text-amber-900 text-sm font-black">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <span>Missing Data Reminders Checklist for Upload Person</span>
              </div>
              <p className="text-xs text-slate-700 font-semibold">
                The validation engine identified {uploadResult.missing_fields_count} missing values in your dataset. You can inline-edit the yellow rows below to complete missing fields before confirming commit.
              </p>
            </div>
          )}

          {/* Validation Filters */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 p-3 rounded-xl border border-slate-300 shadow-inner">
            {/* Status Filter */}
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-slate-700 font-bold">Status Filter:</span>
              {['ALL', 'VALID', 'MISSING_DATA', 'INVALID'].map(st => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all ${
                    statusFilter === st 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'bg-white text-slate-700 border border-slate-300 hover:text-slate-900'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Entity Filter */}
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-slate-700 font-bold">Entity Filter:</span>
              {['ALL', 'FACULTY', 'SUBJECT', 'SECTION', 'CLASSROOM'].map(ef => (
                <button
                  key={ef}
                  onClick={() => setEntityFilter(ef)}
                  className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all ${
                    entityFilter === ef 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'bg-white text-slate-700 border border-slate-300 hover:text-slate-900'
                  }`}
                >
                  {ef}
                </button>
              ))}
            </div>
          </div>

          {/* Staging Preview Table */}
          <div className="overflow-x-auto border border-slate-300 rounded-2xl shadow-sm">
            <table className="w-full text-xs text-left text-slate-900">
              <thead className="bg-slate-100 text-slate-800 font-black uppercase border-b border-slate-300">
                <tr>
                  <th className="px-4 py-3">Row #</th>
                  <th className="px-4 py-3">Entity Type</th>
                  <th className="px-4 py-3">Parsed Details</th>
                  <th className="px-4 py-3">Validation Status</th>
                  <th className="px-4 py-3">Errors / Reminders</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white font-bold">
                {isLoadingStaging ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-600 font-bold">Loading staging records...</td>
                  </tr>
                ) : stagingRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-600 font-bold">No staging records match filter.</td>
                  </tr>
                ) : (
                  stagingRecords.map(rec => (
                    <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-600">{rec.row_number}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 rounded font-black text-[10px]">
                          {rec.entity_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-900 font-bold">
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
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded font-black text-[10px]">VALID</span>
                        )}
                        {rec.validation_status === 'MISSING_DATA' && (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-300 rounded font-black text-[10px]">MISSING DATA</span>
                        )}
                        {rec.validation_status === 'INVALID' && (
                          <span className="px-2 py-0.5 bg-red-50 text-red-900 border border-red-300 rounded font-black text-[10px]">INVALID</span>
                        )}
                        {rec.validation_status === 'WARNING' && (
                          <span className="px-2 py-0.5 bg-yellow-50 text-yellow-900 border border-yellow-300 rounded font-black text-[10px]">WARNING</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-800 font-bold">
                        {rec.error_messages?.length > 0 ? (
                          <span className="text-red-700 font-black">{rec.error_messages.join(', ')}</span>
                        ) : rec.missing_fields?.length > 0 ? (
                          <span className="text-amber-800 font-black">Missing: {rec.missing_fields.join(', ')}</span>
                        ) : (
                          <span className="text-emerald-800 font-black">Ready for commit</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleOpenRemediate(rec)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-blue-800 font-black rounded border border-slate-300 text-[11px] flex items-center gap-1 ml-auto shadow-sm"
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
      <div className="bg-white rounded-2xl border border-slate-300 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              3. Department Import Audit History
            </h2>
            <p className="text-xs text-slate-600 font-semibold">
              Audit trail of all data uploads, staging validations, and production commits
            </p>
          </div>

          <button
            onClick={loadHistory}
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-xl text-xs font-extrabold flex items-center gap-1 transition-all border border-slate-300 shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh History
          </button>
        </div>

        <div className="overflow-x-auto border border-slate-300 rounded-2xl shadow-sm">
          <table className="w-full text-xs text-left text-slate-900">
            <thead className="bg-slate-100 text-slate-800 font-black uppercase border-b border-slate-300">
              <tr>
                <th className="px-4 py-3">File Name</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Uploaded By</th>
                <th className="px-4 py-3">Upload Time</th>
                <th className="px-4 py-3">Total / Valid / Errors</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white font-bold">
              {isLoadingHistory ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-slate-600 font-bold">Loading import audit history...</td>
                </tr>
              ) : historyItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-slate-600 font-bold">No previous import logs found.</td>
                </tr>
              ) : (
                historyItems.map(h => (
                  <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-black text-slate-900 flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-blue-600 shrink-0" />
                      {h.file_name}
                    </td>
                    <td className="px-4 py-3">{h.department_name} ({h.department_code})</td>
                    <td className="px-4 py-3">{h.uploaded_by}</td>
                    <td className="px-4 py-3 text-slate-600">{new Date(h.upload_time).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className="text-slate-900 font-black">{h.total_records}</span> total / <span className="text-emerald-700 font-black">{h.successful_records}</span> valid / <span className="text-red-700 font-black">{h.failed_records}</span> errors
                    </td>
                    <td className="px-4 py-3">
                      {h.import_status === 'CONFIRMED' && (
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded font-black text-[10px]">CONFIRMED</span>
                      )}
                      {h.import_status === 'STAGED' && (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-900 border border-blue-200 rounded font-black text-[10px]">STAGED</span>
                      )}
                      {h.import_status === 'VALIDATED' && (
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-900 border border-indigo-200 rounded font-black text-[10px]">VALIDATED</span>
                      )}
                      {h.import_status === 'NEEDS_REMEDIATION' && (
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-300 rounded font-black text-[10px]">NEEDS REMEDIATION</span>
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-2xl max-w-lg w-full p-6 space-y-4 text-xs text-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-600" />
                Remediate Missing Data (Row {editRecord.row_number})
              </h3>
              <button onClick={() => setEditRecord(null)} className="text-slate-500 hover:text-slate-900 font-bold">✕</button>
            </div>

            <form onSubmit={handleSaveRemediation} className="space-y-3">
              {Object.keys(editFormData).map(key => (
                <div key={key} className="space-y-1">
                  <label className="text-slate-800 font-extrabold capitalize">{key.replace('_', ' ')}:</label>
                  <input
                    type="text"
                    value={editFormData[key] || ''}
                    onChange={(e) => setEditFormData({ ...editFormData, [key]: e.target.value })}
                    className="w-full bg-slate-50 text-slate-900 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-blue-600 shadow-sm"
                  />
                </div>
              ))}

              <div className="flex justify-end space-x-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setEditRecord(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold rounded-xl border border-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingRemediation}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-md shadow-blue-600/20 flex items-center gap-1"
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-2xl max-w-md w-full p-6 space-y-4 text-xs text-center text-slate-900 shadow-2xl">
            <Database className="w-12 h-12 text-emerald-600 mx-auto" />
            <h3 className="text-lg font-black text-slate-900">Confirm Production Database Commit</h3>
            <p className="text-slate-700 font-semibold">
              Are you sure you want to commit <strong>{uploadResult?.valid_records} valid records</strong> to the live production database for <strong>{activeDepartment?.name}</strong>?
            </p>
            <p className="text-xs text-amber-900 bg-amber-50 p-3 rounded-xl border border-amber-300 font-bold">
              ⚡ This action executes inside an atomic database transaction.
            </p>

            <div className="flex justify-center space-x-3 pt-2">
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold rounded-xl border border-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCommit}
                disabled={isCommitting}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md shadow-emerald-600/20 flex items-center gap-2"
              >
                {isCommitting ? 'Committing to DB...' : 'Confirm & Commit Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Commit Result Modal */}
      {commitResult && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-2xl max-w-md w-full p-6 space-y-4 text-xs text-center text-slate-900 shadow-2xl">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto animate-bounce" />
            <h3 className="text-lg font-black text-slate-900">Production Commit Successful!</h3>
            <p className="text-slate-700 font-semibold">{commitResult.message}</p>
            
            <div className="bg-slate-50 p-4 rounded-xl text-left space-y-1 text-slate-900 font-mono border border-slate-200">
              <div>Faculty Members Committed: <strong className="text-emerald-700">{commitResult.committed_faculty}</strong></div>
              <div>Subjects & Hours Committed: <strong className="text-emerald-700">{commitResult.committed_subjects}</strong></div>
              <div>Sections Committed: <strong className="text-emerald-700">{commitResult.committed_sections}</strong></div>
              <div>Classrooms Committed: <strong className="text-emerald-700">{commitResult.committed_rooms}</strong></div>
            </div>

            <button
              onClick={() => setCommitResult(null)}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-md shadow-blue-600/20"
            >
              Done / Return to Portal
            </button>
          </div>
        </div>
      )}

      {/* Clear Department Data Confirmation Modal */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-2xl max-w-lg w-full p-6 space-y-5 text-slate-900 shadow-2xl">
            <div className="flex items-center space-x-3 text-red-600">
              <AlertTriangle className="w-8 h-8 shrink-0" />
              <div>
                <h3 className="text-lg font-black text-slate-900">Clear Semester Data</h3>
                <p className="text-xs text-red-700 font-bold">Action for New Semester Reset</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs space-y-2 leading-relaxed">
              <p className="text-red-900 font-extrabold">
                Are you sure you want to clear all semester database records for <strong className="text-slate-900">{activeDepartment?.name || 'this department'}</strong>?
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-800 font-semibold font-mono">
                <li>Wipes all Sections & Student configs for this department</li>
                <li>Wipes all Subjects & Weekly Hours rules for this department</li>
                <li>Wipes all Classrooms & Labs assigned to this department</li>
                <li>Deletes non-HOD Faculty login user accounts for this department</li>
                <li><strong className="text-emerald-700">HOD and Admin accounts will remain preserved and active!</strong></li>
              </ul>
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => setIsClearModalOpen(false)}
                disabled={isClearingData}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-extrabold border border-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleClearDepartmentData}
                disabled={isClearingData}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl text-xs flex items-center gap-2 shadow-md shadow-red-600/20 transition-all"
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
