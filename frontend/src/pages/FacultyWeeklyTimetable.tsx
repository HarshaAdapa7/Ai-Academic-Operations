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
const SLOTS = [1, 2, 3, 4, 5, 6];

const SLOT_TIMINGS: Record<number, string> = {
  1: '09:00 - 10:00',
  2: '10:00 - 11:00',
  3: '11:15 - 12:15',
  4: '12:15 - 01:15',
  5: '02:00 - 03:00',
  6: '03:00 - 04:00'
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
            className="p-2.5 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white hover:border-dark-700 transition-all duration-300 shadow-sm"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-extrabold text-white tracking-tight">Weekly Teaching Timetable</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary-500/10 text-primary-400 border border-primary-500/20">
                Personalized
              </span>
            </div>
            <p className="text-dark-400 text-sm mt-0.5">
              Assigned classes, room locations, and weekly teaching slots for <strong className="text-white">{user?.full_name}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadFacultyTimetable}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white hover:border-dark-700 text-xs font-semibold transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Sync Schedule</span>
          </button>
        </div>
      </div>

      {/* Top 3 KPI Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Card 1: Workload & Hours */}
        <div className="glass-panel p-6 relative overflow-hidden flex flex-col justify-between border-primary-500/20">
          <div className="absolute -right-8 -top-8 w-24 h-24 bg-primary-500/10 rounded-full blur-xl"></div>
          <div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs font-bold text-dark-400 uppercase tracking-wider">Weekly Workload</span>
              <div className="p-2 rounded-xl bg-primary-500/10 text-primary-400 border border-primary-500/20">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white tracking-tight">{totalClassesPerWeek}</span>
              <span className="text-sm font-semibold text-dark-400">/ {maxAllowedWorkload} hrs max</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-dark-850/60 flex items-center justify-between text-xs">
            <span className="text-dark-400">Capacity Usage</span>
            <span className={`font-bold ${totalClassesPerWeek > maxAllowedWorkload ? 'text-rose-400' : 'text-emerald-400'}`}>
              {Math.round((totalClassesPerWeek / (maxAllowedWorkload || 16)) * 100)}%
            </span>
          </div>
        </div>

        {/* Card 2: Assigned Subjects & Sections */}
        <div className="glass-panel p-6 relative overflow-hidden flex flex-col justify-between border-indigo-500/20">
          <div className="absolute -right-8 -top-8 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl"></div>
          <div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs font-bold text-dark-400 uppercase tracking-wider">Teaching Subjects</span>
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <BookOpen className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white tracking-tight">{uniqueSubjects.length}</span>
              <span className="text-sm font-semibold text-dark-400">Subjects across {uniqueSections.length} Sections</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-dark-850/60 flex items-center gap-1.5 text-xs text-dark-300 truncate">
            <Layers className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
            <span className="truncate">{uniqueSections.join(', ') || 'No sections assigned'}</span>
          </div>
        </div>

        {/* Card 3: Free / Available Slots */}
        <div className="glass-panel p-6 relative overflow-hidden flex flex-col justify-between border-emerald-500/20">
          <div className="absolute -right-8 -top-8 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl"></div>
          <div>
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs font-bold text-dark-400 uppercase tracking-wider">Unassigned Free Slots</span>
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white tracking-tight">{freeSlotsCount}</span>
              <span className="text-sm font-semibold text-dark-400">Available slots for research & prep</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-dark-850/60 flex items-center justify-between text-xs">
            <span className="text-dark-400">Current Day Schedule</span>
            <span className="font-semibold text-emerald-400">
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
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              selectedDayFilter === 'ALL'
                ? 'bg-primary-500 text-white shadow-md shadow-primary-500/20'
                : 'bg-dark-900 border border-dark-800 text-dark-400 hover:text-white'
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
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all relative ${
                  selectedDayFilter === day
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-dark-900 border border-dark-800 text-dark-400 hover:text-white'
                }`}
              >
                {day}
                {isToday && (
                  <span className="ml-1.5 w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Timetable Grid Container */}
      <div className="glass-panel p-6 overflow-x-auto">
        <div className="min-w-[900px]">
          {/* Header Row: Slots */}
          <div className="grid grid-cols-7 gap-3 mb-4 text-center">
            <div className="p-3 bg-dark-900/60 rounded-xl border border-dark-800 font-bold text-xs text-dark-400 uppercase tracking-wider flex items-center justify-center">
              Day / Slot
            </div>
            {SLOTS.map(slotNum => (
              <div key={slotNum} className="p-3 bg-dark-900/60 rounded-xl border border-dark-800 text-center">
                <span className="block font-bold text-xs text-white">Slot {slotNum}</span>
                <span className="block text-[10px] text-dark-400 mt-0.5">{SLOT_TIMINGS[slotNum]}</span>
              </div>
            ))}
          </div>

          {/* Grid Rows: Days */}
          {DAYS.filter(day => selectedDayFilter === 'ALL' || selectedDayFilter === day).map(day => {
            const isToday = day === todayDayName;
            return (
              <div key={day} className="grid grid-cols-7 gap-3 mb-3">
                {/* Day Label */}
                <div className={`p-4 rounded-xl border flex flex-col justify-center items-center text-center ${
                  isToday 
                    ? 'bg-primary-500/10 border-primary-500/30 text-primary-400 font-extrabold' 
                    : 'bg-dark-900/40 border-dark-800 text-dark-300 font-bold'
                }`}>
                  <span className="text-sm">{day}</span>
                  {isToday && (
                    <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400 mt-1 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Today
                    </span>
                  )}
                </div>

                {/* Slots 1 - 6 */}
                {SLOTS.map(slotNum => {
                  const entry = entries.find(e => e.day_of_week === day && e.time_slot === slotNum);
                  const isLunchSlot = slotNum === 5; // Slot 5 default lunch

                  if (!entry) {
                    return (
                      <div 
                        key={slotNum}
                        className={`p-4 rounded-xl border flex flex-col items-center justify-center text-center transition-all ${
                          isLunchSlot 
                            ? 'bg-dark-950/30 border-dark-850/40 text-dark-500' 
                            : 'bg-dark-900/20 border-dark-850/50 hover:bg-dark-900/40 text-dark-500'
                        }`}
                      >
                        {isLunchSlot ? (
                          <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-400/60">
                            <Coffee className="w-3.5 h-3.5" />
                            <span>Lunch Break</span>
                          </div>
                        ) : (
                          <span className="text-xs text-dark-600 font-medium">Free Slot</span>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div 
                      key={slotNum}
                      className="p-3.5 rounded-xl border border-primary-500/30 bg-gradient-to-br from-primary-500/10 to-indigo-500/5 hover:border-primary-500/50 transition-all shadow-md flex flex-col justify-between relative group"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-primary-500 text-white uppercase tracking-wider">
                            {entry.section}
                          </span>
                          <span className="text-[10px] text-primary-300 font-semibold">
                            {entry.subject?.code || 'SUB'}
                          </span>
                        </div>

                        <h5 className="text-xs font-bold text-white leading-snug line-clamp-2 mb-2">
                          {entry.subject?.name || 'Assigned Subject'}
                        </h5>
                      </div>

                      <div className="pt-2 border-t border-dark-800/60 flex items-center justify-between text-[11px] text-dark-300">
                        <div className="flex items-center gap-1 text-emerald-400 font-semibold">
                          <MapPin className="w-3 h-3" />
                          <span>{entry.classroom?.room_number || 'Hall'}</span>
                        </div>
                        {entry.lab_batch && entry.lab_batch !== 'ALL' && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
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
