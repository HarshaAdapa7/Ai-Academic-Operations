import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { LogOut, LayoutGrid, Users, CalendarDays, MonitorPlay, MapPin, Brain, Bell, Calendar, BarChart3 } from 'lucide-react';
import { FacultyManagerView } from './FacultyManagerView';
import { DeptSubjectManager } from './DeptSubjectManager';
import { FacultyAvailabilityView } from './FacultyAvailabilityView';
import { LeaveManagerView } from './LeaveManagerView';
import { ClassroomManagerView } from './ClassroomManagerView';
import { TimetableManagerView } from './TimetableManagerView';
import { AIDecisionCenterView } from './AIDecisionCenterView';
import { AcademicAnalyticsView } from './AcademicAnalyticsView';
import { FacultyWeeklyTimetable } from './FacultyWeeklyTimetable';
import { FacultyAnalyticsRecordsView } from './FacultyAnalyticsRecordsView';
import { leaveService } from '../services/leaveService';
import type { DailyBulletin } from '../services/leaveService';

type ActiveView = 'dashboard' | 'faculty_profiles' | 'dept_subjects' | 'faculty_avail' | 'leave_operations' | 'classrooms_seating' | 'timetable_ops' | 'ai_decision_center' | 'academic_analytics' | 'faculty_weekly_timetable' | 'faculty_analytics_records';

