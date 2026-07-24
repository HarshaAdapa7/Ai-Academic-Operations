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
            className="p-2.5 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white hover:border-dark-700 transition-all duration-300"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
                <BarChart3 className="w-4.5 h-4.5" />
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">My Performance & Analytics Records</h2>
            </div>
            <p className="text-dark-400 text-sm mt-1">
              Workload distribution, subject allocations, leave history, and academic metrics for <strong className="text-white">{user?.full_name}</strong>
            </p>
          </div>
        </div>

        <button
          onClick={loadData}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white hover:border-dark-700 text-xs font-semibold transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Records</span>
        </button>
      </div>

      {/* Top 4 KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Metric 1: Workload Usage */}
        <div className="glass-panel p-6 border-emerald-500/20 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-8 -top-8 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl"></div>
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold text-dark-400 uppercase tracking-wider">Weekly Workload</span>
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Clock className="w-4 h-4" />
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{totalWeeklySessions}</span>
              <span className="text-xs text-dark-400 font-semibold">/ {maxWeeklyWorkload} hrs limit</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-dark-850/60 flex items-center justify-between text-xs">
            <span className="text-dark-400">Capacity Load</span>
            <span className={`font-bold ${workloadPercentage > 100 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {workloadPercentage}%
            </span>
          </div>
        </div>

        {/* Metric 2: Assigned Subjects */}
        <div className="glass-panel p-6 border-indigo-500/20 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-8 -top-8 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl"></div>
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold text-dark-400 uppercase tracking-wider">Assigned Courses</span>
              <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <BookOpen className="w-4 h-4" />
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{assignedSubjects.length}</span>
              <span className="text-xs text-dark-400 font-semibold">Subjects</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-dark-850/60 flex items-center justify-between text-xs text-dark-300">
            <span className="text-dark-400">Class Sections</span>
            <span className="font-bold text-indigo-400">{activeSections.length} Sections</span>
          </div>
        </div>

        {/* Metric 3: Leave Record */}
        <div className="glass-panel p-6 border-purple-500/20 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-8 -top-8 w-24 h-24 bg-purple-500/10 rounded-full blur-xl"></div>
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold text-dark-400 uppercase tracking-wider">Leaves Taken</span>
              <span className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <CalendarDays className="w-4 h-4" />
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white">{totalLeaveDaysTaken}</span>
              <span className="text-xs text-dark-400 font-semibold">Days ({approvedLeaves} Requests)</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-dark-850/60 flex items-center justify-between text-xs">
            <span className="text-dark-400">Pending Approvals</span>
            <span className="font-bold text-purple-400">{pendingLeaves} Pending</span>
          </div>
        </div>

        {/* Metric 4: Designation & Department */}
        <div className="glass-panel p-6 border-amber-500/20 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-8 -top-8 w-24 h-24 bg-amber-500/10 rounded-full blur-xl"></div>
          <div>
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold text-dark-400 uppercase tracking-wider">Academic Role</span>
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Award className="w-4 h-4" />
              </span>
            </div>
            <h4 className="text-lg font-bold text-white leading-tight">
              {profile?.designation || 'Faculty Member'}
            </h4>
          </div>
          <div className="mt-4 pt-3 border-t border-dark-850/60 flex items-center justify-between text-xs">
            <span className="text-dark-400">Department</span>
            <span className="font-bold text-amber-400">{profile?.department?.code || 'CSE'}</span>
          </div>
        </div>
      </div>

      {/* Main Analytics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Weekly Teaching Load Breakdown Chart */}
        <div className="glass-panel p-6 space-y-6">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Daily Lecture Distribution</span>
          </h3>

          <div className="space-y-4">
            {dayBreakdown.map(item => {
              const maxDaySlots = 6;
              const pct = Math.round((item.count / maxDaySlots) * 100);
              return (
                <div key={item.day} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-dark-200">{item.day}</span>
                    <span className="font-bold text-emerald-400">{item.count} Classes ({pct}%)</span>
                  </div>
                  <div className="w-full bg-dark-900 h-2.5 rounded-full overflow-hidden border border-dark-800">
                    <div 
                      className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Course & Subject Allocations */}
        <div className="glass-panel p-6 space-y-6">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-400" />
            <span>Assigned Teaching Roster</span>
          </h3>

          <div className="space-y-3 max-h-[340px] overflow-y-auto pr-2">
            {assignedSubjects.length === 0 ? (
              <div className="p-6 text-center text-dark-500 text-xs font-medium">
                No course profiles linked directly yet.
              </div>
            ) : (
              assignedSubjects.map(sub => (
                <div key={sub.id} className="p-4 rounded-xl bg-dark-950/40 border border-dark-850 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        {sub.code}
                      </span>
                      <span className="text-[10px] font-bold text-dark-400 uppercase">
                        {sub.subject_type || 'THEORY'}
                      </span>
                    </div>
                    <h5 className="text-xs font-bold text-white mt-1">{sub.name}</h5>
                  </div>

                  <div className="text-right text-xs">
                    <span className="font-semibold text-dark-300">{sub.credits} Credits</span>
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
