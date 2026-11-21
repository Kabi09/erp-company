export const departmentDemoAccounts = [
  {
    label: 'Service Technician',
    department: 'service',
    email: 'service.tech@cryoerp.com',
    employeeId: 'DEMO-SVC-TECH',
    roleId: 'role-service-technician',
    role: 'Assigned visits, work updates, parts and expenses',
  },
  {
    label: 'Service Manager',
    department: 'service',
    email: 'service.mgr@cryoerp.com',
    employeeId: 'DEMO-SVC-MGR',
    roleId: 'role-service-manager',
    role: 'Service requests, scheduling and expense verification',
  },
  {
    label: 'R&D Engineer',
    department: 'rnd',
    email: 'rnd.eng@cryoerp.com',
    employeeId: 'DEMO-RD-ENG',
    roleId: 'role-rd-engineer',
    role: 'Specifications, prototype materials and testing',
  },
  {
    label: 'R&D Manager',
    department: 'rnd',
    email: 'rnd.mgr@cryoerp.com',
    employeeId: 'DEMO-RD-MGR',
    roleId: 'role-rd-manager',
    role: 'Manage research projects and confirm completion',
  },
] as const;
