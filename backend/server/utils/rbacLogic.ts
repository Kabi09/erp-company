import type {
  ApprovalRequest,
  ApprovalWorkflow,
  EmployeePermissionOverrides,
  PermissionAction,
  RolePermissionMap,
} from '../../src/types/erp';
import { ERP_MODULE_CATALOG } from '../../src/types/erp';

/**
 * Computes the effective permissions for an employee given their base Role permissions
 * and any individual employee-level overrides ('allow' | 'deny').
 */
export function resolveEffectivePermissions(
  rolePermissions: RolePermissionMap,
  overrides?: EmployeePermissionOverrides,
): Record<string, PermissionAction[]> {
  const result: Record<string, PermissionAction[]> = {};

  const moduleToDept: Record<string, string> = {};
  for (const mod of ERP_MODULE_CATALOG) {
    moduleToDept[mod.id] = mod.department;
  }

  const coarseModules = ['sales', 'supply_chain', 'production', 'logistics', 'admin', 'tracking', 'reports'];
  for (const c of coarseModules) {
    moduleToDept[c] = c;
  }

  const isSuperAdmin = Boolean(
    rolePermissions?.['admin']?.includes('manage') ||
    rolePermissions?.['all']?.includes('manage'),
  );

  const allModuleIds = new Set<string>([
    ...coarseModules,
    ...ERP_MODULE_CATALOG.map((m) => m.id),
    ...Object.keys(rolePermissions || {}),
    ...Object.keys(overrides || {}),
  ]);

  for (const modId of allModuleIds) {
    const parentDept = moduleToDept[modId] || modId;
    const allowedActions = new Set<PermissionAction>();

    if (isSuperAdmin) {
      const catalogEntry = ERP_MODULE_CATALOG.find((m) => m.id === modId);
      const possibleActions: PermissionAction[] = catalogEntry
        ? catalogEntry.actions
        : ['view', 'create', 'edit', 'delete', 'submit', 'approve', 'verify', 'confirm', 'export', 'manage'];
      for (const a of possibleActions) allowedActions.add(a);
      allowedActions.add('manage');
    } else {
      const specificRoleActions = rolePermissions?.[modId] || [];
      const parentRoleActions = rolePermissions?.[parentDept] || [];
      for (const a of specificRoleActions) allowedActions.add(a);
      for (const a of parentRoleActions) allowedActions.add(a);
    }

    // Apply department-level overrides first if modId is a sub-module
    if (parentDept !== modId && overrides?.[parentDept]) {
      for (const [actionKey, effect] of Object.entries(overrides[parentDept])) {
        const act = actionKey as PermissionAction;
        if (effect === 'allow') {
          allowedActions.add(act);
        } else if (effect === 'deny') {
          allowedActions.delete(act);
        }
      }
    }

    // Apply specific module-level overrides (highest precedence)
    const modOverrides = overrides?.[modId] || {};
    for (const [actionKey, effect] of Object.entries(modOverrides)) {
      const act = actionKey as PermissionAction;
      if (effect === 'allow') {
        allowedActions.add(act);
      } else if (effect === 'deny') {
        allowedActions.delete(act);
      }
    }

    result[modId] = Array.from(allowedActions);
  }

  // Ensure coarse module keys have at least their role permissions
  for (const c of coarseModules) {
    const set = new Set<PermissionAction>(result[c] || []);
    if (rolePermissions?.[c]) {
      for (const a of rolePermissions[c]) set.add(a);
    }
    // Also apply coarse module overrides
    if (overrides?.[c]) {
      for (const [act, effect] of Object.entries(overrides[c])) {
        if (effect === 'allow') set.add(act as PermissionAction);
        if (effect === 'deny') set.delete(act as PermissionAction);
      }
    }
    result[c] = Array.from(set);
  }

  return result;
}

/**
 * Checks whether an effective permission set allows a given module and action.
 */
export function checkPermission(
  effectivePerms: Record<string, PermissionAction[]> | undefined,
  module: string,
  action: PermissionAction = 'view',
): boolean {
  if (!effectivePerms) return false;
  if (effectivePerms.admin?.includes('manage')) return true;

  const modPerms = effectivePerms[module] || [];
  if (modPerms.includes(action) || modPerms.includes('manage')) return true;

  const catalogEntry = ERP_MODULE_CATALOG.find((m) => m.id === module);
  if (catalogEntry && catalogEntry.department !== 'shared' && catalogEntry.department !== 'admin') {
    const parentPerms = effectivePerms[catalogEntry.department] || [];
    if (parentPerms.includes(action) || parentPerms.includes('manage')) return true;
  }

  return false;
}

/**
 * Checks if a user is eligible to act as an approver for a specific level of a workflow.
 */
export function isUserEligibleForLevel(
  workflow: ApprovalWorkflow,
  levelNumber: number,
  user: { id: string; roleId: string },
): boolean {
  if (user.roleId === 'role-super-admin') return true;
  const level = workflow.approvalLevels.find((l) => l.levelNumber === levelNumber);
  if (!level) return false;

  const roleMatch = level.eligibleRoleIds.includes(user.roleId);
  const employeeMatch = level.eligibleEmployeeIds.includes(user.id);

  if (level.approverType === 'role') return roleMatch;
  if (level.approverType === 'employee') return employeeMatch;
  return roleMatch || employeeMatch;
}

/**
 * Checks if a user can approve/reject a pending approval request.
 */
export function canUserDecideRequest(
  request: ApprovalRequest,
  workflow: ApprovalWorkflow | undefined,
  user: { id: string; roleId: string },
): { canDecide: boolean; reason?: string } {
  if (request.status !== 'pending') {
    return { canDecide: false, reason: `Request is not pending (Current status: ${request.status}).` };
  }

  // Self-approval check
  if (workflow && !workflow.allowSelfApproval && request.submittedBy.id === user.id) {
    return { canDecide: false, reason: 'Self-approval is disabled for this workflow. Submitter cannot approve.' };
  }

  if (!workflow) {
    if (user.roleId === 'role-super-admin') return { canDecide: true };
    return { canDecide: false, reason: 'Approval workflow configuration not found.' };
  }

  const isEligible = isUserEligibleForLevel(workflow, request.currentLevel, user);
  if (!isEligible) {
    return { canDecide: false, reason: `You are not an authorized approver for Level ${request.currentLevel}.` };
  }

  return { canDecide: true };
}
