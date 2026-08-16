import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Department } from '../services/facultyService';
import { facultyService } from '../services/facultyService';
import { aiService } from '../services/aiService';
import type { AnalyticsDashboardOutput } from '../services/aiService';
import { ChevronLeft, BarChart3, Building2, Users, CheckCircle2, RefreshCw, Activity, ShieldCheck, Search, Download } from 'lucide-react';
import { getUserDeptId, isUserAdminOrDean } from '../utils/security';

interface AcademicAnalyticsViewProps {
  onBack: () => void;
}

export const AcademicAnalyticsView: React.FC<AcademicAnalyticsViewProps> = ({ onBack }) => {
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsDashboardOutput | null>(null);

  const loadAnalyticsData = async () => {
    try {
      setIsLoading(true);
      const deptsData = await facultyService.getDepartments();
      setDepartments(deptsData);

      const userDeptId = getUserDeptId(user, deptsData);
      const isAdmin = isUserAdminOrDean(user);

      let targetDeptId = selectedDeptId;
      if (!isAdmin && userDeptId) {
        targetDeptId = userDeptId;
        setSelectedDeptId(userDeptId);
      }

      const data = await aiService.getAnalyticsDashboard(targetDeptId === 'ALL' ? undefined : targetDeptId);
      setAnalyticsData(data);
    } catch (err) {
      console.error('Failed to load analytics data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnalyticsData();
  }, [user, selectedDeptId]);

  // Filter available departments based on role
  const availableDepartments = useMemo(() => {
    const isAdmin = isUserAdminOrDean(user);
    const userDeptId = getUserDeptId(user, departments);
    if (!isAdmin && userDeptId) {
      return departments.filter(d => d.id === userDeptId);
    }
    return departments;
  }, [user, departments]);

  // Filtered Faculty Workload Metrics
  const filteredWorkload = useMemo(() => {
    if (!analyticsData?.workload_metrics) return [];
    return analyticsData.workload_metrics.filter(m => {
      const matchesSearch = !searchQuery || m.faculty_name.toLowerCase().includes(searchQuery.toLowerCase()) || m.department_code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || m.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [analyticsData, searchQuery, statusFilter]);

  // Export Analytics to CSV
  const handleExportCSV = () => {
    if (!analyticsData?.workload_metrics) return;
    const headers = ["Faculty ID", "Name", "Department", "Theory Hours", "Lab Hours", "Cover Hours", "Invigilations", "Total Hours", "Max Capacity", "Utilization %", "Status"];
    const rows = analyticsData.workload_metrics.map(m => [
      m.faculty_id,
      `"${m.faculty_name}"`,
      m.department_code,
      m.theory_hours || 0,
      m.lab_hours || 0,
      m.substitution_hours || 0,
      m.invigilation_hours || 0,
      m.total_active_hours || m.assigned_slots,
      m.max_weekly_workload,
      `${m.utilization_percentage}%`,
      m.status
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `AcadOps_Faculty_Workload_Analytics_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2.5 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white transition-all shadow-md"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-primary-400" />
              <h2 className="text-2xl font-extrabold text-white tracking-tight">Academic Analytics & Workload Engine</h2>
            </div>
            <p className="text-dark-400 text-sm">Real-time timetable workload calculations, room capacity & department-wise metrics</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Branch Selector */}
          <div className="flex items-center gap-2 bg-dark-900 border border-dark-800 rounded-xl px-3 py-2">
            <Building2 className="w-4 h-4 text-primary-400" />
            <select
              value={selectedDeptId}
              onChange={e => setSelectedDeptId(e.target.value)}
              disabled={!isUserAdminOrDean(user)}
              className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer disabled:cursor-not-allowed"
            >
              <option value="ALL" className="bg-dark-950 text-white">All Departments</option>
              {availableDepartments.map(d => (
                <option key={d.id} value={d.id} className="bg-dark-950 text-white">
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExportCSV}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>

          <button
            onClick={loadAnalyticsData}
            className="p-2.5 rounded-xl bg-dark-900 border border-dark-800 text-dark-400 hover:text-white transition-all"
            title="Refresh analytics data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20">
          <RefreshCw className="w-8 h-8 text-primary-400 animate-spin mx-auto mb-3" />
          <p className="text-dark-400 text-lg">Computing academic metrics and workload heatmaps...</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Metric 1 */}
            <div className="glass-panel p-6 border border-primary-500/20 bg-gradient-to-br from-primary-500/10 via-dark-900 to-dark-950 relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="text-[10px] uppercase font-extrabold text-primary-400 tracking-wider">Average Faculty Utilization</span>
                  <h3 className="text-3xl font-black text-white mt-1">{analyticsData?.average_faculty_utilization || 0}%</h3>
                </div>
                <div className="p-3 rounded-2xl bg-primary-500/20 border border-primary-500/30 text-primary-300">
                  <Users className="w-6 h-6" />
                </div>
              </div>
              <p className="text-xs text-dark-400">
                Tracked across <strong className="text-white">{analyticsData?.total_faculty || 0}</strong> Active Faculty Roster Profiles
              </p>
              <div className="w-full bg-dark-950 h-2 rounded-full mt-3 overflow-hidden border border-dark-800">
                <div 
                  className="bg-gradient-to-r from-primary-500 to-indigo-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(analyticsData?.average_faculty_utilization || 0, 100)}%` }}
                />
              </div>
            </div>

            {/* Metric 2 */}
            <div className="glass-panel p-6 border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-dark-900 to-dark-950 relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="text-[10px] uppercase font-extrabold text-emerald-400 tracking-wider">Campus Room Occupancy</span>
                  <h3 className="text-3xl font-black text-white mt-1">{analyticsData?.average_room_occupancy || 0}%</h3>
                </div>
                <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300">
                  <Building2 className="w-6 h-6" />
                </div>
              </div>
              <p className="text-xs text-dark-400">
                Tracked across <strong className="text-white">{analyticsData?.total_classrooms || 0}</strong> Classrooms & Labs
              </p>
              <div className="w-full bg-dark-950 h-2 rounded-full mt-3 overflow-hidden border border-dark-800">
                <div 
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(analyticsData?.average_room_occupancy || 0, 100)}%` }}
                />
              </div>
            </div>

            {/* Metric 3 */}
            <div className="glass-panel p-6 border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-dark-900 to-dark-950 relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="text-[10px] uppercase font-extrabold text-amber-400 tracking-wider">Total Timetable Slots</span>
                  <h3 className="text-3xl font-black text-white mt-1">{analyticsData?.total_timetable_slots || 0}</h3>
                </div>
                <div className="p-3 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-300">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              </div>
              <p className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-4 h-4" />
                <span>100% Constraint Compliant (B.Tech Rules Compliant)</span>
              </p>
              <div className="w-full bg-dark-950 h-2 rounded-full mt-3 overflow-hidden border border-dark-800">
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 h-full rounded-full w-full" />
              </div>
            </div>
          </div>

          {/* Department Breakdown Bar */}
          {analyticsData?.department_metrics && analyticsData.department_metrics.length > 0 && (
            <div className="glass-panel p-6 space-y-4">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                Department Teaching Capacity & Utilization Breakdown
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {analyticsData.department_metrics.map(dept => (
                  <div key={dept.department_id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-extrabold text-slate-900">{dept.department_code}</span>
                      <span className="text-xs font-black px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-300">{dept.avg_utilization}% Avg Load</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${
                          dept.avg_utilization > 100 ? 'bg-red-600' : dept.avg_utilization < 50 ? 'bg-amber-500' : 'bg-emerald-600'
                        }`}
                        style={{ width: `${Math.min(dept.avg_utilization, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] font-bold text-slate-700">
                      <span>Faculty: {dept.total_faculty}</span>
                      <span>Assigned: {dept.total_teaching_hours} hrs</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Roster & Detail Table */}
          <div className="glass-panel p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-600" />
                  Faculty Workload & Duty Roster
                </h3>
                <p className="text-xs text-slate-600 font-semibold">Theory hours, lab hours, substitution cover duties & invigilation load</p>
              </div>

              {/* Filters & Search */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search faculty name or dept..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="glass-input pl-9 pr-3 py-1.5 text-xs w-48 sm:w-64 bg-white border border-slate-300 text-slate-900 font-bold"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="bg-white border border-slate-300 text-slate-900 text-xs font-extrabold rounded-xl px-3 py-2 outline-none shadow-sm"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="OVERUTILIZED">Overutilized (&gt;100%)</option>
                  <option value="OPTIMAL">Optimal (50-100%)</option>
                  <option value="UNDERUTILIZED">Underutilized (&lt;50%)</option>
                </select>
              </div>
            </div>

            {filteredWorkload.length === 0 ? (
              <p className="text-center py-10 text-slate-500 font-semibold text-sm">No matching faculty workload records found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-800">
                  <thead className="bg-slate-100 text-slate-900 font-extrabold uppercase tracking-wider border-b border-slate-300">
                    <tr>
                      <th className="p-3">Faculty Name</th>
                      <th className="p-3">Dept</th>
                      <th className="p-3">Theory</th>
                      <th className="p-3">Lab</th>
                      <th className="p-3">Cover Duty</th>
                      <th className="p-3">Invigilations</th>
                      <th className="p-3">Total / Max</th>
                      <th className="p-3">Capacity %</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredWorkload.map(fac => (
                      <tr key={fac.faculty_id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 font-extrabold text-slate-900">{fac.faculty_name}</td>
                        <td className="p-3"><span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 font-black border border-blue-200">{fac.department_code}</span></td>
                        <td className="p-3 font-extrabold text-blue-700">{fac.theory_hours || 0} hrs</td>
                        <td className="p-3 font-extrabold text-purple-700">{fac.lab_hours || 0} hrs</td>
                        <td className="p-3 font-extrabold text-indigo-700">{fac.substitution_hours || 0} hrs</td>
                        <td className="p-3 font-extrabold text-amber-700">{fac.invigilation_hours || 0} hrs</td>
                        <td className="p-3 font-black text-slate-900">{fac.total_active_hours || fac.assigned_slots} / {fac.max_weekly_workload} hrs</td>
                        <td className="p-3 font-black text-slate-900">{fac.utilization_percentage}%</td>
                        <td className="p-3 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                            fac.status === 'OVERUTILIZED'
                              ? 'bg-red-50 text-red-800 border-red-300'
                              : fac.status === 'UNDERUTILIZED'
                              ? 'bg-amber-50 text-amber-900 border-amber-300'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          }`}>
                            {fac.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
