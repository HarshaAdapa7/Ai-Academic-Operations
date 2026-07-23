import React, { useState, useEffect } from 'react';
import { facultyService } from '../services/facultyService';
import type { Department, Subject } from '../services/facultyService';
import { Plus, Trash2, FolderPlus, BookOpen, RefreshCw, ChevronLeft, Upload, FileSpreadsheet, Image as ImageIcon, CheckCircle, AlertTriangle, X } from 'lucide-react';

interface DeptSubjectManagerProps {
  onBack: () => void;
}

export const DeptSubjectManager: React.FC<DeptSubjectManagerProps> = ({ onBack }) => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  
  // Department Form State
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [deptError, setDeptError] = useState('');
  const [deptSuccess, setDeptSuccess] = useState('');

  // Subject Form State
  const [subjName, setSubjName] = useState('');
  const [subjCode, setSubjCode] = useState('');
  const [subjDeptId, setSubjDeptId] = useState('');
  const [subjCredits, setSubjCredits] = useState(3);
  const [subjType, setSubjType] = useState<'THEORY' | 'LAB' | 'ELECTIVE' | 'COUNSELLING' | 'SPORTS_LIBRARY'>('THEORY');
  const [subjYear, setSubjYear] = useState(1);
  const [isParallelLab, setIsParallelLab] = useState(false);
  const [parallelSubjId, setParallelSubjId] = useState('');
  const [subjError, setSubjError] = useState('');
  const [subjSuccess, setSubjSuccess] = useState('');

  // Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importMode, setImportMode] = useState<'csv' | 'ocr'>('csv');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importError, setImportError] = useState('');

  const loadData = async () => {
    try {
      const [deptsData, subjsData] = await Promise.all([
        facultyService.getDepartments(),
        facultyService.getSubjects()
      ]);
      setDepartments(deptsData);
      setSubjects(subjsData);
      if (deptsData.length > 0 && !subjDeptId) {
        setSubjDeptId(deptsData[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeptError('');
    setDeptSuccess('');

    if (!deptName || !deptCode) {
      setDeptError('Department Name and Code are required.');
      return;
    }

    try {
      const newDept = await facultyService.createDepartment({ name: deptName, code: deptCode.toUpperCase() });
      setDepartments([...departments, newDept]);
      setDeptName('');
      setDeptCode('');
      setDeptSuccess('Department registered successfully!');
    } catch (err: any) {
      setDeptError(err.response?.data?.detail || 'Failed to create department.');
    }
  };

  const handleCreateSubj = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubjError('');
    setSubjSuccess('');

    if (!subjName || !subjCode || !subjDeptId) {
      setSubjError('Subject Name, Code, and Department are required.');
      return;
    }

    try {
      const newSubj = await facultyService.createSubject({
        name: subjName,
        code: subjCode.toUpperCase(),
        department_id: subjDeptId,
        credits: subjCredits,
        subject_type: subjType,
        is_parallel_lab: isParallelLab,
        parallel_subject_id: parallelSubjId || null,
        academic_year: subjYear
      });
      setSubjects([...subjects, newSubj].sort((a, b) => a.code.localeCompare(b.code)));
      setSubjName('');
      setSubjCode('');
      setSubjCredits(3);
      setIsParallelLab(false);
      setParallelSubjId('');
      setSubjSuccess('Subject registered successfully!');
    } catch (err: any) {
      setSubjError(err.response?.data?.detail || 'Failed to create subject.');
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError('');
    setImportResult(null);

    if (!selectedFile) {
      setImportError('Please select a file to upload.');
      return;
    }

    try {
      setIsUploading(true);
      let res;
      if (importMode === 'csv') {
        res = await facultyService.importFacultyCSV(selectedFile);
      } else {
        res = await facultyService.importFacultyOCR(selectedFile);
      }
      setImportResult(res);
      loadData();
    } catch (err: any) {
      setImportError(err.response?.data?.detail || 'Failed to import file.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDept = async (id: string) => {
    if (!window.confirm('Warning: Deleting a department will delete ALL subjects associated with it. Continue?')) {
      return;
    }
    try {
      await facultyService.deleteDepartment(id);
      setDepartments(departments.filter(d => d.id !== id));
      setSubjects(subjects.filter(s => s.id !== id));
    } catch (err) {
      alert('Failed to delete department.');
    }
  };

  const handleDeleteSubj = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this subject?')) {
      return;
    }
    try {
      await facultyService.deleteSubject(id);
      setSubjects(subjects.filter(s => s.id !== id));
    } catch (err) {
      alert('Failed to delete subject.');
    }
  };

  const handleClearSemesterData = async () => {
    if (!window.confirm('WARNING: Are you sure you want to clear all current semester data? This will reset all timetables, section configurations, and subject allocations to prepare for a fresh semester.')) {
      return;
    }
    try {
      await facultyService.clearSemesterData(true);
      alert('Semester data cleared successfully! You can now import fresh semester data.');
      loadData();
    } catch (err: any) {
      alert('Failed to clear semester data: ' + (err.response?.data?.detail || err.message));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white transition-all duration-300"
            title="Back to Dashboard"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-2xl font-extrabold text-white">Departments & Subjects</h2>
            <p className="text-dark-400 text-sm">Configure dynamic course offerings, Excel/CSV master imports & semester data reset</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setImportResult(null);
              setImportError('');
              setSelectedFile(null);
              setIsImportModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/15 transition-all duration-300"
          >
            <Upload className="w-4 h-4" />
            <span>Import CSV / Excel / OCR</span>
          </button>

          <button
            onClick={handleClearSemesterData}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all duration-300 text-xs font-bold"
            title="Reset active semester timetables, section configs, and subject allocations"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear Semester Data</span>
          </button>

          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-400 hover:text-white transition-all duration-300"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="text-sm font-medium">Refresh</span>
          </button>
        </div>
      </div>

      {/* Forms Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
        
        {/* Department Panel */}
        <div className="glass-panel p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white leading-none">Add Department</h3>
              <p className="text-xs text-dark-400 mt-1">Register new college branch or stream</p>
            </div>
          </div>

          <form onSubmit={handleCreateDept} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-dark-300 block mb-1.5">Department Name</label>
              <input
                type="text"
                placeholder="e.g. Computer Science & Engineering"
                value={deptName}
                onChange={e => setDeptName(e.target.value)}
                className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none transition-all duration-300"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-dark-300 block mb-1.5">Department Code</label>
              <input
                type="text"
                placeholder="e.g. CSE"
                value={deptCode}
                onChange={e => setDeptCode(e.target.value)}
                className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none transition-all duration-300"
              />
            </div>

            {deptError && <p className="text-xs font-medium text-red-400">{deptError}</p>}
            {deptSuccess && <p className="text-xs font-medium text-emerald-400">{deptSuccess}</p>}

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-blue-500/15 flex items-center justify-center gap-2 hover:-translate-y-0.5 transition-all duration-300"
            >
              <Plus className="w-4 h-4" />
              Save Department
            </button>
          </form>
        </div>

        {/* Subject Panel */}
        <div className="glass-panel p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white leading-none">Add Subject</h3>
              <p className="text-xs text-dark-400 mt-1">Register teaching courses under departments</p>
            </div>
          </div>

          <form onSubmit={handleCreateSubj} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Subject Name</label>
                <input
                  type="text"
                  placeholder="e.g. Operating Systems"
                  value={subjName}
                  onChange={e => setSubjName(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none transition-all duration-300"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Subject Code</label>
                <input
                  type="text"
                  placeholder="e.g. CS301"
                  value={subjCode}
                  onChange={e => setSubjCode(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none transition-all duration-300"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Department</label>
                <select
                  value={subjDeptId}
                  onChange={e => setSubjDeptId(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none transition-all duration-300"
                >
                  <option value="">Select Department</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Subject Type</label>
                <select
                  value={subjType}
                  onChange={e => setSubjType(e.target.value as any)}
                  className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none transition-all duration-300"
                >
                  <option value="THEORY">Theory Lecture</option>
                  <option value="LAB">Practical Lab</option>
                  <option value="ELECTIVE">Professional Elective</option>
                  <option value="COUNSELLING">Counselling Session</option>
                  <option value="SPORTS_LIBRARY">Sports / Library</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Academic Year</label>
                <select
                  value={subjYear}
                  onChange={e => setSubjYear(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none transition-all duration-300"
                >
                  <option value={1}>1st Year</option>
                  <option value={2}>2nd Year</option>
                  <option value={3}>3rd Year</option>
                  <option value={4}>4th Year</option>
                </select>
              </div>
            </div>

            {subjType === 'LAB' && (
              <div className="p-4 rounded-xl bg-dark-950/40 border border-dark-800 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isParallelLab}
                    onChange={e => setIsParallelLab(e.target.checked)}
                    className="w-4 h-4 rounded border-dark-800 text-purple-500 accent-purple-500"
                  />
                  <span className="text-xs font-bold text-white">Rule 8: Dual Split Parallel Lab (Batch Swap)</span>
                </label>

                {isParallelLab && (
                  <div>
                    <label className="text-xs font-semibold text-dark-300 block mb-1.5">Linked Parallel Subject Y</label>
                    <select
                      value={parallelSubjId}
                      onChange={e => setParallelSubjId(e.target.value)}
                      className="w-full px-3 py-2 bg-dark-900 border border-dark-800 rounded-lg text-white text-xs outline-none"
                    >
                      <option value="">Select Linked Parallel Lab Subject</option>
                      {subjects.filter(s => s.subject_type === 'LAB').map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {subjError && <p className="text-xs font-medium text-red-400">{subjError}</p>}
            {subjSuccess && <p className="text-xs font-medium text-emerald-400">{subjSuccess}</p>}

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-sm font-semibold shadow-lg shadow-purple-500/15 flex items-center justify-center gap-2 hover:-translate-y-0.5 transition-all duration-300"
            >
              <Plus className="w-4 h-4" />
              Save Subject
            </button>
          </form>
        </div>

      </div>

      {/* Departments & Subjects Inventory Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Departments List */}
        <div className="glass-panel p-6">
          <h3 className="text-base font-bold text-white mb-4">Registered Departments ({departments.length})</h3>
          {departments.length === 0 ? (
            <p className="text-xs text-dark-400 italic">No departments registered yet.</p>
          ) : (
            <div className="space-y-3">
              {departments.map(d => (
                <div key={d.id} className="flex items-center justify-between p-3.5 rounded-xl bg-dark-950/40 border border-dark-850">
                  <div>
                    <strong className="text-sm font-bold text-white block">{d.name}</strong>
                    <span className="text-xs font-semibold text-primary-400 uppercase">{d.code}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteDept(d.id)}
                    className="p-2 rounded-lg bg-dark-900 text-dark-400 hover:text-red-400 border border-dark-850 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Subjects List */}
        <div className="glass-panel p-6">
          <h3 className="text-base font-bold text-white mb-4">Registered Subjects ({subjects.length})</h3>
          {subjects.length === 0 ? (
            <p className="text-xs text-dark-400 italic">No subjects registered yet.</p>
          ) : (
            <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
              {subjects.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3.5 rounded-xl bg-dark-950/40 border border-dark-850">
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-sm font-bold text-white">{s.name}</strong>
                      <span className="text-xs font-bold text-purple-400">({s.code})</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-dark-400 font-medium">
                      <span>Year {s.academic_year || 1}</span>
                      <span>•</span>
                      <span className="uppercase font-bold text-dark-300">{s.subject_type || 'THEORY'}</span>
                      {s.is_parallel_lab && <span className="text-purple-400 font-bold">• Rule 8 Dual Lab</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteSubj(s.id)}
                    className="p-2 rounded-lg bg-dark-900 text-dark-400 hover:text-red-400 border border-dark-850 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* CSV & Picture OCR Importer Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg p-6 relative">
            <button
              onClick={() => setIsImportModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-400 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Upload className="w-5 h-5 text-emerald-400" />
              Import Faculty & Section Assignments
            </h3>
            <p className="text-xs text-dark-400 mb-6">Upload CSV file or Picture/Photo of faculty subject charts</p>

            <div className="flex gap-2 p-1 bg-dark-950 border border-dark-800 rounded-xl mb-6">
              <button
                onClick={() => setImportMode('csv')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 ${
                  importMode === 'csv' ? 'bg-emerald-600 text-white' : 'text-dark-400 hover:text-white'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>CSV / Excel File Upload</span>
              </button>
              <button
                onClick={() => setImportMode('ocr')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 ${
                  importMode === 'ocr' ? 'bg-emerald-600 text-white' : 'text-dark-400 hover:text-white'
                }`}
              >
                <ImageIcon className="w-4 h-4" />
                <span>Picture / OCR Scanner</span>
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-2">
                  {importMode === 'csv' ? 'Select CSV or Excel File (.csv, .xlsx, .xls)' : 'Upload Picture / Photo of Assignment Chart (.jpeg, .jpg, .png, .webp)'}
                </label>
                <input
                  type="file"
                  accept={importMode === 'csv' ? '.csv,.xlsx,.xls,.txt' : '.jpeg,.jpg,.png,.webp,image/*'}
                  onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-xs outline-none"
                />
              </div>

              {importResult && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 space-y-1">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span>{importResult.message}</span>
                  </div>
                  {importResult.records_imported && (
                    <p className="text-dark-300">Imported {importResult.records_imported} records ({importResult.subjects_created} subjects, {importResult.faculty_created} faculty profiles).</p>
                  )}
                </div>
              )}

              {importError && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-2 text-xs text-red-400 font-semibold">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isUploading}
                className="w-full mt-4 py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold shadow-lg shadow-emerald-500/15 disabled:opacity-50"
              >
                {isUploading ? 'Processing Import...' : 'Execute Import & Sync DB'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
