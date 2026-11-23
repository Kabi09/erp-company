import bcrypt from 'bcryptjs';
import {
  CustomerModel,
  DeliveredProductModel,
  DeliveryOrderModel,
  EmployeeModel,
  ProductModel,
  ProductionOrderModel,
  RDProjectModel,
  RDSpecificationModel,
  RoleModel,
  SalesOrderModel,
  ServiceJobModel,
  ServiceRequestModel,
} from '../models';
import { generateId } from '../utils/routeUtils';

const DEFAULT_HASH = bcrypt.hashSync('cryo123', 8);

const ALL_ACTIONS = [
  'view',
  'create',
  'edit',
  'delete',
  'submit',
  'approve',
  'verify',
  'confirm',
  'export',
  'manage',
] as const;

export async function ensureServiceAndRDRolesAndData(): Promise<void> {
  try {
    // 0. Normalize legacy department keys in MongoDB
    await RoleModel.updateMany({ department: 'rnd' }, { $set: { department: 'rd' } });
    await EmployeeModel.updateMany({ department: 'rnd' }, { $set: { department: 'rd' } });

    // 1. Ensure Super Admin role includes service and rd actions
    const superAdminRole = await RoleModel.findOne({ id: 'role-super-admin' });
    if (superAdminRole) {
      superAdminRole.permissions.service = [...ALL_ACTIONS];
      superAdminRole.permissions.rd = [...ALL_ACTIONS];
      superAdminRole.markModified('permissions');
      await superAdminRole.save();
    }

    // 2. Ensure Service Roles
    const serviceRoles = [
      {
        id: 'role-service-manager',
        name: 'Service Manager',
        department: 'service' as const,
        description: 'Complete oversight of field service, job triage, technician dispatch, warranty decisions, and expense approval.',
        permissions: {
          service: ['view', 'create', 'edit', 'delete', 'submit', 'approve', 'confirm', 'export', 'manage'],
          service_dashboard: ['view', 'export'],
          delivered_products: ['view', 'create', 'edit', 'delete', 'export'],
          service_requests: ['view', 'create', 'edit', 'delete', 'submit', 'approve', 'confirm', 'export'],
          service_jobs: ['view', 'create', 'edit', 'delete', 'submit', 'approve', 'confirm', 'export'],
          service_schedule: ['view', 'create', 'edit', 'export'],
          service_materials: ['view', 'create', 'edit', 'submit', 'confirm', 'export'],
          service_expenses: ['view', 'create', 'edit', 'verify', 'confirm', 'export'],
          service_billing: ['view', 'create', 'edit', 'confirm', 'export'],
          completed_services: ['view', 'export'],
          service_reports: ['view', 'export'],
          tracking: ['view'],
          reports: ['view', 'export'],
        },
      },
      {
        id: 'role-service-coord',
        name: 'Service Coordinator',
        department: 'service' as const,
        description: 'Customer ticket intake, scheduling, technician calendar management, and spare parts coordination.',
        permissions: {
          service: ['view', 'create', 'edit', 'submit', 'export'],
          service_dashboard: ['view'],
          delivered_products: ['view', 'export'],
          service_requests: ['view', 'create', 'edit', 'submit', 'export'],
          service_jobs: ['view', 'create', 'edit', 'export'],
          service_schedule: ['view', 'create', 'edit', 'export'],
          service_materials: ['view', 'create', 'submit', 'export'],
          service_expenses: ['view', 'create', 'export'],
          service_billing: ['view', 'create', 'export'],
          completed_services: ['view'],
          service_reports: ['view'],
          tracking: ['view'],
          reports: ['view'],
        },
      },
      {
        id: 'role-service-tech',
        name: 'Service Technician',
        department: 'service' as const,
        description: 'Field engineer responsible for site visits, check-in/out, repair work updates, and expense submission.',
        permissions: {
          service: ['view', 'create', 'edit'],
          service_dashboard: ['view'],
          delivered_products: ['view'],
          service_requests: ['view'],
          service_jobs: ['view', 'create', 'edit'],
          service_schedule: ['view'],
          service_materials: ['view', 'create'],
          service_expenses: ['view', 'create'],
          service_billing: ['view'],
          tracking: ['view'],
        },
      },
    ];

    const resolvedRoleIds: Record<string, string> = {};

    for (const r of serviceRoles) {
      let roleDoc = await RoleModel.findOne({ $or: [{ id: r.id }, { name: r.name }] });
      if (!roleDoc) {
        roleDoc = await RoleModel.create(r);
      } else {
        roleDoc.department = 'service';
        const merged: Record<string, any> = { ...roleDoc.permissions };
        for (const [mod, acts] of Object.entries(r.permissions)) {
          if (!merged[mod]) {
            merged[mod] = acts;
          } else {
            merged[mod] = Array.from(new Set([...merged[mod], ...acts]));
          }
        }
        roleDoc.permissions = merged;
        roleDoc.markModified('permissions');
        await roleDoc.save();
      }
      resolvedRoleIds[r.id] = roleDoc.id;
    }

    // Also update any legacy role IDs if present
    await RoleModel.updateOne(
      { id: 'role-service-coordinator' },
      {
        $set: {
          department: 'service',
          'permissions.service': ['view', 'create', 'edit', 'submit', 'export'],
          'permissions.service_dashboard': ['view'],
          'permissions.delivered_products': ['view', 'export'],
          'permissions.service_requests': ['view', 'create', 'edit', 'submit', 'export'],
          'permissions.service_jobs': ['view', 'create', 'edit', 'export'],
          'permissions.service_schedule': ['view', 'create', 'edit'],
          'permissions.service_materials': ['view', 'create', 'edit', 'submit', 'export'],
          'permissions.service_expenses': ['view', 'create', 'export'],
          'permissions.service_billing': ['view', 'create', 'export'],
        },
      },
    );
    await RoleModel.updateOne(
      { id: 'role-service-technician' },
      {
        $set: {
          department: 'service',
          'permissions.service': ['view', 'create', 'edit'],
          'permissions.service_dashboard': ['view'],
          'permissions.delivered_products': ['view'],
          'permissions.service_requests': ['view'],
          'permissions.service_jobs': ['view', 'create', 'edit'],
          'permissions.service_schedule': ['view'],
          'permissions.service_materials': ['view', 'create'],
          'permissions.service_expenses': ['view', 'create'],
          'permissions.service_billing': ['view'],
        },
      },
    );

    // 3. Ensure R&D Roles
    const rdRoles = [
      {
        id: 'role-rd-manager',
        name: 'R&D Manager',
        department: 'rd' as const,
        description: 'Oversight of innovation initiatives, prototype projects, budget approvals, and test validation.',
        permissions: {
          rd: ['view', 'create', 'edit', 'delete', 'submit', 'approve', 'confirm', 'export', 'manage'],
          rd_dashboard: ['view', 'export'],
          rd_projects: ['view', 'create', 'edit', 'delete', 'submit', 'approve', 'confirm', 'export'],
          rd_specifications: ['view', 'create', 'edit', 'delete', 'export'],
          rd_bom: ['view', 'create', 'edit', 'delete', 'submit', 'export'],
          rd_work_updates: ['view', 'create', 'edit', 'export'],
          rd_testing: ['view', 'create', 'edit', 'verify', 'confirm', 'export'],
          completed_rd_projects: ['view', 'export'],
          rd_reports: ['view', 'export'],
          tracking: ['view'],
          reports: ['view', 'export'],
        },
      },
      {
        id: 'role-rd-engineer',
        name: 'R&D Engineer',
        department: 'rd' as const,
        description: 'Design, component selection, prototype fabrication logging, and technical specification drafting.',
        permissions: {
          rd: ['view', 'create', 'edit', 'submit', 'export'],
          rd_dashboard: ['view'],
          rd_projects: ['view', 'edit', 'export'],
          rd_specifications: ['view', 'create', 'edit', 'export'],
          rd_bom: ['view', 'create', 'edit', 'submit', 'export'],
          rd_work_updates: ['view', 'create', 'edit', 'export'],
          rd_testing: ['view', 'create', 'edit', 'export'],
          completed_rd_projects: ['view'],
          rd_reports: ['view'],
          tracking: ['view'],
          reports: ['view'],
        },
      },
      {
        id: 'role-rd-tester',
        name: 'R&D Tester',
        department: 'rd' as const,
        description: 'Prototype test execution, dynamic checklist scoring, retesting verification, and test report generation.',
        permissions: {
          rd: ['view', 'create', 'edit'],
          rd_dashboard: ['view'],
          rd_projects: ['view'],
          rd_specifications: ['view'],
          rd_bom: ['view'],
          rd_work_updates: ['view', 'create'],
          rd_testing: ['view', 'create', 'edit', 'verify'],
          completed_rd_projects: ['view'],
          tracking: ['view'],
        },
      },
    ];

    for (const r of rdRoles) {
      let roleDoc = await RoleModel.findOne({ $or: [{ id: r.id }, { name: r.name }] });
      if (!roleDoc) {
        roleDoc = await RoleModel.create(r);
      } else {
        roleDoc.department = 'rd';
        const merged: Record<string, any> = { ...roleDoc.permissions };
        for (const [mod, acts] of Object.entries(r.permissions)) {
          if (!merged[mod]) {
            merged[mod] = acts;
          } else {
            merged[mod] = Array.from(new Set([...merged[mod], ...acts]));
          }
        }
        roleDoc.permissions = merged;
        roleDoc.markModified('permissions');
        await roleDoc.save();
      }
      resolvedRoleIds[r.id] = roleDoc.id;
    }

    // 4. Ensure Service and R&D Employees
    const defaultEmployees = [
      {
        id: 'emp-8',
        employeeId: 'EMP-008',
        name: 'Rajesh Kumar',
        email: 'service.mgr@cryoerp.com',
        phone: '+91 98450 11008',
        department: 'service' as const,
        roleId: 'role-service-manager',
        designation: 'Service Operations Manager',
        status: 'Active' as const,
        passwordHash: DEFAULT_HASH,
        createdAt: '2026-02-01T09:00:00Z',
      },
      {
        id: 'emp-9',
        employeeId: 'EMP-009',
        name: 'Anil Sharma',
        email: 'tech.anil@cryoerp.com',
        phone: '+91 98450 11009',
        department: 'service' as const,
        roleId: 'role-service-tech',
        designation: 'Senior Field Service Engineer',
        status: 'Active' as const,
        passwordHash: DEFAULT_HASH,
        createdAt: '2026-02-05T09:00:00Z',
      },
      {
        id: 'emp-10',
        employeeId: 'EMP-010',
        name: 'Dr. Sunita Rao',
        email: 'rd.mgr@cryoerp.com',
        phone: '+91 98450 11010',
        department: 'rd' as const,
        roleId: 'role-rd-manager',
        designation: 'Head of Cryogenic R&D',
        status: 'Active' as const,
        passwordHash: DEFAULT_HASH,
        createdAt: '2026-02-10T09:00:00Z',
      },
      {
        id: 'emp-11',
        employeeId: 'EMP-011',
        name: 'Karthik Raman',
        email: 'rd.eng@cryoerp.com',
        phone: '+91 98450 11011',
        department: 'rd' as const,
        roleId: 'role-rd-engineer',
        designation: 'Senior Prototype Engineer',
        status: 'Active' as const,
        passwordHash: DEFAULT_HASH,
        createdAt: '2026-02-15T09:00:00Z',
      },
    ];

    for (const emp of defaultEmployees) {
      const targetRoleId = resolvedRoleIds[emp.roleId] || emp.roleId;
      const exists = await EmployeeModel.findOne({ $or: [{ id: emp.id }, { email: emp.email }, { employeeId: emp.employeeId }] });
      if (!exists) {
        await EmployeeModel.create({ ...emp, roleId: targetRoleId });
      } else {
        let changed = false;
        const assignedRole = await RoleModel.findOne({ id: exists.roleId }).lean();
        if (!assignedRole) {
          exists.roleId = targetRoleId;
          changed = true;
        }
        if (!exists.passwordHash) {
          exists.passwordHash = DEFAULT_HASH;
          changed = true;
        }
        if (exists.status !== 'Active') {
          exists.status = 'Active';
          changed = true;
        }
        if (changed) {
          await exists.save();
        }
      }
    }

    // 5. Synchronize Delivered Products from completed deliveries
    await syncDeliveredProducts();

    // 6. Ensure sample Service Request & R&D Project if none exist
    const srvCount = await ServiceRequestModel.countDocuments();
    if (srvCount === 0) {
      await seedSampleServiceRecords();
    }

    const rdCount = await RDProjectModel.countDocuments();
    if (rdCount === 0) {
      await seedSampleRDRecords();
    }
  } catch (err) {
    console.warn('[SeedService] Notice during ensureServiceAndRDRolesAndData:', err);
  }
}

