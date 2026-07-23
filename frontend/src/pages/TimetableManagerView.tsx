import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { timetableService } from '../services/timetableService';
import type { TimetableEntry, ExamTimetableEntry } from '../services/timetableService';
import { facultyService } from '../services/facultyService';
import type { Subject, Department, FacultyProfile, SectionConfig } from '../services/facultyService';
import { classroomService } from '../services/classroomService';
import type { Classroom } from '../services/classroomService';
import { ChevronLeft, Plus, X, Calendar, RefreshCw, Settings, AlertTriangle, ShieldCheck, Sparkles, Check } from 'lucide-react';

interface TimetableManagerViewProps {
  onBack: () => void;
}

export const TimetableManagerView: React.FC<TimetableManagerViewProps> = ({ onBack }) => {
  const { user } = useAuth();
  
  const [departments, setDepartments] = useState<Department[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [facultyProfiles, setFacultyProfiles] = useState<FacultyProfile[]>([]);
  const [sectionConfigs, setSectionConfigs] = useState<SectionConfig[]>([]);
  
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedSection, setSelectedSection] = useState('CSE 3-A');
  const [isCustomSection, setIsCustomSection] = useState(false);
  const [customSectionInput, setCustomSectionInput] = useState('');
  const [activeTab, setActiveTab] = useState<'class' | 'exam' | 'settings'>('class');
  const [isLoading, setIsLoading] = useState(true);

  // Scheduling Rule states
  const [ruleSlotsPerDay, setRuleSlotsPerDay] = useState<number>(7);
  const [ruleLunchSlot, setRuleLunchSlot] = useState<number | null>(null);
  const [ruleDays, setRuleDays] = useState<string[]>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
  const [ruleActivityBlocks, setRuleActivityBlocks] = useState('Saturday-5,Saturday-6,Saturday-7');
  const [isSavingRule, setIsSavingRule] = useState(false);
  const [ruleSaveMessage, setRuleSaveMessage] = useState('');

  // Timetable Entries states
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
  const [targetDay, setTargetDay] = useState('');
  const [targetSlot, setTargetSlot] = useState(1);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedFacultyId, setSelectedFacultyId] = useState('');
  const [selectedClassroomId, setSelectedClassroomId] = useState('');
  const [slotError, setSlotError] = useState('');

  // Exam Timetable states
  const [exams, setExams] = useState<ExamTimetableEntry[]>([]);

  // Auto-generation wizard states
  const [isSolverModalOpen, setIsSolverModalOpen] = useState(false);
  const [solverDeptIds, setSolverDeptIds] = useState<string[]>([]);
  const [solverSectionsText, setSolverSectionsText] = useState('CSE 1-A, CSE 3-A, ECE 2-A');
  const [solverError, setSolverError] = useState('');
  const [isSolving, setIsSolving] = useState(false);

  // Dynamic Rule 0 & Lunch calculation
  const sectionYear = parseInt(selectedSection.replace(/\D/g, '')) || 1;
  const currentLunchSlot = ruleLunchSlot !== null ? ruleLunchSlot : (sectionYear === 1 ? 4 : 5);

  const loadBaseData = async () => {
    try {
      setIsLoading(true);
      const [deptsData, subjsData, roomsData, facultyData, examsData, sectionsData] = await Promise.all([
        facultyService.getDepartments(),
        facultyService.getSubjects(),
        classroomService.getClassrooms(),
        facultyService.getFacultyProfiles(),
        timetableService.getExamSchedule(),
        facultyService.getSectionConfigs()
      ]);
      setDepartments(deptsData);
      setSubjects(subjsData);
      setClassrooms(roomsData);
      setFacultyProfiles(facultyData);
      setExams(examsData);
      setSectionConfigs(sectionsData);
      
      if (deptsData.length > 0 && !selectedDeptId) {
        setSelectedDeptId(deptsData[0].id);
      }
    } catch (err) {
      console.error('Failed to load scheduling meta details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBaseData();
  }, []);

  const loadTimetableAndRules = async () => {
    try {
      setIsLoading(true);
      if (selectedDeptId) {
        const rule = await timetableService.getSchedulingRule(selectedDeptId);
        if (rule.slots_per_day) setRuleSlotsPerDay(rule.slots_per_day);
        if (rule.lunch_slot !== undefined && rule.lunch_slot !== null) setRuleLunchSlot(rule.lunch_slot);
        if (rule.days_active) setRuleDays(rule.days_active.split(','));
        if (rule.activity_blocks) setRuleActivityBlocks(rule.activity_blocks);
      }

      const entries = await timetableService.getTimetable({ section: selectedSection });
      setTimetableEntries(entries);
    } catch (err) {
      console.error('Failed to load timetable rules/slots:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTimetableAndRules();
  }, [selectedDeptId, selectedSection]);

  // Compute dynamic section dropdown list
  const getAvailableSections = () => {
    const list = new Set<string>();

    sectionConfigs.forEach(s => {
      if (s.name) list.add(s.name.trim().toUpperCase());
    });

    timetableEntries.forEach(e => {
      if (e.section) list.add(e.section.trim().toUpperCase());
    });

    departments.forEach(d => {
      const code = d.code.toUpperCase();
      [1, 2, 3, 4].forEach(yr => {
        list.add(`${code} ${yr}-A`);
        list.add(`${code} ${yr}-B`);
      });
    });

    ['CSE 1-A', 'CSE 2-A', 'CSE 3-A', 'CSE 4-A', 'CSE 3-B', 'CSD 3-A', 'ECE 2-A', 'EEE 3-A', 'MECH 2-A', 'CIVIL 3-A'].forEach(s => list.add(s));

    return Array.from(list).sort();
  };

  const handleOpenSlotModal = (day: string, slotNum: number, existing?: TimetableEntry) => {
    setTargetDay(day);
    setTargetSlot(slotNum);
    setSlotError('');
    if (existing) {
      setSelectedSubjectId(existing.subject_id);
      setSelectedFacultyId(existing.faculty_id);
      setSelectedClassroomId(existing.classroom_id);
    } else {
      setSelectedSubjectId('');
      setSelectedFacultyId('');
      setSelectedClassroomId('');
    }
    setIsSlotModalOpen(true);
  };

  const handleSlotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSlotError('');

    if (!selectedSubjectId || !selectedFacultyId || !selectedClassroomId) {
      setSlotError('Subject, Faculty member, and Classroom location are required.');
      return;
    }

    const payload = {
      department_id: selectedDeptId,
      section: selectedSection,
      academic_year: sectionYear,
      day_of_week: targetDay,
      time_slot: targetSlot,
      subject_id: selectedSubjectId,
      faculty_id: selectedFacultyId,
      classroom_id: selectedClassroomId
    };

    try {
      await timetableService.createTimetableEntry(payload);
      setIsSlotModalOpen(false);
      loadTimetableAndRules();
    } catch (err: any) {
      setSlotError(err.response?.data?.detail || 'Scheduling Collision detected.');
    }
  };

  const handleDeleteSlot = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Clear this scheduled teaching slot?')) {
      return;
    }
    try {
      await timetableService.deleteTimetableEntry(id);
      loadTimetableAndRules();
    } catch (err) {
      alert('Failed to delete timetable session.');
    }
  };

  // Trigger Master Solver
  const handleRunAISolver = async (e: React.FormEvent) => {
    e.preventDefault();
    setSolverError('');
    setIsSolving(true);

    const parsedSections = solverSectionsText.split(',').map(s => s.trim()).filter(s => s.length > 0);
    if (parsedSections.length === 0) {
      setSolverError('Please enter at least one target section.');
      setIsSolving(false);
      return;
    }

    try {
      await timetableService.generateMasterTimetable({
        department_ids: solverDeptIds.length > 0 ? solverDeptIds : undefined,
        sections: parsedSections
      });
      setIsSolverModalOpen(false);
      loadTimetableAndRules();
    } catch (err: any) {
      setSolverError(err.response?.data?.detail || 'AI Master Engine could not allocate a collision-free timetable satisfying all 17 rules.');
    } finally {
      setIsSolving(false);
    }
  };

  const toggleSolverDept = (id: string) => {
    if (solverDeptIds.includes(id)) {
      setSolverDeptIds(solverDeptIds.filter(d => d !== id));
    } else {
      setSolverDeptIds([...solverDeptIds, id]);
    }
  };

  const handleSaveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingRule(true);
      setRuleSaveMessage('');
      await timetableService.saveSchedulingRule({
        department_id: selectedDeptId || null,
        slots_per_day: ruleSlotsPerDay,
        days_active: ruleDays.join(','),
        allow_classroom_overlap: false,
        allow_faculty_overlap: false,
        lunch_slot: ruleLunchSlot,
        activity_blocks: ruleActivityBlocks
      });
      setRuleSaveMessage('Scheduling rules & daily slots saved successfully!');
      setTimeout(() => setRuleSaveMessage(''), 4000);
      loadTimetableAndRules();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save scheduling rules.');
    } finally {
      setIsSavingRule(false);
    }
  };

  const activityBlocksList = ruleActivityBlocks.split(',').map(b => b.trim());

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white transition-all duration-300"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-2xl font-extrabold text-white">Dynamic Timetable Scheduling (17 B.Tech Rules)</h2>
            <p className="text-dark-400 text-sm">Automated multi-department, multi-year constraint solver engine</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-48">
            <select
              value={selectedDeptId}
              onChange={e => setSelectedDeptId(e.target.value)}
              className="w-full px-3 py-2 bg-dark-900 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-primary-500/50"
            >
              {departments.map(d => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
            </select>
          </div>
          <button
            onClick={loadBaseData}
            className="p-2.5 rounded-xl bg-dark-900 border border-dark-800 text-dark-400 hover:text-white transition-all duration-300"
            title="Refresh database records"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 p-1 bg-dark-900 border border-dark-800 rounded-xl max-w-md mb-8">
        <button
          onClick={() => setActiveTab('class')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'class' ? 'bg-primary-500 text-white' : 'text-dark-400 hover:text-white'
          }`}
        >
          Weekly Timetable Grid
        </button>
        <button
          onClick={() => setActiveTab('exam')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'exam' ? 'bg-primary-500 text-white' : 'text-dark-400 hover:text-white'
          }`}
        >
          Exams & Invigilators
        </button>
        {(user?.role === 'HOD' || user?.role === 'ADMIN') && (
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
              activeTab === 'settings' ? 'bg-primary-500 text-white' : 'text-dark-400 hover:text-white'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            17-Rule Configs
          </button>
        )}
      </div>

      {/* Tab Panels */}
      {isLoading ? (
        <div className="text-center py-20">
          <p className="text-dark-400 text-lg">Loading scheduling schedules...</p>
        </div>
      ) : activeTab === 'class' ? (
        /* Dynamic Timetable Grid Tab */
        <div className="space-y-6">
          <div className="flex justify-between items-center gap-4 bg-dark-900/30 p-4 border border-dark-800 rounded-xl">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-dark-400">Cohort Section:</label>
                <select
                  value={isCustomSection ? '__CUSTOM__' : selectedSection}
                  onChange={e => {
                    if (e.target.value === '__CUSTOM__') {
                      setIsCustomSection(true);
                    } else {
                      setIsCustomSection(false);
                      setSelectedSection(e.target.value);
                    }
                  }}
                  className="px-3 py-1.5 bg-dark-950 border border-dark-800 rounded-lg text-white text-xs outline-none focus:border-primary-500/50"
                >
                  {getAvailableSections().map(sec => (
                    <option key={sec} value={sec}>{sec}</option>
                  ))}
                  <option value="__CUSTOM__">+ Type Custom Section...</option>
                </select>

                {isCustomSection && (
                  <input
                    type="text"
                    value={customSectionInput}
                    onChange={e => {
                      const val = e.target.value.toUpperCase();
                      setCustomSectionInput(val);
                      setSelectedSection(val);
                    }}
                    placeholder="e.g. IT 3-A"
                    className="w-28 px-3 py-1.5 bg-dark-950 border border-primary-500/50 rounded-lg text-white text-xs outline-none"
                  />
                )}
              </div>

              <span className="text-xs px-2.5 py-1 rounded bg-primary-500/10 text-primary-400 border border-primary-500/20 font-bold">
                Rule 0: {sectionYear === 1 ? `1st Year (Lunch Slot ${currentLunchSlot})` : `Year ${sectionYear} (Lunch Slot ${currentLunchSlot})`}
              </span>
              <span className="text-xs px-2.5 py-1 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold">
                Daily Capacity: {ruleSlotsPerDay} Slots
              </span>
            </div>

            {(user?.role === 'HOD' || user?.role === 'ADMIN') && (
              <button
                onClick={() => {
                  setSolverError('');
                  setIsSolverModalOpen(true);
                }}
                className="flex items-center gap-2 py-2 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-primary-600 hover:from-indigo-500 hover:to-primary-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/10 transition-all duration-300"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Run Master 17-Rule Solver
              </button>
            )}
          </div>

          {/* Timetable Grid */}
          <div className="glass-panel p-6 overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr>
                  <th className="p-3 text-left text-xs font-bold text-dark-500 border-b border-dark-850 w-24 uppercase">Day / Slot</th>
                  {Array.from({ length: ruleSlotsPerDay }).map((_, idx) => {
                    const slotNum = idx + 1;
                    const isLunch = slotNum === currentLunchSlot;
                    return (
                      <th key={idx} className={`p-3 text-center text-xs font-bold border-b border-dark-850 uppercase ${isLunch ? 'text-amber-400' : 'text-dark-500'}`}>
                        {isLunch ? `Slot ${slotNum} (Lunch)` : `Slot ${slotNum}`}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {ruleDays.map(day => {
                  const dayEntries = timetableEntries.filter(
                    e => e.day_of_week === day && e.section === selectedSection
                  );

                  return (
                    <tr key={day} className="border-b border-dark-850/40 hover:bg-dark-900/5">
                      <td className="p-3 text-xs font-extrabold text-white align-middle">{day}</td>
                      {Array.from({ length: ruleSlotsPerDay }).map((_, slotIdx) => {
                        const slotNum = slotIdx + 1;
                        const entry = dayEntries.find(e => e.time_slot === slotNum);
                        
                        const isLunch = slotNum === currentLunchSlot;
                        const isActivity = activityBlocksList.includes(`${day}-${slotNum}`);
                        const isSatAfternoon = day === 'Saturday' && slotNum >= 5; // Rule 15

                        return (
                          <td 
                            key={slotNum} 
                            onClick={() => {
                              if (isLunch || isActivity || isSatAfternoon) return;
                              if (user?.role === 'HOD' || user?.role === 'ADMIN') {
                                handleOpenSlotModal(day, slotNum, entry);
                              }
                            }}
                            className="p-2"
                          >
                            {isLunch ? (
                              <div className="py-4 border border-amber-500/20 bg-amber-500/5 text-center rounded-xl text-amber-400/80 text-[10px] uppercase font-bold tracking-widest">
                                Lunch Break
                              </div>
                            ) : isSatAfternoon ? (
                              <div className="py-4 border border-dark-850 bg-dark-950/40 text-center rounded-xl text-dark-600 text-[10px] uppercase font-bold tracking-widest">
                                Half Day
                              </div>
                            ) : isActivity ? (
                              <div className="py-4 border border-dark-850 bg-indigo-950/10 text-center rounded-xl text-indigo-400/80 text-[10px] uppercase font-bold tracking-wider">
                                Activities
                              </div>
                            ) : entry ? (
                              <div className="p-3 rounded-xl bg-primary-500/10 border border-primary-500/25 relative group cursor-pointer hover:bg-primary-500/15 transition-all">
                                {(user?.role === 'HOD' || user?.role === 'ADMIN') && (
                                  <button
                                    onClick={(e) => handleDeleteSlot(entry.id, e)}
                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold shadow-lg"
                                    title="Delete session"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                                <strong className="block text-[11px] text-white font-extrabold truncate">{entry.subject?.name}</strong>
                                <span className="block text-[9px] text-primary-400 font-semibold mt-1 truncate">Prof. {entry.faculty?.user?.full_name}</span>
                                <div className="flex justify-between items-center mt-1">
                                  <span className="text-[9px] text-dark-400 font-bold uppercase truncate">{entry.classroom?.room_number}</span>
                                  {entry.lab_batch && entry.lab_batch !== 'ALL' && (
                                    <span className="text-[8px] px-1 rounded bg-purple-500/20 text-purple-300 font-bold">{entry.lab_batch}</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              (user?.role === 'HOD' || user?.role === 'ADMIN') ? (
                                <div className="border border-dashed border-dark-800 hover:border-primary-500/35 rounded-xl p-3.5 text-center cursor-pointer text-dark-500 hover:text-primary-400 transition-all text-[10px] font-bold flex items-center justify-center gap-1">
                                  <Plus className="w-3.5 h-3.5" />
                                  Assign
                                </div>
                              ) : (
                                <div className="p-3.5 text-center text-dark-600 text-[10px] font-medium italic">
                                  Unassigned
                                </div>
                              )
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'exam' ? (
        /* Exam Planner & Invigilators View */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-3 space-y-4">
            <h3 className="text-base font-bold text-white">Scheduled Exam Sessions Ledger</h3>
            {exams.length === 0 ? (
              <div className="glass-panel p-8 text-center text-dark-500">
                <Calendar className="w-10 h-10 mx-auto mb-3 opacity-25" />
                <p className="text-sm font-medium">No exam sessions scheduled yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {exams.map(exam => (
                  <div key={exam.id} className="glass-panel p-5 border border-dark-800 relative flex flex-col justify-between min-h-[160px]">
                    <div>
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-sm font-extrabold text-white leading-tight">{exam.subject?.name}</h4>
                          <span className="text-[9px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25 font-bold uppercase mt-2 inline-block">
                            Slot {exam.time_slot}
                          </span>
                        </div>
                        <span className="text-xs font-extrabold text-white bg-dark-900 px-2 py-1 rounded border border-dark-850 uppercase">
                          Room {exam.classroom?.room_number}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center border-t border-dark-850/40 pt-4 mt-4 text-xs">
                      <div className="flex items-center gap-1.5 text-dark-300">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>Invigilator: <strong>{exam.invigilator?.user?.full_name || 'Unassigned'}</strong></span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Settings Tab */
        <div className="space-y-8 max-w-3xl mx-auto">
          <form onSubmit={handleSaveRules} className="glass-panel p-6 space-y-6">
            <h3 className="text-base font-bold text-white mb-2">Configure Department Scheduling Rules & Daily Slots</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Slots Per Day (Daily Periods)</label>
                <input
                  type="number"
                  min={4}
                  max={12}
                  value={ruleSlotsPerDay}
                  onChange={e => setRuleSlotsPerDay(parseInt(e.target.value) || 7)}
                  className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-sm outline-none focus:border-primary-500/50"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Default Lunch Break Period Slot</label>
                <select
                  value={ruleLunchSlot !== null ? ruleLunchSlot : ''}
                  onChange={e => setRuleLunchSlot(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-sm outline-none focus:border-primary-500/50"
                >
                  <option value="">Auto (Year 1 = Period 4, Upper Years = Period 5)</option>
                  <option value={3}>Period Slot 3</option>
                  <option value={4}>Period Slot 4</option>
                  <option value={5}>Period Slot 5</option>
                  <option value={6}>Period Slot 6</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-dark-300 block mb-1.5">Saturday Activity Blocks (Day-Slot Pairs)</label>
              <input
                type="text"
                value={ruleActivityBlocks}
                onChange={e => setRuleActivityBlocks(e.target.value)}
                placeholder="e.g. Saturday-5,Saturday-6,Saturday-7"
                className="w-full px-4 py-2.5 bg-dark-950 border border-dark-800 rounded-xl text-white text-sm outline-none focus:border-primary-500/50"
              />
              <p className="text-[11px] text-dark-500 mt-1">Comma separated list of slots locked for sports/counseling/activities.</p>
            </div>

            {ruleSaveMessage && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>{ruleSaveMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSavingRule}
              className="py-3 px-6 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-xs font-bold shadow-lg shadow-primary-500/20 transition-all"
            >
              {isSavingRule ? 'Saving Rules...' : 'Save Department Scheduling Rules'}
            </button>
          </form>

          <div className="glass-panel p-6">
            <h3 className="text-base font-bold text-white mb-6">17 B.Tech College Rules Summary</h3>
            <div className="space-y-3 text-xs text-dark-300">
              <p>• <strong>Rule 0</strong>: Year 1 Lunch at Period 4; Upper Years Lunch at Period 5.</p>
              <p>• <strong>Rule 1 & 2</strong>: HOD excluded from Period 1/7 and Wednesday afternoon slots.</p>
              <p>• <strong>Rule 3 & 4</strong>: Sports/Library & Counselling scheduled at Period 7.</p>
              <p>• <strong>Rule 6 & 8</strong>: Dual parallel lab X & Y batch swap (Morning/Afternoon split).</p>
              <p>• <strong>Rule 9</strong>: 3-Period labs placed at Periods 2-4 (Morning) or Periods 5-7 (Afternoon).</p>
              <p>• <strong>Rule 14</strong>: Branch-wide Professional Electives synchronized at identical Day & Slot.</p>
              <p>• <strong>Rule 15 & 16</strong>: Saturday half-day morning schedule; labs avoided on Saturday.</p>
            </div>
          </div>
        </div>
      )}

      {/* Manual Slot Assignment Modal */}
      {isSlotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md p-6 relative">
            <button
              onClick={() => setIsSlotModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-400 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold text-white mb-2">Assign Timetable Session</h3>
            <p className="text-xs text-dark-400 mb-6">{targetDay} at Slot {targetSlot} (Cohort: {selectedSection})</p>

            <form onSubmit={handleSlotSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Subject Course</label>
                <select
                  value={selectedSubjectId}
                  onChange={e => setSelectedSubjectId(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none"
                >
                  <option value="">Select Subject</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code}) - {s.subject_type}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Faculty Professor</label>
                <select
                  value={selectedFacultyId}
                  onChange={e => setSelectedFacultyId(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none"
                >
                  <option value="">Select Teacher</option>
                  {facultyProfiles.map(f => <option key={f.id} value={f.id}>{f.user?.full_name} {f.is_hod ? '(HOD)' : ''}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Classroom Location</label>
                <select
                  value={selectedClassroomId}
                  onChange={e => setSelectedClassroomId(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none"
                >
                  <option value="">Select Classroom</option>
                  {classrooms.map(c => <option key={c.id} value={c.id}>{c.room_number} ({c.room_type})</option>)}
                </select>
              </div>

              {slotError && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-2 text-xs text-red-400 font-semibold mt-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{slotError}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full mt-4 py-3.5 px-4 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 text-white text-sm font-semibold shadow-lg shadow-primary-500/15"
              >
                Confirm Slot Assignment
              </button>
            </form>
          </div>
        </div>
      )}

      {/* AI Master Solver Modal */}
      {isSolverModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg p-6 relative">
            <button
              onClick={() => setIsSolverModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-400 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
              Master 17-Rules AI Constraint Solver
            </h3>
            <p className="text-xs text-dark-400 mb-6">Auto-schedule multi-department, multi-year sections concurrently obeying all 17 rules.</p>

            <form onSubmit={handleRunAISolver} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-2">Target Departments / Branches (Multi-select)</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto p-3 bg-dark-950/50 border border-dark-850 rounded-xl">
                  {departments.map(d => {
                    const isChecked = solverDeptIds.includes(d.id);
                    return (
                      <div
                        key={d.id}
                        onClick={() => toggleSolverDept(d.id)}
                        className={`p-2 rounded border cursor-pointer select-none text-xs font-bold flex items-center gap-2 ${
                          isChecked ? 'bg-indigo-500/20 border-indigo-500 text-white' : 'bg-dark-900 border-dark-800 text-dark-400'
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${isChecked ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-dark-700'}`}>
                          {isChecked && <Plus className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span>{d.code}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Target Sections across Years (Comma-separated)</label>
                <input
                  type="text"
                  value={solverSectionsText}
                  onChange={e => setSolverSectionsText(e.target.value)}
                  placeholder="e.g. CSE 1-A, CSE 1-B, CSE 3-A, ECE 2-A"
                  className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none"
                />
              </div>

              {solverError && (
                <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex gap-2 text-xs text-red-400 font-semibold mt-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>{solverError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSolving}
                className="w-full mt-4 py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-primary-600 hover:from-indigo-500 hover:to-primary-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/15 disabled:opacity-50"
              >
                {isSolving ? 'Solving 17 B.Tech rules constraint parameters...' : 'Run Master 17-Rules AI Solver'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
