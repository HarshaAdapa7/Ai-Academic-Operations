import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { aiService } from '../services/aiService';
import type { AISuggestedAction } from '../services/aiService';
import { facultyService } from '../services/facultyService';
import type { Department } from '../services/facultyService';
import { ChevronLeft, Send, Sparkles, Brain, RefreshCw, ArrowRight } from 'lucide-react';

interface AIDecisionCenterViewProps {
  onBack: () => void;
  onNavigate: (viewName: 'faculty_profiles' | 'dept_subjects' | 'faculty_avail' | 'leave_operations' | 'classrooms_seating' | 'timetable_ops') => void;
}

export const AIDecisionCenterView: React.FC<AIDecisionCenterViewProps> = ({ onBack, onNavigate }) => {
  const { user } = useAuth();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Chat messages state
  const [messages, setMessages] = useState<{ id: string; role: 'user' | 'assistant'; content: string; actions?: AISuggestedAction[] }[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content: `Hello ${user?.full_name || 'Faculty'}! I am your AI Academic Operations & Assistant Engine.\n\nI can analyze teacher workload metrics, evaluate pending leave substitution options, inspect campus room occupancy, and answer institutional policy questions.`,
      actions: [
        { action_type: 'APPLY_SUBSTITUTION', label: 'Leave & Substitution Desk', payload_json: '{}' },
        { action_type: 'VIEW_ROOM_GRID', label: 'Classrooms Inventory', payload_json: '{}' }
      ]
    }
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const QUICK_PROMPTS = [
    "Who is the most overutilized faculty member in CSE?",
    "What are the B.Tech computer lab slot rules?",
    "Analyze campus classroom occupancy rates",
    "Find substitute candidates for active leave requests"
  ];

  const loadBaseMeta = async () => {
    try {
      const depts = await facultyService.getDepartments();
      setDepartments(depts);
      if (depts.length > 0 && !selectedDeptId) {
        setSelectedDeptId(depts[0].id);
      }
    } catch (err) {
      console.error('Failed to load departments list:', err);
    }
  };

  useEffect(() => {
    loadBaseMeta();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const prompt = textToSend || inputPrompt;
    if (!prompt.trim() || isLoading) return;

    const userMsgId = `user-${Date.now()}`;
    const userMsg = { id: userMsgId, role: 'user' as const, content: prompt };
    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputPrompt('');
    setIsLoading(true);

    try {
      const resp = await aiService.sendChatMessage({
        prompt: prompt,
        conversation_id: activeConversationId,
        department_id: selectedDeptId || undefined
      });

      setActiveConversationId(resp.conversation_id);
      const assistantMsg = {
        id: `asst-${Date.now()}`,
        role: 'assistant' as const,
        content: resp.response,
        actions: resp.suggested_actions
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('Failed to get AI assistant response:', err);
      const errorMsg = {
        id: `err-${Date.now()}`,
        role: 'assistant' as const,
        content: 'Apologies, I encountered an issue connecting to the LangGraph AI Engine. Please ensure the backend services are operational and try again.'
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteAction = (actionType: string) => {
    if (actionType === 'AUTO_SOLVE_TIMETABLE') {
      onNavigate('timetable_ops');
    } else if (actionType === 'APPLY_SUBSTITUTION') {
      onNavigate('leave_operations');
    } else if (actionType === 'VIEW_ROOM_GRID') {
      onNavigate('classrooms_seating');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-2.5 rounded-xl bg-dark-900 border border-dark-800 text-dark-300 hover:text-white hover:border-dark-700 transition-all duration-300"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-500 to-pink-600 flex items-center justify-center text-white shadow-md shadow-rose-500/20">
                <Brain className="w-4.5 h-4.5" />
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight">AI Assistant</h2>
            </div>
            <p className="text-dark-400 text-sm mt-1">
              Consult assistant engines for workload metrics, leave substitutions, and academic questions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-48">
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

      {/* Main Chat Interface */}
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
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-rose-500/20 flex items-center gap-2 transition-all"
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
              Quick Questions
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
    </div>
  );
};
