import { RoleModel } from '../models';
import { departmentModules } from '../../../shared/types/departmentModules';
import type { RolePermissionMap } from '../../src/types/erp';

const technician: RolePermissionMap = {
  service_dashboard: ['view'],
  service_schedule: ['view'],
  service_jobs: ['view', 'edit', 'confirm'],
  service_parts: ['view', 'edit', 'create'],
  service_expenses: ['view', 'create'],
};
const manager = (department: string) =>
  Object.fromEntries(
    departmentModules.filter((m) => m.department === department).map((m) => [m.id, m.actions]),
  );
export async function registerDepartmentRoles() {
  const coordinator = {
    ...technician,
    service_assets: ['view'],
    service_requests: ['view', 'create', 'edit'],
    service_schedule: ['view', 'edit'],
    service_team: ['view'],
  };
  const defaults = [
    ['service', 'Service Manager', manager('service')],
    ['service', 'Service Coordinator', coordinator],
    ['service', 'Service Technician', technician],
    ['rnd', 'R&D Manager', manager('rnd')],
    ['rnd', 'R&D Engineer', { ...manager('rnd'), rnd_completion: ['view'] }],
  ] as const;
  for (const [department, name, permissions] of defaults) {
    const id = 'role-' + name.toLowerCase().replace('&', '').replaceAll(' ', '-');
    await RoleModel.updateOne(
      { id },
      { $setOnInsert: { id, name, department, permissions, description: name } },
      { upsert: true },
    );
  }
}
