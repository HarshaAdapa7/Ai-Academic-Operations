import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    
    setError(null);
    setIsSubmitting(true);
    
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 overflow-hidden font-sans">
      {/* Background Soft Gradients */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-blue-100/50 via-indigo-50/30 to-transparent pointer-events-none rounded-b-[4rem]"></div>
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-indigo-400/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        {/* Main Card */}
        <div className="bg-white border border-slate-300 shadow-xl rounded-3xl p-8 sm:p-10 backdrop-blur-md">
          
          {/* Logo/Brand Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-700 via-indigo-800 to-blue-900 text-white font-black text-base shadow-xl shadow-blue-900/20 mb-4 border border-blue-900/30 tracking-wider">
              ANITS
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">ANITS Portal</h2>
            <p className="text-slate-600 mt-1.5 text-xs sm:text-sm font-bold">Anil Neerukonda Institute of Technology & Sciences</p>
            <span className="inline-block mt-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-[10px] font-black uppercase tracking-wider">
              Autonomous • Academic Operations Platform
            </span>
          </div>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-300 text-red-700 text-xs font-bold leading-relaxed shadow-sm flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 mt-1.5 flex-shrink-0"></span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block">Email Address</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400">
                  <Mail className="w-5 h-5" />
                </span>
                <input
                  type="email"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-bold placeholder-slate-400 focus:border-blue-600 focus:bg-white outline-none transition-all shadow-sm"
                  placeholder="professor@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block">Password</label>
                <Link 
                  to="/forgot-password" 
                  className="text-xs font-extrabold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Forgot Password?
                </Link>
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400">
                  <Lock className="w-5 h-5" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full pl-11 pr-11 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-bold placeholder-slate-400 focus:border-blue-600 focus:bg-white outline-none transition-all shadow-sm"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-700 transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isSubmitting}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold text-sm shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 mt-6 transition-all cursor-pointer disabled:opacity-70"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Dashboard</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Footer Link */}
          <div className="text-center mt-8 pt-6 border-t border-slate-200">
            <p className="text-xs sm:text-sm font-bold text-slate-600">
              Don't have an account?{' '}
              <Link 
                to="/signup" 
                className="font-extrabold text-blue-600 hover:text-blue-800 transition-colors ml-1"
              >
                Create Account
              </Link>
            </p>
          </div>
        </div>

        {/* Security Badge */}
        <div className="text-center mt-6">
          <p className="text-[11px] font-extrabold text-slate-600 tracking-wider uppercase">
            Encrypted End-to-End • ANITS Academic Operations Platform
          </p>
        </div>
      </div>
    </div>
  );
};
