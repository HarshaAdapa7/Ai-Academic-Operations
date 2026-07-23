import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, ShieldCheck, KeyRound, Loader2, ArrowRight } from 'lucide-react';

type Step = 'REQUEST' | 'VERIFY';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState<Step>('REQUEST');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { forgotPassword, verifyOtp } = useAuth();
  const navigate = useNavigate();

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await forgotPassword(email);
      setSuccess('If registered, a 6-digit OTP code has been sent to your email.');
      setStep('VERIFY');
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.length !== 6) {
      setError('Please enter the 6-digit OTP code');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await verifyOtp(email, otpCode);
      setSuccess('OTP verified successfully! Opening password reset...');
      setTimeout(() => {
        navigate(`/reset-password?email=${encodeURIComponent(email)}&otp=${encodeURIComponent(otpCode)}`);
      }, 1500);
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
        {step === 'REQUEST' ? (
          <>
            {/* Header for Email Request */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-600 text-white shadow-xl shadow-primary-500/20 mb-4">
                <KeyRound className="w-7 h-7" />
              </div>
              <h2 className="text-3xl font-extrabold text-white tracking-tight">Recover Password</h2>
              <p className="text-dark-400 mt-2 text-sm">Enter email to receive verification code</p>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleRequestOtp} className="space-y-5">
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

              <button
                type="submit"
                className="w-full btn-primary flex items-center justify-center gap-2 mt-4"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Sending OTP...
                  </>
                ) : (
                  <>
                    Send OTP Code
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>
          </>
        ) : (
          <>
            {/* Header for OTP Verification */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-xl shadow-emerald-500/20 mb-4">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h2 className="text-3xl font-extrabold text-white tracking-tight">Verify Identity</h2>
              <p className="text-dark-400 mt-2 text-sm">We sent a 6-digit code to {email}</p>
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

            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-dark-300 uppercase tracking-wider block">Verification OTP Code</label>
                <input
                  type="text"
                  maxLength={6}
                  className="glass-input text-center text-2xl font-mono tracking-[0.5em] focus:tracking-[0.5em]"
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full btn-primary bg-gradient-to-r from-emerald-600 to-teal-600 shadow-emerald-500/20 hover:from-emerald-500 hover:to-teal-500 flex items-center justify-center gap-2 mt-4"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    Verify OTP
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>

              <div className="text-center mt-2">
                <button
                  type="button"
                  onClick={() => setStep('REQUEST')}
                  className="text-xs font-medium text-dark-400 hover:text-white transition-colors"
                  disabled={isSubmitting}
                >
                  Change Email Address
                </button>
              </div>
            </form>
          </>
        )}

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
