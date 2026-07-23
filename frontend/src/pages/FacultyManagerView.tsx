import React, { useState, useEffect } from 'react';
import { facultyService } from '../services/facultyService';
import type { FacultyProfile, Department, Subject, UserMini } from '../services/facultyService';
import { Search, Plus, Edit, Trash2, CalendarDays, RefreshCw, X, ChevronLeft } from 'lucide-react';

interface FacultyManagerViewProps {
  onBack: () => void;
  onOpenAvailability: (facultyId: string, facultyName: string) => void;
}

export const FacultyManagerView: React.FC<FacultyManagerViewProps> = ({ onBack, onOpenAvailability }) => {
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
      const [profilesData, deptsData, subjsData, usersData] = await Promise.all([
        facultyService.getFacultyProfiles(),
        facultyService.getDepartments(),
        facultyService.getSubjects(),
        facultyService.getUsers()
      ]);
      setProfiles(profilesData);
      setDepartments(deptsData);
      setSubjects(subjsData);
      setUsers(usersData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
            className="p-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white transition-all duration-300"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-2xl font-extrabold text-white">Faculty Registry</h2>
            <p className="text-dark-400 text-sm">Assign workloads, department designations and subject experts</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="p-3 rounded-xl bg-dark-900 border border-dark-800 text-dark-400 hover:text-white transition-all duration-300"
            title="Refresh Registry"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 py-3 px-5 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-primary-500/15 transition-all duration-300"
          >
            <Plus className="w-4 h-4" />
            Add Faculty Profile
          </button>
        </div>
      </div>

      {/* Filter and Search Registry */}
      <div className="glass-panel p-4 mb-8 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-5 h-5 text-dark-500 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by faculty name or email..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none transition-all duration-300"
          />
        </div>

        <div className="w-full md:w-64">
          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none transition-all duration-300"
          >
            <option value="">All Departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Faculty Cards Grid */}
      {isLoading ? (
        <div className="text-center py-20">
          <p className="text-dark-400 text-lg">Loading faculty registry...</p>
        </div>
      ) : filteredProfiles.length === 0 ? (
        <div className="text-center py-20 glass-panel">
          <p className="text-dark-500 text-lg font-medium">No faculty members matched the search filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProfiles.map(p => {
            const workloadPct = Math.min((p.current_weekly_workload / p.max_weekly_workload) * 100, 100);
            
            // Workload warning color classes
            let progressColor = 'bg-emerald-500 shadow-emerald-500/20';
            if (p.max_weekly_workload > 0) {
              const ratio = p.current_weekly_workload / p.max_weekly_workload;
              if (ratio >= 1.0) {
                progressColor = 'bg-red-500 shadow-red-500/20';
              } else if (ratio >= 0.75) {
                progressColor = 'bg-amber-500 shadow-amber-500/20';
              }
            }

            return (
              <div key={p.id} className="glass-panel glass-panel-hover p-6 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white leading-tight">{p.user?.full_name}</h3>
                      <p className="text-xs text-dark-400 font-medium mt-1">{p.user?.email}</p>
                    </div>
                    {p.department && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold uppercase tracking-wider">
                        {p.department.code}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 mb-5">
                    <p className="text-xs text-dark-300 font-semibold">{p.designation}</p>
                    {p.office_hours && (
                      <p className="text-xs text-dark-500">Office: {p.office_hours}</p>
                    )}
                  </div>

                  {/* Workload Progress */}
                  <div className="space-y-1.5 mb-6">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-dark-400">Weekly Workload</span>
                      <span className="text-white">{p.current_weekly_workload} / {p.max_weekly_workload} hrs</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-dark-900 overflow-hidden border border-dark-800">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                        style={{ width: `${workloadPct}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Expertise Subjects */}
                  <div className="mb-6">
                    <h4 className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-2">Subject Expertise</h4>
                    {p.subjects.length === 0 ? (
                      <span className="text-xs text-dark-500 italic">No subjects mapped yet</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {p.subjects.map(s => (
                          <span 
                            key={s.id} 
                            className="text-[10px] px-2 py-0.5 rounded bg-dark-900 border border-dark-800 text-dark-300 font-medium"
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
                <div className="flex items-center justify-between pt-4 border-t border-dark-800/40 mt-auto">
                  <button
                    onClick={() => onOpenAvailability(p.id, p.user?.full_name)}
                    className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 font-bold transition-all duration-300"
                  >
                    <CalendarDays className="w-4 h-4" />
                    Availability
                  </button>

                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditModal(p)}
                      className="p-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-400 hover:text-white hover:border-dark-700 transition-all duration-300"
                      title="Edit Profile"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="p-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-400 hover:text-red-400 hover:border-red-500/30 transition-all duration-300"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 relative">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-400 hover:text-white transition-all duration-300"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-xl font-extrabold text-white mb-6">
              {editingProfile ? 'Edit Faculty Profile' : 'Create Faculty Profile'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* User Account Selection */}
              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Linked User Account</label>
                {editingProfile ? (
                  <div className="px-4 py-3 bg-dark-900/60 border border-dark-800 rounded-xl text-dark-400 text-sm font-semibold">
                    {editingProfile.user?.full_name} ({editingProfile.user?.email})
                  </div>
                ) : (
                  <select
                    value={formUserId}
                    onChange={e => setFormUserId(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none transition-all duration-300"
                  >
                    <option value="">Select a user account</option>
                    {availableUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.email} - {u.role})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Department and Designation */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5">Department</label>
                  <select
                    value={formDeptId}
                    onChange={e => setFormDeptId(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none transition-all duration-300"
                  >
                    <option value="">Unassigned</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5">Designation</label>
                  <input
                    type="text"
                    placeholder="e.g. Associate Professor"
                    value={formDesignation}
                    onChange={e => setFormDesignation(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none transition-all duration-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-dark-950/40 border border-dark-850">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formIsHod}
                      onChange={e => setFormIsHod(e.target.checked)}
                      className="w-4 h-4 rounded border-dark-800 text-primary-500 accent-primary-500"
                    />
                    <span className="text-xs font-bold text-white">HOD Status (Rules 1 & 2)</span>
                  </label>
                </div>
                <div className="p-3 rounded-xl bg-dark-950/40 border border-dark-850">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formIsDean}
                      onChange={e => setFormIsDean(e.target.checked)}
                      className="w-4 h-4 rounded border-dark-800 text-indigo-500 accent-indigo-500"
                    />
                    <span className="text-xs font-bold text-white">Academic Dean Status (Rule 21)</span>
                  </label>
                </div>
              </div>

              {/* Workload and Office Hours */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5">Max Weekly Workload (hrs)</label>
                  <input
                    type="number"
                    min="1"
                    max="40"
                    value={formMaxWorkload}
                    onChange={e => setFormMaxWorkload(parseInt(e.target.value) || 16)}
                    className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none transition-all duration-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5">Office Hours Schedule</label>
                  <input
                    type="text"
                    placeholder="e.g. Mon/Wed 2 PM - 4 PM"
                    value={formOfficeHours}
                    onChange={e => setFormOfficeHours(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none transition-all duration-300"
                  />
                </div>
              </div>

              {/* Subject Expertise Mappings */}
              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-3">Subject Expertise Mappings</label>
                {subjects.length === 0 ? (
                  <p className="text-xs text-dark-500 italic">Please add subjects first in the Departments & Subjects tab.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto p-3 bg-dark-950/50 border border-dark-850 rounded-xl pr-2">
                    {subjects.map(s => {
                      const isChecked = formSubjectIds.includes(s.id);
                      return (
                        <div 
                          key={s.id} 
                          onClick={() => handleSubjectToggle(s.id)}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer select-none transition-all duration-200 ${
                            isChecked 
                              ? 'bg-primary-500/10 border-primary-500/35 text-white' 
                              : 'bg-dark-900 border-dark-800/80 text-dark-400 hover:bg-dark-850/80 hover:text-white'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                            isChecked ? 'bg-primary-500 border-primary-500 text-white' : 'border-dark-700'
                          }`}>
                            {isChecked && <Plus className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <div>
                            <p className="text-xs font-bold leading-none">{s.name}</p>
                            <span className="text-[9px] text-dark-500 mt-1 inline-block font-semibold">{s.code}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {formError && <p className="text-sm font-semibold text-red-400">{formError}</p>}

              <button
                type="submit"
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-primary-500/15 transition-all duration-300"
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