export const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  
  // States to pass to availability sub-view
  const [editFacultyId, setEditFacultyId] = useState<string | undefined>(undefined);
  const [editFacultyName, setEditFacultyName] = useState<string | undefined>(undefined);

  // Daily bulletin popup states
  const [bulletin, setBulletin] = useState<DailyBulletin | null>(null);
  const [isBulletinOpen, setIsBulletinOpen] = useState(false);

  useEffect(() => {
    const fetchBulletin = async () => {
      try {
        const todayStr = new Date().toDateString(); // e.g. "Sat Jul 18 2026"
        const lastShown = localStorage.getItem('last_bulletin_date');
        
        // Fetch bulletin statistics
        const data = await leaveService.getDailyBulletin();
        setBulletin(data);
        
        // Show only if not shown today
        if (lastShown !== todayStr) {
          setIsBulletinOpen(true);
          localStorage.setItem('last_bulletin_date', todayStr);
        }
      } catch (err) {
        console.error('Failed to load dashboard daily bulletin:', err);
      }
    };
    if (user) {
      fetchBulletin();
    }
  }, [user]);

  const allModules = [
    { 
      id: 'faculty_profiles',
      name: 'Faculty Profiles', 
      desc: 'Manage availability matrices, workload limits and teaching roles.', 
      icon: Users, 
      color: 'from-blue-500 to-indigo-500', 
      active: true,
      roles: ['HOD', 'ADMIN', 'DEAN'],
      onClick: () => setActiveView('faculty_profiles')
    },
    { 
      id: 'faculty_weekly_timetable',
      name: 'My Weekly Timetable', 
      desc: 'View your 6-day class schedule, daily class breakdown, room allocations, and workload stats.', 
      icon: Calendar, 
      color: 'from-blue-500 to-indigo-500', 
      active: true,
      roles: ['FACULTY'],
      onClick: () => setActiveView('faculty_weekly_timetable')
    },
    { 
      id: 'faculty_analytics_records',
      name: 'My Analytics & Records', 
      desc: 'Track performance metrics, weekly workload distribution, course rosters, and leave stats.', 
      icon: BarChart3, 
      color: 'from-emerald-500 to-teal-500', 
      active: true,
      roles: ['FACULTY'],
      onClick: () => setActiveView('faculty_analytics_records')
    },
    { 
      id: 'leave_operations',
      name: 'Leave Operations', 
      desc: 'Request leaves, configure substitute approvals and analyze schedule impacts.', 
      icon: CalendarDays, 
      color: 'from-purple-500 to-pink-500', 
      active: true,
      roles: ['FACULTY', 'HOD', 'ADMIN', 'DEAN'],
      onClick: () => setActiveView('leave_operations')
    },
    { 
      id: 'classrooms_seating',
      name: 'Classrooms & Seating', 
      desc: 'Allocate regular and exam seating plans with jumbled spacing.', 
      icon: MapPin, 
      color: 'from-emerald-500 to-teal-500', 
      active: true,
      roles: ['HOD', 'ADMIN', 'DEAN'],
      onClick: () => setActiveView('classrooms_seating')
    },
    { 
      id: 'timetable_ops',
      name: 'Dynamic Timetable Solver', 
      desc: 'Master multi-department schedule generation and session editing.', 
      icon: MonitorPlay, 
      color: 'from-amber-500 to-orange-500', 
      active: true,
      roles: ['HOD', 'ADMIN', 'DEAN'],
      onClick: () => setActiveView('timetable_ops')
    },
    { 
      id: 'ai_decision_center',
      name: 'AI Assistant', 
      desc: 'Ask questions about workload, leave substitutions, room allocations, and schedules.', 
      icon: Brain, 
      color: 'from-rose-500 to-red-500', 
      active: true,
      roles: ['FACULTY', 'HOD', 'ADMIN', 'DEAN'],
      onClick: () => setActiveView('ai_decision_center')
    },
    { 
      id: 'academic_analytics',
      name: 'Academic Analytics Hub', 
      desc: 'View real-time workload heatmaps, room occupancy utilization rates and rule optimization metrics.', 
      icon: BarChart3, 
      color: 'from-cyan-500 to-blue-600', 
      active: true,
      roles: ['HOD', 'ADMIN', 'DEAN'],
      onClick: () => setActiveView('academic_analytics')
    },
  ];

  const visibleModules = allModules.filter(mod => {
    const userRole = user?.role || 'FACULTY';
    return mod.roles ? mod.roles.includes(userRole) : true;
  });

  const handleOpenFacultyAvailability = (id: string, name: string) => {
    setEditFacultyId(id);
    setEditFacultyName(name);
    setActiveView('faculty_avail');
  };

  return (
    <div className="min-h-screen pb-12">
      {/* Navbar */}
      <nav className="glass-panel rounded-none border-t-0 border-x-0 bg-dark-950/70 backdrop-blur-md sticky top-0 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div 
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => setActiveView('dashboard')}
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center text-white font-extrabold shadow-lg shadow-primary-500/10">
              <LayoutGrid className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white leading-none">AcadOps</h1>
              <span className="text-[10px] text-dark-400 font-semibold tracking-wider uppercase">Startup V1</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* HOD sub-navigation options shown in Navbar when inside Module 2 */}
            {(user?.role === 'HOD' || user?.role === 'ADMIN') && activeView !== 'dashboard' && (
              <div className="hidden md:flex items-center gap-2 mr-6 bg-dark-900/50 p-1 rounded-xl border border-dark-800">
                <button
                  onClick={() => setActiveView('faculty_profiles')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                    activeView === 'faculty_profiles' 
                      ? 'bg-primary-500 text-white shadow-md' 
                      : 'text-dark-400 hover:text-white'
                  }`}
                >
                  Faculty Registry
                </button>
                <button
                  onClick={() => setActiveView('dept_subjects')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                    activeView === 'dept_subjects' 
                      ? 'bg-primary-500 text-white shadow-md' 
                      : 'text-dark-400 hover:text-white'
                  }`}
                >
                  Dept & Subjects
                </button>
                <button
                  onClick={() => setActiveView('academic_analytics')}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                    activeView === 'academic_analytics' 
                      ? 'bg-primary-500 text-white shadow-md' 
                      : 'text-dark-400 hover:text-white'
                  }`}
                >
                  Academic Analytics
                </button>
              </div>
            )}

            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-white">{user?.full_name}</p>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary-500/10 text-primary-400 border border-primary-500/20 font-medium">
                {user?.role}
              </span>
            </div>
            
            <button
              onClick={logout}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-red-400 hover:border-red-500/20 transition-all duration-300 hover:bg-red-500/5"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main View Router */}
      {activeView === 'dashboard' && (
        <main className="max-w-7xl mx-auto px-6 mt-10">
          {/* Welcome Banner */}
          <div className="glass-panel p-8 md:p-10 relative overflow-hidden mb-10">
            <div className="absolute -right-20 -top-20 w-80 h-80 bg-primary-600/10 rounded-full blur-[100px]"></div>
            <div className="relative z-10 max-w-2xl">
              <span className="text-xs font-bold text-primary-400 uppercase tracking-widest bg-primary-500/10 border border-primary-500/20 px-3 py-1 rounded-full">
                System Bootstrapped
              </span>
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mt-4 tracking-tight leading-tight">
                Hello, {user?.full_name}
              </h2>
              <p className="text-dark-300 mt-3 text-base md:text-lg leading-relaxed">
                Your system environment has been initialized. You are currently logged in with the role of <strong className="text-primary-400 font-semibold">{user?.role}</strong>. Below is your dynamic module registry.
              </p>
            </div>
          </div>

          {/* Modules Grid */}
          <h3 className="text-xs font-bold text-dark-400 uppercase tracking-widest mb-6">Platform Modules</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleModules.map((mod, index) => {
              const Icon = mod.icon;
              return (
                <div 
                  key={index} 
                  onClick={mod.active && mod.onClick ? mod.onClick : undefined}
                  className={`glass-panel p-6 flex flex-col justify-between ${
                    mod.active 
                      ? 'glass-panel-hover cursor-pointer border-primary-500/25 hover:border-primary-500/40' 
                      : 'opacity-65'
                  }`}
                >
                  <div>
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${mod.color} flex items-center justify-center text-white shadow-lg mb-5`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <h4 className="text-xl font-bold text-white mb-2">{mod.name}</h4>
                    <p className="text-dark-400 text-sm leading-relaxed mb-6">{mod.desc}</p>
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t border-dark-800/40">
                    <span className="text-xs font-semibold text-dark-500 uppercase tracking-wider">Status</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${
                      mod.active 
                        ? 'bg-primary-500/10 border-primary-500/20 text-primary-400' 
                        : 'bg-dark-900 border-dark-800 text-dark-400'
                    }`}>
                      {mod.active ? 'Active' : 'Locked (Build Next)'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      )}

      {/* Render Sub-Views based on active state */}
      {activeView === 'faculty_profiles' && user?.role !== 'FACULTY' && (
        <FacultyManagerView 
          onBack={() => setActiveView('dashboard')}
          onOpenAvailability={handleOpenFacultyAvailability}
        />
      )}

      {activeView === 'dept_subjects' && (
        <DeptSubjectManager 
          onBack={() => setActiveView('dashboard')}
        />
      )}

      {activeView === 'faculty_avail' && (
        <FacultyAvailabilityView 
          facultyId={editFacultyId}
          facultyName={editFacultyName}
          onBack={() => {
            if (user?.role === 'FACULTY') {
              setActiveView('dashboard');
            } else {
              setActiveView('faculty_profiles');
            }
          }}
        />
      )}

      {activeView === 'leave_operations' && (
        <LeaveManagerView 
          onBack={() => setActiveView('dashboard')}
        />
      )}

      {activeView === 'classrooms_seating' && user?.role !== 'FACULTY' && (
        <ClassroomManagerView 
          onBack={() => setActiveView('dashboard')}
        />
      )}

      {activeView === 'timetable_ops' && user?.role !== 'FACULTY' && (
        <TimetableManagerView 
          onBack={() => setActiveView('dashboard')}
        />
      )}

      {activeView === 'ai_decision_center' && (
        <AIDecisionCenterView 
          onBack={() => setActiveView('dashboard')}
          onNavigate={(targetView) => setActiveView(targetView)}
        />
      )}

      {activeView === 'academic_analytics' && (
        <AcademicAnalyticsView 
          onBack={() => setActiveView('dashboard')}
        />
      )}

      {activeView === 'faculty_weekly_timetable' && (
        <FacultyWeeklyTimetable 
          onBack={() => setActiveView('dashboard')}
        />
      )}

      {activeView === 'faculty_analytics_records' && (
        <FacultyAnalyticsRecordsView 
          onBack={() => setActiveView('dashboard')}
        />
      )}

      {/* Daily Task Bulletin Modal */}
      {isBulletinOpen && bulletin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg p-6 relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-primary-500/10 rounded-full blur-2xl"></div>
            
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center text-white shadow-lg">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-white">{bulletin.title}</h3>
                <p className="text-xs text-primary-400 font-semibold">{bulletin.headline}</p>
              </div>
            </div>

            <div className="border-t border-dark-850/50 my-4 pt-4">
              <h4 className="text-xs font-bold text-dark-400 uppercase tracking-widest mb-3">Today's Agenda:</h4>
              <ul className="space-y-3">
                {bulletin.bullets.map((bullet, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm text-dark-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-1.5 flex-shrink-0"></span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => setIsBulletinOpen(false)}
              className="w-full mt-6 py-3 px-4 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-primary-500/15 transition-all duration-300"
            >
              Acknowledge Bulletin
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
