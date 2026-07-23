import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

// Base API URL configuration
export const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'ADMIN' | 'HOD' | 'FACULTY';
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
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user profiles:', error);
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
  }, [token]);

  const login = async (email: string, password: string) => {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        email,
        password,
        full_name: 'Login Form' // matching schema structure or ignored on backend
      });
      
      const { access_token } = response.data;
      
      localStorage.setItem('token', access_token);
      setToken(access_token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      
      // Fetch details
      await fetchCurrentUser(access_token);
      return response.data;
    } catch (error: any) {
      throw error.response?.data?.detail || 'Login failed. Please check credentials.';
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
      throw error.response?.data?.detail || 'Registration failed.';
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
      throw error.response?.data?.detail || 'Failed to request OTP code.';
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
      throw error.response?.data?.detail || 'Invalid or expired OTP code.';
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
      throw error.response?.data?.detail || 'Failed to reset password.';
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