export async function syncDeliveredProducts(): Promise<number> {
  let count = 0;
  const completedDeliveries = await DeliveryOrderModel.find({
    status: { $in: ['Delivered', 'Partially Delivered'] },
  }).lean();

  for (const del of completedDeliveries) {
    const existing = await DeliveredProductModel.findOne({ deliveryOrderId: del.id });
    if (!existing) {
      const prodOrder = del.productionOrderId
        ? await ProductionOrderModel.findOne({ id: del.productionOrderId }).lean()
        : await ProductionOrderModel.findOne({ salesOrderId: del.salesOrderId }).lean();
      const product = prodOrder?.productId
        ? await ProductModel.findOne({ id: prodOrder.productId }).lean()
        : await ProductModel.findOne({ name: del.productName }).lean();
      const customer = await CustomerModel.findOne({ id: del.customerId }).lean();

      const rawSerials =
        del.serialNumbers && del.serialNumbers.length > 0
          ? del.serialNumbers
          : prodOrder?.serialNumbers && prodOrder.serialNumbers.length > 0
            ? prodOrder.serialNumbers
            : [];
      const deliveredCount = Math.max(1, del.deliveredQty || del.quantity || 1);
      const modelCode = (product as any)?.model || product?.code || 'EQ';
      const serials: string[] = [...rawSerials.slice(0, deliveredCount).filter(Boolean)];
      for (let idx = serials.length; idx < deliveredCount; idx++) {
        serials.push(`CRYO-${modelCode}-${del.docNo}-${String(idx + 1).padStart(2, '0')}`);
      }

      for (const sn of serials) {
        const already = await DeliveredProductModel.findOne({ serialNumber: sn });
        if (!already) {
          const deliveredDate =
            del.actualDeliveryDate || del.actualDispatchDate || new Date().toISOString().split('T')[0];
          const start = new Date(deliveredDate);
          const end = new Date(start);
          end.setFullYear(end.getFullYear() + 2); // 24 months standard warranty
          const isUnder = new Date() <= end;

          await DeliveredProductModel.create({
            id: generateId('DP'),
            serialNumber: sn,
            productId: product?.id || prodOrder?.productId || 'prod-delivered',
            productName: product?.name || del.productName || prodOrder?.productName || 'Ultra-Low Temperature Freezer -86°C',
            modelNumber: (product as any)?.model || product?.code || 'ULT-86-400',
            customerId: customer?.id || del.customerId,
            customerName: customer?.name || del.customerName,
            customerContact: customer?.contactPerson || '',
            customerPhone: customer?.phone || '',
            customerEmail: customer?.email || '',
            deliveryAddress: del.deliveryAddress || customer?.shippingAddress || customer?.billingAddress || 'Customer Delivery Site',
            salesOrderId: del.salesOrderId,
            salesOrderDocNo: del.salesOrderDocNo,
            productionOrderId: prodOrder?.id,
            productionOrderDocNo: prodOrder?.docNo,
            deliveryOrderId: del.id,
            deliveryOrderDocNo: del.docNo,
            deliveredDate,
            warrantyPeriodMonths: 24,
            warrantyStartDate: deliveredDate,
            warrantyEndDate: end.toISOString().split('T')[0],
            warrantyStatus: isUnder ? 'Under Warranty' : 'Expired',
            status: 'Active',
            notes: `Delivered under Challan ${del.docNo}`,
          });
          count++;
        }
      }
    }
  }

  // If no completed delivery orders exist in current test/dev DB, create at least 2 baseline delivered products
  const totalDelivered = await DeliveredProductModel.countDocuments();
  if (totalDelivered === 0) {
    const cust = await CustomerModel.findOne().lean();
    const prod = await ProductModel.findOne().lean();

    const today = new Date();
    const pastDate = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const expiryDate = new Date(today.getTime() + 640 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const pastExpiredDate = new Date(today.getTime() - 800 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const pastExpiredEndDate = new Date(today.getTime() - 70 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    await DeliveredProductModel.create([
      {
        id: 'dp-1',
        serialNumber: 'CRYO-ULT-2025-001',
        productId: prod?.id || 'prod-1',
        productName: prod?.name || 'Ultra-Low Temperature Freezer -86°C (400L)',
        modelNumber: prod?.model || 'ULT-86-400',
        customerId: cust?.id || 'cust-1',
        customerName: cust?.name || 'Biogenix Diagnostics Pvt. Ltd.',
        customerContact: cust?.contactPerson || 'Dr. Meera Deshmukh',
        customerPhone: cust?.phone || '+91 98201 44510',
        customerEmail: cust?.email || 'm.deshmukh@biogenix.in',
        deliveryAddress: cust?.shippingAddress || 'Andheri East, Mumbai, Maharashtra 400069',
        deliveredDate: pastDate,
        warrantyPeriodMonths: 24,
        warrantyStartDate: pastDate,
        warrantyEndDate: expiryDate,
        warrantyStatus: 'Under Warranty',
        status: 'Active',
        notes: 'Installed and commissioned at Central Lab Unit 3.',
      },
      {
        id: 'dp-2',
        serialNumber: 'CRYO-BLD-2023-014',
        productId: prod?.id || 'prod-2',
        productName: 'Blood Bank Refrigerator +4°C (300L)',
        modelNumber: 'BBR-04-300',
        customerId: cust?.id || 'cust-1',
        customerName: cust?.name || 'Biogenix Diagnostics Pvt. Ltd.',
        customerContact: cust?.contactPerson || 'Dr. Meera Deshmukh',
        customerPhone: cust?.phone || '+91 98201 44510',
        customerEmail: cust?.email || 'm.deshmukh@biogenix.in',
        deliveryAddress: cust?.shippingAddress || 'Andheri East, Mumbai, Maharashtra 400069',
        deliveredDate: pastExpiredDate,
        warrantyPeriodMonths: 24,
        warrantyStartDate: pastExpiredDate,
        warrantyEndDate: pastExpiredEndDate,
        warrantyStatus: 'Expired',
        status: 'Active',
        notes: 'Legacy equipment installed in 2023. Warranty expired.',
      },
    ]);
    count += 2;
  }

  return count;
}

async function seedSampleServiceRecords(): Promise<void> {
  const dp = await DeliveredProductModel.findOne({ status: 'Active' }).lean();
  if (!dp) return;

  const srv = await ServiceRequestModel.create({
    id: 'srv-1',
    docNo: 'SRV-0001',
    requestDate: new Date().toISOString().split('T')[0],
    customerId: dp.customerId,
    customerName: dp.customerName,
    contactPerson: dp.customerContact,
    contactPhone: dp.customerPhone,
    contactEmail: dp.customerEmail,
    serviceAddress: dp.deliveryAddress,
    deliveredProductId: dp.id,
    serialNumber: dp.serialNumber,
    productName: dp.productName,
    modelNumber: dp.modelNumber,
    serviceType: 'Customer Site',
    priority: 'High',
    issueDescription: 'Cabinet temperature fluctuating above -70°C threshold. Alarm sounding intermittently.',
    isUnderWarranty: dp.warrantyStatus === 'Under Warranty',
    warrantyClaimValid: true,
    warrantyRemarks: 'Valid under 24-month comprehensive manufacturer warranty.',
    status: 'In Progress',
    assignedJobId: 'job-1',
    assignedTechnicianId: 'emp-9',
    assignedTechnicianName: 'Anil Sharma',
    scheduledDate: new Date().toISOString().split('T')[0],
    createdBy: 'Rajesh Kumar',
  });

  await ServiceJobModel.create({
    id: 'job-1',
    docNo: 'JOB-0001',
    serviceRequestId: srv.id,
    serviceRequestDocNo: srv.docNo,
    customerId: dp.customerId,
    customerName: dp.customerName,
    deliveredProductId: dp.id,
    serialNumber: dp.serialNumber,
    productName: dp.productName,
    serviceType: 'Customer Site',
    priority: 'High',
    assignedTechnicianId: 'emp-9',
    assignedTechnicianName: 'Anil Sharma',
    scheduledDate: srv.scheduledDate!,
    status: 'In Progress',
    checkIn: {
      timestamp: new Date().toISOString(),
      performedBy: 'Anil Sharma',
      location: 'Biogenix Diagnostics Lab 3',
      notes: 'Reached customer site on time. Commenced temperature sensor resistance diagnostic.',
    },
    diagnosisSummary: 'Secondary stage thermal expansion valve sensor drifting under high ambient heat.',
    rootCause: 'Dust clogging on auxiliary condenser coil causing heat rejection bottleneck.',
    correctiveAction: 'Cleaned auxiliary condenser, recalibrated PT100 probe, and tested pull-down cycle.',
    isChargeable: false,
    totalHoursSpent: 3.5,
  });
}

async function seedSampleRDRecords(): Promise<void> {
  const proj = await RDProjectModel.create({
    id: 'rnd-1',
    projectCode: 'RND-0001',
    title: 'Ultra-Fast Cryo Cascade Refrigeration Engine (-150°C)',
    objective: 'Develop next-generation dual-stage mixed-refrigerant cryogenic cooling system for bio-repository preservation.',
    projectType: 'New Product Development',
    leadEngineerId: 'emp-10',
    leadEngineerName: 'Dr. Sunita Rao',
    teamMembers: [
      { id: 'emp-10', name: 'Dr. Sunita Rao', role: 'Principal Investigator' },
      { id: 'emp-11', name: 'Karthik Raman', role: 'Lead Mechanical & Thermal Engineer' },
    ],
    targetCompletionDate: '2026-08-30',
    budgetEstimated: 850000,
    budgetUtilized: 185000,
    status: 'Prototyping',
    currentStage: 'Secondary Stage Brazing & Leak Testing',
  });

  await RDSpecificationModel.create({
    id: 'spec-1',
    rdProjectId: proj.id,
    version: '1.0',
    parameters: [
      { id: 'p1', category: 'Thermal', parameterName: 'Ultimate Low Temperature', targetValue: '-150', tolerance: '±2', unit: '°C', notes: 'Measured at evaporator core' },
      { id: 'p2', category: 'Thermal', parameterName: 'Pull-down Time from +25°C to -150°C', targetValue: '180', tolerance: '<= 210', unit: 'Minutes', notes: 'Unloaded test chamber' },
      { id: 'p3', category: 'Electrical', parameterName: 'Power Consumption at Steady State', targetValue: '1800', tolerance: '±150', unit: 'Watts', notes: '230V 50Hz single phase' },
      { id: 'p4', category: 'Acoustic', parameterName: 'Operating Sound Level at 1 Meter', targetValue: '52', tolerance: '<= 55', unit: 'dBA', notes: 'Acoustic enclosure verified' },
    ],
    approvedBy: 'Dr. Sunita Rao',
    approvedAt: '2026-02-12T11:00:00Z',
    notes: 'Initial engineering baseline approved.',
  });
}
