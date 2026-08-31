import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, ShieldCheck, KeyRound, Loader2, ArrowRight } from 'lucide-react';

type Step = 'REQUEST' | 'VERIFY';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
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
      const res = await forgotPassword(email);
      setSuccess('If registered, a 6-digit OTP code has been dispatched.');
      if (res?.dev_otp) {
        setDevOtp(res.dev_otp);
        setOtpCode(res.dev_otp);
      }
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
    <div 
      className="relative min-h-screen flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 py-10 overflow-hidden font-sans bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url('/anits_campus_bg.jpg')" }}
    >
      {/* High-grade Executive Institutional Backdrop Overlay */}
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-xs"></div>
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-slate-950/30"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/95 backdrop-blur-md border border-white/60 shadow-2xl rounded-2xl sm:rounded-3xl p-6 sm:p-10">
          {step === 'REQUEST' ? (
            <>
              {/* Header for Email Request */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-700 via-indigo-800 to-blue-900 text-white font-black text-base shadow-xl shadow-blue-950/30 mb-4 border border-blue-900/30 tracking-wider">
                  <KeyRound className="w-7 h-7" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Recover Password</h2>
                <p className="text-slate-600 mt-1 text-xs sm:text-sm font-bold">Enter your registered email to receive OTP code</p>
              </div>

              {error && (
                <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-300 text-red-700 text-xs font-bold leading-relaxed shadow-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleRequestOtp} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block">Email Address</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400">
                      <Mail className="w-5 h-5" />
                    </span>
                    <input
                      type="email"
                      className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-sm font-bold placeholder-slate-400 focus:border-blue-600 focus:bg-white outline-none transition-all shadow-sm"
                      placeholder="professor@anits.edu.in"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold text-sm shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 mt-6 transition-all cursor-pointer disabled:opacity-70"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Sending OTP...</span>
                    </>
                  ) : (
                    <>
                      <span>Send OTP Code</span>
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
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 text-white font-black text-base shadow-xl shadow-emerald-950/30 mb-4 border border-emerald-800/30 tracking-wider">
                  <ShieldCheck className="w-7 h-7" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Verify Identity</h2>
                <p className="text-slate-600 mt-1 text-xs sm:text-sm font-bold">We dispatched a 6-digit code to {email}</p>
              </div>

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

              {devOtp && (
                <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold space-y-1 shadow-sm">
                  <div className="font-extrabold flex items-center gap-2 text-amber-800">
                    ⚡ Intranet / Dev Mode OTP Dispatch
                  </div>
                  <div>
                    Your 6-digit OTP code is: <span className="font-mono text-base font-black text-amber-950 underline tracking-widest">{devOtp}</span>
                  </div>
                  <div className="text-[11px] text-amber-800/90">
                    (Auto-filled into verification input below & saved as an In-App Notification)
                  </div>
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block text-center">Verification OTP Code</label>
                  <input
                    type="text"
                    maxLength={6}
                    className="w-full py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 text-2xl font-mono font-black text-center tracking-[0.5em] focus:tracking-[0.5em] focus:border-emerald-600 focus:bg-white outline-none transition-all shadow-sm"
                    placeholder="000000"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    disabled={isSubmitting}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-sm shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 mt-6 transition-all cursor-pointer disabled:opacity-70"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <span>Verify OTP</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>

                <div className="text-center mt-3">
                  <button
                    type="button"
                    onClick={() => setStep('REQUEST')}
                    className="text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
                    disabled={isSubmitting}
                  >
                    ← Change Email Address
                  </button>
                </div>
              </form>
            </>
          )}

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
