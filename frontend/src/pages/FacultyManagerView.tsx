import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { facultyService } from '../services/facultyService';
import type { FacultyProfile, Department, Subject, UserMini } from '../services/facultyService';
import { Search, Plus, Edit, Trash2, CalendarDays, RefreshCw, X, ChevronLeft } from 'lucide-react';
import { getUserDeptId, isUserAdminOrDean } from '../utils/security';

interface FacultyManagerViewProps {
  onBack: () => void;
  onOpenAvailability: (facultyId: string, facultyName: string) => void;
}

export const FacultyManagerView: React.FC<FacultyManagerViewProps> = ({ onBack, onOpenAvailability }) => {
  const { user } = useAuth();
  
  const [profiles, setProfiles] = useState<FacultyProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [users, setUsers] = useState<UserMini[]>([]);
  
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<FacultyProfile | null>(null);
  
  // Form values
  const [formUserId, setFormUserId] = useState('');
  const [formDeptId, setFormDeptId] = useState('');
  const [formDesignation, setFormDesignation] = useState('');
  const [formMaxWorkload, setFormMaxWorkload] = useState(16);
  const [formOfficeHours, setFormOfficeHours] = useState('');
  const [formIsHod, setFormIsHod] = useState(false);
  const [formIsDean, setFormIsDean] = useState(false);
  const [formSubjectIds, setFormSubjectIds] = useState<string[]>([]);
  
  const [formError, setFormError] = useState('');

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [deptsData, subjsData, usersData] = await Promise.all([
        facultyService.getDepartments(),
        facultyService.getSubjects(),
        facultyService.getUsers()
      ]);
      
      setDepartments(deptsData);
      setSubjects(subjsData);
      setUsers(usersData);

      // Security Scoping: HODs get strictly scoped profiles for their department only
      let targetDeptId: string | undefined = undefined;
      if (!isUserAdminOrDean(user)) {
        targetDeptId = getUserDeptId(user, deptsData);
        if (targetDeptId) {
          setDeptFilter(targetDeptId);
        }
      }

      const profilesData = await facultyService.getFacultyProfiles(targetDeptId);
      setProfiles(profilesData);
    } catch (err) {
      console.error('Failed to load faculty registry data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const openAddModal = () => {
    setEditingProfile(null);
    setFormUserId('');
    setFormDeptId('');
    setFormDesignation('Assistant Professor');
    setFormMaxWorkload(16);
    setFormOfficeHours('');
    setFormSubjectIds([]);
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (profile: FacultyProfile) => {
    if (profile) {
      setEditingProfile(profile);
      setFormUserId(profile.user_id);
      setFormDeptId(profile.department_id || '');
      setFormDesignation(profile.designation);
      setFormIsHod(profile.is_hod || false);
      setFormIsDean(profile.is_dean || false);
      setFormMaxWorkload(profile.max_weekly_workload);
      setFormOfficeHours(profile.office_hours || '');
      setFormSubjectIds(profile.subjects.map(s => s.id));
    } else {
      setEditingProfile(null);
      setFormUserId('');
      setFormDeptId(departments[0]?.id || '');
      setFormDesignation('');
      setFormIsHod(false);
      setFormIsDean(false);
      setFormMaxWorkload(16);
      setFormOfficeHours('');
      setFormSubjectIds([]);
    }
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formUserId && !editingProfile) {
      setFormError('Please select a user account.');
      return;
    }
    if (!formDesignation.trim()) {
      setFormError('Designation is required.');
      return;
    }

    const payload = {
      department_id: formDeptId || undefined,
      designation: formDesignation.trim(),
      is_hod: formIsHod,
      is_dean: formIsDean,
      max_weekly_workload: formMaxWorkload,
      office_hours: formOfficeHours.trim() || undefined,
      subject_ids: formSubjectIds
    };

    try {
      if (editingProfile) {
        // Update
        const updated = await facultyService.updateFacultyProfile(editingProfile.id, payload);
        setProfiles(profiles.map(p => p.id === editingProfile.id ? updated : p));
      } else {
        // Create
        const created = await facultyService.createFacultyProfile({
          user_id: formUserId,
          ...payload
        });
        setProfiles([created, ...profiles]);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setFormError(err.response?.data?.detail || 'Failed to save faculty profile.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this faculty profile? Their availability grid and subject mappings will be deleted.')) {
      return;
    }
    try {
      await facultyService.deleteFacultyProfile(id);
      setProfiles(profiles.filter(p => p.id !== id));
    } catch (err) {
      alert('Failed to delete faculty profile.');
    }
  };

  const handleSubjectToggle = (subjId: string) => {
    if (formSubjectIds.includes(subjId)) {
      setFormSubjectIds(formSubjectIds.filter(id => id !== subjId));
    } else {
      setFormSubjectIds([...formSubjectIds, subjId]);
    }
  };

  // Filter profiles
  const filteredProfiles = profiles.filter(p => {
    const nameMatch = p.user?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                      p.user?.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const deptMatch = !deptFilter || p.department_id === deptFilter;
    return nameMatch && deptMatch;
  });

  // Filter users that don't have profiles yet (only when adding a new profile)
  const availableUsers = users.filter(u => {
    // Role must be FACULTY or HOD
    if (u.role !== 'FACULTY' && u.role !== 'HOD') return false;
    // Must not already have a profile
    return !profiles.some(p => p.user_id === u.id);
  });

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 hover:bg-slate-200 transition-all font-bold shadow-sm"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-2xl font-black text-slate-900">Faculty Registry</h2>
            <p className="text-slate-600 text-sm font-semibold">Assign workloads, department designations and subject experts</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="p-3 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 hover:bg-slate-200 transition-all shadow-sm"
            title="Refresh Registry"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 py-3 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold shadow-md shadow-blue-600/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Faculty Profile
          </button>
        </div>
      </div>

      {/* Filter and Search Registry */}
      <div className="glass-panel p-4 mb-8 flex flex-col md:flex-row gap-4 items-center justify-between bg-white border border-slate-300 shadow-sm rounded-2xl">
        <div className="relative w-full md:w-96">
          <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by faculty name or email..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-bold placeholder-slate-400 focus:border-blue-600 outline-none transition-all"
          />
        </div>

        <div className="w-full md:w-64">
          <select
            value={deptFilter}
            onChange={e => {
              if (user?.role === 'ADMIN' || user?.role === 'DEAN') {
                setDeptFilter(e.target.value);
              }
            }}
            disabled={user?.role !== 'ADMIN' && user?.role !== 'DEAN'}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-extrabold focus:border-blue-600 outline-none transition-all disabled:opacity-80 cursor-not-allowed shadow-sm"
          >
            {user?.role === 'ADMIN' || user?.role === 'DEAN' ? (
              <option value="" className="bg-white text-slate-900 font-extrabold py-1">All Departments</option>
            ) : null}
            {departments
              .filter(d => (user?.role === 'ADMIN' || user?.role === 'DEAN') ? true : d.id === deptFilter)
              .map(d => (
                <option key={d.id} value={d.id} className="bg-white text-slate-900 font-bold py-1">{d.name} ({d.code})</option>
              ))}
          </select>
        </div>
      </div>

      {/* Faculty Cards Grid */}
      {isLoading ? (
        <div className="text-center py-20">
          <p className="text-slate-600 text-lg font-bold">Loading faculty registry...</p>
        </div>
      ) : filteredProfiles.length === 0 ? (
        <div className="text-center py-20 glass-panel bg-white border border-slate-300 rounded-2xl shadow-sm">
          <p className="text-slate-600 text-lg font-semibold">No faculty members matched the search filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProfiles.map(p => {
            const rawRatio = p.max_weekly_workload > 0 ? (p.current_weekly_workload / p.max_weekly_workload) : 0;
            const workloadPct = Math.round(rawRatio * 100);
            
            // Workload warning color classes
            let progressColor = 'bg-emerald-600';
            let badgeBg = 'bg-emerald-50 text-emerald-800 border-emerald-300 font-black';
            let statusText = `${workloadPct}% Capacity`;

            if (rawRatio > 1.0) {
              progressColor = 'bg-red-600';
              badgeBg = 'bg-red-50 text-red-800 border-red-300 font-black';
              statusText = `${workloadPct}% Overutilized`;
            } else if (rawRatio >= 0.8) {
              progressColor = 'bg-amber-500';
              badgeBg = 'bg-amber-50 text-amber-900 border-amber-300 font-black';
              statusText = `${workloadPct}% Heavy Load`;
            } else if (p.current_weekly_workload === 0) {
              progressColor = 'bg-slate-300';
              badgeBg = 'bg-slate-100 text-slate-700 border-slate-300 font-bold';
              statusText = 'Unassigned';
            }

            return (
              <div key={p.id} className="glass-panel glass-panel-hover p-6 flex flex-col justify-between bg-white border border-slate-300 shadow-sm rounded-2xl hover:border-blue-600 transition-all">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-black text-slate-900 leading-tight">{p.user?.full_name}</h3>
                      <p className="text-xs text-slate-600 font-semibold mt-1">{p.user?.email}</p>
                    </div>
                    {p.department && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-black uppercase tracking-wider">
                        {p.department.code}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 mb-5">
                    <p className="text-xs text-slate-800 font-extrabold">{p.designation}</p>
                    {p.office_hours && (
                      <p className="text-xs text-slate-600 font-semibold">Office: {p.office_hours}</p>
                    )}
                  </div>

                  {/* Workload Progress Bar */}
                  <div className="space-y-2 mb-6">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="text-slate-700">Weekly Workload</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-900 font-black">{p.current_weekly_workload} / {p.max_weekly_workload} hrs</span>
                        <span className={`text-[9px] px-2 py-0.5 rounded border ${badgeBg}`}>
                          {statusText}
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden border border-slate-300 p-0.5">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                        style={{ width: `${Math.min(workloadPct, 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Expertise Subjects */}
                  <div className="mb-6">
                    <h4 className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider mb-2">Subject Expertise</h4>
                    {p.subjects.length === 0 ? (
                      <span className="text-xs text-slate-500 italic font-semibold">No subjects mapped yet</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {p.subjects.map(s => (
                          <span 
                            key={s.id} 
                            className="text-[10px] px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-800 font-extrabold"
                            title={s.name}
                          >
                            {s.code}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card footer controls */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200 mt-auto">
                  <button
                    onClick={() => onOpenAvailability(p.id, p.user?.full_name)}
                    className="flex items-center gap-1.5 text-xs text-blue-700 hover:text-blue-900 font-extrabold transition-all"
                  >
                    <CalendarDays className="w-4 h-4" />
                    Availability
                  </button>

                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditModal(p)}
                      className="p-2 rounded-lg bg-slate-100 border border-slate-300 text-slate-800 hover:bg-slate-200 transition-all font-bold shadow-sm"
                      title="Edit Profile"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-2 rounded-lg bg-slate-100 border border-slate-300 text-red-700 hover:bg-red-50 hover:border-red-300 transition-all font-bold shadow-sm"
                      title="Delete Profile"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Slide-in Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 relative bg-white border border-slate-300 shadow-2xl rounded-2xl text-slate-900">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 hover:bg-slate-200 transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-xl font-black text-slate-900 mb-6">
              {editingProfile ? 'Edit Faculty Profile' : 'Create Faculty Profile'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* User Account Selection */}
              <div>
                <label className="text-xs font-extrabold text-slate-800 block mb-1.5">Linked User Account</label>
                {editingProfile ? (
                  <div className="px-4 py-3 bg-slate-100 border border-slate-300 rounded-xl text-slate-900 text-sm font-extrabold">
                    {editingProfile.user?.full_name} ({editingProfile.user?.email})
                  </div>
                ) : (
                  <select
                    value={formUserId}
                    onChange={e => setFormUserId(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-extrabold focus:border-blue-600 outline-none transition-all shadow-sm"
                  >
                    <option value="" className="bg-white text-slate-900">Select a user account</option>
                    {availableUsers.map(u => (
                      <option key={u.id} value={u.id} className="bg-white text-slate-900 font-bold">
                        {u.full_name} ({u.email} - {u.role})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Department and Designation */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-extrabold text-slate-800 block mb-1.5">Department</label>
                  <select
                    value={formDeptId}
                    onChange={e => setFormDeptId(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-extrabold focus:border-blue-600 outline-none transition-all shadow-sm"
                  >
                    <option value="" className="bg-white text-slate-900">Unassigned</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id} className="bg-white text-slate-900 font-bold">{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-extrabold text-slate-800 block mb-1.5">Designation</label>
                  <input
                    type="text"
                    placeholder="e.g. Associate Professor"
                    value={formDesignation}
                    onChange={e => setFormDesignation(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-bold focus:border-blue-600 outline-none transition-all shadow-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-300">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formIsHod}
                      onChange={e => setFormIsHod(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 accent-blue-600"
                    />
                    <span className="text-xs font-extrabold text-slate-900">HOD Status (Rules 1 & 2)</span>
                  </label>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-300">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formIsDean}
                      onChange={e => setFormIsDean(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 accent-indigo-600"
                    />
                    <span className="text-xs font-extrabold text-slate-900">Academic Dean Status (Rule 21)</span>
                  </label>
                </div>
              </div>

              {/* Workload and Office Hours */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-extrabold text-slate-800 block mb-1.5">Max Weekly Workload (hrs)</label>
                  <input
                    type="number"
                    min="1"
                    max="40"
                    value={formMaxWorkload}
                    onChange={e => setFormMaxWorkload(parseInt(e.target.value) || 16)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-bold focus:border-blue-600 outline-none transition-all shadow-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-extrabold text-slate-800 block mb-1.5">Office Hours Schedule</label>
                  <input
                    type="text"
                    placeholder="e.g. Mon/Wed 2 PM - 4 PM"
                    value={formOfficeHours}
                    onChange={e => setFormOfficeHours(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-bold focus:border-blue-600 outline-none transition-all shadow-sm"
                  />
                </div>
              </div>

              {/* Subject Expertise Mappings */}
              <div>
                <label className="text-xs font-extrabold text-slate-800 block mb-3">Subject Expertise Mappings</label>
                {subjects.length === 0 ? (
                  <p className="text-xs text-slate-500 italic font-semibold">Please add subjects first in the Departments & Subjects tab.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto p-3 bg-slate-50 border border-slate-300 rounded-xl pr-2">
                    {subjects.map(s => {
                      const isChecked = formSubjectIds.includes(s.id);
                      return (
                        <div 
                          key={s.id} 
                          onClick={() => handleSubjectToggle(s.id)}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer select-none transition-all ${
                            isChecked 
                              ? 'bg-blue-50 border-blue-300 text-blue-900 shadow-sm' 
                              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                            isChecked ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'
                          }`}>
                            {isChecked && <Plus className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <div>
                            <p className="text-xs font-bold leading-none">{s.name}</p>
                            <span className="text-[9px] text-slate-500 mt-1 inline-block font-bold">{s.code}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {formError && <p className="text-sm font-bold text-red-600">{formError}</p>}

              <button
                type="submit"
                className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-extrabold shadow-md shadow-blue-600/20 transition-all"
              >
                Save Profile
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
