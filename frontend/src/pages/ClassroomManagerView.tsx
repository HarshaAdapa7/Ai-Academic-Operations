import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { classroomService } from '../services/classroomService';
import type { Classroom, SeatingPlan, SeatingAssignment } from '../services/classroomService';
import { facultyService } from '../services/facultyService';
import type { Subject, Department } from '../services/facultyService';
import { ChevronLeft, Plus, Trash2, Edit, X, Calendar, Eye, RefreshCw, Layers, Printer, Grid3X3 } from 'lucide-react';

interface ClassroomManagerViewProps {
  onBack: () => void;
}

export const ClassroomManagerView: React.FC<ClassroomManagerViewProps> = ({ onBack }) => {
  const { user } = useAuth();
  
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [seatingPlans, setSeatingPlans] = useState<SeatingPlan[]>([]);
  
  const [activeTab, setActiveTab] = useState<'classrooms' | 'seating' | 'history'>('classrooms');
  const [isLoading, setIsLoading] = useState(true);

  // Classroom modal states
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomNum, setRoomNum] = useState('');
  const [roomCapacity, setRoomCapacity] = useState(40);
  const [roomRows, setRoomRows] = useState(5);
  const [roomCols, setRoomCols] = useState(8);
  const [roomType, setRoomType] = useState('LECTURE_HALL');
  const [roomDeptId, setRoomDeptId] = useState('');
  const [roomError, setRoomError] = useState('');

  // Seating plan wizard states
  const [examDate, setExamDate] = useState('');
  const [examSlot, setExamSlot] = useState(1);
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
  
  // Custom courses input builder
  const [courseInputs, setCourseInputs] = useState<{
    subject_id: string;
    rawText: string; // "RollNo, Name" one per line
  }[]>([{ subject_id: '', rawText: '' }]);

  const [activePlanDetails, setActivePlanDetails] = useState<SeatingPlan | null>(null);
  const [seatingError, setSeatingError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [roomsData, deptsData, subjsData, plansData] = await Promise.all([
        classroomService.getClassrooms(),
        facultyService.getDepartments(),
        facultyService.getSubjects(),
        classroomService.getSeatingPlans()
      ]);
      setClassrooms(roomsData);
      setDepartments(deptsData);
      setSubjects(subjsData);
      setSeatingPlans(plansData);
    } catch (err) {
      console.error('Failed to load classrooms data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRoomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRoomError('');

    if (!roomNum.trim()) {
      setRoomError('Room number is required.');
      return;
    }

    const capacityCalculated = roomRows * roomCols;
    if (capacityCalculated !== roomCapacity) {
      setRoomCapacity(capacityCalculated);
    }

    const payload = {
      room_number: roomNum,
      capacity: capacityCalculated,
      rows: roomRows,
      cols: roomCols,
      room_type: roomType,
      department_id: roomDeptId || null
    };

    try {
      if (editingRoomId) {
        await classroomService.updateClassroom(editingRoomId, payload);
      } else {
        await classroomService.createClassroom(payload);
      }
      setIsRoomModalOpen(false);
      loadData();
    } catch (err: any) {
      setRoomError(err.response?.data?.detail || 'Failed to save classroom.');
    }
  };

  const handleEditRoom = (room: Classroom) => {
    setEditingRoomId(room.id);
    setRoomNum(room.room_number);
    setRoomCapacity(room.capacity);
    setRoomRows(room.rows);
    setRoomCols(room.cols);
    setRoomType(room.room_type);
    setRoomDeptId(room.department_id || '');
    setRoomError('');
    setIsRoomModalOpen(true);
  };

  const handleDeleteRoom = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this classroom? All seating assignments tied to it will be lost.')) {
      return;
    }
    try {
      await classroomService.deleteClassroom(id);
      loadData();
    } catch (err) {
      alert('Failed to delete classroom.');
    }
  };

  // Seating plan wizard actions
  const addCourseRow = () => {
    setCourseInputs([...courseInputs, { subject_id: '', rawText: '' }]);
  };

  const removeCourseRow = (idx: number) => {
    setCourseInputs(courseInputs.filter((_, i) => i !== idx));
  };

  const handleCourseChange = (idx: number, field: 'subject_id' | 'rawText', value: string) => {
    const updated = [...courseInputs];
    updated[idx][field] = value;
    setCourseInputs(updated);
  };

  const toggleRoomSelection = (roomId: string) => {
    if (selectedRoomIds.includes(roomId)) {
      setSelectedRoomIds(selectedRoomIds.filter(id => id !== roomId));
    } else {
      setSelectedRoomIds([...selectedRoomIds, roomId]);
    }
  };

  const parseStudentText = (text: string): { roll_no: string; name: string }[] => {
    const students: { roll_no: string; name: string }[] = [];
    const lines = text.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      // split by comma
      const parts = line.split(',');
      if (parts.length >= 2) {
        students.push({
          roll_no: parts[0].trim(),
          name: parts[1].trim()
        });
      } else {
        // Fallback: use roll no as name if no comma
        students.push({
          roll_no: line.trim(),
          name: line.trim()
        });
      }
    }
    return students;
  };

  const handleGenerateSeating = async (e: React.FormEvent) => {
    e.preventDefault();
    setSeatingError('');
    setIsGenerating(true);

    if (!examDate || selectedRoomIds.length === 0) {
      setSeatingError('Exam date and at least one target classroom are required.');
      setIsGenerating(false);
      return;
    }

    // Process and parse courses students
    const coursesPayload = [];
    for (const input of courseInputs) {
      if (!input.subject_id) {
        setSeatingError('All course rows must have a selected subject.');
        setIsGenerating(false);
        return;
      }
      const parsedStudents = parseStudentText(input.rawText);
      if (parsedStudents.length === 0) {
        setSeatingError('All course rows must contain at least one student.');
        setIsGenerating(false);
        return;
      }
      coursesPayload.push({
        subject_id: input.subject_id,
        students: parsedStudents
      });
    }

    try {
      const plan = await classroomService.generateSeatingPlan({
        exam_date: new Date(examDate).toISOString(),
        time_slot: examSlot,
        classroom_ids: selectedRoomIds,
        courses: coursesPayload
      });
      
      setActivePlanDetails(plan);
      setActiveTab('history');
      loadData();
      
      // Clear wizards
      setExamDate('');
      setSelectedRoomIds([]);
      setCourseInputs([{ subject_id: '', rawText: '' }]);
    } catch (err: any) {
      setSeatingError(err.response?.data?.detail || 'Failed to generate seating allocation plan.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const getSubjectColor = (subjId: string) => {
    // Generate a consistent color based on subject UUID
    const colors = [
      'bg-blue-600/35 border-blue-500/50 text-blue-300',
      'bg-emerald-600/35 border-emerald-500/50 text-emerald-300',
      'bg-purple-600/35 border-purple-500/50 text-purple-300',
      'bg-rose-600/35 border-rose-500/50 text-rose-300',
      'bg-amber-600/35 border-amber-500/50 text-amber-300',
      'bg-indigo-600/35 border-indigo-500/50 text-indigo-300'
    ];
    let sum = 0;
    for (let i = 0; i < subjId.length; i++) {
      sum += subjId.charCodeAt(i);
    }
    return colors[sum % colors.length];
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Printable Sheet Wrapper (Hidden normally, shown in print) */}
      {activePlanDetails && (
        <div className="hidden print:block print:bg-white print:text-black p-8">
          <h2 className="text-xl font-bold text-center border-b pb-4 uppercase">
            EXAM HALL SEATING ARRANGEMENT
          </h2>
          <div className="flex justify-between text-sm mt-4 border-b pb-4">
            <span>Date: {new Date(activePlanDetails.exam_date).toLocaleDateString()}</span>
            <span>Slot: {activePlanDetails.time_slot}</span>
          </div>

          {/* Render layout for each room separately */}
          {Array.from(new Set(activePlanDetails.assignments.map(a => a.classroom_id))).map(roomId => {
            const roomAssignments = activePlanDetails.assignments.filter(a => a.classroom_id === roomId);
            const room = classrooms.find(r => r.id === roomId);
            if (!room) return null;

            // Map row,col
            const grid: { [key: string]: SeatingAssignment } = {};
            roomAssignments.forEach(a => {
              grid[`${a.row_index}-${a.col_index}`] = a;
            });

            return (
              <div key={roomId} className="my-8 page-break-after">
                <h3 className="text-base font-bold mb-4 uppercase">Classroom: {room.room_number}</h3>
                <div 
                  className="grid gap-2 border p-4 rounded bg-gray-50"
                  style={{ gridTemplateColumns: `repeat(${room.cols}, minmax(0, 1fr))` }}
                >
                  {Array.from({ length: room.rows }).map((_, r) => (
                    Array.from({ length: room.cols }).map((_, c) => {
                      const assign = grid[`${r}-${c}`];
                      return (
                        <div key={`${r}-${c}`} className="border p-2 rounded bg-white text-[10px] text-center min-h-[50px] flex flex-col justify-center">
                          {assign ? (
                            <>
                              <strong className="block text-[11px]">{assign.student_roll_no}</strong>
                              <span className="block text-gray-500 font-semibold">{assign.student_name}</span>
                              <span className="block mt-1 font-bold text-[9px] bg-gray-200 text-gray-700 px-1 py-0.5 rounded uppercase">
                                {assign.subject?.code}
                              </span>
                            </>
                          ) : (
                            <span className="text-gray-300">Vacant</span>
                          )}
                        </div>
                      );
                    })
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Main UI (Hidden in print) */}
      <div className="print:hidden">
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
              <h2 className="text-2xl font-extrabold text-white">Classrooms & Seating Planner</h2>
              <p className="text-dark-400 text-sm">Register classroom layout grids and generate jumbled seating arrangements</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="p-3 rounded-xl bg-dark-900 border border-dark-800 text-dark-400 hover:text-white transition-all duration-300"
              title="Refresh ledger data"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            {(user?.role === 'HOD' || user?.role === 'ADMIN') && activeTab === 'classrooms' && (
              <button
                onClick={() => {
                  setEditingRoomId(null);
                  setRoomNum('');
                  setRoomCapacity(40);
                  setRoomRows(5);
                  setRoomCols(8);
                  setRoomType('LECTURE_HALL');
                  setRoomDeptId('');
                  setRoomError('');
                  setIsRoomModalOpen(true);
                }}
                className="flex items-center gap-2 py-3 px-5 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-primary-500/15 transition-all duration-300"
              >
                <Plus className="w-4 h-4" />
                Add Classroom
              </button>
            )}
          </div>
        </div>

        {/* Tabs switcher */}
        <div className="flex gap-2 p-1 bg-dark-900 border border-dark-800 rounded-xl max-w-md mb-8">
          <button
            onClick={() => setActiveTab('classrooms')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'classrooms' 
                ? 'bg-primary-500 text-white' 
                : 'text-dark-400 hover:text-white'
            }`}
          >
            Classrooms Inventory
          </button>
          {(user?.role === 'HOD' || user?.role === 'ADMIN') && (
            <button
              onClick={() => setActiveTab('seating')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'seating' 
                  ? 'bg-primary-500 text-white' 
                  : 'text-dark-400 hover:text-white'
              }`}
            >
              Seating Planner
            </button>
          )}
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'history' 
                ? 'bg-primary-500 text-white' 
                : 'text-dark-400 hover:text-white'
            }`}
          >
            Seating Plans History
          </button>
        </div>

        {/* Tab contents */}
        {isLoading ? (
          <div className="text-center py-20">
            <p className="text-dark-400 text-lg">Loading classrooms ledger...</p>
          </div>
        ) : activeTab === 'classrooms' ? (
          /* Classrooms Tab */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {classrooms.map(room => {
              const deptCode = room.department?.code || 'Gen';
              return (
                <div key={room.id} className="glass-panel p-6 relative flex flex-col justify-between min-h-[180px]">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="text-lg font-bold text-white leading-tight">{room.room_number}</h4>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-primary-500/10 text-primary-400 border border-primary-500/20 font-bold uppercase tracking-wider mt-1.5 inline-block">
                          {deptCode} Branch
                        </span>
                      </div>
                      <span className="text-xs font-bold px-2.5 py-1 rounded bg-dark-950 border border-dark-850 text-dark-300">
                        {room.room_type}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mt-6 border-t border-dark-850/40 pt-4 text-xs">
                      <div>
                        <span className="text-dark-500 block font-semibold">Desks Capacity</span>
                        <strong className="text-white text-base font-extrabold mt-0.5 block">{room.capacity}</strong>
                      </div>
                      <div>
                        <span className="text-dark-500 block font-semibold">Row Count</span>
                        <strong className="text-white text-base font-extrabold mt-0.5 block">{room.rows} rows</strong>
                      </div>
                      <div>
                        <span className="text-dark-500 block font-semibold">Col Count</span>
                        <strong className="text-white text-base font-extrabold mt-0.5 block">{room.cols} cols</strong>
                      </div>
                    </div>
                  </div>

                  {(user?.role === 'HOD' || user?.role === 'ADMIN') && (
                    <div className="flex gap-2 justify-end border-t border-dark-850/40 pt-4 mt-6">
                      <button
                        onClick={() => handleEditRoom(room)}
                        className="p-2 rounded bg-dark-900 border border-dark-800 text-dark-300 hover:text-white transition-all"
                        title="Edit classroom"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteRoom(room.id)}
                        className="p-2 rounded bg-dark-900 border border-dark-800 text-dark-300 hover:text-red-400 hover:border-red-500/20 transition-all"
                        title="Remove classroom"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : activeTab === 'seating' ? (
          /* Seating Planner Wizard Tab */
          <div className="glass-panel p-6 max-w-4xl mx-auto">
            <h3 className="text-lg font-bold text-white mb-6">Exam Seating Allocation Wizard</h3>
            
            <form onSubmit={handleGenerateSeating} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Exam Date */}
                <div>
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5">Exam Date</label>
                  <input
                    type="date"
                    value={examDate}
                    onChange={e => setExamDate(e.target.value)}
                    className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none"
                  />
                </div>
                {/* Exam Time Slot */}
                <div>
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5">Time Slot</label>
                  <select
                    value={examSlot}
                    onChange={e => setExamSlot(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none"
                  >
                    <option value={1}>Slot 1 (09:00 AM - 12:00 PM)</option>
                    <option value={2}>Slot 2 (01:00 PM - 04:00 PM)</option>
                  </select>
                </div>
              </div>

              {/* Classrooms Selector */}
              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-3">Choose Target Classrooms to allocate</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {classrooms.map(room => {
                    const isSelected = selectedRoomIds.includes(room.id);
                    return (
                      <div
                        key={room.id}
                        onClick={() => toggleRoomSelection(room.id)}
                        className={`p-3 rounded-xl border text-center cursor-pointer transition-all duration-300 ${
                          isSelected 
                            ? 'bg-primary-500/10 border-primary-500/50 text-white'
                            : 'bg-dark-950/40 border-dark-850 text-dark-400 hover:text-white'
                        }`}
                      >
                        <h5 className="text-sm font-bold">{room.room_number}</h5>
                        <p className="text-[10px] text-dark-500 mt-1">Cap: {room.capacity} seats</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Courses / Students Lists inputs */}
              <div className="border-t border-dark-850/60 pt-6">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h4 className="text-sm font-bold text-white">Enrollment Student Inputs</h4>
                    <p className="text-xs text-dark-400">Add courses and paste raw registration rolls</p>
                  </div>
                  <button
                    type="button"
                    onClick={addCourseRow}
                    className="py-2 px-4 rounded-lg bg-dark-900 border border-dark-800 text-white hover:bg-dark-800 text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Course
                  </button>
                </div>

                <div className="space-y-4">
                  {courseInputs.map((input, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-dark-950/40 border border-dark-850 space-y-3 relative">
                      {courseInputs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeCourseRow(idx)}
                          className="absolute top-2 right-2 p-1.5 rounded bg-dark-900 border border-dark-800 text-dark-400 hover:text-red-400 transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      
                      <div className="w-full max-w-sm">
                        <label className="text-[10px] font-bold text-dark-450 block mb-1">Subject Course</label>
                        <select
                          value={input.subject_id}
                          onChange={e => handleCourseChange(idx, 'subject_id', e.target.value)}
                          className="w-full px-3 py-2 bg-dark-900 border border-dark-800 rounded-lg text-white text-xs focus:border-primary-500/40"
                        >
                          <option value="">Select Subject</option>
                          {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-dark-450 block mb-1">Students List (Format: RollNumber, StudentName - one per line)</label>
                        <textarea
                          rows={3}
                          value={input.rawText}
                          onChange={e => handleCourseChange(idx, 'rawText', e.target.value)}
                          placeholder="CSE-101, Albert Einstein&#10;CSE-102, Isaac Newton"
                          className="w-full px-3 py-2 bg-dark-900 border border-dark-800 rounded-lg text-white text-xs outline-none focus:border-primary-500/40 font-mono"
                        ></textarea>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {seatingError && <p className="text-sm font-semibold text-red-400">{seatingError}</p>}

              <button
                type="submit"
                disabled={isGenerating}
                className="w-full py-4 px-4 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-primary-500/15 transition-all duration-300 disabled:opacity-50"
              >
                {isGenerating ? 'Computing Jumbled Seating arrangements...' : 'Generate Seating Plan'}
              </button>
            </form>
          </div>
        ) : (
          /* Seating Plans History & Detail Viewer Tab */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* List panel */}
            <div className="lg:col-span-1 space-y-4">
              <h3 className="text-base font-bold text-white">Generated Seating Lists</h3>
              {seatingPlans.length === 0 ? (
                <p className="text-sm text-dark-500 py-6">No seating plans registered yet.</p>
              ) : (
                <div className="space-y-3">
                  {seatingPlans.map(plan => {
                    const isSelected = activePlanDetails?.id === plan.id;
                    return (
                      <div
                        key={plan.id}
                        onClick={() => setActivePlanDetails(plan)}
                        className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 flex justify-between items-center ${
                          isSelected
                            ? 'bg-primary-500/10 border-primary-500/40 text-white'
                            : 'bg-dark-900/40 border-dark-850 text-dark-400 hover:text-white'
                        }`}
                      >
                        <div>
                          <h4 className="text-xs font-bold text-dark-300 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(plan.exam_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                          </h4>
                          <p className="text-[10px] text-dark-500 mt-1 font-semibold uppercase">Slot: {plan.time_slot} | Students: {plan.assignments.length}</p>
                        </div>
                        <Eye className="w-4 h-4 text-dark-500" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Visual previewer panel */}
            <div className="lg:col-span-2">
              {activePlanDetails ? (
                <div className="glass-panel p-6 space-y-6">
                  <div className="flex justify-between items-start gap-4 border-b border-dark-850/40 pb-4">
                    <div>
                      <h3 className="text-lg font-bold text-white">Visual Arrangement Layout</h3>
                      <p className="text-xs text-dark-400 mt-0.5">
                        Exam Date: {new Date(activePlanDetails.exam_date).toLocaleDateString()} | Slot: {activePlanDetails.time_slot}
                      </p>
                    </div>
                    <button
                      onClick={handlePrint}
                      className="py-2.5 px-4 rounded-xl bg-dark-900 border border-dark-800 text-white hover:bg-dark-800 text-xs font-bold flex items-center justify-center gap-2 transition-all duration-300"
                    >
                      <Printer className="w-4 h-4" />
                      Print Seating plan
                    </button>
                  </div>

                  {/* Render rooms desk layouts */}
                  {Array.from(new Set(activePlanDetails.assignments.map(a => a.classroom_id))).map(roomId => {
                    const roomAssignments = activePlanDetails.assignments.filter(a => a.classroom_id === roomId);
                    const room = classrooms.find(r => r.id === roomId);
                    if (!room) return null;

                    // Map row,col to assignment
                    const grid: { [key: string]: SeatingAssignment } = {};
                    roomAssignments.forEach(a => {
                      grid[`${a.row_index}-${a.col_index}`] = a;
                    });

                    return (
                      <div key={roomId} className="p-5 rounded-xl border border-dark-850 bg-dark-950/20 space-y-4">
                        <div className="flex justify-between items-center">
                          <h4 className="text-sm font-bold text-white flex items-center gap-2">
                            <Layers className="w-4 h-4 text-primary-400" />
                            Classroom: {room.room_number}
                          </h4>
                          <span className="text-[10px] font-bold text-dark-500 uppercase">Layout: {room.rows} x {room.cols}</span>
                        </div>

                        {/* Top-down visual desk matrix */}
                        <div className="overflow-x-auto pb-4">
                          <div 
                            className="grid gap-2.5 min-w-[640px]"
                            style={{ gridTemplateColumns: `repeat(${room.cols}, minmax(0, 1fr))` }}
                          >
                            {Array.from({ length: room.rows }).map((_, r) => (
                              Array.from({ length: room.cols }).map((_, c) => {
                                const assign = grid[`${r}-${c}`];
                                const subjColor = assign ? getSubjectColor(assign.subject_id) : 'bg-dark-950/20 border-dark-850 text-dark-600';
                                
                                return (
                                  <div 
                                    key={`${r}-${c}`} 
                                    className={`border p-2 rounded-xl text-[10px] text-center min-h-[60px] flex flex-col justify-between transition-all ${subjColor}`}
                                  >
                                    {assign ? (
                                      <>
                                        <strong className="block text-[11px] font-extrabold">{assign.student_roll_no}</strong>
                                        <span className="block text-[9px] font-medium opacity-85 truncate max-w-full">{assign.student_name}</span>
                                        <span className="block mt-1 font-bold text-[8px] bg-dark-950/50 px-1 py-0.5 rounded uppercase tracking-wider truncate max-w-full">
                                          {assign.subject?.code}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="my-auto opacity-35">Vacant</span>
                                    )}
                                  </div>
                                );
                              })
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="glass-panel p-10 text-center text-dark-500">
                  <Grid3X3 className="w-12 h-12 mx-auto mb-4 opacity-25" />
                  <p className="text-sm font-medium">Select a seating plan from the list to display its layout grid details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Classroom Modal Form (For HOD/Admin) */}
      {isRoomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md p-6 relative">
            <button
              onClick={() => setIsRoomModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-dark-900 border border-dark-800 text-dark-400 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-lg font-bold text-white mb-6">
              {editingRoomId ? 'Edit Classroom' : 'Register Classroom'}
            </h3>

            <form onSubmit={handleRoomSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Room Number / Description</label>
                <input
                  type="text"
                  placeholder="e.g. Room-302, Lab-1"
                  value={roomNum}
                  onChange={e => setRoomNum(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5">Row Layout</label>
                  <input
                    type="number"
                    value={roomRows}
                    onChange={e => setRoomRows(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-dark-300 block mb-1.5">Col Layout</label>
                  <input
                    type="number"
                    value={roomCols}
                    onChange={e => setRoomCols(parseInt(e.target.value) || 1)}
                    className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Total Seats capacity (Auto-calculated)</label>
                <input
                  type="number"
                  disabled
                  value={roomRows * roomCols}
                  className="w-full px-4 py-3 bg-dark-950/30 border border-dark-800 rounded-xl text-dark-500 text-sm outline-none cursor-not-allowed"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Classroom Type</label>
                <select
                  value={roomType}
                  onChange={e => setRoomType(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none"
                >
                  <option value="LECTURE_HALL">Lecture Hall</option>
                  <option value="COMPUTER_LAB">Computer Lab</option>
                  <option value="SEMINAR_ROOM">Seminar Room</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Department branch owner</label>
                <select
                  value={roomDeptId}
                  onChange={e => setRoomDeptId(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-primary-500/50 outline-none"
                >
                  <option value="">General/Shared</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
                </select>
              </div>

              {roomError && <p className="text-sm font-semibold text-red-400">{roomError}</p>}

              <button
                type="submit"
                className="w-full mt-4 py-3.5 px-4 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-primary-500/15 transition-all duration-300"
              >
                Save Classroom Details
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
