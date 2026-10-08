import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest('/auth/me')
      .then(({ user: currentUser }) => {
        if (active) setUser(currentUser);
      })
      .catch((error) => {
        if (active && error.status !== 401) {
          console.error('Unable to restore Wakwito session:', error);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const login = async (identifier, password, remember = true) => {
    const { user: nextUser } = await apiRequest('/auth/login', {
      method: 'POST',
      body: { identifier, password, remember },
    });
    setUser(nextUser);
    return nextUser;
  };

  const signup = async (formData) => {
    const { user: nextUser } = await apiRequest('/auth/signup', {
      method: 'POST',
      body: {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
      },
    });
    setUser(nextUser);
    return nextUser;
  };

  const logout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  };

  const value = useMemo(() => ({ user, loading, login, signup, logout }), [user, loading]);

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('Auth context missing');
  return context;
}
