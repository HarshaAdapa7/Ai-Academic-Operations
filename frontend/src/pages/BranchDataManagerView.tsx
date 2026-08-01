import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { facultyService } from '../services/facultyService';
import type { Department, Subject, FacultyProfile, SectionConfig } from '../services/facultyService';
import { branchDataService } from '../services/branchDataService';
import type { SectionSubjectTeacherLink } from '../services/branchDataService';
import { 
  ChevronLeft, BookOpen, Users, Link2, Plus, Edit2, Trash2, 
  Search, X, Check, AlertCircle, RefreshCw 
} from 'lucide-react';
import { getUserDeptId, isUserAdminOrDean } from '../utils/security';

interface BranchDataManagerViewProps {
  onBack: () => void;
}

type TabType = 'subjects' | 'faculty' | 'assignments';

export const BranchDataManagerView: React.FC<BranchDataManagerViewProps> = ({ onBack }) => {
  const { user } = useAuth();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabType>('subjects');

  // Database Data States
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [faculty, setFaculty] = useState<FacultyProfile[]>([]);
  const [assignments, setAssignments] = useState<SectionSubjectTeacherLink[]>([]);
  const [sections, setSections] = useState<SectionConfig[]>([]);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modals States
  const [isSubjModalOpen, setIsSubjModalOpen] = useState(false);
  const [editSubj, setEditSubj] = useState<Subject | null>(null);
  
  const [isFacModalOpen, setIsFacModalOpen] = useState(false);
  const [editFac, setEditFac] = useState<FacultyProfile | null>(null);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [editAssign, setEditAssign] = useState<SectionSubjectTeacherLink | null>(null);

  // Form states - Subject
  const [subjName, setSubjName] = useState('');
  const [subjCode, setSubjCode] = useState('');
  const [subjCredits, setSubjCredits] = useState(3);
  const [subjType, setSubjType] = useState<'THEORY' | 'LAB' | 'ELECTIVE' | 'COUNSELLING' | 'SPORTS_LIBRARY'>('THEORY');
  const [subjYear, setSubjYear] = useState(1);
  const [isParallelLab, setIsParallelLab] = useState(false);
  const [parallelSubjId, setParallelSubjId] = useState('');

  // Form states - Faculty Profile
  const [selectedUserId, setSelectedUserId] = useState('');
  const [facDesignation, setFacDesignation] = useState('');
  const [facMaxWorkload, setFacMaxWorkload] = useState(16);
  const [facIsHOD, setFacIsHOD] = useState(false);
  const [facIsDean, setFacIsDean] = useState(false);
  const [unassignedUsers, setUnassignedUsers] = useState<any[]>([]);

  // Form states - Assignment mapping
  const [assignSectionId, setAssignSectionId] = useState('');
  const [assignSubjectId, setAssignSubjectId] = useState('');
  const [assignFacultyId, setAssignFacultyId] = useState('');

  // Fetch departments
  useEffect(() => {
    const fetchDepts = async () => {
      try {
        const data = await facultyService.getDepartments();
        setDepartments(data);
        const userDept = getUserDeptId(user, data);
        if (userDept) {
          setSelectedDeptId(userDept);
        } else if (data.length > 0) {
          setSelectedDeptId(data[0].id);
        }
      } catch (err) {
        console.error('Failed to load departments:', err);
      }
    };
    fetchDepts();
  }, [user]);

  // Load active department registry data
  const loadRegistryData = async () => {
    if (!selectedDeptId) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      // 1. Fetch Subjects
      const subjs = await facultyService.getSubjects(selectedDeptId);
      setSubjects(subjs);

      // 2. Fetch Faculty profiles
      const facs = await facultyService.getFacultyProfiles(selectedDeptId);
      setFaculty(facs);

      // 3. Fetch Assignments (Mappings)
      const links = await branchDataService.getSectionSubjectTeachers(selectedDeptId);
      setAssignments(links);

      // 4. Fetch Sections Configs
      const configs = await facultyService.getSectionConfigs();
      const filteredConfigs = configs.filter(c => c.department_id === selectedDeptId);
      setSections(filteredConfigs);
    } catch (err) {
      setErrorMsg('Failed to load branch registry data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRegistryData();
  }, [selectedDeptId]);

  // Fetch users for new faculty register dropdown
  useEffect(() => {
    if (isFacModalOpen && !editFac) {
      const loadUsers = async () => {
        try {
          const allUsers = await facultyService.getUsers();
          // Filter out users already assigned in faculty profiles
          const assignedUserIds = new Set(faculty.map(f => f.user_id));
          const unassigned = allUsers.filter(u => !assignedUserIds.has(u.id));
          setUnassignedUsers(unassigned);
          if (unassigned.length > 0) {
            setSelectedUserId(unassigned[0].id);
          }
        } catch (err) {
          console.error('Failed to load system users:', err);
        }
      };
      loadUsers();
    }
  }, [isFacModalOpen, editFac, faculty]);

  // Handle Subject Add/Edit
  const handleOpenSubjModal = (subj: Subject | null = null) => {
    setEditSubj(subj);
    if (subj) {
      setSubjName(subj.name);
      setSubjCode(subj.code);
      setSubjCredits(subj.credits);
      setSubjType(subj.subject_type);
      setSubjYear(subj.academic_year);
      setIsParallelLab(subj.is_parallel_lab);
      setParallelSubjId(subj.parallel_subject_id || '');
    } else {
      setSubjName('');
      setSubjCode('');
      setSubjCredits(3);
      setSubjType('THEORY');
      setSubjYear(1);
      setIsParallelLab(false);
      setParallelSubjId('');
    }
    setIsSubjModalOpen(true);
  };

  const handleSubjSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    if (!subjName || !subjCode) {
      setErrorMsg('Subject name and code are required.');
      return;
    }
    try {
      const payload = {
        name: subjName.trim(),
        code: subjCode.trim().toUpperCase(),
        department_id: selectedDeptId,
        credits: Number(subjCredits),
        subject_type: subjType,
        is_parallel_lab: isParallelLab,
        parallel_subject_id: parallelSubjId || null,
        academic_year: Number(subjYear)
      };

      if (editSubj) {
        await branchDataService.updateSubject(editSubj.id, payload);
        setSuccessMsg('Subject updated successfully.');
      } else {
        await facultyService.createSubject(payload);
        setSuccessMsg('Subject created successfully.');
      }
      setIsSubjModalOpen(false);
      loadRegistryData();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Failed to save subject.');
    }
  };

  const handleDeleteSubj = async (id: string) => {
    if (!window.confirm('Delete this subject and all associated teaching mappings?')) return;
    try {
      await facultyService.deleteSubject(id);
      setSuccessMsg('Subject deleted successfully.');
      loadRegistryData();
    } catch (err) {
      setErrorMsg('Failed to delete subject.');
    }
  };

  // Handle Faculty Add/Edit
  const handleOpenFacModal = (fac: FacultyProfile | null = null) => {
    setEditFac(fac);
    if (fac) {
      setFacDesignation(fac.designation);
      setFacMaxWorkload(fac.max_weekly_workload);
      setFacIsHOD(fac.is_hod);
      setFacIsDean(fac.is_dean);
    } else {
      setSelectedUserId('');
      setFacDesignation('Assistant Professor');
      setFacMaxWorkload(16);
      setFacIsHOD(false);
      setFacIsDean(false);
    }
    setIsFacModalOpen(true);
  };

  const handleFacSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (editFac) {
        const payload = {
          department_id: selectedDeptId,
          designation: facDesignation,
          max_weekly_workload: Number(facMaxWorkload),
          is_hod: facIsHOD,
          is_dean: facIsDean,
          subject_ids: editFac.subjects.map(s => s.id)
        };
        await facultyService.updateFaculty(editFac.id, payload);
        setSuccessMsg('Faculty profile updated successfully.');
      } else {
        if (!selectedUserId) {
          setErrorMsg('Please select a system user account.');
          return;
        }
        const payload = {
          user_id: selectedUserId,
          department_id: selectedDeptId,
          designation: facDesignation,
          max_weekly_workload: Number(facMaxWorkload),
          is_hod: facIsHOD,
          is_dean: facIsDean,
          subject_ids: []
        };
        await facultyService.createFaculty(payload);
        setSuccessMsg('Faculty profile created successfully.');
      }
      setIsFacModalOpen(false);
      loadRegistryData();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Failed to save faculty profile.');
    }
  };

  const handleDeleteFac = async (id: string) => {
    if (!window.confirm('Delete this faculty profile? User account will remain intact.')) return;
    try {
      await facultyService.deleteFaculty(id);
      setSuccessMsg('Faculty profile deleted successfully.');
      loadRegistryData();
    } catch (err) {
      setErrorMsg('Failed to delete faculty.');
    }
  };

  // Handle Mappings Add/Delete
  const handleOpenAssignModal = () => {
    setEditAssign(null);
    if (sections.length === 0) {
      setErrorMsg('Please configure classroom sections first.');
      return;
    }
    if (subjects.length === 0) {
      setErrorMsg('Please add branch subjects first.');
      return;
    }
    if (faculty.length === 0) {
      setErrorMsg('Please register faculty profiles first.');
      return;
    }
    setAssignSectionId(sections[0].id);
    setAssignSubjectId(subjects[0].id);
    setAssignFacultyId(faculty[0].id);
    setIsAssignModalOpen(true);
  };

  const handleOpenEditAssignModal = (link: SectionSubjectTeacherLink) => {
    setEditAssign(link);
    setAssignSectionId(link.section_id);
    setAssignSubjectId(link.subject_id);
    setAssignFacultyId(link.faculty_id);
    setIsAssignModalOpen(true);
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    try {
      if (editAssign) {
        await branchDataService.deleteSectionSubjectTeacher(
          editAssign.section_id,
          editAssign.subject_id,
          editAssign.faculty_id
        );
      }
      await branchDataService.assignSectionSubjectTeacher({
        section_id: assignSectionId,
        subject_id: assignSubjectId,
        faculty_id: assignFacultyId
      });
      setSuccessMsg(editAssign ? 'Teaching assignment updated successfully.' : 'Teaching assignment mapped successfully.');
      setIsAssignModalOpen(false);
      setEditAssign(null);
      loadRegistryData();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || 'Failed to map assignment.');
    }
  };

  const handleDeleteAssign = async (secId: string, subjId: string, facId: string) => {
    if (!window.confirm('Remove this teacher assignment from this section?')) return;
    try {
      await branchDataService.deleteSectionSubjectTeacher(secId, subjId, facId);
      setSuccessMsg('Teaching assignment deleted successfully.');
      loadRegistryData();
    } catch (err) {
      setErrorMsg('Failed to delete assignment mapping.');
    }
  };

  // Filters search filtering
  const filteredSubjects = subjects.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredFaculty = faculty.filter(f => 
    f.user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    f.user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.designation.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredAssignments = assignments.filter(a => 
    a.section_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.subject_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.subject_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.faculty_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main className="max-w-7xl mx-auto px-6 mt-6">
      {/* Header toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-xs font-bold text-primary-400 uppercase tracking-widest hover:text-primary-300 transition-colors mb-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Grid
          </button>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">
            Raw Branch Data Registry Editor
          </h2>
          <p className="text-xs text-dark-400 mt-1">
            View, search, edit, or directly modify the database tables imported from Excel files.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Department Selector */}
          {isUserAdminOrDean(user) ? (
            <div className="bg-dark-900 border border-dark-800 rounded-xl px-3 py-2 flex items-center gap-2">
              <span className="text-xs text-dark-400 font-semibold uppercase">Branch:</span>
              <select
                value={selectedDeptId}
                onChange={(e) => setSelectedDeptId(e.target.value)}
                className="bg-transparent text-white text-xs font-bold focus:outline-none cursor-pointer"
              >
                {departments.map(d => (
                  <option key={d.id} value={d.id} className="bg-dark-950 text-white font-medium">
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="bg-dark-900/50 border border-dark-800/40 rounded-xl px-4 py-2 text-xs font-bold text-primary-400 uppercase tracking-wider">
              Branch: {departments.find(d => d.id === selectedDeptId)?.name || 'HOD Locked'}
            </div>
          )}

          <button
            onClick={loadRegistryData}
            className="p-2.5 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white transition-all flex items-center justify-center"
            title="Reload registry data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs list & search bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 mb-6 border-b border-dark-800 pb-4">
        {/* Navigation tabs */}
        <div className="flex items-center gap-1.5 bg-dark-900/50 p-1 rounded-xl border border-dark-850 self-start">
          <button
            onClick={() => { setActiveTab('subjects'); setSearchTerm(''); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold tracking-wide transition-all ${
              activeTab === 'subjects' 
                ? 'bg-primary-500 text-white shadow-md' 
                : 'text-dark-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Subjects ({subjects.length})
          </button>
          
          <button
            onClick={() => { setActiveTab('faculty'); setSearchTerm(''); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold tracking-wide transition-all ${
              activeTab === 'faculty' 
                ? 'bg-primary-500 text-white shadow-md' 
                : 'text-dark-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            Faculty Profiles ({faculty.length})
          </button>

          <button
            onClick={() => { setActiveTab('assignments'); setSearchTerm(''); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold tracking-wide transition-all ${
              activeTab === 'assignments' 
                ? 'bg-primary-500 text-white shadow-md' 
                : 'text-dark-400 hover:text-white'
            }`}
          >
            <Link2 className="w-4 h-4" />
            Teaching Assignments ({assignments.length})
          </button>
        </div>

        {/* Global Search and Add action */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-dark-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-dark-900 border border-dark-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-primary-500"
            />
          </div>

          {activeTab === 'subjects' && (
            <button
              onClick={() => handleOpenSubjModal(null)}
              className="py-2 px-4 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-primary-500/10"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Subject
            </button>
          )}

          {activeTab === 'faculty' && (
            <button
              onClick={() => handleOpenFacModal(null)}
              className="py-2 px-4 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-primary-500/10"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Faculty
            </button>
          )}

          {activeTab === 'assignments' && (
            <button
              onClick={handleOpenAssignModal}
              className="py-2 px-4 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-primary-500/10"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Assignment
            </button>
          )}
        </div>
      </div>

      {/* Global notifications banners */}
      {errorMsg && (
        <div className="glass-panel p-4 border-red-500/20 bg-red-500/5 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-300 leading-relaxed font-medium">{errorMsg}</p>
        </div>
      )}
      {successMsg && (
        <div className="glass-panel p-4 border-emerald-500/20 bg-emerald-500/5 mb-6 flex items-start gap-3">
          <Check className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-300 leading-relaxed font-medium">{successMsg}</p>
        </div>
      )}

      {/* 1. Subjects Grid View */}
      {activeTab === 'subjects' && (
        <div className="glass-panel overflow-hidden border border-dark-850">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-dark-900 border-b border-dark-800 text-[10px] uppercase font-extrabold text-dark-400 tracking-wider">
                  <th className="px-6 py-4">Code</th>
                  <th className="px-6 py-4">Title / Name</th>
                  <th className="px-6 py-4">Credits</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Year</th>
                  <th className="px-6 py-4">Parallel Split?</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-850">
                {filteredSubjects.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-xs text-dark-500 italic">
                      No subjects matched the search query.
                    </td>
                  </tr>
                ) : (
                  filteredSubjects.map(s => (
                    <tr key={s.id} className="hover:bg-dark-900/40 transition-colors">
                      <td className="px-6 py-4">
                        <span className="text-xs font-bold text-primary-400 bg-primary-500/5 border border-primary-500/10 px-2 py-0.5 rounded-lg">
                          {s.code}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-white">
                        {s.name}
                      </td>
                      <td className="px-6 py-4 text-xs text-dark-300 font-medium">
                        {s.credits} Credits
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border uppercase ${
                          s.subject_type === 'LAB' 
                            ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' 
                            : s.subject_type === 'ELECTIVE'
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                            : 'bg-dark-800 border-dark-700 text-dark-300'
                        }`}>
                          {s.subject_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-dark-300 font-medium">
                        Year {s.academic_year}
                      </td>
                      <td className="px-6 py-4 text-xs text-dark-400 font-medium">
                        {s.is_parallel_lab ? (
                          <span className="text-purple-400 font-bold">Yes (Dual split-lab)</span>
                        ) : 'No'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenSubjModal(s)}
                            className="p-1.5 rounded-lg bg-dark-900 text-dark-400 hover:text-white border border-dark-800 transition-colors"
                            title="Edit Subject"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteSubj(s.id)}
                            className="p-1.5 rounded-lg bg-dark-900 text-dark-400 hover:text-red-400 border border-dark-800 transition-colors"
                            title="Delete Subject"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. Faculty Profiles Grid View */}
      {activeTab === 'faculty' && (
        <div className="glass-panel overflow-hidden border border-dark-850">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-dark-900 border-b border-dark-800 text-[10px] uppercase font-extrabold text-dark-400 tracking-wider">
                  <th className="px-6 py-4">Faculty Name</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Designation</th>
                  <th className="px-6 py-4">Max Workload</th>
                  <th className="px-6 py-4">HOD Status</th>
                  <th className="px-6 py-4">Dean Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-850">
                {filteredFaculty.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-10 text-center text-xs text-dark-500 italic">
                      No faculty profiles registered.
                    </td>
                  </tr>
                ) : (
                  filteredFaculty.map(f => (
                    <tr key={f.id} className="hover:bg-dark-900/40 transition-colors">
                      <td className="px-6 py-4 text-xs font-bold text-white">
                        {f.user.full_name}
                      </td>
                      <td className="px-6 py-4 text-xs text-dark-400 font-medium">
                        {f.user.email}
                      </td>
                      <td className="px-6 py-4 text-xs text-dark-300 font-semibold">
                        {f.designation || 'Assistant Professor'}
                      </td>
                      <td className="px-6 py-4 text-xs text-dark-300 font-medium">
                        {f.max_weekly_workload} periods / week
                      </td>
                      <td className="px-6 py-4">
                        {f.is_hod ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-red-500/10 border-red-500/20 text-red-400">HOD</span>
                        ) : (
                          <span className="text-[10px] text-dark-500">No</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {f.is_dean ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-amber-500/10 border-amber-500/20 text-amber-400">Dean</span>
                        ) : (
                          <span className="text-[10px] text-dark-500">No</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenFacModal(f)}
                            className="p-1.5 rounded-lg bg-dark-900 text-dark-400 hover:text-white border border-dark-800 transition-colors"
                            title="Edit Faculty settings"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteFac(f.id)}
                            className="p-1.5 rounded-lg bg-dark-900 text-dark-400 hover:text-red-400 border border-dark-800 transition-colors"
                            title="Delete Faculty profile"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Teaching Assignments Grid View */}
      {activeTab === 'assignments' && (
        <div className="glass-panel overflow-hidden border border-dark-850">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-dark-900 border-b border-dark-800 text-[10px] uppercase font-extrabold text-dark-400 tracking-wider">
                  <th className="px-6 py-4">Section</th>
                  <th className="px-6 py-4">Subject Code</th>
                  <th className="px-6 py-4">Subject Title</th>
                  <th className="px-6 py-4">Mapped Faculty Member</th>
                  <th className="px-6 py-4">Faculty Email</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-850">
                {filteredAssignments.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-xs text-dark-500 italic">
                      No teaching assignments mapped yet.
                    </td>
                  </tr>
                ) : (
                  filteredAssignments.map((a, index) => (
                    <tr key={index} className="hover:bg-dark-900/40 transition-colors">
                      <td className="px-6 py-4">
                        <span className="text-xs font-extrabold text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-2 py-0.5 rounded-lg">
                          {a.section_name}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-dark-300">
                        {a.subject_code}
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-white">
                        {a.subject_name}
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-white">
                        {a.faculty_name}
                      </td>
                      <td className="px-6 py-4 text-xs text-dark-400 font-medium">
                        {a.faculty_email}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditAssignModal(a)}
                            className="p-1.5 rounded-lg bg-dark-900 text-dark-400 hover:text-white border border-dark-800 transition-colors"
                            title="Edit Assignment"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteAssign(a.section_id, a.subject_id, a.faculty_id)}
                            className="p-1.5 rounded-lg bg-dark-900 text-dark-400 hover:text-red-400 border border-dark-800 transition-colors"
                            title="Remove assignment"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: Subject Add/Edit */}
      {isSubjModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg p-6 relative border border-dark-800">
            <button
              onClick={() => setIsSubjModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-400 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold text-white mb-4">
              {editSubj ? 'Modify Subject Record' : 'Register New Subject'}
            </h3>

            <form onSubmit={handleSubjSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-dark-400 block mb-1.5">Subject Code</label>
                <input
                  type="text"
                  placeholder="e.g. 23CD3104"
                  value={subjCode}
                  onChange={(e) => setSubjCode(e.target.value)}
                  className="w-full bg-dark-900 border border-dark-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-400 block mb-1.5">Subject Title / Name</label>
                <input
                  type="text"
                  placeholder="e.g. Artificial Intelligence"
                  value={subjName}
                  onChange={(e) => setSubjName(e.target.value)}
                  className="w-full bg-dark-900 border border-dark-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-dark-400 block mb-1.5">Category Type</label>
                  <select
                    value={subjType}
                    onChange={(e: any) => setSubjType(e.target.value)}
                    className="w-full bg-dark-900 border border-dark-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                  >
                    <option value="THEORY">Theory class</option>
                    <option value="LAB">Practical Lab</option>
                    <option value="ELECTIVE">Elective</option>
                    <option value="COUNSELLING">Counselling</option>
                    <option value="SPORTS_LIBRARY">Sports/Library</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-dark-400 block mb-1.5">Credits (1-6)</label>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={subjCredits}
                    onChange={(e) => setSubjCredits(Number(e.target.value))}
                    className="w-full bg-dark-900 border border-dark-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-dark-400 block mb-1.5">Academic Year (1-4)</label>
                  <input
                    type="number"
                    min={1}
                    max={4}
                    value={subjYear}
                    onChange={(e) => setSubjYear(Number(e.target.value))}
                    className="w-full bg-dark-900 border border-dark-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2 text-xs font-semibold text-dark-400 mb-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isParallelLab}
                      onChange={(e) => setIsParallelLab(e.target.checked)}
                      className="rounded bg-dark-900 border border-dark-800 text-primary-500"
                    />
                    Is Parallel Split Lab? (Rule 8)
                  </label>
                </div>
              </div>

              {isParallelLab && (
                <div>
                  <label className="text-xs font-semibold text-dark-400 block mb-1.5">Linked Parallel Subject</label>
                  <select
                    value={parallelSubjId}
                    onChange={(e) => setParallelSubjId(e.target.value)}
                    className="w-full bg-dark-900 border border-dark-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                  >
                    <option value="">-- No Subject Linked --</option>
                    {subjects.filter(s => s.id !== editSubj?.id).map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-primary-500/15 flex items-center justify-center gap-2 hover:-translate-y-0.5 transition-all duration-300"
              >
                Save Subject Settings
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Faculty Add/Edit */}
      {isFacModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg p-6 relative border border-dark-800">
            <button
              onClick={() => setIsFacModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-400 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold text-white mb-4">
              {editFac ? 'Modify Faculty Settings' : 'Register Faculty Profile'}
            </h3>

            <form onSubmit={handleFacSubmit} className="space-y-4">
              {!editFac && (
                <div>
                  <label className="text-xs font-semibold text-dark-400 block mb-1.5">Select User Account</label>
                  {unassignedUsers.length === 0 ? (
                    <p className="text-xs text-amber-400 italic">No unassigned user accounts available. Create a user first.</p>
                  ) : (
                    <select
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      className="w-full bg-dark-900 border border-dark-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                    >
                      {unassignedUsers.map(u => (
                        <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {editFac && (
                <div>
                  <label className="text-xs font-semibold text-dark-400 block mb-1">Faculty Member</label>
                  <p className="text-sm font-bold text-white">{editFac.user.full_name} ({editFac.user.email})</p>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-dark-400 block mb-1.5">Academic Designation</label>
                <input
                  type="text"
                  placeholder="e.g. Associate Professor"
                  value={facDesignation}
                  onChange={(e) => setFacDesignation(e.target.value)}
                  className="w-full bg-dark-900 border border-dark-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-400 block mb-1.5">Max Weekly Workload (Hours)</label>
                <input
                  type="number"
                  min={1}
                  max={40}
                  value={facMaxWorkload}
                  onChange={(e) => setFacMaxWorkload(Number(e.target.value))}
                  className="w-full bg-dark-900 border border-dark-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                />
              </div>

              <div className="flex gap-6 pt-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-dark-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={facIsHOD}
                    onChange={(e) => setFacIsHOD(e.target.checked)}
                    className="rounded bg-dark-900 border border-dark-800 text-primary-500"
                  />
                  Is Head of Department (HOD)
                </label>

                <label className="flex items-center gap-2 text-xs font-semibold text-dark-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={facIsDean}
                    onChange={(e) => setFacIsDean(e.target.checked)}
                    className="rounded bg-dark-900 border border-dark-800 text-primary-500"
                  />
                  Is Academic Dean
                </label>
              </div>

              <button
                type="submit"
                disabled={!editFac && unassignedUsers.length === 0}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-primary-500/15 flex items-center justify-center gap-2 hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50"
              >
                Save Faculty Settings
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Teaching Mappings Add */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg p-6 relative border border-dark-800">
            <button
              onClick={() => setIsAssignModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-400 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold text-white mb-4">
              {editAssign ? 'Edit Teaching Assignment' : 'Map Section-Subject-Teacher'}
            </h3>

            <form onSubmit={handleAssignSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-dark-400 block mb-1.5">Target Section</label>
                {editAssign ? (
                  <div className="bg-dark-950 border border-dark-800 rounded-xl px-4 py-2.5 text-sm text-dark-300 font-semibold select-none">
                    {editAssign.section_name}
                  </div>
                ) : (
                  <select
                    value={assignSectionId}
                    onChange={(e) => setAssignSectionId(e.target.value)}
                    className="w-full bg-dark-900 border border-dark-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                  >
                    {sections.map(s => (
                      <option key={s.id} value={s.id}>{s.name} (Year {s.academic_year})</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-400 block mb-1.5">Subject</label>
                {editAssign ? (
                  <div className="bg-dark-950 border border-dark-800 rounded-xl px-4 py-2.5 text-sm text-dark-300 font-semibold select-none">
                    {editAssign.subject_name} ({editAssign.subject_code})
                  </div>
                ) : (
                  <select
                    value={assignSubjectId}
                    onChange={(e) => setAssignSubjectId(e.target.value)}
                    className="w-full bg-dark-900 border border-dark-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                  >
                    {subjects.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-400 block mb-1.5">Assign Instructor / Faculty</label>
                <select
                  value={assignFacultyId}
                  onChange={(e) => setAssignFacultyId(e.target.value)}
                  className="w-full bg-dark-900 border border-dark-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
                >
                  {faculty.map(f => (
                    <option key={f.id} value={f.id}>{f.user.full_name} ({f.user.email})</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-primary-500/15 flex items-center justify-center gap-2 hover:-translate-y-0.5 transition-all duration-300"
              >
                {editAssign ? 'Update Instructor Assignment' : 'Create Mapped Assignment'}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};
