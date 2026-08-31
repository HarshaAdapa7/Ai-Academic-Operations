import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  LogOut, LayoutGrid, Users, CalendarDays, MonitorPlay, MapPin, Brain, Bell, Calendar, BarChart3,
  Sun, Moon, ShieldCheck, GraduationCap, Building, Sparkles, Loader2
} from 'lucide-react';
import { leaveService } from '../services/leaveService';
import type { DailyBulletin } from '../services/leaveService';
import { academicCalendarService } from '../services/academicCalendarService';
import type { AcademicCalendar } from '../services/academicCalendarService';
import { NotificationDrawer } from '../components/NotificationDrawer';
import { useNotifications } from '../context/NotificationContext';

// Dynamic Lazy Loading of Sub-View Modules for maximum speed and initial bundle reduction
const FacultyManagerView = React.lazy(() => import('./FacultyManagerView').then(m => ({ default: m.FacultyManagerView })));
const DeptSubjectManager = React.lazy(() => import('./DeptSubjectManager').then(m => ({ default: m.DeptSubjectManager })));
const FacultyAvailabilityView = React.lazy(() => import('./FacultyAvailabilityView').then(m => ({ default: m.FacultyAvailabilityView })));
const LeaveManagerView = React.lazy(() => import('./LeaveManagerView').then(m => ({ default: m.LeaveManagerView })));
const ClassroomManagerView = React.lazy(() => import('./ClassroomManagerView').then(m => ({ default: m.ClassroomManagerView })));
const TimetableManagerView = React.lazy(() => import('./TimetableManagerView').then(m => ({ default: m.TimetableManagerView })));
const ExamTimetableManagerView = React.lazy(() => import('./ExamTimetableManagerView').then(m => ({ default: m.ExamTimetableManagerView })));
const AIDecisionCenterView = React.lazy(() => import('./AIDecisionCenterView').then(m => ({ default: m.AIDecisionCenterView })));
const AcademicAnalyticsView = React.lazy(() => import('./AcademicAnalyticsView').then(m => ({ default: m.AcademicAnalyticsView })));
const FacultyWeeklyTimetable = React.lazy(() => import('./FacultyWeeklyTimetable').then(m => ({ default: m.FacultyWeeklyTimetable })));
const FacultyAnalyticsRecordsView = React.lazy(() => import('./FacultyAnalyticsRecordsView').then(m => ({ default: m.FacultyAnalyticsRecordsView })));
const AcademicCalendarView = React.lazy(() => import('./AcademicCalendarView').then(m => ({ default: m.AcademicCalendarView })));
const DepartmentDataImportView = React.lazy(() => import('./DepartmentDataImportView').then(m => ({ default: m.DepartmentDataImportView })));

type ActiveView = 'dashboard' | 'faculty_profiles' | 'dept_subjects' | 'faculty_avail' | 'leave_operations' | 'classrooms_seating' | 'timetable_ops' | 'exam_timetable_ops' | 'ai_decision_center' | 'academic_analytics' | 'faculty_weekly_timetable' | 'faculty_analytics_records' | 'dept_data_import' | 'academic_calendar';


