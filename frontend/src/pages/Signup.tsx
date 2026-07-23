import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserPlus, Mail, Lock, User, Loader2, ArrowRight } from 'lucide-react';

export const Signup: React.FC = () => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('FACULTY');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      await signup(fullName, email, password, role);
      setSuccess('Account created successfully! Redirecting to login...');
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
      {/* Background Neon Glows */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-primary-600/10 rounded-full blur-[100px] animate-pulse-slow"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/10 rounded-full blur-[100px] animate-pulse-slow"></div>

      <div className="w-full max-w-md glass-panel p-8 md:p-10 relative z-10 animate-slide-up">
        {/* Logo/Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-600 text-white shadow-xl shadow-primary-500/20 mb-4">
            <UserPlus className="w-7 h-7" />
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">Create Account</h2>
          <p className="text-dark-400 mt-2 text-sm">Join the Academic Operations Platform</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-200 text-sm">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Full Name Input */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-dark-300 uppercase tracking-wider block">Full Name</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-dark-400">
                <User className="w-5 h-5" />
              </span>
              <input
                type="text"
                className="glass-input pl-11"
                placeholder="Dr. Harsh Vardhan"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>
          </div>

          {/* Email Input */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-dark-300 uppercase tracking-wider block">Email Address</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-dark-400">
                <Mail className="w-5 h-5" />
              </span>
              <input
                type="email"
                className="glass-input pl-11"
                placeholder="professor@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-dark-300 uppercase tracking-wider block">Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-dark-400">
                <Lock className="w-5 h-5" />
              </span>
              <input
                type="password"
                className="glass-input pl-11"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>
          </div>

          {/* Role Select */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-dark-300 uppercase tracking-wider block">System Role</label>
            <div className="grid grid-cols-3 gap-2">
              {['FACULTY', 'HOD', 'ADMIN'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  disabled={isSubmitting}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all duration-300 ${
                    role === r
                      ? 'bg-primary-600/20 border-primary-500 text-primary-300 shadow-md shadow-primary-500/5'
                      : 'bg-dark-900/30 border-dark-800 text-dark-400 hover:border-dark-700 hover:text-dark-200'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full btn-primary flex items-center justify-center gap-2 mt-6"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Registering...
              </>
            ) : (
              <>
                Create Account
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        {/* Footer Link */}
        <div className="text-center mt-8 pt-6 border-t border-dark-800/60">
          <p className="text-sm text-dark-400">
            Already have an account?{' '}
            <Link 
              to="/login" 
              className="font-semibold text-primary-400 hover:text-primary-300 transition-colors"
            >
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
