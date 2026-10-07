'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  apiKey: string | null;
  token: string | null;
  user: { id: string; email: string; name?: string; role: string } | null;
  setApiKey: (key: string) => void;
  setSession: (token: string, user: any) => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [user, setUserState] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load credentials from localStorage on mount (JWT preferred, API key fallback)
    const storedToken = localStorage.getItem('auth_token');
    const storedUser = localStorage.getItem('auth_user');
    const storedKey = localStorage.getItem('api_key');
    if (storedToken) {
      setTokenState(storedToken);
      try { setUserState(storedUser ? JSON.parse(storedUser) : null); } catch {}
    } else if (storedKey) {
      setApiKeyState(storedKey);
    }
    setIsLoading(false);
  }, []);

  const setApiKey = (key: string) => {
    localStorage.setItem('api_key', key);
    setApiKeyState(key);
  };

  const setSession = (newToken: string, newUser: any) => {
    localStorage.setItem('auth_token', newToken);
    localStorage.setItem('auth_user', JSON.stringify(newUser));
    localStorage.removeItem('api_key');
    setTokenState(newToken);
    setUserState(newUser);
    setApiKeyState(null);
  };

  const logout = () => {
    localStorage.removeItem('api_key');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    setApiKeyState(null);
    setTokenState(null);
    setUserState(null);
  };

  return (
    <AuthContext.Provider
      value={{
        apiKey,
        token,
        user,
        setApiKey,
        setSession,
        isAuthenticated: !!(token || apiKey),
        isLoading,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

