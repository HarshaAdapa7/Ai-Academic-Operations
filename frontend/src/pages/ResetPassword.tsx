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
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
      {/* Background Neon Glows */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-primary-600/10 rounded-full blur-[100px] animate-pulse-slow"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/10 rounded-full blur-[100px] animate-pulse-slow"></div>

      <div className="w-full max-w-md glass-panel p-8 md:p-10 relative z-10 animate-slide-up">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-600 text-white shadow-xl shadow-primary-500/20 mb-4">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">Set New Password</h2>
          <p className="text-dark-400 mt-2 text-sm">Choose a strong, secure password</p>
        </div>

        {(!email || !otpCode) && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-sm text-center">
            Verification details are missing. Please request a new OTP link.
            <Link to="/forgot-password" className="block font-semibold text-primary-400 mt-2 hover:underline">
              Request OTP Code
            </Link>
          </div>
        )}

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

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* New Password Input */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-dark-300 uppercase tracking-wider block">New Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-dark-400">
                <Lock className="w-5 h-5" />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                className="glass-input pl-11 pr-10"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isSubmitting || !email || !otpCode}
                required
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-dark-400 hover:text-white"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isSubmitting || !email || !otpCode}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Confirm Password Input */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-dark-300 uppercase tracking-wider block">Confirm Password</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-dark-400">
                <KeyRound className="w-5 h-5" />
              </span>
              <input
                type={showPassword ? 'text' : 'password'}
                className="glass-input pl-11 pr-10"
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
            className="w-full btn-primary flex items-center justify-center gap-2 mt-4"
            disabled={isSubmitting || !email || !otpCode}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Resetting...
              </>
            ) : (
              <>
                Reset Password
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        {/* Footer Link */}
        <div className="text-center mt-8 pt-6 border-t border-dark-800/60">
          <Link 
            to="/login" 
            className="text-sm font-semibold text-primary-400 hover:text-primary-300 transition-colors"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};
