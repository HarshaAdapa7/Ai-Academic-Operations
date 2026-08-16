import React, { useState, useEffect } from 'react';
import { facultyService } from '../services/facultyService';
import type { AvailabilityItem } from '../services/facultyService';
import { useAuth } from '../context/AuthContext';
import { CalendarDays, Save, Check, X, ChevronLeft } from 'lucide-react';

interface FacultyAvailabilityViewProps {
  facultyId?: string; // Optional: If passed, we edit this specific faculty (HOD view)
  facultyName?: string; // Optional: To display whose availability we are editing
  onBack?: () => void; // Optional: Back button callback
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];

// Custom label for slots
const SLOT_LABELS: Record<number, string> = {
  1: 'Slot 1 (09:00 - 10:00)',
  2: 'Slot 2 (10:00 - 11:00)',
  3: 'Slot 3 (11:15 - 12:15)',
  4: 'Slot 4 (12:15 - 01:15)',
  5: 'Slot 5 (01:15 - 02:00)',
  6: 'Slot 6 (02:00 - 03:00)',
  7: 'Slot 7 (03:00 - 04:00)',
  8: 'Slot 8 (04:00 - 05:00)'
};

export const FacultyAvailabilityView: React.FC<FacultyAvailabilityViewProps> = ({ 
  facultyId, 
  facultyName, 
  onBack 
}) => {
  const { user } = useAuth();
  const [activeFacultyId, setActiveFacultyId] = useState<string | null>(facultyId || null);
  const [activeFacultyName, setActiveFacultyName] = useState<string>(facultyName || '');
  const [grid, setGrid] = useState<Record<string, Record<number, boolean>>>(
    // Initialize full grid as available (true)
    DAYS.reduce((acc, day) => {
      acc[day] = SLOTS.reduce((sAcc, slot) => {
        sAcc[slot] = true;
        return sAcc;
        }, {} as Record<number, boolean>);
      return acc;
    }, {} as Record<string, Record<number, boolean>>)
  );

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Resolve own faculty ID if user is FACULTY and no id was passed
  const resolveOwnFacultyId = async () => {
    try {
      setIsLoading(true);
      const profiles = await facultyService.getFacultyProfiles();
      const ownProfile = profiles.find(p => p.user_id === user?.id);
      if (ownProfile) {
        setActiveFacultyId(ownProfile.id);
        setActiveFacultyName(ownProfile.user?.full_name);
        await loadAvailability(ownProfile.id);
      } else {
        setErrorMsg("You do not have a faculty profile registered. Please contact the HOD to setup your profile.");
        setIsLoading(false);
      }
    } catch (err) {
      setErrorMsg("Failed to connect to faculty registry.");
      setIsLoading(false);
    }
  };

  const loadAvailability = async (fid: string) => {
    try {
      setIsLoading(true);
      const avails = await facultyService.getAvailability(fid);
      
      // Update local grid state with whatever is in DB
      const updatedGrid = { ...grid };
      
      // Initialize full grid to true (available) first in case DB is missing some slots
      DAYS.forEach(day => {
        SLOTS.forEach(slot => {
          updatedGrid[day][slot] = true;
        });
      });

      // Override with DB values
      avails.forEach((item: AvailabilityItem) => {
        if (updatedGrid[item.day_of_week]) {
          updatedGrid[item.day_of_week][item.time_slot] = item.is_available;
        }
      });

      setGrid(updatedGrid);
    } catch (err) {
      console.error('Failed to load availability:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (facultyId) {
      loadAvailability(facultyId);
    } else if (user?.role === 'FACULTY' || user?.role === 'HOD') {
      resolveOwnFacultyId();
    } else {
      setIsLoading(false);
    }
  }, [facultyId, user]);

  const toggleSlot = (day: string, slot: number) => {
    setGrid(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [slot]: !prev[day][slot]
      }
    }));
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (!activeFacultyId) return;
    setIsSaving(true);
    setSaveSuccess(false);
    setErrorMsg('');

    // Flatten grid to array of items
    const availabilities: AvailabilityItem[] = [];
    DAYS.forEach(day => {
      SLOTS.forEach(slot => {
        availabilities.push({
          day_of_week: day,
          time_slot: slot,
          is_available: grid[day][slot]
        });
      });
    });

    try {
      await facultyService.updateAvailability(activeFacultyId, availabilities);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setErrorMsg("Failed to save availability settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetAll = (state: boolean) => {
    const reset = DAYS.reduce((acc, day) => {
      acc[day] = SLOTS.reduce((sAcc, slot) => {
        sAcc[slot] = state;
        return sAcc;
      }, {} as Record<number, boolean>);
      return acc;
    }, {} as Record<string, Record<number, boolean>>);
    setGrid(reset);
    setSaveSuccess(false);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          {onBack && (
            <button 
              onClick={onBack}
              className="p-2.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 hover:bg-slate-200 transition-all font-bold shadow-sm"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <h2 className="text-2xl font-black text-slate-900">Availability Settings</h2>
            <p className="text-slate-600 text-sm font-semibold">
              {activeFacultyName ? `Configuring slots for: ${activeFacultyName}` : 'Manage weekly scheduling availability'}
            </p>
          </div>
        </div>

        {activeFacultyId && !isLoading && (
          <div className="flex gap-2">
            <button
              onClick={() => handleResetAll(true)}
              className="px-3 py-2 text-xs font-extrabold text-slate-800 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-all shadow-sm"
            >
              Mark All Available
            </button>
            <button
              onClick={() => handleResetAll(false)}
              className="px-3 py-2 text-xs font-extrabold text-slate-800 bg-slate-100 border border-slate-300 rounded-lg hover:bg-slate-200 transition-all shadow-sm"
            >
              Mark All Unavailable
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-20">
          <p className="text-slate-600 text-lg font-bold">Loading scheduling matrix...</p>
        </div>
      ) : errorMsg ? (
        <div className="glass-panel p-8 text-center max-w-xl mx-auto bg-white border border-slate-300 shadow-sm rounded-2xl">
          <CalendarDays className="w-12 h-12 text-blue-600 mx-auto mb-4 opacity-70" />
          <h4 className="text-lg font-black text-slate-900 mb-2">Profile Missing</h4>
          <p className="text-slate-600 text-sm font-semibold leading-relaxed">{errorMsg}</p>
          {onBack && (
            <button
              onClick={onBack}
              className="mt-6 py-2.5 px-5 bg-slate-100 border border-slate-300 rounded-xl text-xs text-slate-900 hover:bg-slate-200 font-extrabold shadow-sm"
            >
              Go Back
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Calendar Grid */}
          <div className="glass-panel p-6 overflow-x-auto bg-white border border-slate-300 shadow-sm rounded-2xl">
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr>
                  <th className="p-3 text-left text-xs font-black text-slate-900 uppercase tracking-wider border-b border-slate-300 w-32">Day</th>
                  {SLOTS.map(slot => (
                    <th key={slot} className="p-3 text-center text-xs font-black text-slate-900 uppercase tracking-wider border-b border-slate-300">
                      Slot {slot}
                      <span className="block text-[9px] text-slate-600 font-bold normal-case mt-0.5">
                        {SLOT_LABELS[slot].split(' ')[2]}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map(day => (
                  <tr key={day} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="p-3 text-sm font-black text-slate-900 border-r border-slate-300 bg-slate-50">{day}</td>
                    {SLOTS.map(slot => {
                      const isAvailable = grid[day][slot];
                      return (
                        <td key={slot} className="p-2 border-r border-slate-200">
                          <button
                            onClick={() => toggleSlot(day, slot)}
                            className={`w-full py-5 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
                              isAvailable
                                ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-900 shadow-sm'
                                : 'bg-red-50 hover:bg-red-100 border-red-300 text-red-900 shadow-sm'
                            }`}
                          >
                            {isAvailable ? (
                              <>
                                <Check className="w-4 h-4 text-emerald-700" />
                                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-800">Available</span>
                              </>
                            ) : (
                              <>
                                <X className="w-4 h-4 text-red-700" />
                                <span className="text-[9px] font-black uppercase tracking-wider text-red-800">Busy</span>
                              </>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 glass-panel p-4 bg-white border border-slate-300 shadow-sm rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-700 font-bold">
                <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300"></div>
                <span>Available</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-700 font-bold">
                <div className="w-3 h-3 rounded bg-red-100 border border-red-300"></div>
                <span>Busy (Blocked)</span>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {saveSuccess && (
                <span className="text-xs font-black text-emerald-700 flex items-center gap-1.5 animate-fade-in">
                  <Check className="w-4 h-4" />
                  Availability saved successfully!
                </span>
              )}
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full sm:w-auto flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-55 text-white text-sm font-extrabold shadow-md shadow-blue-600/20 transition-all"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Saving...' : 'Save Availability Grid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
