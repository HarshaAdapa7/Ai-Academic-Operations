import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

// Base API URL configuration
export const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'ADMIN' | 'HOD' | 'FACULTY' | 'DEAN';
  department_id?: string;
  faculty_profile?: any;
  created_at: string;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<any>;
  signup: (full_name: string, email: string, password: string, role: string) => Promise<any>;
  logout: () => void;
  forgotPassword: (email: string) => Promise<any>;
  verifyOtp: (email: string, otpCode: string) => Promise<any>;
  resetPassword: (email: string, otpCode: string, newPassword: string) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Set default auth headers for axios
  if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common['Authorization'];
  }

  const fetchCurrentUser = async (authToken: string) => {
    try {
      setIsLoading(true);
      const response = await axios.get(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const userData = response.data;
      if (!userData.department_id && response.data.faculty_profile?.department_id) {
        userData.department_id = response.data.faculty_profile.department_id;
      }
      setUser(userData);
    } catch (error) {
      console.warn('Session expired or unauthenticated. Cleared session token.');
      logout();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchCurrentUser(token);
    } else {
      setIsLoading(false);
    }

    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response && error.response.status === 401) {
          logout();
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [token]);

const formatAuthError = (error: any, fallback: string): string => {
  if (!error) return fallback;
  const detail = error.response?.data?.detail;
  if (!detail) {
    if (error.code === 'ERR_NETWORK') return 'Network Error: Cannot connect to API server at http://127.0.0.1:8002.';
    return error.message || fallback;
  }
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((d: any) => d.msg || d.detail || JSON.stringify(d)).join(', ');
  }
  if (typeof detail === 'object') {
    return detail.msg || detail.detail || JSON.stringify(detail);
  }
  return fallback;
};

  const login = async (email: string, password: string) => {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email,
        password,
        full_name: 'Login Form'
      });
      
      const { access_token } = response.data;
      
      localStorage.setItem('token', access_token);
      setToken(access_token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      
      await fetchCurrentUser(access_token);
      return response.data;
    } catch (error: any) {
      throw formatAuthError(error, 'Login failed. Please check credentials.');
    }
  };

  const signup = async (full_name: string, email: string, password: string, role: string) => {
    try {
      const response = await axios.post(`${API_URL}/auth/signup`, {
        full_name,
        email,
        password,
        role
      });
      return response.data;
    } catch (error: any) {
      throw formatAuthError(error, 'Registration failed.');
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  const forgotPassword = async (email: string) => {
    try {
      const response = await axios.post(`${API_URL}/auth/forgot-password`, { email });
      return response.data;
    } catch (error: any) {
      throw formatAuthError(error, 'Failed to request OTP code.');
    }
  };

  const verifyOtp = async (email: string, otpCode: string) => {
    try {
      const response = await axios.post(`${API_URL}/auth/verify-otp`, {
        email,
        otp_code: otpCode
      });
      return response.data;
    } catch (error: any) {
      throw formatAuthError(error, 'Invalid or expired OTP code.');
    }
  };

  const resetPassword = async (email: string, otpCode: string, newPassword: string) => {
    try {
      const response = await axios.post(`${API_URL}/auth/reset-password`, {
        email,
        otp_code: otpCode,
        new_password: newPassword
      });
      return response.data;
    } catch (error: any) {
      throw formatAuthError(error, 'Failed to reset password.');
    }
  };

  const value = {
    token,
    user,
    isAuthenticated: !!token && !!user,
    isLoading,
    login,
    signup,
    logout,
    forgotPassword,
    verifyOtp,
    resetPassword
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
};
