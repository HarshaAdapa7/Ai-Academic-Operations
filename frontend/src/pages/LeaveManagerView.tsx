import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { leaveService } from '../services/leaveService';
import type { LeaveBalance, LeaveRequest, SubProposal } from '../services/leaveService';
import { facultyService } from '../services/facultyService';
import type { Subject, FacultyProfile } from '../services/facultyService';
import { ChevronLeft, Plus, Check, X, Bookmark, RefreshCw, Trash2, UserCheck, AlertCircle } from 'lucide-react';

interface LeaveManagerViewProps {
  onBack: () => void;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SLOTS = [1, 2, 3, 4, 5, 6];

export const LeaveManagerView: React.FC<LeaveManagerViewProps> = ({ onBack }) => {
  const { user } = useAuth();
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [proposals, setProposals] = useState<SubProposal[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [facultyProfiles, setFacultyProfiles] = useState<FacultyProfile[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'leaves' | 'inbox'>('leaves');
  
  // Apply Leave form states
  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [formLeaveType, setFormLeaveType] = useState('Casual');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formError, setFormError] = useState('');
  
  // Substitution builder state
  const [subProposals, setSubProposals] = useState<{
    day_of_week: string;
    time_slot: number;
    subject_id: string;
    substitute_faculty_id: string;
    availableSubstitutes: FacultyProfile[];
  }[]>([]);

  // Individual substitute builder row state
  const [tempDay, setTempDay] = useState('Monday');
  const [tempSlot, setTempSlot] = useState(1);
  const [tempSubjId, setTempSubjId] = useState('');
  const [tempSubId, setTempSubId] = useState('');
  const [tempSubs, setTempSubs] = useState<FacultyProfile[]>([]);
  const [tempLoadingSubs, setTempLoadingSubs] = useState(false);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [balsData, reqsData, propsData, subjsData, profsData] = await Promise.all([
        user?.role === 'FACULTY' ? leaveService.getLeaveBalances() : Promise.resolve([]),
        leaveService.getLeaveRequests(),
        user?.role === 'FACULTY' ? leaveService.getMySubProposals() : Promise.resolve([]),
        facultyService.getSubjects(),
        facultyService.getFacultyProfiles()
      ]);
      setBalances(balsData);
      setRequests(reqsData);
      setProposals(propsData);
      setSubjects(subjsData);
      setFacultyProfiles(profsData);
    } catch (err) {
      console.error('Failed to load leave data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  // Query eligible substitutes when slot/subject selected in builder
  const handleQuerySubstitutes = async (day: string, slot: number, subjId: string) => {
    if (!day || !slot || !subjId) {
      setTempSubs([]);
      return;
    }
    try {
      setTempLoadingSubs(true);
      const eligs = await leaveService.getEligibleSubstitutes({
        day_of_week: day,
        time_slot: slot,
        subject_id: subjId
      });
      setTempSubs(eligs);
      if (eligs.length > 0) {
        setTempSubId(eligs[0].id);
      } else {
        setTempSubId('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTempLoadingSubs(false);
    }
  };

  useEffect(() => {
    handleQuerySubstitutes(tempDay, tempSlot, tempSubjId);
  }, [tempDay, tempSlot, tempSubjId]);

  const addSubstitutionRow = () => {
    if (!tempSubjId || !tempSubId) {
      alert('Please select both a subject and an eligible substitute faculty member.');
      return;
    }
    
    // Check if row already added
    const exists = subProposals.some(p => p.day_of_week === tempDay && p.time_slot === tempSlot);
    if (exists) {
      alert('A substitution is already configured for this day and slot.');
      return;
    }

    setSubProposals([...subProposals, {
      day_of_week: tempDay,
      time_slot: tempSlot,
      subject_id: tempSubjId,
      substitute_faculty_id: tempSubId,
      availableSubstitutes: tempSubs
    }]);

    setTempSubjId('');
    setTempSubId('');
    setTempSubs([]);
  };

  const removeSubstitutionRow = (index: number) => {
    setSubProposals(subProposals.filter((_, i) => i !== index));
  };

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formStartDate || !formEndDate || !formReason.trim()) {
      setFormError('Start date, End date, and Reason are required.');
      return;
    }

    const duration = Math.floor((new Date(formEndDate).getTime() - new Date(formStartDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (duration <= 0) {
      setFormError('End date must be after or equal to Start date.');
      return;
    }

    try {
      await leaveService.applyLeave({
        leave_type: formLeaveType,
        start_date: new Date(formStartDate).toISOString(),
        end_date: new Date(formEndDate).toISOString(),
        reason: formReason,
        substitution_proposals: subProposals.map(p => ({
          day_of_week: p.day_of_week,
          time_slot: p.time_slot,
          subject_id: p.subject_id,
          substitute_faculty_id: p.substitute_faculty_id
        }))
      });
      setIsApplyOpen(false);
      loadData();
      
      // Clear forms
      setFormReason('');
      setFormStartDate('');
      setFormEndDate('');
      setSubProposals([]);
    } catch (err: any) {
      setFormError(err.response?.data?.detail || 'Failed to submit leave application.');
    }
  };

  const handleRespondProposal = async (id: string, status: 'ACCEPTED' | 'DECLINED') => {
    try {
      await leaveService.respondSubProposal(id, status);
      loadData();
    } catch (err) {
      alert('Failed to submit response.');
    }
  };

  const handleHODDecision = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    if (!window.confirm(`Are you sure you want to ${status.toLowerCase()} this leave request?`)) {
      return;
    }
    try {
      await leaveService.updateLeaveStatus(id, status);
      loadData();
    } catch (err) {
      alert('Failed to update leave request status.');
    }
  };

  const getSubName = (subId: string) => {
    const prof = facultyProfiles.find(p => p.id === subId);
    return prof ? prof.user?.full_name : 'Unknown Faculty';
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white transition-all duration-300"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-2xl font-extrabold text-white">Leave & Substitutions Desk</h2>
            <p className="text-dark-400 text-sm">Request leaves, manage peer session coverages, and approve absences</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="p-3 rounded-xl bg-dark-900 border border-dark-800 text-dark-400 hover:text-white transition-all duration-300"
            title="Refresh Ledger"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          {user?.role === 'FACULTY' && (
            <button
              onClick={() => {
                setSubProposals([]);
                setFormError('');
                setIsApplyOpen(true);
              }}
              className="flex items-center gap-2 py-3 px-5 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-primary-500/15 transition-all duration-300"
            >
              <Plus className="w-4 h-4" />
              Apply for Leave
            </button>
          )}
        </div>
      </div>

      {/* Faculty Leave Balances Registry */}
      {user?.role === 'FACULTY' && balances.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {balances.map(bal => {
            const remaining = bal.total_allowed - bal.taken;
            return (
              <div key={bal.id} className="glass-panel p-6 relative overflow-hidden">
                <div className="absolute right-4 top-4 w-8 h-8 rounded-full bg-primary-500/5 flex items-center justify-center border border-primary-500/10">
                  <Bookmark className="w-4 h-4 text-primary-400" />
                </div>
                <h4 className="text-xs font-bold text-dark-400 uppercase tracking-widest">{bal.leave_type} Leave</h4>
                <div className="flex items-baseline gap-2 mt-4">
                  <span className="text-3xl font-extrabold text-white">{remaining}</span>
                  <span className="text-xs font-medium text-dark-500">days left</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-dark-900 border border-dark-850 mt-4 overflow-hidden">
                  <div 
                    className="h-full rounded-full bg-primary-500" 
                    style={{ width: `${(bal.taken / bal.total_allowed) * 100}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[10px] font-semibold mt-2 text-dark-500">
                  <span>{bal.taken} Taken</span>
                  <span>{bal.total_allowed} Allowed</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tabs Switcher (Faculty Only) */}
      {user?.role === 'FACULTY' && balances.length > 0 && (
        <div className="flex gap-2 p-1 bg-dark-900 border border-dark-800 rounded-xl max-w-sm mb-8">
          <button
            onClick={() => setActiveTab('leaves')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'leaves' 
                ? 'bg-primary-500 text-white' 
                : 'text-dark-400 hover:text-white'
            }`}
          >
            My Applications
          </button>
          <button
            onClick={() => setActiveTab('inbox')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'inbox' 
                ? 'bg-primary-500 text-white' 
                : 'text-dark-400 hover:text-white'
            }`}
          >
            Substitutions Inbox
            {proposals.filter(p => p.status === 'PENDING').length > 0 && (
              <span className="w-2 h-2 rounded-full bg-red-500"></span>
            )}
          </button>
        </div>
      )}

      {/* Tab Panels */}
      {isLoading ? (
        <div className="text-center py-20">
          <p className="text-dark-400 text-lg">Loading leave records...</p>
        </div>
      ) : user?.role === 'FACULTY' ? (
        balances.length === 0 ? (
          <div className="glass-panel p-8 text-center max-w-2xl mx-auto my-12 border-amber-500/20">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-400 mx-auto mb-6 border border-amber-500/20">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Faculty Profile Setup Required</h3>
            <p className="text-dark-400 text-sm leading-relaxed mb-6">
              Your teaching profile has not been configured in the system yet. Please request your branch HOD or Administrator to set up your profile under the **Faculty Profiles** registry. Once set up, you will be able to manage leave applications and cover peer substitution arrangements.
            </p>
          </div>
        ) : activeTab === 'leaves' ? (
          /* My Applications Tab */
          <div className="glass-panel p-6">
            <h3 className="text-lg font-bold text-white mb-6">Leave Applications History</h3>
            {requests.length === 0 ? (
              <p className="text-sm text-dark-500 py-6">You have not submitted any leave requests yet.</p>
            ) : (
              <div className="space-y-6">
                {requests.map(req => {
                  const startStr = new Date(req.start_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                  const endStr = new Date(req.end_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                  
                  let badgeColor = 'bg-dark-900 border-dark-800 text-dark-400';
                  if (req.status === 'APPROVED') badgeColor = 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400';
                  if (req.status === 'REJECTED') badgeColor = 'bg-red-500/10 border-red-500/25 text-red-400';
                  if (req.status === 'PENDING') badgeColor = 'bg-amber-500/10 border-amber-500/25 text-amber-400';

                  return (
                    <div key={req.id} className="p-5 rounded-xl border border-dark-850/60 bg-dark-950/20 space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-bold text-white">{req.leave_type} Leave</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${badgeColor}`}>
                              {req.status}
                            </span>
                          </div>
                          <p className="text-xs text-dark-400 mt-1">{startStr} - {endStr}</p>
                        </div>
                        <span className="text-xs text-dark-500 font-semibold">Filed: {new Date(req.created_at).toLocaleDateString()}</span>
                      </div>
                      
                      <p className="text-xs text-dark-300 italic">" {req.reason} "</p>

                      {/* Substitutes mappings summary */}
                      {req.substitution_proposals.length > 0 && (
                        <div className="border-t border-dark-850/40 pt-4 mt-2">
                          <h5 className="text-[10px] font-bold text-dark-500 uppercase tracking-wider mb-2">Class Coverage Arrangements</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {req.substitution_proposals.map(prop => {
                              let propBadge = 'bg-dark-900 border-dark-800 text-dark-400';
                              if (prop.status === 'ACCEPTED') propBadge = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
                              if (prop.status === 'DECLINED') propBadge = 'bg-red-500/10 border-red-500/20 text-red-400';

                              return (
                                <div key={prop.id} className="flex justify-between items-center p-3 rounded-lg bg-dark-900/60 border border-dark-850/40">
                                  <div>
                                    <p className="text-xs font-semibold text-white">{prop.subject?.name} ({prop.subject?.code})</p>
                                    <p className="text-[10px] text-dark-400 mt-0.5">{prop.day_of_week} Slot {prop.time_slot} | Sub: {getSubName(prop.substitute_faculty_id)}</p>
                                  </div>
                                  <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${propBadge}`}>
                                    {prop.status}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Substitutions Inbox Tab */
          <div className="glass-panel p-6">
            <h3 className="text-lg font-bold text-white mb-6">Class Coverage Substitution Inbox</h3>
            {proposals.length === 0 ? (
              <p className="text-sm text-dark-500 py-6">No coverage requests proposed to you by peer faculty members.</p>
            ) : (
              <div className="divide-y divide-dark-850/40">
                {proposals.map(prop => {
                  const applicant = facultyProfiles.find(p => p.id === prop.original_faculty_id);
                  return (
                    <div key={prop.id} className="flex flex-col sm:flex-row justify-between sm:items-center py-4 gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-primary-400">{applicant?.user?.full_name}</span>
                          <span className="text-xs text-dark-500 font-medium">requests coverage for</span>
                        </div>
                        <h4 className="text-sm font-bold text-white mt-1">{prop.subject?.name} ({prop.subject?.code})</h4>
                        <div className="flex gap-4 text-xs text-dark-400 mt-1 font-semibold">
                          <span>Day: {prop.day_of_week}</span>
                          <span>Slot: {prop.time_slot}</span>
                        </div>
                      </div>

                      {prop.status === 'PENDING' ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRespondProposal(prop.id, 'ACCEPTED')}
                            className="flex items-center gap-1.5 py-2 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold transition-all duration-300"
                          >
                            <Check className="w-4 h-4" />
                            Accept
                          </button>
                          <button
                            onClick={() => handleRespondProposal(prop.id, 'DECLINED')}
                            className="flex items-center gap-1.5 py-2 px-4 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-xs font-bold transition-all duration-300"
                          >
                            <X className="w-4 h-4" />
                            Decline
                          </button>
                        </div>
                      ) : (
                        <span className={`text-xs font-bold px-3 py-1 rounded border uppercase ${
                          prop.status === 'ACCEPTED' 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : 'bg-red-500/10 border-red-500/20 text-red-400'
                        }`}>
                          {prop.status}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )
      ) : (
        /* HOD Approval Dashboard */
        <div className="glass-panel p-6">
          <h3 className="text-lg font-bold text-white mb-6">Pending Leave Requests Review</h3>
          {requests.filter(r => r.status === 'PENDING').length === 0 ? (
            <p className="text-sm text-dark-500 py-6">No pending leave applications to review in your department.</p>
          ) : (
            <div className="space-y-6">
              {requests.filter(r => r.status === 'PENDING').map(req => {
                const startStr = new Date(req.start_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                const endStr = new Date(req.end_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                const applicantProfile = facultyProfiles.find(p => p.id === req.faculty_id);
                
                // Count accepted vs total substitutions
                const acceptedSubs = req.substitution_proposals.filter(p => p.status === 'ACCEPTED').length;
                const totalSubs = req.substitution_proposals.length;
                const isFullyCovered = acceptedSubs === totalSubs;

                return (
                  <div key={req.id} className="p-5 rounded-xl border border-dark-800 bg-dark-900/30 space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <h4 className="text-sm font-bold text-white">{applicantProfile?.user?.full_name}</h4>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/25 font-bold uppercase tracking-wider">
                            {req.leave_type} Leave
                          </span>
                        </div>
                        <p className="text-xs text-dark-400 mt-1">{startStr} - {endStr}</p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleHODDecision(req.id, 'APPROVED')}
                          className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold transition-all duration-300"
                        >
                          <Check className="w-4 h-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => handleHODDecision(req.id, 'REJECTED')}
                          className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-xs font-bold transition-all duration-300"
                        >
                          <X className="w-4 h-4" />
                          Reject
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-dark-300 italic">" {req.reason} "</p>

                    {/* Substitution Agreement Breakdown */}
                    {totalSubs > 0 && (
                      <div className="border-t border-dark-850/40 pt-4 mt-2">
                        <div className="flex justify-between items-center mb-3">
                          <h5 className="text-[10px] font-bold text-dark-500 uppercase tracking-wider">Substitution Coverage Status</h5>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            isFullyCovered ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                          }`}>
                            {acceptedSubs} of {totalSubs} Accepted
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {req.substitution_proposals.map(prop => (
                            <div key={prop.id} className="flex justify-between items-center p-3 rounded-lg bg-dark-950/40 border border-dark-850/30">
                              <div>
                                <p className="text-xs font-semibold text-white">{prop.subject?.name} ({prop.subject?.code})</p>
                                <p className="text-[10px] text-dark-400 mt-0.5">{prop.day_of_week} Slot {prop.time_slot} | Sub: {getSubName(prop.substitute_faculty_id)}</p>
                              </div>
                              <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${
                                prop.status === 'ACCEPTED' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                              }`}>
                                {prop.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Apply Leave Modal Wizard */}
      {isApplyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 relative">
            <button
              onClick={() => setIsApplyOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-400 hover:text-white transition-all duration-300"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-xl font-extrabold text-white mb-6">Leave & Coverage Setup</h3>

            <form onSubmit={handleApplySubmit} className="space-y-6">
              
              {/* Type, Start, End Dates */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5">Leave Category</label>
                  <select
                    value={formLeaveType}
                    onChange={e => setFormLeaveType(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none transition-all duration-300"
                  >
                    <option value="Casual">Casual Leave</option>
                    <option value="Sick">Sick Leave</option>
                    <option value="Duty">Duty Leave</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5">Start Date</label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={e => setFormStartDate(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none transition-all duration-300"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5">End Date</label>
                  <input
                    type="date"
                    value={formEndDate}
                    onChange={e => setFormEndDate(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none transition-all duration-300"
                  />
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Reason for absence</label>
                <textarea
                  placeholder="Detail your reason for requesting leave..."
                  rows={2}
                  value={formReason}
                  onChange={e => setFormReason(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none transition-all duration-300"
                ></textarea>
              </div>

              {/* Substitution Coverage Slot Builder */}
              <div className="border-t border-dark-850/60 pt-6">
                <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-primary-400" />
                  Class Coverage Slot Builder
                </h4>
                <p className="text-xs text-dark-400 mb-4">Propose qualified teachers from your department who are available to cover your slot</p>

                {/* Sub builder row picker */}
                <div className="p-4 rounded-xl bg-dark-950/50 border border-dark-850 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-dark-450 block mb-1">Day of Week</label>
                      <select
                        value={tempDay}
                        onChange={e => setTempDay(e.target.value)}
                        className="w-full px-3 py-2.5 bg-dark-900 border border-dark-800 rounded-lg text-white text-xs outline-none focus:border-primary-500/40"
                      >
                        {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-dark-450 block mb-1">Class Time Slot</label>
                      <select
                        value={tempSlot}
                        onChange={e => setTempSlot(parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-2.5 bg-dark-900 border border-dark-800 rounded-lg text-white text-xs outline-none focus:border-primary-500/40"
                      >
                        {SLOTS.map(s => <option key={s} value={s}>Slot {s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-dark-450 block mb-1">Subject</label>
                      <select
                        value={tempSubjId}
                        onChange={e => setTempSubjId(e.target.value)}
                        className="w-full px-3 py-2.5 bg-dark-900 border border-dark-800 rounded-lg text-white text-xs outline-none focus:border-primary-500/40"
                      >
                        <option value="">Select Subject</option>
                        {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                    <div className="sm:col-span-3">
                      <label className="text-[10px] font-bold text-dark-450 block mb-1">Available Qualified Substitutes</label>
                      <select
                        value={tempSubId}
                        onChange={e => setTempSubId(e.target.value)}
                        disabled={tempLoadingSubs || !tempSubjId}
                        className="w-full px-3 py-2.5 bg-dark-900 border border-dark-800 rounded-lg text-white text-xs outline-none focus:border-primary-500/40 disabled:opacity-50"
                      >
                        {tempLoadingSubs ? (
                          <option>Querying schedules...</option>
                        ) : tempSubs.length === 0 ? (
                          <option value="">No eligible free faculty found</option>
                        ) : (
                          tempSubs.map(f => (
                            <option key={f.id} value={f.id}>{f.user?.full_name} ({f.designation})</option>
                          ))
                        )}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={addSubstitutionRow}
                      className="py-2.5 px-4 rounded-lg bg-dark-900 border border-dark-800 text-white hover:bg-dark-800 text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Slot
                    </button>
                  </div>
                </div>

                {/* Sub builder row listings */}
                {subProposals.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h5 className="text-[10px] font-bold text-dark-500 uppercase tracking-wider">Scheduled Coverage List</h5>
                    {subProposals.map((p, index) => {
                      const subject = subjects.find(s => s.id === p.subject_id);
                      return (
                        <div key={index} className="flex justify-between items-center p-3 rounded-lg bg-dark-900/60 border border-dark-850/40">
                          <div>
                            <span className="text-[10px] font-bold text-primary-400">{p.day_of_week} Slot {p.time_slot}</span>
                            <h6 className="text-xs font-bold text-white mt-0.5">{subject?.name} | Sub: {getSubName(p.substitute_faculty_id)}</h6>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeSubstitutionRow(index)}
                            className="p-1.5 rounded bg-dark-950 border border-dark-800 text-dark-500 hover:text-red-400 hover:border-red-500/25 transition-all"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
                Submit Leave Application
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
