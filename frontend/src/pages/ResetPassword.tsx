import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { KeyRound, Lock, Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';

export const ResetPassword: React.FC = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [searchParams] = useSearchParams();
  const { resetPassword } = useAuth();
  const navigate = useNavigate();

  const email = searchParams.get('email') || '';
  const otpCode = searchParams.get('otp') || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!email || !otpCode) {
      setError('Missing session parameters. Please request a new recovery OTP.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await resetPassword(email, otpCode, newPassword);
      setSuccess('Your password has been reset successfully! Redirecting to login...');
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
    <div 
      className="relative min-h-screen flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 py-10 overflow-hidden font-sans bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/anits_campus_bg.jpg')" }}
    >
      {/* High-grade Executive Institutional Backdrop Overlay */}
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-xs"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-slate-950/30"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/95 backdrop-blur-md border border-white/60 shadow-2xl rounded-2xl sm:rounded-3xl p-6 sm:p-10">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-700 via-indigo-800 to-blue-900 text-white font-black text-base shadow-xl shadow-blue-950/30 mb-4 border border-blue-900/30 tracking-wider">
              <Lock className="w-7 h-7" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Set New Password</h2>
            <p className="text-slate-600 mt-1 text-xs sm:text-sm font-bold">Choose a strong, secure password</p>
          </div>

          {(!email || !otpCode) && (
            <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold text-center leading-relaxed shadow-sm">
              Verification details are missing. Please request a new OTP link.
              <Link to="/forgot-password" className="block font-extrabold text-blue-600 mt-2 hover:underline">
                Request OTP Code
              </Link>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-300 text-red-700 text-xs font-bold leading-relaxed shadow-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold leading-relaxed shadow-sm">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* New Password Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block">New Password</label>
              <div className="relative flex items-center">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400 pointer-events-none">
                  <Lock className="w-5 h-5" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full pl-11 pr-12 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-bold placeholder-slate-400 focus:border-blue-600 focus:bg-white outline-none transition-all shadow-sm"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isSubmitting || !email || !otpCode}
                  required
                />
                <button
                  type="button"
                  className="absolute right-0 pr-3.5 pl-2 h-full flex items-center justify-center text-slate-400 hover:text-blue-600 transition-colors cursor-pointer bg-transparent border-0 outline-none"
                  style={{ background: 'transparent', border: 'none', boxShadow: 'none' }}
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isSubmitting || !email || !otpCode}
                  tabIndex={-1}
                  title={showPassword ? "Hide Password" : "Show Password"}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Confirm Password Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block">Confirm Password</label>
              <div className="relative flex items-center">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400 pointer-events-none">
                  <KeyRound className="w-5 h-5" />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full pl-11 pr-12 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-bold placeholder-slate-400 focus:border-blue-600 focus:bg-white outline-none transition-all shadow-sm"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isSubmitting || !email || !otpCode}
                  required
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold text-sm shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 mt-6 transition-all cursor-pointer disabled:opacity-70"
              disabled={isSubmitting || !email || !otpCode}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Resetting...</span>
                </>
              ) : (
                <>
                  <span>Reset Password</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* Footer Link */}
          <div className="text-center mt-8 pt-6 border-t border-slate-200">
            <Link 
              to="/login" 
              className="text-xs sm:text-sm font-extrabold text-blue-600 hover:text-blue-800 transition-colors"
            >
              Back to Sign In
            </Link>
          </div>
        </div>

        {/* Security Badge */}
        <div className="text-center mt-6">
          <p className="text-[11px] font-extrabold text-white/90 drop-shadow-md tracking-wider uppercase">
            Encrypted End-to-End • ANITS Academic Operations Platform
          </p>
        </div>
      </div>
    </div>
  );
};
