import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { ForgotPassword } from './pages/ForgotPassword';
import { ResetPassword } from './pages/ResetPassword';
import { Dashboard } from './pages/Dashboard';
import { useNotifications } from './context/NotificationContext';
import { Loader2, Bell, X } from 'lucide-react';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin mb-4" />
        <p className="text-dark-400 font-medium text-sm">Authenticating Session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary-500 animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

function AppContent() {
  const { latestToast, clearToast } = useNotifications();

  React.useEffect(() => {
    if (latestToast) {
      const timer = setTimeout(() => {
        clearToast();
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [latestToast, clearToast]);

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/signup"
          element={
            <PublicRoute>
              <Signup />
            </PublicRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PublicRoute>
              <ForgotPassword />
            </PublicRoute>
          }
        />
        <Route
          path="/reset-password"
          element={
            <PublicRoute>
              <ResetPassword />
            </PublicRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Floating Neon Toast Notification Alert */}
      {latestToast && (
        <div className="fixed bottom-6 right-6 z-[9999] max-w-sm w-full bg-dark-900/90 border border-primary-500/30 rounded-xl shadow-2xl backdrop-blur-md p-4 animate-slide-up flex gap-3 text-white">
          <div className="p-2 bg-primary-500/10 rounded-lg text-primary-400 self-start">
            <Bell className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-sm">{latestToast.title}</div>
            <div className="text-xs text-dark-300 mt-1">{latestToast.message}</div>
          </div>
          <button 
            onClick={clearToast}
            className="text-dark-400 hover:text-white transition-colors self-start p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </Router>
  );
}

function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <AppContent />
      </NotificationProvider>
    </AuthProvider>
  );
}

export default App;
