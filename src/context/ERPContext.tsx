import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { erpApi, getAuthToken, setAuthToken, type ERPBootstrapPayload } from '../services/api';
import type { AuthUser, Department, PermissionAction, PermissionModule } from '../types/erp';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}

interface ERPContextValue {
  user: AuthUser | null;
  data: ERPBootstrapPayload | null;
  loading: boolean;
  error: string | null;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  login: (identifier: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  refresh: () => Promise<void>;
  can: (module: PermissionModule, action?: PermissionAction) => boolean;
  getDefaultRoute: (u?: AuthUser | null) => string;
  toasts: ToastMessage[];
  toast: (type: ToastMessage['type'], title: string, description?: string) => void;
  dismissToast: (id: string) => void;
  activeDept: Department;
  setActiveDept: (dept: Department) => void;
}

const ERPContext = createContext<ERPContextValue | null>(null);

const THEME_KEY = 'cryo_erp_theme';

export const ERPProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [data, setData] = useState<ERPBootstrapPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [activeDept, setActiveDept] = useState<Department>('sales');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const toast = useCallback((type: ToastMessage['type'], title: string, description?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, title, description }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const getDefaultRoute = useCallback((u: AuthUser | null = user): string => {
    if (!u) return '/login';
    if (u.department === 'admin') return '/sales';
    if (u.department === 'sales') return '/sales';
    if (u.department === 'supply_chain') return '/supply-chain';
    if (u.department === 'production') return '/production';
    if (u.department === 'logistics') return '/logistics';
    return '/sales';
  }, [user]);

  const refresh = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      setData(null);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const payload = await erpApi.bootstrap();
      setData(payload);
      setUser(payload.currentUser);
      setActiveDept((prev) => {
        if (payload.currentUser.department !== 'admin') return payload.currentUser.department;
        return prev;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load ERP data';
      setError(message);
      if (!getAuthToken()) {
        setUser(null);
        setData(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const res = await erpApi.login(identifier, password);
      setAuthToken(res.token);
      setUser(res.user);
      setActiveDept(res.user.department === 'admin' ? 'sales' : res.user.department);
      setLoading(true);
      const payload = await erpApi.bootstrap();
      setData(payload);
      setUser(payload.currentUser);
      setLoading(false);
      toast('success', `Welcome back, ${res.user.name}`, `${res.user.roleName} workspace ready.`);
      return res.user;
    },
    [toast],
  );

  const logout = useCallback(() => {
    setAuthToken(null);
    setUser(null);
    setData(null);
    toast('info', 'Signed out', 'Your session has been ended.');
  }, [toast]);

  const can = useCallback(
    (module: PermissionModule, action: PermissionAction = 'view') => {
      if (!user) return false;
      const perms = user.permissions[module] || [];
      return perms.includes(action) || perms.includes('manage');
    },
    [user],
  );

  const value = useMemo<ERPContextValue>(
    () => ({
      user,
      data,
      loading,
      error,
      theme,
      toggleTheme,
      login,
      logout,
      refresh,
      can,
      getDefaultRoute,
      toasts,
      toast,
      dismissToast,
      activeDept,
      setActiveDept,
    }),
    [user, data, loading, error, theme, toggleTheme, login, logout, refresh, can, getDefaultRoute, toasts, toast, dismissToast, activeDept],
  );

  return <ERPContext.Provider value={value}>{children}</ERPContext.Provider>;
};

export function useERP(): ERPContextValue {
  const ctx = useContext(ERPContext);
  if (!ctx) throw new Error('useERP must be used inside ERPProvider');
  return ctx;
}
