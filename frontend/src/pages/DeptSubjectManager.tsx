import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { facultyService } from '../services/facultyService';
import type { Department, Subject } from '../services/facultyService';
import { Plus, Trash2, FolderPlus, BookOpen, RefreshCw, ChevronLeft, Upload, FileSpreadsheet, Image as ImageIcon, CheckCircle, AlertTriangle, X } from 'lucide-react';
import { getUserDeptId, isUserAdminOrDean } from '../utils/security';

interface DeptSubjectManagerProps {
  onBack: () => void;
}

export const DeptSubjectManager: React.FC<DeptSubjectManagerProps> = ({ onBack }) => {
  const { user } = useAuth();

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
      const deptsData = await facultyService.getDepartments();
      setDepartments(deptsData);

      let targetDeptId: string | undefined = undefined;
      if (!isUserAdminOrDean(user)) {
        targetDeptId = getUserDeptId(user, deptsData);
        if (targetDeptId) {
          setSubjDeptId(targetDeptId);
        }
      } else if (deptsData.length > 0 && !subjDeptId) {
        setSubjDeptId(deptsData[0].id);
      }

      const subjsData = await facultyService.getSubjects(targetDeptId);
      setSubjects(subjsData);
    } catch (err: any) {
      console.error('Failed to load subjects data:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

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
            className="p-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 hover:bg-slate-200 transition-all font-bold shadow-sm"
            title="Back to Dashboard"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-2xl font-black text-slate-900">Departments & Subjects</h2>
            <p className="text-slate-600 text-sm font-semibold">Configure dynamic course offerings, Excel/CSV master imports & semester data reset</p>
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
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-extrabold shadow-md shadow-emerald-600/20 transition-all"
          >
            <Upload className="w-4 h-4" />
            <span>Import CSV / Excel / OCR</span>
          </button>

          <button
            onClick={handleClearSemesterData}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 border border-red-300 text-red-700 hover:bg-red-100 transition-all text-xs font-extrabold shadow-sm"
            title="Reset active semester timetables, section configs, and subject allocations"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear Semester Data</span>
          </button>

          <button
            onClick={loadData}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 hover:bg-slate-200 transition-all shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="text-xs font-extrabold">Refresh</span>
          </button>
        </div>
      </div>

      {/* Forms Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
        
        {/* Department Panel */}
        <div className="glass-panel p-6 bg-white border border-slate-300 shadow-sm rounded-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 leading-none">Add Department</h3>
              <p className="text-xs text-slate-600 font-semibold mt-1">Register new college branch or stream</p>
            </div>
          </div>

          <form onSubmit={handleCreateDept} className="space-y-4">
            <div>
              <label className="text-xs font-extrabold text-slate-800 block mb-1.5">Department Name</label>
              <input
                type="text"
                placeholder="e.g. Computer Science & Engineering"
                value={deptName}
                onChange={e => setDeptName(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-bold placeholder-slate-400 focus:border-blue-600 outline-none transition-all shadow-sm"
              />
            </div>
            <div>
              <label className="text-xs font-extrabold text-slate-800 block mb-1.5">Department Code</label>
              <input
                type="text"
                placeholder="e.g. CSE"
                value={deptCode}
                onChange={e => setDeptCode(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-bold placeholder-slate-400 focus:border-blue-600 outline-none transition-all shadow-sm"
              />
            </div>

            {deptError && <p className="text-xs font-bold text-red-600">{deptError}</p>}
            {deptSuccess && <p className="text-xs font-bold text-emerald-600">{deptSuccess}</p>}

            <button
              type="submit"
              className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 transition-all"
            >
              <Plus className="w-4 h-4" />
              Save Department
            </button>
          </form>
        </div>

        {/* Subject Panel */}
        <div className="glass-panel p-6 bg-white border border-slate-300 shadow-sm rounded-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 leading-none">Add Subject</h3>
              <p className="text-xs text-slate-600 font-semibold mt-1">Register teaching courses under departments</p>
            </div>
          </div>

          <form onSubmit={handleCreateSubj} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-extrabold text-slate-800 block mb-1.5">Subject Name</label>
                <input
                  type="text"
                  placeholder="e.g. Operating Systems"
                  value={subjName}
                  onChange={e => setSubjName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-bold placeholder-slate-400 focus:border-blue-600 outline-none transition-all shadow-sm"
                />
              </div>
              <div>
                <label className="text-xs font-extrabold text-slate-800 block mb-1.5">Subject Code</label>
                <input
                  type="text"
                  placeholder="e.g. CS301"
                  value={subjCode}
                  onChange={e => setSubjCode(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-bold placeholder-slate-400 focus:border-blue-600 outline-none transition-all shadow-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-extrabold text-slate-800 block mb-1.5">Department</label>
                <select
                  value={subjDeptId}
                  onChange={e => {
                    if (user?.role === 'ADMIN' || user?.role === 'DEAN') {
                      setSubjDeptId(e.target.value);
                    }
                  }}
                  disabled={user?.role !== 'ADMIN' && user?.role !== 'DEAN'}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-extrabold focus:border-blue-600 outline-none transition-all disabled:opacity-80 cursor-not-allowed shadow-sm"
                >
                  {departments
                    .filter(d => (user?.role === 'ADMIN' || user?.role === 'DEAN') ? true : d.id === subjDeptId)
                    .map(d => (
                      <option key={d.id} value={d.id} className="bg-white text-slate-900 font-bold py-1">{d.name} ({d.code})</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-extrabold text-slate-800 block mb-1.5">Subject Type</label>
                <select
                  value={subjType}
                  onChange={e => setSubjType(e.target.value as any)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-extrabold focus:border-blue-600 outline-none transition-all shadow-sm"
                >
                  <option value="THEORY" className="bg-white text-slate-900 font-bold py-1">Theory Lecture</option>
                  <option value="LAB" className="bg-white text-slate-900 font-bold py-1">Practical Lab</option>
                  <option value="ELECTIVE" className="bg-white text-slate-900 font-bold py-1">Professional Elective</option>
                  <option value="COUNSELLING" className="bg-white text-slate-900 font-bold py-1">Counselling Session</option>
                  <option value="SPORTS_LIBRARY" className="bg-white text-slate-900 font-bold py-1">Sports / Library</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-extrabold text-slate-800 block mb-1.5">Academic Year</label>
                <select
                  value={subjYear}
                  onChange={e => setSubjYear(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-extrabold focus:border-blue-600 outline-none transition-all shadow-sm"
                >
                  <option value={1} className="bg-white text-slate-900 font-bold py-1">1st Year</option>
                  <option value={2} className="bg-white text-slate-900 font-bold py-1">2nd Year</option>
                  <option value={3} className="bg-white text-slate-900 font-bold py-1">3rd Year</option>
                  <option value={4} className="bg-white text-slate-900 font-bold py-1">4th Year</option>
                </select>
              </div>
            </div>

            {subjType === 'LAB' && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-300 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isParallelLab}
                    onChange={e => setIsParallelLab(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-purple-600 accent-purple-600"
                  />
                  <span className="text-xs font-extrabold text-slate-900">Rule 8: Dual Split Parallel Lab (Batch Swap)</span>
                </label>

                {isParallelLab && (
                  <div>
                    <label className="text-xs font-extrabold text-slate-800 block mb-1.5">Linked Parallel Subject Y</label>
                    <select
                      value={parallelSubjId}
                      onChange={e => setParallelSubjId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs font-extrabold outline-none"
                    >
                      <option value="" className="bg-white text-slate-900">Select Linked Parallel Lab Subject</option>
                      {subjects.filter(s => s.subject_type === 'LAB').map(s => (
                        <option key={s.id} value={s.id} className="bg-white text-slate-900 font-bold">{s.name} ({s.code})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {subjError && <p className="text-xs font-bold text-red-600">{subjError}</p>}
            {subjSuccess && <p className="text-xs font-bold text-emerald-600">{subjSuccess}</p>}

            <button
              type="submit"
              className="w-full py-3.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-extrabold shadow-md shadow-purple-600/20 flex items-center justify-center gap-2 transition-all"
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
        <div className="glass-panel p-6 bg-white border border-slate-300 shadow-sm rounded-2xl">
          <h3 className="text-base font-black text-slate-900 mb-4">Registered Departments ({departments.length})</h3>
          {departments.length === 0 ? (
            <p className="text-xs text-slate-500 italic font-semibold">No departments registered yet.</p>
          ) : (
            <div className="space-y-3">
              {departments.map(d => (
                <div key={d.id} className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-300 shadow-sm">
                  <div>
                    <strong className="text-sm font-black text-slate-900 block">{d.name}</strong>
                    <span className="text-xs font-extrabold text-blue-700 uppercase">{d.code}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteDept(d.id)}
                    className="p-2 rounded-lg bg-white text-red-700 hover:bg-red-50 border border-slate-300 transition-all shadow-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Subjects List */}
        <div className="glass-panel p-6 bg-white border border-slate-300 shadow-sm rounded-2xl">
          <h3 className="text-base font-black text-slate-900 mb-4">Registered Subjects ({subjects.length})</h3>
          {subjects.length === 0 ? (
            <p className="text-xs text-slate-500 italic font-semibold">No subjects registered yet.</p>
          ) : (
            <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
              {subjects.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-300 shadow-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-sm font-black text-slate-900">{s.name}</strong>
                      <span className="text-xs font-extrabold text-purple-700">({s.code})</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-600 font-bold">
                      <span>Year {s.academic_year || 1}</span>
                      <span>•</span>
                      <span className="uppercase font-black text-slate-800">{s.subject_type || 'THEORY'}</span>
                      {s.is_parallel_lab && <span className="text-purple-700 font-black">• Rule 8 Dual Lab</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteSubj(s.id)}
                    className="p-2 rounded-lg bg-white text-red-700 hover:bg-red-50 border border-slate-300 transition-all shadow-sm"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg p-6 relative bg-white border border-slate-300 shadow-2xl rounded-2xl text-slate-900">
            <button
              onClick={() => setIsImportModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200 transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-black text-slate-900 mb-2 flex items-center gap-2">
              <Upload className="w-5 h-5 text-emerald-600" />
              Import Faculty & Section Assignments
            </h3>
            <p className="text-xs text-slate-600 font-semibold mb-6">Upload CSV file or Picture/Photo of faculty subject charts</p>

            <div className="flex gap-2 p-1 bg-slate-100 border border-slate-300 rounded-xl mb-6">
              <button
                onClick={() => setImportMode('csv')}
                className={`flex-1 py-2 rounded-lg text-xs font-extrabold flex items-center justify-center gap-2 transition-all ${
                  importMode === 'csv' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>CSV / Excel File Upload</span>
              </button>
              <button
                onClick={() => setImportMode('ocr')}
                className={`flex-1 py-2 rounded-lg text-xs font-extrabold flex items-center justify-center gap-2 transition-all ${
                  importMode === 'ocr' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <ImageIcon className="w-4 h-4" />
                <span>Picture / OCR Scanner</span>
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-extrabold text-slate-800 block mb-2">
                  {importMode === 'csv' ? 'Select CSV or Excel File (.csv, .xlsx, .xls)' : 'Upload Picture / Photo of Assignment Chart (.jpeg, .jpg, .png, .webp)'}
                </label>
                <input
                  type="file"
                  accept={importMode === 'csv' ? '.csv,.xlsx,.xls,.txt' : '.jpeg,.jpg,.png,.webp,image/*'}
                  onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-xs font-bold outline-none"
                />
              </div>

              {importResult && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 space-y-1 font-bold">
                  <div className="flex items-center gap-2 font-black">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>{importResult.message}</span>
                  </div>
                  {importResult.records_imported && (
                    <p className="text-slate-700">Imported {importResult.records_imported} records ({importResult.subjects_created} subjects, {importResult.faculty_created} faculty profiles).</p>
                  )}
                </div>
              )}

              {importError && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-300 flex gap-2 text-xs text-red-700 font-extrabold">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-600" />
                  <span>{importError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isUploading}
                className="w-full mt-4 py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold shadow-md shadow-emerald-600/20 disabled:opacity-50 transition-all"
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
