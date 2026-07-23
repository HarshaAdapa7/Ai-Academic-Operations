import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { aiService } from '../services/aiService';
import type { AISuggestedAction, AcademicPolicy } from '../services/aiService';
import { facultyService } from '../services/facultyService';
import type { Department } from '../services/facultyService';
import { ChevronLeft, Send, Sparkles, Brain, BookOpen, RefreshCw, Plus, Search, ArrowRight } from 'lucide-react';

interface AIDecisionCenterViewProps {
  onBack: () => void;
  onNavigate?: (viewName: any) => void;
}

export const AIDecisionCenterView: React.FC<AIDecisionCenterViewProps> = ({ onBack, onNavigate }) => {
  const { user } = useAuth();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [activeTab, setActiveTab] = useState<'assistant' | 'policies'>('assistant');
  const [isLoading, setIsLoading] = useState(false);

  // Chat states
  const [messages, setMessages] = useState<{ id: string; role: 'user' | 'assistant'; content: string; actions?: AISuggestedAction[] }[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content: `Hello ${user?.full_name || 'Academic Administrator'}! I am your AI Operations & Decision Assistant Engine.\n\nI can analyze teacher workload metrics, evaluate pending leave substitution options, inspect campus room occupancy, auto-schedule class timetables, and search institutional policy RAG documents.`,
      actions: [
        { action_type: 'AUTO_SOLVE_TIMETABLE', label: 'Auto-Schedule Timetable', payload_json: '{}' },
        { action_type: 'APPLY_SUBSTITUTION', label: 'Leave & Substitution Desk', payload_json: '{}' },
        { action_type: 'VIEW_ROOM_GRID', label: 'Classrooms Inventory', payload_json: '{}' }
      ]
    }
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Policy RAG states
  const [policies, setPolicies] = useState<AcademicPolicy[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [newPolicyTitle, setNewPolicyTitle] = useState('');
  const [newPolicyCategory, setNewPolicyCategory] = useState('LEAVE_POLICY');
  const [newPolicyContent, setNewPolicyContent] = useState('');

  const QUICK_PROMPTS = [
    "Who is the most overutilized faculty member in CSE?",
    "What are the B.Tech computer lab slot rules?",
    "Analyze campus classroom occupancy rates",
    "Find substitute candidates for active leave requests"
  ];

  useEffect(() => {
    loadDepartmentsAndPolicies();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadDepartmentsAndPolicies = async () => {
    try {
      const depts = await facultyService.getDepartments();
      setDepartments(depts);

      const pols = await aiService.getAcademicPolicies();
      setPolicies(pols);
    } catch (err) {
      console.error('Failed to load decision center context:', err);
    }
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const promptToSend = customPrompt || inputPrompt;
    if (!promptToSend.trim()) return;

    const userMsgId = `user-${Date.now()}`;
    const userMessage = { id: userMsgId, role: 'user' as const, content: promptToSend };
    
    setMessages(prev => [...prev, userMessage]);
    if (!customPrompt) setInputPrompt('');
    setIsLoading(true);

    try {
      const res = await aiService.sendChatMessage(
        promptToSend,
        activeConversationId,
        selectedDeptId || undefined
      );

      setActiveConversationId(res.conversation_id);
      
      const assistantMsg = {
        id: `asst-${Date.now()}`,
        role: 'assistant' as const,
        content: res.reply,
        actions: res.suggested_actions
      };
      
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error('Failed to communicate with AI Assistant:', err);
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: 'Apologies, the decision assistant engine encountered a temporary network error. Please verify backend service connectivity.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteAction = (actionType: string) => {
    if (!onNavigate) return;
    switch (actionType) {
      case 'AUTO_SOLVE_TIMETABLE':
        onNavigate('timetable_ops');
        break;
      case 'APPLY_SUBSTITUTION':
        onNavigate('leave_operations');
        break;
      case 'VIEW_ROOM_GRID':
        onNavigate('classrooms_seating');
        break;
      default:
        break;
    }
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPolicyTitle || !newPolicyContent) return;

    try {
      const created = await aiService.createAcademicPolicy({
        title: newPolicyTitle,
        category: newPolicyCategory,
        content: newPolicyContent,
        tags: `${newPolicyCategory.toLowerCase()}, academic, regulation`
      });
      setPolicies(prev => [created, ...prev]);
      setIsPolicyModalOpen(false);
      setNewPolicyTitle('');
      setNewPolicyContent('');
    } catch (err) {
      console.error('Failed to save academic policy:', err);
    }
  };

  const filteredPolicies = policies.filter(p => 
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
              <Brain className="w-6 h-6 text-rose-500" />
              <h2 className="text-2xl font-extrabold text-white">
                AI Decision Center & Assistant
              </h2>
            </div>
            <p className="text-dark-400 text-sm">Consult scheduling assistant engines and search RAG academic policies</p>
          </div>
        </div>

        {/* Department Filter */}
        <div className="flex items-center gap-3">
          <div className="w-56">
            <select
              value={selectedDeptId}
              onChange={e => setSelectedDeptId(e.target.value)}
              className="w-full px-3 py-2 bg-dark-900 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-rose-500/50"
            >
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name} ({d.code})</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex gap-2 p-1 bg-dark-900 border border-dark-800 rounded-xl max-w-sm mb-8">
        <button
          onClick={() => setActiveTab('assistant')}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'assistant' 
              ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' 
              : 'text-dark-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI Assistant Chat
        </button>
        <button
          onClick={() => setActiveTab('policies')}
          className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'policies' 
              ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' 
              : 'text-dark-400 hover:text-white'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          RAG Policies
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'assistant' ? (
        /* AI Assistant Conversational View */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Messages & Conversation Area */}
          <div className="lg:col-span-3 glass-panel p-6 flex flex-col h-[650px] relative overflow-hidden">
            {/* Messages Container */}
            <div className="flex-1 overflow-y-auto space-y-6 pr-2 mb-4">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-600 to-pink-600 flex items-center justify-center text-white flex-shrink-0 shadow-lg shadow-rose-500/20">
                      <Sparkles className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`max-w-xl rounded-2xl p-4 text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary-600 text-white rounded-tr-none shadow-md'
                      : 'bg-dark-900 border border-dark-800 text-dark-100 rounded-tl-none space-y-3'
                  }`}>
                    <div className="whitespace-pre-wrap font-medium">{msg.content}</div>

                    {/* Suggested Action Buttons */}
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="pt-3 border-t border-dark-800/80 flex flex-wrap gap-2 mt-2">
                        {msg.actions.map((act, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleExecuteAction(act.action_type)}
                            className="py-1.5 px-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500 hover:text-white transition-all text-[10px] font-extrabold flex items-center gap-1.5 shadow-sm"
                          >
                            <span>{act.label}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3 justify-start items-center">
                  <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center animate-pulse">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="bg-dark-900 border border-dark-800 rounded-2xl p-4 text-xs text-dark-400 flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-rose-400" />
                    <span>AI assistant is evaluating schedule constraints & policy RAG...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="pt-4 border-t border-dark-800/80 flex gap-3">
              <input
                type="text"
                value={inputPrompt}
                onChange={e => setInputPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask AI assistant about teacher availability, leaves, room allocations..."
                className="flex-1 px-4 py-3 bg-dark-900 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-rose-500/50 shadow-inner"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={isLoading || !inputPrompt.trim()}
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-rose-500/20 disabled:opacity-50"
              >
                <span>Send</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Right Sidebar: Quick Prompts & Context */}
          <div className="space-y-6">
            <div className="glass-panel p-6 border border-dark-800">
              <h3 className="text-xs font-bold text-dark-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                Quick Operations Questions
              </h3>
              <div className="space-y-2.5">
                {QUICK_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(prompt)}
                    className="w-full text-left p-3 rounded-xl bg-dark-950/40 border border-dark-850 text-dark-300 hover:text-white hover:border-rose-500/40 hover:bg-rose-500/5 transition-all text-xs font-medium leading-snug"
                  >
                    "{prompt}"
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* RAG Academic Policy Knowledge Base Tab */
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-dark-900/30 p-4 border border-dark-800 rounded-xl">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-dark-500 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search academic policy rules, duty leave regulations, or lab hours..."
                className="w-full pl-10 pr-4 py-2 bg-dark-950 border border-dark-800 rounded-xl text-white text-xs outline-none focus:border-rose-500/50"
              />
            </div>

            {(user?.role === 'HOD' || user?.role === 'ADMIN') && (
              <button
                onClick={() => setIsPolicyModalOpen(true)}
                className="flex items-center gap-2 py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-500/20 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Policy Document
              </button>
            )}
          </div>

          {/* Policy Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredPolicies.map(pol => (
              <div key={pol.id} className="glass-panel p-6 border border-dark-800 relative flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="text-base font-extrabold text-white">{pol.title}</h4>
                    <span className="text-[9px] px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/25 font-bold uppercase">
                      {pol.category}
                    </span>
                  </div>
                  <p className="text-xs text-dark-300 leading-relaxed font-medium mt-2">{pol.content}</p>
                </div>

                {pol.tags && (
                  <div className="mt-4 pt-3 border-t border-dark-850/50 flex flex-wrap gap-1.5">
                    {pol.tags.split(',').map((tag, idx) => (
                      <span key={idx} className="text-[9px] px-2 py-0.5 rounded bg-dark-950 text-dark-400 font-semibold">
                        #{tag.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Custom Policy Modal (HOD & Admin) */}
      {isPolicyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-950/80 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md p-6 relative">
            <h3 className="text-lg font-bold text-white mb-6">Add Policy Document</h3>
            <form onSubmit={handleSavePolicy} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Policy Title</label>
                <input
                  type="text"
                  value={newPolicyTitle}
                  onChange={e => setNewPolicyTitle(e.target.value)}
                  placeholder="e.g. Duty Leave Compensation Policy"
                  className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-rose-500/50 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Category</label>
                <select
                  value={newPolicyCategory}
                  onChange={e => setNewPolicyCategory(e.target.value)}
                  className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-sm focus:border-rose-500/50 outline-none"
                >
                  <option value="LEAVE_POLICY">LEAVE_POLICY</option>
                  <option value="TIMETABLE_RULES">TIMETABLE_RULES</option>
                  <option value="EXAM_RULES">EXAM_RULES</option>
                  <option value="WORKLOAD_POLICY">WORKLOAD_POLICY</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-dark-300 block mb-1.5">Policy Regulation Text</label>
                <textarea
                  rows={4}
                  value={newPolicyContent}
                  onChange={e => setNewPolicyContent(e.target.value)}
                  placeholder="Describe institutional rules and constraints..."
                  className="w-full px-4 py-3 bg-dark-950/50 border border-dark-800 rounded-xl text-white text-xs focus:border-rose-500/50 outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-dark-850">
                <button
                  type="button"
                  onClick={() => setIsPolicyModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 text-xs font-bold hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                >
                  Save Policy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
