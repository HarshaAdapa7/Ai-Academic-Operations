import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { facultyService } from '../services/facultyService';
import type { FacultyProfile } from '../services/facultyService';
import { leaveService } from '../services/leaveService';
import type { LeaveRequest, LeaveBalance } from '../services/leaveService';
import { timetableService } from '../services/timetableService';
import type { TimetableEntry } from '../services/timetableService';
import { 
  ChevronLeft, 
  BarChart3, 
  Clock, 
  BookOpen, 
  CalendarDays, 
  RefreshCw, 
  Award, 
  Activity 
} from 'lucide-react';

interface FacultyAnalyticsRecordsViewProps {
  onBack: () => void;
}

export const FacultyAnalyticsRecordsView: React.FC<FacultyAnalyticsRecordsViewProps> = ({ onBack }) => {
  const { user } = useAuth();

  const [profile, setProfile] = useState<FacultyProfile | null>(null);
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const profiles = await facultyService.getFacultyProfiles();
      const ownProfile = profiles.find(p => p.user_id === user?.id) || profiles[0];
      setProfile(ownProfile);

      if (ownProfile) {
        const [ttData, leavesData, balancesData] = await Promise.all([
          timetableService.getTimetable({ faculty_id: ownProfile.id }),
          leaveService.getLeaveRequests().catch(() => []),
          leaveService.getLeaveBalances().catch(() => [])
        ]);
        setTimetableEntries(ttData);
        setLeaveRequests(leavesData.filter(l => l.faculty_id === ownProfile.id));
        setLeaveBalances(balancesData.filter(b => b.faculty_id === ownProfile.id));
      }
    } catch (err) {
      console.error('Failed to load faculty analytics records:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  // Calculated Metrics
  const totalWeeklySessions = timetableEntries.length;
  const maxWeeklyWorkload = profile?.max_weekly_workload || 16;
  const workloadPercentage = Math.round((totalWeeklySessions / maxWeeklyWorkload) * 100);

  // Assigned subjects & sections
  const assignedSubjects = profile?.subjects || [];
  const activeSections = Array.from(new Set(timetableEntries.map(e => e.section)));

  // Day-wise class breakdown
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayBreakdown = DAYS.map(day => ({
    day,
    count: timetableEntries.filter(e => e.day_of_week === day).length
  }));

  // Helper for leave days calculation
  const calcDays = (startDateStr: string, endDateStr: string) => {
    const start = new Date(startDateStr).getTime();
    const end = new Date(endDateStr).getTime();
    const diffDays = Math.ceil((end - start) / (1000 * 3600 * 24)) + 1;
    return isNaN(diffDays) || diffDays < 1 ? 1 : diffDays;
  };

  // Leave metrics
  const approvedLeaves = leaveRequests.filter(r => r.status === 'APPROVED').length;
  const pendingLeaves = leaveRequests.filter(r => r.status === 'PENDING_HOD' || r.status === 'PENDING_DEAN').length;
  const totalLeaveDaysTaken = leaveRequests
    .filter(r => r.status === 'APPROVED')
    .reduce((acc, r) => acc + calcDays(r.start_date, r.end_date), 0);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 hover:bg-slate-200 transition-all font-bold shadow-sm"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-md">
                <BarChart3 className="w-4.5 h-4.5" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">My Performance & Analytics Records</h2>
            </div>
            <p className="text-slate-600 text-sm font-semibold mt-1">
              Workload distribution, subject allocations, leave history, and academic metrics for <strong className="text-slate-900">{user?.full_name}</strong>
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-900 hover:bg-slate-200 text-xs font-extrabold transition-all shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Records</span>
        </button>
      </div>

      {/* Top 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Metric 1: Workload Usage */}
        <div className="glass-panel p-6 bg-white border border-slate-300 shadow-sm rounded-2xl relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-black text-emerald-800 uppercase tracking-wider">Weekly Workload</span>
              <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                <Clock className="w-4 h-4" />
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900">{totalWeeklySessions}</span>
              <span className="text-xs text-slate-600 font-bold">/ {maxWeeklyWorkload} hrs limit</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-bold">
            <span className="text-slate-600">Capacity Load</span>
            <span className={`font-black ${workloadPercentage > 100 ? 'text-red-700' : 'text-emerald-700'}`}>
              {workloadPercentage}%
            </span>
          </div>
        </div>

        {/* Metric 2: Assigned Subjects */}
        <div className="glass-panel p-6 bg-white border border-slate-300 shadow-sm rounded-2xl relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-black text-indigo-800 uppercase tracking-wider">Assigned Courses</span>
              <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200">
                <BookOpen className="w-4 h-4" />
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900">{assignedSubjects.length}</span>
              <span className="text-xs text-slate-600 font-bold">Subjects</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
            <span className="text-slate-600">Class Sections</span>
            <span className="font-black text-indigo-700">{activeSections.length} Sections</span>
          </div>
        </div>

        {/* Metric 3: Leave Record */}
        <div className="glass-panel p-6 bg-white border border-slate-300 shadow-sm rounded-2xl relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-black text-purple-800 uppercase tracking-wider">Leaves Taken</span>
              <span className="p-2 rounded-xl bg-purple-50 text-purple-600 border border-purple-200">
                <CalendarDays className="w-4 h-4" />
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900">{totalLeaveDaysTaken}</span>
              <span className="text-xs text-slate-600 font-bold">Days ({approvedLeaves} Requests)</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-bold">
            <span className="text-slate-600">Pending Approvals</span>
            <span className="font-black text-purple-700">{pendingLeaves} Pending</span>
          </div>
        </div>

        {/* Metric 4: Designation & Department */}
        <div className="glass-panel p-6 bg-white border border-slate-300 shadow-sm rounded-2xl relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-black text-amber-800 uppercase tracking-wider">Academic Role</span>
              <span className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
                <Award className="w-4 h-4" />
              </span>
            </div>
            <h4 className="text-lg font-black text-slate-900 leading-tight">
              {profile?.designation || 'Faculty Member'}
            </h4>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-bold">
            <span className="text-slate-600">Department</span>
            <span className="font-black text-amber-800">{profile?.department?.code || 'CSE'}</span>
          </div>
        </div>
      </div>

      {/* Main Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Weekly Teaching Load Breakdown Chart */}
        <div className="glass-panel p-6 space-y-6 bg-white border border-slate-300 shadow-sm rounded-2xl">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-600" />
            <span>Daily Lecture Distribution</span>
          </h3>

          <div className="space-y-4">
            {dayBreakdown.map(item => {
              const maxDaySlots = 6;
              const pct = Math.round((item.count / maxDaySlots) * 100);
              return (
                <div key={item.day} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold">
                    <span className="text-slate-800">{item.day}</span>
                    <span className="text-emerald-800 font-black">{item.count} Classes ({pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200">
                    <div 
                      className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Course & Subject Allocations */}
        <div className="glass-panel p-6 space-y-6 bg-white border border-slate-300 shadow-sm rounded-2xl">
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <span>Assigned Teaching Roster</span>
          </h3>

          <div className="space-y-3 max-h-[340px] overflow-y-auto pr-2">
            {assignedSubjects.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs font-semibold">
                No course profiles linked directly yet.
              </div>
            ) : (
              assignedSubjects.map(sub => (
                <div key={sub.id} className="p-4 rounded-xl bg-slate-50 border border-slate-300 flex items-center justify-between shadow-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-50 text-indigo-900 border border-indigo-200">
                        {sub.code}
                      </span>
                      <span className="text-[10px] font-extrabold text-slate-600 uppercase">
                        {sub.subject_type || 'THEORY'}
                      </span>
                    </div>
                    <h5 className="text-xs font-black text-slate-900 mt-1">{sub.name}</h5>
                  </div>

                  <div className="text-right text-xs">
                    <span className="font-extrabold text-slate-700">{sub.credits} Credits</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
