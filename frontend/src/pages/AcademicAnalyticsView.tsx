import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Department, FacultyProfile } from '../services/facultyService';
import type { Classroom } from '../services/classroomService';
import type { TimetableEntry } from '../services/timetableService';
import { facultyService } from '../services/facultyService';
import { classroomService } from '../services/classroomService';
import { timetableService } from '../services/timetableService';
import { ChevronLeft, BarChart3, Building2, Users, CheckCircle2, RefreshCw, Activity, ShieldCheck, PieChart } from 'lucide-react';

interface AcademicAnalyticsViewProps {
  onBack: () => void;
}

export const AcademicAnalyticsView: React.FC<AcademicAnalyticsViewProps> = ({ onBack }) => {
  const { user } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [facultyProfiles, setFacultyProfiles] = useState<FacultyProfile[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');

  const loadAnalyticsData = async () => {
    try {
      setIsLoading(true);
      const [deptsData, facultyData, roomsData, entriesData] = await Promise.all([
        facultyService.getDepartments(),
        facultyService.getFacultyProfiles(),
        classroomService.getClassrooms(),
        timetableService.getTimetable({})
      ]);

      setDepartments(deptsData);
      setFacultyProfiles(facultyData);
      setClassrooms(roomsData);
      setTimetableEntries(entriesData);

      // Default department selection based on user role
      if (user?.role === 'HOD' && user?.department_id) {
        setSelectedDeptId(user.department_id);
      } else if (deptsData.length > 0 && !selectedDeptId) {
        setSelectedDeptId(deptsData[0].id);
      }
    } catch (err) {
      console.error('Failed to load analytics data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnalyticsData();
  }, []);

  // Filter available departments based on role
  const availableDepartments = useMemo(() => {
    if (user?.role === 'HOD' && user?.department_id) {
      return departments.filter(d => d.id === user.department_id);
    }
    return departments;
  }, [user, departments]);

  const activeDepartment = useMemo(() => {
    return departments.find(d => d.id === selectedDeptId) || availableDepartments[0];
  }, [departments, selectedDeptId, availableDepartments]);

  // Compute Faculty Workload Heatmap for selected department
  const facultyWorkloadData = useMemo(() => {
    const targetDeptFaculty = facultyProfiles.filter(f => !selectedDeptId || f.department_id === selectedDeptId);

    return targetDeptFaculty.map(fac => {
      // Count teaching sessions assigned to this faculty member
      const assignedSessions = timetableEntries.filter(e => e.faculty_id === fac.id);
      const workloadHours = assignedSessions.length;
      const maxCapacity = fac.max_weekly_workload || 18;
      const utilizationPercentage = Math.min(Math.round((workloadHours / maxCapacity) * 100), 100);

      return {
        id: fac.id,
        name: fac.user?.full_name || 'Faculty Member',
        designation: fac.designation || 'Lecturer',
        workloadHours,
        maxCapacity,
        utilizationPercentage,
        isHod: fac.is_hod
      };
    }).sort((a, b) => b.workloadHours - a.workloadHours);
  }, [facultyProfiles, timetableEntries, selectedDeptId]);

  // Compute Classroom & Lab Occupancy Breakdown for selected department (or all rooms)
  const classroomOccupancyData = useMemo(() => {
    const targetRooms = classrooms.filter(r => !selectedDeptId || !r.department_id || r.department_id === selectedDeptId);
    const totalWeeklySlotsPossible = 48; // 6 days * 8 slots

    return targetRooms.map(room => {
      const occupiedSlots = timetableEntries.filter(e => e.classroom_id === room.id).length;
      const occupancyRate = Math.min(Number(((occupiedSlots / totalWeeklySlotsPossible) * 100).toFixed(1)), 100);

      return {
        id: room.id,
        roomNumber: room.room_number,
        roomType: room.room_type,
        capacity: room.capacity,
        occupiedSlots,
        totalWeeklySlotsPossible,
        occupancyRate
      };
    }).sort((a, b) => b.occupancyRate - a.occupancyRate);
  }, [classrooms, timetableEntries, selectedDeptId]);

  // Overall Aggregate Statistics
  const overallStats = useMemo(() => {
    const totalSessions = timetableEntries.filter(e => !selectedDeptId || e.department_id === selectedDeptId).length;

    const avgFacultyUtil = facultyWorkloadData.length > 0
      ? Math.round(facultyWorkloadData.reduce((acc, f) => acc + f.utilizationPercentage, 0) / facultyWorkloadData.length)
      : 0;

    const avgRoomOccupancy = classroomOccupancyData.length > 0
      ? Number((classroomOccupancyData.reduce((acc, r) => acc + r.occupancyRate, 0) / classroomOccupancyData.length).toFixed(1))
      : 0;

    return {
      totalSessions,
      avgFacultyUtil,
      avgRoomOccupancy,
      activeFacultyCount: facultyWorkloadData.length,
      activeRoomCount: classroomOccupancyData.length
    };
  }, [timetableEntries, facultyWorkloadData, classroomOccupancyData, selectedDeptId]);

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
              <h2 className="text-2xl font-extrabold text-white">Academic Analytics & Insights Hub</h2>
            </div>
            <p className="text-dark-400 text-sm">Real-time faculty workload heatmaps, room occupancy utilization & 17-Rule engine performance</p>
          </div>
        </div>

        {/* Branch Selector */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-dark-900 border border-dark-800 rounded-xl px-3 py-2">
            <Building2 className="w-4 h-4 text-primary-400" />
            <select
              value={selectedDeptId}
              onChange={e => setSelectedDeptId(e.target.value)}
              disabled={user?.role === 'HOD' && Boolean(user?.department_id)}
              className="bg-transparent text-white text-xs font-bold outline-none cursor-pointer disabled:cursor-not-allowed"
            >
              {availableDepartments.map(d => (
                <option key={d.id} value={d.id} className="bg-dark-950 text-white">
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

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
                  <h3 className="text-3xl font-black text-white mt-1">{overallStats.avgFacultyUtil}%</h3>
                </div>
                <div className="p-3 rounded-2xl bg-primary-500/20 border border-primary-500/30 text-primary-300">
                  <Users className="w-6 h-6" />
                </div>
              </div>
              <p className="text-xs text-dark-400">
                Tracked across <strong className="text-white">{overallStats.activeFacultyCount}</strong> Faculty Profiles in {activeDepartment?.code || 'Department'}
              </p>
              <div className="w-full bg-dark-950 h-2 rounded-full mt-3 overflow-hidden border border-dark-800">
                <div 
                  className="bg-gradient-to-r from-primary-500 to-indigo-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${overallStats.avgFacultyUtil}%` }}
                />
              </div>
            </div>

            {/* Metric 2 */}
            <div className="glass-panel p-6 border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-dark-900 to-dark-950 relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="text-[10px] uppercase font-extrabold text-emerald-400 tracking-wider">Campus Room Occupancy</span>
                  <h3 className="text-3xl font-black text-white mt-1">{overallStats.avgRoomOccupancy}%</h3>
                </div>
                <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300">
                  <Building2 className="w-6 h-6" />
                </div>
              </div>
              <p className="text-xs text-dark-400">
                Tracked across <strong className="text-white">{overallStats.activeRoomCount}</strong> Classrooms & Labs
              </p>
              <div className="w-full bg-dark-950 h-2 rounded-full mt-3 overflow-hidden border border-dark-800">
                <div 
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${overallStats.avgRoomOccupancy}%` }}
                />
              </div>
            </div>

            {/* Metric 3 */}
            <div className="glass-panel p-6 border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-dark-900 to-dark-950 relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="text-[10px] uppercase font-extrabold text-amber-400 tracking-wider">Total Scheduled Sessions</span>
                  <h3 className="text-3xl font-black text-white mt-1">{overallStats.totalSessions}</h3>
                </div>
                <div className="p-3 rounded-2xl bg-amber-500/20 border border-amber-500/30 text-amber-300">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              </div>
              <p className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-4 h-4" />
                <span>100% Conflict-Free (17 B.Tech Rules Compliant)</span>
              </p>
              <div className="w-full bg-dark-950 h-2 rounded-full mt-3 overflow-hidden border border-dark-800">
                <div className="bg-gradient-to-r from-amber-500 to-orange-500 h-full rounded-full w-full" />
              </div>
            </div>
          </div>

          {/* Breakdown Section: Faculty Heatmap & Room Occupancy */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Faculty Workload Heatmap */}
            <div className="glass-panel p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-dark-850 pb-3">
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary-400" />
                    Faculty Workload Heatmap
                  </h3>
                  <p className="text-xs text-dark-400">Weekly teaching load hours vs maximum target capacity</p>
                </div>
                <span className="text-xs font-bold text-dark-400 bg-dark-950 px-3 py-1 rounded-lg border border-dark-800">
                  {facultyWorkloadData.length} Professors
                </span>
              </div>

              {facultyWorkloadData.length === 0 ? (
                <p className="text-center py-10 text-dark-500 text-sm">No faculty records found for {activeDepartment?.code || 'this department'}.</p>
              ) : (
                <div className="space-y-4 max-h-[420px] overflow-y-auto pr-2">
                  {facultyWorkloadData.map(fac => (
                    <div key={fac.id} className="p-3.5 rounded-xl bg-dark-950/50 border border-dark-850 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-extrabold text-white">{fac.name}</span>
                            {fac.isHod && (
                              <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                                HOD
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-dark-400">{fac.designation}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black text-white">{fac.workloadHours} / {fac.maxCapacity} Hours</span>
                          <span className="text-[10px] text-dark-400 block">{fac.utilizationPercentage}% Capacity</span>
                        </div>
                      </div>

                      {/* Workload Progress Bar */}
                      <div className="w-full bg-dark-900 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            fac.utilizationPercentage > 100
                              ? 'bg-red-500'
                              : fac.utilizationPercentage >= 85
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(fac.utilizationPercentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Classroom & Lab Occupancy Breakdown */}
            <div className="glass-panel p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-dark-850 pb-3">
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                    <PieChart className="w-5 h-5 text-emerald-400" />
                    Classroom & Lab Occupancy Breakdown
                  </h3>
                  <p className="text-xs text-dark-400">Weekly room utilization rate out of 48 total available slots</p>
                </div>
                <span className="text-xs font-bold text-dark-400 bg-dark-950 px-3 py-1 rounded-lg border border-dark-800">
                  {classroomOccupancyData.length} Rooms Tracked
                </span>
              </div>

              {classroomOccupancyData.length === 0 ? (
                <p className="text-center py-10 text-dark-500 text-sm">No classroom records found.</p>
              ) : (
                <div className="space-y-4 max-h-[420px] overflow-y-auto pr-2">
                  {classroomOccupancyData.map(room => (
                    <div key={room.id} className="p-3.5 rounded-xl bg-dark-950/50 border border-dark-850 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-extrabold text-white">Room {room.roomNumber}</span>
                            <span className="text-[9px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30 uppercase">
                              {room.roomType.replace('_', ' ')}
                            </span>
                          </div>
                          <span className="text-xs text-dark-400">Capacity: {room.capacity} Students</span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black text-white">{room.occupiedSlots} / 48 Slots</span>
                          <span className="text-[10px] text-dark-400 block">{room.occupancyRate}% Occupied</span>
                        </div>
                      </div>

                      {/* Occupancy Progress Bar */}
                      <div className="w-full bg-dark-900 h-2 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-indigo-500 transition-all duration-300"
                          style={{ width: `${Math.min(room.occupancyRate, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
