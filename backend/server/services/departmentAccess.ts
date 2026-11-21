import { projectOps, serviceOps, type Workspace } from '../../../shared/departmentForms';
import type { AuthUser, PermissionAction } from '../../src/types/erp';
import { ServiceJob, ResearchProject, type WorkRecord } from '../models/department.model';
import { checkPermission } from '../utils/rbacLogic';
import { account, billing, ensure } from './departmentLogic';

export const modelFor = (dept: Workspace) => (dept === 'service' ? ServiceJob : ResearchProject);
export const opsFor = (dept: Workspace) => (dept === 'service' ? serviceOps : projectOps);
export const can = (u: AuthUser, module: string, action: PermissionAction = 'view') =>
  checkPermission(u.permissions, module, action);
export function scope(u: AuthUser, dept: Workspace) {
  return dept === 'service' && !can(u, 'service_team')
    ? { $or: [{ employeeId: u.id }, { employeeId: '', createdBy: u.id }] }
    : {};
}
export function viewRecord(u: AuthUser, dept: Workspace, r: WorkRecord) {
  const team = can(u, 'service_team');
  const expenses = can(u, 'service_expenses') || can(u, 'service_verification');
  const entries = r.entries.filter((e) => {
    const op = opsFor(dept)[e.action];
    if (dept === 'service' && op?.tab === 'Expenses') return expenses && (team || e.employeeId === u.id);
    return op && can(u, op.module);
  });
  const accounts =
    dept === 'service' && expenses
      ? [
          ...new Set([
            r.employeeId,
            ...entries.filter((e) => serviceOps[e.action]?.tab === 'Expenses').map((e) => e.employeeId),
          ]),
        ]
          .filter((id) => id && (team || id === u.id))
          .map((employeeId) => ({ employeeId, ...account(r.entries, employeeId) }))
      : [];
  return {
    id: r.id,
    name: r.name,
    docNo: r.docNo,
    status: r.status,
    revision: r.revision,
    employeeId: r.employeeId,
    assetId: r.assetId,
    details: (
      dept === 'service' ? can(u, 'service_jobs') || can(u, 'service_requests') : can(u, 'rnd_projects')
    )
      ? r.details
      : { priority: r.details.priority },
    entries,
    accounts,
    billing: dept === 'service' && can(u, 'service_billing') ? billing(r) : undefined,
  };
}
export async function attachmentAccess(
  u: AuthUser,
  module: string,
  recordId: string,
  mode: 'upload' | 'view' | 'delete',
) {
  if (!/^(service_|rnd_)/.test(module)) return;
  const dept = module.startsWith('rnd_') ? 'rnd' : 'service';
  const r = await modelFor(dept)
    .findOne({ id: recordId, ...scope(u, dept) })
    .lean();
  const creation = module === 'service_requests' && can(u, module, 'create');
  const permitted =
    mode === 'upload'
      ? creation ||
        Object.values(opsFor(dept)).some((op) => op.module === module && can(u, module, op.permission))
      : can(u, module);
  ensure(
    permitted && (r || (mode === 'upload' && creation && !(await ServiceJob.exists({ id: recordId })))),
    'FORBIDDEN: Attachment access denied.',
  );
  ensure(mode !== 'delete', 'FORBIDDEN: Attachments form part of the work history.');
}
