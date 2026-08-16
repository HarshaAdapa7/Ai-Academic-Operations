import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { timetableService } from '../services/timetableService';
import type { TimetableEntry } from '../services/timetableService';
import { facultyService } from '../services/facultyService';
import type { FacultyProfile } from '../services/facultyService';
import { ChevronLeft, Clock, BookOpen, MapPin, RefreshCw, Layers, CheckCircle2, Coffee } from 'lucide-react';

interface FacultyWeeklyTimetableProps {
  onBack: () => void;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];

const SLOT_TIMINGS: Record<number, string> = {
  1: '09:00 - 10:00',
  2: '10:00 - 11:00',
  3: '11:15 - 12:15',
  4: '12:15 - 01:15',
  5: '01:15 - 02:00',
  6: '02:00 - 03:00',
  7: '03:00 - 04:00',
  8: '04:00 - 05:00'
};

export const FacultyWeeklyTimetable: React.FC<FacultyWeeklyTimetableProps> = ({ onBack }) => {
  const { user } = useAuth();
  
  const [facultyProfile, setFacultyProfile] = useState<FacultyProfile | null>(null);
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('ALL');

  const todayDayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

  const loadFacultyTimetable = async () => {
    try {
      setIsLoading(true);
      const profiles = await facultyService.getFacultyProfiles();
      const ownProfile = profiles.find(p => p.user_id === user?.id);
      
      if (ownProfile) {
        setFacultyProfile(ownProfile);
        const data = await timetableService.getTimetable({ faculty_id: ownProfile.id });
        setEntries(data);
      } else {
        const data = await timetableService.getTimetable({});
        setEntries(data);
      }
    } catch (err) {
      console.error('Failed to load faculty timetable:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFacultyTimetable();
  }, [user]);

  // Derived KPI Stats
  const totalClassesPerWeek = entries.length;
  const maxAllowedWorkload = facultyProfile?.max_weekly_workload || 16;
  
  const uniqueSubjects = Array.from(new Set(entries.map(e => e.subject?.name || 'Subject'))).filter(Boolean);
  const uniqueSections = Array.from(new Set(entries.map(e => e.section))).filter(Boolean);

  const totalPossibleSlots = DAYS.length * SLOTS.length;
  const freeSlotsCount = totalPossibleSlots - totalClassesPerWeek;

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
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Weekly Teaching Timetable</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-50 text-blue-800 border border-blue-200">
                Personalized
              </span>
            </div>
            <p className="text-slate-600 text-sm font-semibold mt-0.5">
              Assigned classes, room locations, and weekly teaching slots for <strong className="text-slate-900">{user?.full_name}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadFacultyTimetable}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-900 hover:bg-slate-200 text-xs font-extrabold transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sync Schedule</span>
          </button>
        </div>
      </div>

      {/* Top 3 KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Card 1: Workload & Hours */}
        <div className="glass-panel p-6 relative overflow-hidden flex flex-col justify-between bg-white border border-slate-300 shadow-sm rounded-2xl">
          <div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs font-black text-blue-800 uppercase tracking-wider">Weekly Workload</span>
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">{totalClassesPerWeek}</span>
              <span className="text-sm font-bold text-slate-600">/ {maxAllowedWorkload} hrs max</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-bold">
            <span className="text-slate-600">Capacity Usage</span>
            <span className={`font-black ${totalClassesPerWeek > maxAllowedWorkload ? 'text-red-700' : 'text-emerald-700'}`}>
              {Math.round((totalClassesPerWeek / (maxAllowedWorkload || 16)) * 100)}%
            </span>
          </div>
        </div>

        {/* Card 2: Assigned Subjects & Sections */}
        <div className="glass-panel p-6 relative overflow-hidden flex flex-col justify-between bg-white border border-slate-300 shadow-sm rounded-2xl">
          <div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs font-black text-indigo-800 uppercase tracking-wider">Teaching Subjects</span>
              <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200">
                <BookOpen className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">{uniqueSubjects.length}</span>
              <span className="text-sm font-bold text-slate-600">Subjects across {uniqueSections.length} Sections</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-200 flex items-center gap-1.5 text-xs text-slate-700 font-bold truncate">
            <Layers className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
            <span className="truncate">{uniqueSections.join(', ') || 'No sections assigned'}</span>
          </div>
        </div>

        {/* Card 3: Free / Available Slots */}
        <div className="glass-panel p-6 relative overflow-hidden flex flex-col justify-between bg-white border border-slate-300 shadow-sm rounded-2xl">
          <div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs font-black text-emerald-800 uppercase tracking-wider">Unassigned Free Slots</span>
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">{freeSlotsCount}</span>
              <span className="text-sm font-bold text-slate-600">Available slots for research & prep</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs font-bold">
            <span className="text-slate-600">Current Day Schedule</span>
            <span className="font-black text-emerald-800">
              {entries.filter(e => e.day_of_week === todayDayName).length} classes today ({todayDayName})
            </span>
          </div>
        </div>
      </div>

      {/* Day Filter Pills */}
      <div className="flex items-center justify-between gap-4 mb-6 overflow-x-auto pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedDayFilter('ALL')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${
              selectedDayFilter === 'ALL'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 border border-slate-300 text-slate-700 hover:text-slate-900'
            }`}
          >
            Full Week Grid
          </button>
          {DAYS.map(day => {
            const isToday = day === todayDayName;
            return (
              <button
                key={day}
                onClick={() => setSelectedDayFilter(day)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all relative ${
                  selectedDayFilter === day
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 border border-slate-300 text-slate-700 hover:text-slate-900'
                }`}
              >
                {day}
                {isToday && (
                  <span className="ml-1.5 w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Timetable Grid Container */}
      <div className="glass-panel p-6 overflow-x-auto bg-white border border-slate-300 shadow-sm rounded-2xl">
        <div className="min-w-[900px]">
          {/* Header Row: Slots */}
          <div className="grid grid-cols-9 gap-3 mb-4 text-center">
            <div className="p-3 bg-slate-100 rounded-xl border border-slate-300 font-black text-xs text-slate-800 uppercase tracking-wider flex items-center justify-center">
              Day / Slot
            </div>
            {SLOTS.map(slotNum => (
              <div key={slotNum} className="p-3 bg-slate-100 rounded-xl border border-slate-300 text-center">
                <span className="block font-black text-xs text-slate-900">Slot {slotNum}</span>
                <span className="block text-[10px] text-slate-600 font-bold mt-0.5">{SLOT_TIMINGS[slotNum]}</span>
              </div>
            ))}
          </div>

          {/* Grid Rows: Days */}
          {DAYS.filter(day => selectedDayFilter === 'ALL' || selectedDayFilter === day).map(day => {
            const isToday = day === todayDayName;
            return (
              <div key={day} className="grid grid-cols-9 gap-3 mb-3">
                {/* Day Label */}
                <div className={`p-4 rounded-xl border flex flex-col justify-center items-center text-center ${
                  isToday 
                    ? 'bg-blue-50 border-blue-300 text-blue-900 font-black' 
                    : 'bg-slate-50 border-slate-300 text-slate-900 font-extrabold'
                }`}>
                  <span className="text-sm">{day}</span>
                  {isToday && (
                    <span className="text-[10px] uppercase font-black tracking-widest text-emerald-800 mt-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300">
                      Today
                    </span>
                  )}
                </div>

                {/* Slots 1 - 8 */}
                {SLOTS.map(slotNum => {
                  const entry = entries.find(e => e.day_of_week === day && e.time_slot === slotNum);
                  const isLunchSlot = slotNum === 5; // Slot 5 default lunch

                  if (!entry) {
                    return (
                      <div 
                        key={slotNum}
                        className={`p-4 rounded-xl border flex flex-col items-center justify-center text-center transition-all ${
                          isLunchSlot 
                            ? 'bg-amber-50 border-amber-200 text-amber-900' 
                            : 'bg-slate-50 border-slate-200 text-slate-500'
                        }`}
                      >
                        {isLunchSlot ? (
                          <div className="flex items-center gap-1 text-[11px] font-black text-amber-800">
                            <Coffee className="w-3.5 h-3.5 text-amber-600" />
                            <span>Lunch Break</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-bold">Free Slot</span>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div 
                      key={slotNum}
                      className="p-3.5 rounded-xl border border-blue-300 bg-blue-50 hover:border-blue-400 transition-all shadow-sm flex flex-col justify-between relative group"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-600 text-white uppercase tracking-wider">
                            {entry.section}
                          </span>
                          <span className="text-[10px] text-blue-900 font-extrabold">
                            {entry.subject?.code || 'SUB'}
                          </span>
                        </div>

                        <h5 className="text-xs font-black text-slate-900 leading-snug line-clamp-2 mb-2">
                          {entry.subject?.name || 'Assigned Subject'}
                        </h5>
                      </div>

                      <div className="pt-2 border-t border-blue-200 flex items-center justify-between text-[11px] text-slate-700 font-bold">
                        <div className="flex items-center gap-1 text-emerald-800 font-black">
                          <MapPin className="w-3 h-3 text-emerald-600" />
                          <span>{entry.classroom?.room_number || 'Hall'}</span>
                        </div>
                        {entry.lab_batch && entry.lab_batch !== 'ALL' && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-900 font-black border border-indigo-200">
                            Batch {entry.lab_batch}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
