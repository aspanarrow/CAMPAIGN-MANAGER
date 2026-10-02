'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  apiKey: string | null;
  setApiKey: (key: string) => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load API key from localStorage on mount
    const storedKey = localStorage.getItem('api_key');
    if (storedKey) {
      setApiKeyState(storedKey);
    }
    setIsLoading(false);
  }, []);

  const setApiKey = (key: string) => {
    localStorage.setItem('api_key', key);
    setApiKeyState(key);
  };

  const logout = () => {
    localStorage.removeItem('api_key');
    setApiKeyState(null);
  };

  return (
    <AuthContext.Provider
      value={{
        apiKey,
        setApiKey,
        isAuthenticated: !!apiKey,
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

