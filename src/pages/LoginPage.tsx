import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Moon, Snowflake, Sun } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { Button, ErrorBanner, Field, Input } from '../components/ui';

const DEMO_ACCOUNTS = [
  { label: 'Super Admin', dept: 'All Departments', email: 'admin@cryoerp.com', role: 'Full access & Administration' },
  { label: 'Sales Manager', dept: 'Sales', email: 'sales.mgr@cryoerp.com', role: 'Approve quotes, verify payments, confirm SO' },
  { label: 'Sales Executive', dept: 'Sales', email: 'sales.exec@cryoerp.com', role: 'Enquiries, follow-ups, draft quotes' },
  { label: 'Supply Chain Manager', dept: 'Supply Chain', email: 'sc.mgr@cryoerp.com', role: 'Stock, issues, supplier POs, GRN & QC' },
  { label: 'Production Manager', dept: 'Production', email: 'prod.mgr@cryoerp.com', role: 'Orders, BOM, daily updates, QC & rework' },
  { label: 'Logistics Manager', dept: 'Logistics', email: 'log.mgr@cryoerp.com', role: 'Delivery orders, dispatch & POD' },
];

export const LoginPage: React.FC = () => {
  const { login, getDefaultRoute, theme, toggleTheme } = useERP();
  const navigate = useNavigate();

  const [identifier, setIdentifier] = useState('admin@cryoerp.com');
  const [password, setPassword] = useState('cryo123');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const loggedIn = await login(identifier, password);
      navigate(getDefaultRoute(loggedIn), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <div className="h-14 px-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-slate-900 dark:bg-teal-600 text-white flex items-center justify-center">
            <Snowflake className="w-4 h-4" />
          </div>
          <span className="font-semibold text-sm tracking-tight text-slate-900 dark:text-slate-100">
            CRYO Enterprise ERP 2.0
          </span>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="p-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          {/* Login Form */}
          <div className="lg:col-span-3 p-6 sm:p-8">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Sign in to CRYO ERP
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Enter your employee email or Employee ID to open your department workspace.
            </p>

            {error && (
              <div className="mt-4">
                <ErrorBanner message={error} />
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <Field label="Email or Employee ID" required htmlFor="login-identifier">
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    id="login-identifier"
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="name@cryoerp.com or EMP-001"
                    className="pl-9"
                  />
                </div>
              </Field>

              <Field label="Password" required htmlFor="login-password">
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    id="login-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="pl-9"
                  />
                </div>
              </Field>

              <Button type="submit" size="lg" loading={submitting} className="w-full mt-2">
                Sign In to Workspace
              </Button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              Connected departments: Sales Management · Supply Chain · Production & QC · Logistics & Delivery
            </div>
          </div>

          {/* Demo Workspace Selector */}
          <div className="lg:col-span-2 bg-slate-50 dark:bg-slate-950/60 p-6 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Demo Environment Accounts
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Click any role below to fill credentials (password: <span className="font-mono">cryo123</span>).
            </p>
            <div className="mt-4 space-y-2">
              {DEMO_ACCOUNTS.map((acc) => {
                const selected = identifier.toLowerCase() === acc.email;
                return (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => {
                      setIdentifier(acc.email);
                      setPassword('cryo123');
                      setError(null);
                    }}
                    className={`w-full text-left p-2.5 rounded-md border transition-colors cursor-pointer ${
                      selected
                        ? 'bg-white dark:bg-slate-900 border-teal-600'
                        : 'bg-white/60 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{acc.label}</span>
                      <span className="text-[11px] text-slate-500">{acc.dept}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{acc.role}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
