import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, Shield, User } from 'lucide-react';
import { useERP } from '../../context/ERPContext';
import { erpApi } from '../../services/api';
import { Button, Field, Input, PageHeader, StatusBadge } from '../../components/ui';
import { formatDateTime } from '../../utils/erpLogic';
import type { PermissionModule } from '../../types/erp';

export const NotificationsPage: React.FC = () => {
  const { data: db, user, refresh, toast } = useERP();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [markingAll, setMarkingAll] = useState(false);

  if (!db || !user) return null;

  const visible = useMemo(() => {
    return db.notifications.filter((n) => {
      const deptMatch =
        user.department === 'admin' || n.department === 'all' || n.department === user.department;
      if (!deptMatch) return false;
      if (filter === 'unread' && n.readBy.includes(user.id)) return false;
      return true;
    });
  }, [db.notifications, user, filter]);

  const unreadCount = visible.filter((n) => !n.readBy.includes(user.id)).length;

  const markRead = async (id: string) => {
    try {
      await erpApi.markNotificationRead(id);
      await refresh();
    } catch (err) {
      toast('error', 'Action failed', (err as Error).message);
    }
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await erpApi.markAllNotificationsRead();
      await refresh();
      toast('success', 'All notifications marked read');
    } catch (err) {
      toast('error', 'Action failed', (err as Error).message);
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        subtitle="Cross-department handoffs, approvals, low-stock alerts, and delivery milestones."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md">
              {(['all', 'unread'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 text-xs font-medium rounded cursor-pointer ${
                    filter === f
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {f === 'all' ? 'All' : `Unread (${unreadCount})`}
                </button>
              ))}
            </div>
            <Button variant="secondary" size="sm" loading={markingAll} disabled={unreadCount === 0} onClick={markAll}>
              <CheckCheck className="w-4 h-4" /> Mark All Read
            </Button>
          </div>
        }
      />

      {visible.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-10 text-center">
          <Bell className="w-6 h-6 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">No notifications</p>
          <p className="text-xs text-slate-500 mt-1">You are all caught up on cross-department activity.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800">
          {visible.map((n) => {
            const isRead = n.readBy.includes(user.id);
            return (
              <div
                key={n.id}
                className={`p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                  !isRead ? 'bg-teal-50/40 dark:bg-teal-950/20' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{n.title}</span>
                    <StatusBadge
                      status={
                        n.severity === 'error'
                          ? 'Urgent'
                          : n.severity === 'warning'
                            ? 'Pending'
                            : n.severity === 'success'
                              ? 'Completed'
                              : 'New'
                      }
                    />
                    <span className="text-[11px] uppercase tracking-wider text-slate-500">{n.department.replace('_', ' ')}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{n.message}</p>
                  <div className="text-[11px] font-mono text-slate-500 mt-1.5">{formatDateTime(n.createdAt)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {n.link && (
                    <Link to={n.link} onClick={() => !isRead && markRead(n.id)}>
                      <Button variant="secondary" size="sm">
                        Open
                      </Button>
                    </Link>
                  )}
                  {!isRead && (
                    <Button variant="ghost" size="sm" onClick={() => markRead(n.id)}>
                      Mark Read
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const ProfilePage: React.FC = () => {
  const { user, refresh, toast } = useERP();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (newPassword && newPassword.trim().length < 8) {
        throw new Error('New password must be at least 8 characters long.');
      }
      if (newPassword && !currentPassword) {
        throw new Error('Current password is required to change password.');
      }
      await erpApi.updateProfile({
        name: name.trim(),
        phone: phone.trim(),
        currentPassword: currentPassword || undefined,
        newPassword: newPassword.trim() || undefined,
      });
      await refresh();
      setCurrentPassword('');
      setNewPassword('');
      toast('success', 'Profile updated successfully');
    } catch (err) {
      toast('error', 'Update failed', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const modules: PermissionModule[] = [
    'sales',
    'supply_chain',
    'production',
    'logistics',
    'service',
    'rd',
    'tracking',
    'reports',
    'admin',
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="My Profile & Permissions"
        subtitle="Manage your account details and review your assigned RBAC access."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <form
          onSubmit={handleSave}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4"
        >
          <div className="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="w-10 h-10 rounded-full bg-teal-700 text-white flex items-center justify-center font-semibold text-sm">
              {user.name
                .split(' ')
                .map((p) => p[0])
                .join('')
                .slice(0, 2)}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{user.name}</div>
              <div className="text-xs text-slate-500">
                {user.employeeId} · {user.roleName} · {user.designation}
              </div>
            </div>
          </div>

          <Field label="Full Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Work Email">
            <Input value={user.email} disabled />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="New Password (optional)" hint="Minimum 8 characters. Leave blank to keep current password.">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          {newPassword.length > 0 && (
            <Field label="Current Password" required hint="Verify your current identity to confirm password change.">
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                required
              />
            </Field>
          )}
          <div className="pt-2 flex justify-end">
            <Button type="submit" loading={saving}>
              <User className="w-4 h-4" /> Save Changes
            </Button>
          </div>
        </form>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
            <Shield className="w-4 h-4 text-teal-600" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Assigned Role Permissions</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {modules.map((mod) => {
              const actions = user.permissions[mod] || [];
              return (
                <div key={mod} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    {mod.replace('_', ' ')}
                  </span>
                  <div className="flex items-center gap-1 flex-wrap justify-end">
                    {actions.length === 0 ? (
                      <span className="text-slate-400">No access</span>
                    ) : (
                      actions.map((a) => (
                        <span
                          key={a}
                          className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[11px]"
                        >
                          {a}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