export const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { unreadCount, setIsDrawerOpen } = useNotifications();
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  
  // Active Academic Calendar state for home page banner
  const [, setActiveCalendar] = useState<AcademicCalendar | null>(null);

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
    const fetchActiveCal = async () => {
      try {
        const calData = await academicCalendarService.getActiveAcademicCalendar();
        setActiveCalendar(calData);
      } catch (err) {
        console.error('Failed to load active calendar:', err);
      }
    };
    if (user) {
      fetchBulletin();
      fetchActiveCal();
    }
  }, [user]);

  const allModules = [
    { 
      id: 'dept_data_import',
      name: 'Department Data Portal', 
      desc: 'Securely upload, validate, stage, and commit department Faculty, Subjects, Hours & Rooms.', 
      icon: LayoutGrid, 
      color: 'from-indigo-600 to-purple-600', 
      active: true,
      roles: ['HOD', 'ADMIN', 'DEAN'],
      onClick: () => setActiveView('dept_data_import')
    },
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
      id: 'exam_timetable_ops',
      name: 'Exam Timetable Preparation', 
      desc: 'Directly schedule Mid & Semester End Examinations with automatic Academic Calendar sync, holiday protection, and invigilator duty roster.', 
      icon: Calendar, 
      color: 'from-amber-500 to-red-500', 
      active: true,
      roles: ['HOD', 'ADMIN', 'DEAN'],
      onClick: () => setActiveView('exam_timetable_ops')
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
    { 
      id: 'academic_calendar',
      name: 'Academic Calendar', 
      desc: 'Centralized multi-year semester timeline, examination milestones, orientation, and closing dates.', 
      icon: Calendar, 
      color: 'from-indigo-500 to-purple-600', 
      active: true,
      roles: ['FACULTY', 'HOD', 'ADMIN', 'DEAN'],
      onClick: () => setActiveView('academic_calendar')
    },
    { 
      id: 'notification_center',
      name: 'Notification Center', 
      desc: 'Universal real-time alert engine, role-targeted broadcasts, live leave approvals, and schedule updates.', 
      icon: Bell, 
      color: 'from-amber-500 to-yellow-600', 
      active: true,
      roles: ['FACULTY', 'HOD', 'ADMIN', 'DEAN'],
      onClick: () => setIsDrawerOpen(true)
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

  // Helper for dynamic time-based greeting & icons
  const getGreetingData = () => {
    const hour = new Date().getHours();
    if (hour >= 4 && hour < 12) {
      return { 
        text: 'Good morning', 
        icon: Sun, 
        badgeColor: 'bg-amber-50 border-amber-200 text-amber-900' 
      };
    }
    if (hour >= 12 && hour < 17) {
      return { 
        text: 'Good afternoon', 
        icon: Sun, 
        badgeColor: 'bg-orange-50 border-orange-200 text-orange-900' 
      };
    }
    return { 
      text: 'Good evening', 
      icon: Moon, 
      badgeColor: 'bg-indigo-50 border-indigo-200 text-indigo-900' 
    };
  };

  // Helper for formatted capitalized user name
  const getFormattedName = (name?: string | null) => {
    if (!name) return 'Colleague';
    return name
      .split(' ')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  };

  // Helper for dynamic role welcome config
  const getRoleWelcomeConfig = (role?: string) => {
    switch (role) {
      case 'ADMIN':
        return {
          badge: 'Institutional Administration • Master Governance Scope',
          subtitle: 'Welcome to your administrative control center. You have institutional authority over multi-department scheduling rules, AI solver engines, faculty registries, and academic calendar operations.',
          icon: ShieldCheck,
          roleTitle: 'System Administrator'
        };
      case 'DEAN':
        return {
          badge: 'Academic Dean Office • Cross-Departmental Oversight',
          subtitle: "Welcome to the Academic Dean's portal. Monitor college-wide faculty workload distributions, cross-department scheduling rules, and institutional examination schedules.",
          icon: GraduationCap,
          roleTitle: 'Academic Dean'
        };
      case 'HOD':
        return {
          badge: 'Department Head • Branch Operations Center',
          subtitle: 'Welcome to the Department Head operations desk. Manage branch faculty rosters, course teaching assignments, 17-rule weekly timetable generation, and duty leave approvals.',
          icon: Building,
          roleTitle: 'Head of Department (HOD)'
        };
      case 'FACULTY':
        return {
          badge: 'Faculty Member Portal • Teaching & Analytics',
          subtitle: 'Welcome to your teaching workspace. View your assigned weekly lectures, room allocations, leave applications, and student mentoring roster in real-time.',
          icon: Sparkles,
          roleTitle: 'Faculty Member'
        };
      case 'STUDENT':
        return {
          badge: 'Student Academic Portal • Class & Exam Timelines',
          subtitle: "Welcome to the Student Academic Portal. Access your section's weekly schedule, upcoming exam session rooms, and institutional academic milestones.",
          icon: CalendarDays,
          roleTitle: 'Student'
        };
      default:
        return {
          badge: 'Academic Operations Platform • ANITS Autonomous',
          subtitle: 'Welcome back to the unified academic management console. Access your operational modules and constraint solver tools below.',
          icon: Sparkles,
          roleTitle: role || 'Academic Member'
        };
    }
  };

  return (
    <div className="min-h-screen pb-12">
      {/* Navbar */}
      <nav className="glass-panel rounded-none border-t-0 border-x-0 bg-dark-950/70 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div 
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer"
            onClick={() => setActiveView('dashboard')}
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-700 via-indigo-800 to-blue-900 flex items-center justify-center text-white font-black text-xs shadow-md border border-blue-900/30 tracking-wider flex-shrink-0">
              ANITS
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-base sm:text-lg font-black text-slate-900 leading-none tracking-tight">ANITS</h1>
                <span className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800 text-[8px] sm:text-[9px] font-black uppercase tracking-wider">Autonomous</span>
              </div>
              <span className="text-[9px] sm:text-[10px] text-slate-600 font-extrabold tracking-wider uppercase block mt-0.5">Academic Operations</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            {/* HOD sub-navigation options shown in Navbar when inside Module 2 */}
            {(user?.role === 'HOD' || user?.role === 'ADMIN') && activeView !== 'dashboard' && (
              <div className="hidden lg:flex items-center gap-1.5 mr-4 bg-slate-100 p-1.5 rounded-xl border border-slate-300 shadow-inner">
                <button
                  onClick={() => setActiveView('faculty_profiles')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                    activeView === 'faculty_profiles' 
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' 
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  Faculty Registry
                </button>
                <button
                  onClick={() => setActiveView('dept_subjects')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                    activeView === 'dept_subjects' 
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' 
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  Dept & Subjects
                </button>
                <button
                  onClick={() => setActiveView('timetable_ops')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                    activeView === 'timetable_ops' 
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' 
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  Weekly Timetable
                </button>
                <button
                  onClick={() => setActiveView('exam_timetable_ops')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                    activeView === 'exam_timetable_ops' 
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30' 
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  Exam Preparation
                </button>
                <button
                  onClick={() => setActiveView('academic_analytics')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                    activeView === 'academic_analytics' 
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' 
                      : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
                  }`}
                >
                  Academic Analytics
                </button>
              </div>
            )}

            <div className="text-right hidden sm:block">
              <span className="block text-xs font-extrabold text-slate-900">{getFormattedName(user?.full_name)}</span>
              <span className="text-[10px] font-black text-blue-700 uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded border border-blue-200 inline-block">
                {user?.role}
              </span>
            </div>
            
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="p-2 sm:p-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-200 transition-all relative"
              title="Notification Center"
            >
              <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-blue-600 text-white text-[9px] sm:text-[10px] font-black flex items-center justify-center shadow-md">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={logout}
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 hover:text-red-700 hover:border-red-300 hover:bg-red-50 transition-all font-extrabold shadow-sm"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-xs font-bold hidden md:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Mobile sub-navigation bar when inside a sub-module */}
        {(user?.role === 'HOD' || user?.role === 'ADMIN') && activeView !== 'dashboard' && (
          <div className="lg:hidden flex items-center gap-1.5 pt-3 pb-1 border-t border-slate-200 mt-3 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveView('dashboard')}
              className="px-3 py-1.5 rounded-lg text-xs font-black bg-slate-200 text-slate-900 border border-slate-300 whitespace-nowrap"
            >
              ← Overview
            </button>
            <button
              onClick={() => setActiveView('faculty_profiles')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeView === 'faculty_profiles' ? 'bg-blue-600 text-white shadow-xs font-black' : 'bg-white text-slate-700 border border-slate-300'
              }`}
            >
              Faculty
            </button>
            <button
              onClick={() => setActiveView('dept_subjects')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeView === 'dept_subjects' ? 'bg-blue-600 text-white shadow-xs font-black' : 'bg-white text-slate-700 border border-slate-300'
              }`}
            >
              Subjects
            </button>
            <button
              onClick={() => setActiveView('timetable_ops')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeView === 'timetable_ops' ? 'bg-blue-600 text-white shadow-xs font-black' : 'bg-white text-slate-700 border border-slate-300'
              }`}
            >
              Timetable
            </button>
            <button
              onClick={() => setActiveView('exam_timetable_ops')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeView === 'exam_timetable_ops' ? 'bg-amber-600 text-white shadow-xs font-black' : 'bg-white text-slate-700 border border-slate-300'
              }`}
            >
              Exams
            </button>
            <button
              onClick={() => setActiveView('academic_analytics')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeView === 'academic_analytics' ? 'bg-blue-600 text-white shadow-xs font-black' : 'bg-white text-slate-700 border border-slate-300'
              }`}
            >
              Analytics
            </button>
          </div>
        )}
      </nav>

      {/* Main View Router */}
      {activeView === 'dashboard' && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-6 sm:mt-10">
          {/* Executive Dynamic Welcome Banner */}
          {(() => {
            const greeting = getGreetingData();
            const GreetingIcon = greeting.icon;
            const roleConfig = getRoleWelcomeConfig(user?.role);
            const RoleIcon = roleConfig.icon;
            const formattedName = getFormattedName(user?.full_name);
            const formattedDate = new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              month: 'short', 
              day: 'numeric', 
              year: 'numeric' 
            });

            return (
              <div className="relative overflow-hidden mb-8 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-blue-50/90 via-indigo-50/40 to-white border border-slate-300 p-5 sm:p-8 md:p-10 shadow-sm">
                {/* Subtle Decorative Background Accents */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
                <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-indigo-300/10 rounded-full blur-2xl pointer-events-none"></div>

                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  {/* Left Column: Greeting, Formatted Name & Role Description */}
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full border shadow-xs ${greeting.badgeColor}`}>
                        <GreetingIcon className="w-3.5 h-3.5" />
                        {greeting.text}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-blue-900 bg-blue-100/80 border border-blue-300 px-3 py-1 rounded-full uppercase tracking-wider">
                        <RoleIcon className="w-3.5 h-3.5 text-blue-700" />
                        {roleConfig.badge}
                      </span>
                    </div>

                    <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tight leading-tight">
                      {greeting.text}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900">{formattedName}</span>
                    </h2>

                    <p className="text-slate-700 mt-3 text-xs sm:text-sm md:text-base font-semibold leading-relaxed">
                      {roleConfig.subtitle}
                    </p>
                  </div>

                  {/* Right Column: Institutional Operational Status Pill */}
                  <div className="flex-shrink-0 flex flex-col sm:flex-row lg:flex-col gap-2.5 sm:gap-3 bg-white/90 backdrop-blur-sm border border-slate-300/90 rounded-xl sm:rounded-2xl p-3.5 sm:p-4 shadow-sm w-full lg:w-auto">
                    <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <span>{formattedDate}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 pt-2 sm:pt-0 lg:pt-2 border-t sm:border-t-0 lg:border-t border-slate-200 text-[11px]">
                      <span className="font-extrabold text-slate-500 uppercase tracking-wider">Active Term</span>
                      <span className="font-black text-blue-800 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                        A.Y. 2026–27 (Sem-I)
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-extrabold text-emerald-700 pt-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>ANITS Engine Online</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}



          {/* Modules Grid */}
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-6">Platform Modules</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleModules.map((mod, index) => {
              const Icon = mod.icon;
              return (
                <div 
                  key={index} 
                  onClick={mod.active && mod.onClick ? mod.onClick : undefined}
                  className={`glass-panel p-6 flex flex-col justify-between transition-all bg-white border border-slate-300 shadow-sm ${
                    mod.active 
                      ? 'glass-panel-hover cursor-pointer border-slate-300 hover:border-blue-600 hover:shadow-md' 
                      : 'opacity-60'
                  }`}
                >
                  <div>
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${mod.color} flex items-center justify-center text-white shadow-md mb-5`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <h4 className="text-xl font-black text-slate-900 mb-2">{mod.name}</h4>
                    <p className="text-slate-600 text-sm font-semibold leading-relaxed mb-6">{mod.desc}</p>
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                    <span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">Status</span>
                    <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full border ${
                      mod.active 
                        ? 'bg-blue-50 border-blue-200 text-blue-800' 
                        : 'bg-slate-100 border-slate-300 text-slate-600'
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

      {/* Render Sub-Views based on active state with React.Suspense fallback */}
      <React.Suspense fallback={
        <div className="max-w-7xl mx-auto px-6 mt-16 flex flex-col items-center justify-center min-h-[300px]">
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
          <p className="text-slate-600 font-bold text-sm">Loading Module Sector...</p>
        </div>
      }>
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

        {activeView === 'exam_timetable_ops' && user?.role !== 'FACULTY' && (
          <ExamTimetableManagerView 
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

        {activeView === 'dept_data_import' && (
          <DepartmentDataImportView 
            onBack={() => setActiveView('dashboard')}
          />
        )}

        {activeView === 'academic_calendar' && (
          <AcademicCalendarView 
            onBack={() => setActiveView('dashboard')}
          />
        )}
      </React.Suspense>

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

      {/* Slide-over Notification Drawer */}
      <NotificationDrawer />
    </div>
  );
};
