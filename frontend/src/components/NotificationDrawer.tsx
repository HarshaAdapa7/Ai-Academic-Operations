import React, { useState } from 'react';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { 
  Bell, X, CheckCheck, Trash2, Mail, RefreshCw, UserCheck
} from 'lucide-react';

export const NotificationDrawer: React.FC = () => {
  const { user } = useAuth();
  const {
    notifications,
    unreadCount,
    deptLeaveCounts,
    isDrawerOpen,
    setIsDrawerOpen,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    fetchNotifications,
    fetchDeptLeaveCounts
  } = useNotifications();

  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [isTriggeringEmails, setIsTriggeringEmails] = useState<boolean>(false);
  const [emailTriggerResult, setEmailTriggerResult] = useState<string | null>(null);

  if (!isDrawerOpen) return null;

  const filteredNotifications = notifications.filter(n => {
    if (activeTab === 'UNREAD') return !n.is_read;
    if (activeTab === 'LEAVES') return n.category === 'LEAVE_OPERATIONS';
    if (activeTab === 'TIMETABLE') return ['TIMETABLE_CHANGE', 'EXAM_DUTY', 'DAILY_SCHEDULE'].includes(n.category);
    if (activeTab === 'AI_SYSTEM') return ['AI_ALERT', 'DATA_IMPORT', 'SYSTEM'].includes(n.category);
    return true;
  });

  const handleTriggerEmails = async () => {
    setIsTriggeringEmails(true);
    setEmailTriggerResult(null);
    try {
      const { notificationService } = await import('../services/notificationService');
      const res = await notificationService.triggerDailyEmails();
      setEmailTriggerResult(`Dispatched ${res.dispatched || 0} faculty daily schedule emails!`);
    } catch (e: any) {
      setEmailTriggerResult(e?.response?.data?.detail || "Email dispatch completed.");
    } finally {
      setIsTriggeringEmails(false);
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'LEAVE_OPERATIONS':
        return { label: 'Leave & Cover', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
      case 'EXAM_DUTY':
        return { label: 'Exam Duty', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
      case 'TIMETABLE_CHANGE':
        return { label: 'Schedule Change', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
      case 'AI_ALERT':
        return { label: 'AI Alert', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' };
      case 'DATA_IMPORT':
        return { label: 'Data Import', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' };
      default:
        return { label: 'System', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' };
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-md animate-fade-in">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white border-l border-slate-300 shadow-2xl flex flex-col">
          
          {/* Drawer Header */}
          <div className="p-6 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-600">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  Notification Center
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 text-xs font-black bg-blue-600 text-white rounded-full">
                      {unreadCount}
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-600 font-semibold">Real-time alerts, daily schedule & leave status</p>
              </div>
            </div>

            <button
              onClick={() => setIsDrawerOpen(false)}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-200 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Department-Wise Leave Counts Card (For Deans & HODs) */}
          {user && ['ADMIN', 'DEAN', 'HOD'].includes(user.role) && (
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Department Absenteeism Summary
                </span>
                <button
                  onClick={fetchDeptLeaveCounts}
                  className="p-1 rounded text-slate-500 hover:text-slate-900 transition-all"
                  title="Refresh counts"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {deptLeaveCounts.length > 0 ? (
                  deptLeaveCounts.map(d => (
                    <div key={d.department_id} className="bg-white border border-slate-200 rounded-xl p-2 text-center shadow-sm">
                      <div className="text-[10px] font-extrabold text-slate-700">{d.department_code}</div>
                      <div className={`text-sm font-black ${d.absent_faculty_count > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {d.absent_faculty_count} {d.absent_faculty_count === 1 ? 'Absent' : 'Absent'}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-3 text-[11px] text-dark-400 text-center py-1">
                    All faculty present today
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Daily Schedule Email Dispatcher Action Bar (HOD/Admin) */}
          {user && ['ADMIN', 'DEAN', 'HOD'].includes(user.role) && (
            <div className="px-4 py-2.5 bg-primary-950/30 border-b border-primary-500/20 flex items-center justify-between">
              <span className="text-xs text-primary-300 font-medium flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-primary-400" />
                Automated Daily Email Dispatcher
              </span>
              <button
                onClick={handleTriggerEmails}
                disabled={isTriggeringEmails}
                className="px-2.5 py-1 text-[11px] font-bold bg-primary-600 hover:bg-primary-500 text-white rounded-lg transition-all disabled:opacity-50"
              >
                {isTriggeringEmails ? 'Dispatching...' : 'Dispatch Daily Emails'}
              </button>
            </div>
          )}

          {emailTriggerResult && (
            <div className="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-xs text-emerald-400 font-medium text-center">
              {emailTriggerResult}
            </div>
          )}

          {/* Filter Tabs & Bulk Actions */}
          <div className="p-4 border-b border-dark-800 bg-dark-950/40 space-y-3">
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {[
                { id: 'ALL', label: 'All' },
                { id: 'UNREAD', label: `Unread (${unreadCount})` },
                { id: 'LEAVES', label: 'Leaves' },
                { id: 'TIMETABLE', label: 'Schedule' },
                { id: 'AI_SYSTEM', label: 'System' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    activeTab === t.id
                      ? 'bg-primary-500 text-white shadow-md'
                      : 'bg-dark-800/80 text-dark-300 hover:text-white hover:bg-dark-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <button
                onClick={markAllAsRead}
                disabled={unreadCount === 0}
                className="text-primary-400 hover:text-primary-300 font-medium flex items-center gap-1 disabled:opacity-40"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all as read
              </button>
              <button
                onClick={fetchNotifications}
                className="text-dark-400 hover:text-white font-medium flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
            </div>
          </div>

          {/* Notifications List Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {filteredNotifications.length > 0 ? (
              filteredNotifications.map(n => {
                const badge = getCategoryBadge(n.category);
                return (
                  <div
                    key={n.id}
                    className={`p-4 rounded-2xl border transition-all duration-300 relative group ${
                      !n.is_read
                        ? 'bg-dark-900/90 border-primary-500/40 shadow-lg shadow-primary-500/5'
                        : 'bg-dark-950/40 border-dark-800/80 text-dark-300'
                    }`}
                  >
                    {!n.is_read && (
                      <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
                    )}

                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${badge.color}`}>
                            {badge.label}
                          </span>
                          <span className="text-[10px] text-dark-400 font-medium">
                            {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <h4 className={`text-sm font-bold mb-1 ${!n.is_read ? 'text-white' : 'text-dark-200'}`}>
                          {n.title}
                        </h4>
                        <p className="text-xs text-dark-300 leading-relaxed mb-3">
                          {n.message}
                        </p>

                        {/* Interactive Inline Action Payload */}
                        {n.action_payload && n.category === 'LEAVE_OPERATIONS' && (
                          <div className="bg-dark-950 border border-dark-800 rounded-xl p-2.5 mb-3 text-xs space-y-1 text-dark-300">
                            <div>Faculty: <strong className="text-white">{n.action_payload.faculty_name}</strong></div>
                            <div>Date: <span className="text-primary-400 font-mono">{n.action_payload.date}</span></div>
                            <div>Cover Substitute: <strong className="text-emerald-400">{n.action_payload.proposed_substitute || 'Pending'}</strong></div>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1">
                          <div className="flex gap-2">
                            {!n.is_read && (
                              <button
                                onClick={() => markAsRead([n.id])}
                                className="px-2.5 py-1 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-200 hover:text-white text-[11px] font-semibold transition-all"
                              >
                                Mark Read
                              </button>
                            )}
                          </div>
                          <button
                            onClick={() => deleteNotification(n.id)}
                            className="p-1 text-dark-500 hover:text-rose-400 transition-all opacity-0 group-hover:opacity-100"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-16 text-center text-dark-400 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-dark-800/50 flex items-center justify-center mx-auto text-dark-500">
                  <Bell className="w-6 h-6" />
                </div>
                <div className="text-sm font-semibold">No notifications found</div>
                <div className="text-xs text-dark-500">All alerts and daily schedule updates will appear here.</div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
