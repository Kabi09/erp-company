import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { connectDatabase, disconnectDatabase } from '../config/database';
import {
  ActivityLogModel,
  BOMModel,
  CompanySettingsModel,
  CustomerModel,
  CustomerPOModel,
  DailyProductionUpdateModel,
  DeliveredProductModel,
  DeliveryIssueModel,
  DeliveryOrderModel,
  DocCounterModel,
  EmployeeModel,
  EnquiryModel,
  FollowUpModel,
  GRNModel,
  MaterialIssueModel,
  MaterialModel,
  MaterialRequestModel,
  NotificationModel,
  PaymentEntryModel,
  ProductCategoryModel,
  ProductModel,
  ProductionOrderModel,
  ProformaInvoiceModel,
  QualityCheckModel,
  QuotationModel,
  RDBOMModel,
  RDProjectModel,
  RDSpecificationModel,
  RDTestRecordModel,
  RDWorkUpdateModel,
  ReworkOrderModel,
  RoleModel,
  SalesOrderModel,
  ServiceBillingModel,
  ServiceExpenseModel,
  ServiceJobModel,
  ServiceMaterialRequestModel,
  ServiceRequestModel,
  ServiceWorkUpdateModel,
  StockTransactionModel,
  SupplierModel,
  SupplierPOModel,
  SupplierReturnModel,
  TechnicianAdvanceModel,
} from '../models';
import { ensureDefaultApprovalWorkflows } from '../routes/approval.routes';
import { createSeedDatabase } from '../seedData';
import {
  ensureServiceAndRDRolesAndData,
  ensureSuperAdminOnly,
  syncDeliveredProducts,
} from '../services/seedService';

async function seedClientDemo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in backend/.env');
  }

  console.log(`Connecting to target database...`);
  await connectDatabase(uri);

  // Clean slate for client demo database
  await mongoose.connection.dropDatabase();
  console.log('Dropped existing collections in target DB for clean client demo seed.');

  const seed = createSeedDatabase();
  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'admin@gmail.com').trim().toLowerCase();
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'Zxcvbnm09#';
  const superAdminHash = bcrypt.hashSync(superAdminPassword, 10);
  const demoStaffHash = bcrypt.hashSync('cryo123', 8);

  // 1. Company Settings (clean client mode)
  await CompanySettingsModel.create({
    id: 'company',
    ...seed.company,
    demoMode: false,
  });

  // 2. Product Categories
  const categoryNames = [
    'Ultra Low Temperature Freezers',
    'Laboratory Refrigerators',
    'Environmental Chambers',
    'Cold Rooms',
    'Cryogenic Storage Tanks',
    'Bio-Repository Systems',
    'Blood Bank Chillers',
  ];
  await ProductCategoryModel.insertMany(
    categoryNames.map((name, idx) => ({
      id: `pcat-${idx + 1}`,
      name,
      normalizedName: name.trim().toLowerCase(),
      active: true,
      createdBy: 'Super Admin',
    })),
  );

  // 3. Roles & Core Employees (update emp-1 to configured Super Admin credentials)
  await RoleModel.insertMany(seed.roles);

  const coreEmployees = seed.employees.map((e) => {
    if (e.id === 'emp-1' || e.roleId === 'role-super-admin') {
      return {
        ...e,
        name: 'Arjun Nair (Super Admin)',
        email: superAdminEmail,
        passwordHash: superAdminHash,
        status: 'Active' as const,
      };
    }
    return {
      ...e,
      passwordHash: demoStaffHash,
    };
  });
  await EmployeeModel.insertMany(coreEmployees);

  // 4. Master Data (Customers, Suppliers, Materials + 2 extra, Products)
  await CustomerModel.insertMany(seed.customers);
  await SupplierModel.insertMany(seed.suppliers);

  const extraMaterials = [
    {
      id: 'mat-9',
      code: 'MAT-009',
      name: 'Cryo Mixed Refrigerant Blend (R170/R290/N2)',
      category: 'Refrigerants',
      specification: 'Ultra-pure azeotropic gas mix for -86C / -150C cascade stages',
      unit: 'Cylinders',
      minStock: 8,
      storageLocation: 'Rack E-01 (HazMat Store)',
      preferredSupplierId: 'sup-2',
      active: true,
      createdAt: '2026-06-15T10:00:00Z',
    },
    {
      id: 'mat-10',
      code: 'MAT-010',
      name: 'Magnetic Door Lock & Dual Silicone Gasket Kit',
      category: 'Hardware & Seals',
      specification: 'Triple-lip cryogenic silicone seal assembly for ULT cabinets',
      unit: 'Sets',
      minStock: 12,
      storageLocation: 'Rack C-04',
      preferredSupplierId: 'sup-3',
      active: true,
      createdAt: '2026-06-16T10:00:00Z',
    },
  ];
  await MaterialModel.insertMany([...seed.materials, ...extraMaterials]);
  await ProductModel.insertMany(seed.products);

  // 5. Sales, Supply Chain, Production & Logistics Workflows
  await EnquiryModel.insertMany(seed.enquiries);
  await FollowUpModel.insertMany(seed.followUps);
  await QuotationModel.insertMany(seed.quotations);
  await ProformaInvoiceModel.insertMany(seed.proformaInvoices);
  await CustomerPOModel.insertMany(seed.customerPOs);
  await PaymentEntryModel.insertMany(seed.payments);
  await SalesOrderModel.insertMany(seed.salesOrders);
  await ProductionOrderModel.insertMany(seed.productionOrders);
  await BOMModel.insertMany(seed.boms);
  await MaterialRequestModel.insertMany(seed.materialRequests);
  await MaterialIssueModel.insertMany(seed.materialIssues);
  await SupplierPOModel.insertMany(seed.supplierPOs);
  await GRNModel.insertMany(seed.grns);
  await SupplierReturnModel.insertMany(seed.supplierReturns);

  const extraStockTxns = [
    {
      id: 'st-24',
      materialId: 'mat-9',
      materialCode: 'MAT-009',
      materialName: 'Cryo Mixed Refrigerant Blend (R170/R290/N2)',
      unit: 'Cylinders',
      type: 'Opening Balance' as const,
      quantityDelta: 18,
      balanceAfter: 18,
      linkedDocType: 'Opening',
      linkedDocId: 'init-9',
      linkedDocNo: 'OPEN-2026',
      remarks: 'Initial warehouse inventory',
      performedBy: 'Vikram Kulkarni',
      timestamp: '2026-10-01T09:00:00Z',
    },
    {
      id: 'st-25',
      materialId: 'mat-10',
      materialCode: 'MAT-010',
      materialName: 'Magnetic Door Lock & Dual Silicone Gasket Kit',
      unit: 'Sets',
      type: 'Opening Balance' as const,
      quantityDelta: 24,
      balanceAfter: 24,
      linkedDocType: 'Opening',
      linkedDocId: 'init-10',
      linkedDocNo: 'OPEN-2026',
      remarks: 'Initial warehouse inventory',
      performedBy: 'Vikram Kulkarni',
      timestamp: '2026-10-01T09:00:00Z',
    },
  ];
  await StockTransactionModel.insertMany([...seed.stockTransactions, ...extraStockTxns]);

  await DailyProductionUpdateModel.insertMany(seed.dailyUpdates);
  await QualityCheckModel.insertMany(seed.qualityChecks);
  await ReworkOrderModel.insertMany(seed.reworkOrders);

  const extraDeliveries = [
    {
      id: 'del-3',
      docNo: 'DEL-0003',
      salesOrderId: 'so-2',
      salesOrderDocNo: 'SO-0002',
      productionOrderId: 'po-2',
      productionOrderDocNo: 'PROD-0002',
      customerId: 'cust-2',
      customerName: 'Apex Clinical Research Institute',
      productName: 'Ultra Low Temperature Freezer (ULT-500)',
      quantity: 2,
      serialNumbers: ['CRYO-ULT500-2603', 'CRYO-ULT500-2604'],
      deliveryAddress: 'Cryo Storage Unit 3, Genome Valley, Hyderabad, TS 500078',
      transportMethod: 'Courier' as const,
      courierCompany: 'Safexpress Cold-Chain',
      trackingNumber: 'SFX-44918220',
      courierContact: '+91 40 2319 8800',
      plannedDispatchDate: '2026-11-04',
      expectedDeliveryDate: '2026-11-07',
      actualDispatchDate: '2026-11-04T10:00:00Z',
      deliveryChallanNo: 'DC-2026-0419',
      dispatchRemarks: 'Dispatched with shock & tilt indicators installed.',
      actualDeliveryDate: '2026-11-07',
      receivedBy: 'Dr. Ramesh Babu',
      deliveredQty: 2,
      deliveryCondition: 'Good' as const,
      podName: 'POD_DEL0003_Signed.pdf',
      deliveryRemarks: 'Commissioned and checked at Genome Valley lab.',
      status: 'Delivered' as const,
      remarks: 'Insured transit completed without issues.',
      createdBy: 'Deepak Verma',
      createdAt: '2026-11-03T14:00:00Z',
      updatedAt: '2026-11-07T15:30:00Z',
    },
    {
      id: 'del-4',
      docNo: 'DEL-0004',
      salesOrderId: 'so-4',
      salesOrderDocNo: 'SO-0004',
      productionOrderId: 'po-4',
      productionOrderDocNo: 'PROD-0004',
      customerId: 'cust-4',
      customerName: 'National Vaccine Repository',
      productName: 'Ultra Low Temperature Freezer (ULT-800)',
      quantity: 1,
      serialNumbers: ['CRYO-ULT800-2602'],
      deliveryAddress: 'Cold Storage Wing 2, Electronic City, Bengaluru, KA 560100',
      transportMethod: 'Own Vehicle' as const,
      vehicleNumber: 'KA-01-MH-5104',
      driverName: 'Suresh Naik',
      driverPhone: '+91 98456 33012',
      plannedDispatchDate: '2026-11-24',
      expectedDeliveryDate: '2026-11-25',
      deliveredQty: 0,
      status: 'Planned' as const,
      remarks: 'Second unit scheduled for Bengaluru delivery.',
      createdBy: 'Deepak Verma',
      createdAt: '2026-11-21T11:00:00Z',
      updatedAt: '2026-11-21T11:00:00Z',
    },
  ];
  await DeliveryOrderModel.insertMany([...seed.deliveryOrders, ...extraDeliveries]);
  if (seed.deliveryIssues.length > 0) {
    await DeliveryIssueModel.insertMany(seed.deliveryIssues);
  }

  await ensureDefaultApprovalWorkflows();

  // 6. Service & R&D Roles, Core Employees, and Super Admin Preservation
  await ensureServiceAndRDRolesAndData();
  await ensureSuperAdminOnly(superAdminEmail, superAdminPassword);

  // Add second active field technician so service dispatch lists realistic choices
  await EmployeeModel.create({
    id: 'emp-12',
    employeeId: 'EMP-012',
    name: 'Vikram Patel',
    email: 'tech.vikram@cryoerp.com',
    phone: '+91 98450 11012',
    department: 'service',
    roleId: 'role-service-tech',
    designation: 'Field Calibration Engineer',
    status: 'Active',
    passwordHash: demoStaffHash,
    createdAt: '2026-10-05T09:00:00Z',
  });

  // 7. Rich Delivered Products + Realistic Service Management Records (5 Requests, 4 Jobs, Spares, Expenses, Billing)
  await DeliveredProductModel.deleteMany({});
  await ServiceRequestModel.deleteMany({});
  await ServiceJobModel.deleteMany({});
  await ServiceWorkUpdateModel.deleteMany({});
  await ServiceMaterialRequestModel.deleteMany({});
  await TechnicianAdvanceModel.deleteMany({});
  await ServiceExpenseModel.deleteMany({});
  await ServiceBillingModel.deleteMany({});

  await syncDeliveredProducts();

  await DeliveredProductModel.insertMany([
    {
      id: 'dp-legacy-1',
      serialNumber: 'CRYO-LN2-2023-104',
      productId: 'prod-cat-3',
      productName: 'Bio-Bank LN2 Vapor Storage System (BBR-300)',
      modelNumber: 'BBR-04-300',
      customerId: 'cust-3',
      customerName: 'NovaGene Lifesciences Ltd.',
      customerContact: 'Dr. Kavita Krishnan',
      customerPhone: '+91 98114 77230',
      customerEmail: 'k.krishnan@novagene.co.in',
      deliveryAddress: 'Bio-Repository Wing 1, Cyber City, Gurugram, HR 122002',
      deliveredDate: '2023-08-14',
      warrantyPeriodMonths: 24,
      warrantyStartDate: '2023-08-14',
      warrantyEndDate: '2025-08-14',
      warrantyStatus: 'Expired',
      status: 'Active',
      notes: 'Legacy installed unit out of comprehensive warranty; eligible for chargeable service.',
    },
    {
      id: 'dp-legacy-2',
      serialNumber: 'CRYO-LAB350-2024-052',
      productId: 'prod-cat-4',
      productName: 'Laboratory Deep Freezer -40°C (LAB-350)',
      modelNumber: 'LAB-40-350',
      customerId: 'cust-5',
      customerName: 'Helix Biotech Labs',
      customerContact: 'Siddharth Rao',
      customerPhone: '+91 98451 66302',
      customerEmail: 's.rao@helixbio.in',
      deliveryAddress: 'Lab Annex 2, Peenya Phase III, Bengaluru, KA 560058',
      deliveredDate: '2024-03-20',
      warrantyPeriodMonths: 24,
      warrantyStartDate: '2024-03-20',
      warrantyEndDate: '2026-03-20',
      warrantyStatus: 'Expired',
      status: 'Under Service',
      notes: 'Returned for workshop cascade compressor overhaul.',
    },
  ]);

  const dpList = await DeliveredProductModel.find().lean();
  const dp1 = dpList.find((d) => d.serialNumber === 'CRYO-ULT500-2601') || dpList[0];
  const dpUlt2 = dpList.find((d) => d.serialNumber === 'CRYO-ULT500-2602') || dp1;
  const dp2 = dpList.find((d) => d.serialNumber === 'CRYO-ULT500-2603') || dpList[1] || dp1;
  const dpLegacy1 = dpList.find((d) => d.serialNumber === 'CRYO-LN2-2023-104') || dp1;
  const dpLegacy2 = dpList.find((d) => d.serialNumber === 'CRYO-LAB350-2024-052') || dp2;

  await ServiceRequestModel.insertMany([
    {
      id: 'srv-1',
      docNo: 'SRV-0001',
      requestDate: '2026-11-18',
      customerId: dp1.customerId,
      customerName: dp1.customerName,
      contactPerson: dp1.customerContact || 'Dr. Meera Deshmukh',
      contactPhone: dp1.customerPhone || '+91 98201 44510',
      contactEmail: dp1.customerEmail || 'procurement@biogenix.in',
      serviceAddress: dp1.deliveryAddress,
      deliveredProductId: dp1.id,
      serialNumber: dp1.serialNumber,
      productName: dp1.productName,
      modelNumber: dp1.modelNumber || 'ULT-500',
      serviceType: 'Customer Site',
      priority: 'High',
      issueDescription: 'Cabinet temperature fluctuating between -72C and -80C with intermittent high-stage alarm.',
      isUnderWarranty: true,
      warrantyClaimValid: true,
      warrantyRemarks: 'Within 24-month warranty period. Approved FOC replacement of sensor probe.',
      status: 'In Progress',
      assignedJobId: 'job-1',
      assignedTechnicianId: 'emp-9',
      assignedTechnicianName: 'Anil Sharma',
      scheduledDate: '2026-11-23',
      createdBy: 'Rajesh Kumar',
    },
    {
      id: 'srv-2',
      docNo: 'SRV-0002',
      requestDate: '2026-11-15',
      customerId: dpLegacy2.customerId,
      customerName: dpLegacy2.customerName,
      contactPerson: dpLegacy2.customerContact || 'Siddharth Rao',
      contactPhone: dpLegacy2.customerPhone || '+91 98451 66302',
      contactEmail: dpLegacy2.customerEmail || 's.rao@helixbio.in',
      serviceAddress: dpLegacy2.deliveryAddress,
      deliveredProductId: dpLegacy2.id,
      serialNumber: dpLegacy2.serialNumber,
      productName: dpLegacy2.productName,
      modelNumber: dpLegacy2.modelNumber || 'LAB-350',
      serviceType: 'CRYO Workshop',
      priority: 'Urgent',
      issueDescription: 'Secondary stage compressor tripping thermal overload relay after 15 mins run.',
      isUnderWarranty: false,
      warrantyClaimValid: false,
      warrantyRemarks: 'Warranty expired Mar 2026; customer approved chargeable workshop overhaul estimate.',
      status: 'In Progress',
      assignedJobId: 'job-2',
      assignedTechnicianId: 'emp-12',
      assignedTechnicianName: 'Vikram Patel',
      scheduledDate: '2026-11-22',
      createdBy: 'Rajesh Kumar',
    },
    {
      id: 'srv-3',
      docNo: 'SRV-0003',
      requestDate: '2026-11-08',
      customerId: dpLegacy1.customerId,
      customerName: dpLegacy1.customerName,
      contactPerson: dpLegacy1.customerContact || 'Dr. Kavita Krishnan',
      contactPhone: dpLegacy1.customerPhone || '+91 98114 77230',
      contactEmail: dpLegacy1.customerEmail || 'k.krishnan@novagene.co.in',
      serviceAddress: dpLegacy1.deliveryAddress,
      deliveredProductId: dpLegacy1.id,
      serialNumber: dpLegacy1.serialNumber,
      productName: dpLegacy1.productName,
      modelNumber: dpLegacy1.modelNumber || 'BBR-300',
      serviceType: 'Customer Site',
      priority: 'Medium',
      issueDescription: 'Annual preventive maintenance, door gasket replacement, and PT100 5-point calibration certificate.',
      isUnderWarranty: false,
      warrantyClaimValid: false,
      warrantyRemarks: 'Annual chargeable AMC calibration & seal replacement.',
      status: 'Completed',
      assignedJobId: 'job-3',
      assignedTechnicianId: 'emp-9',
      assignedTechnicianName: 'Anil Sharma',
      scheduledDate: '2026-11-10',
      createdBy: 'Rajesh Kumar',
    },
    {
      id: 'srv-4',
      docNo: 'SRV-0004',
      requestDate: '2026-11-20',
      customerId: dp2.customerId,
      customerName: dp2.customerName,
      contactPerson: dp2.customerContact || 'Dr. Ramesh Babu',
      contactPhone: dp2.customerPhone || '+91 99450 22190',
      contactEmail: dp2.customerEmail || 'r.babu@apexclinical.org',
      serviceAddress: dp2.deliveryAddress,
      deliveredProductId: dp2.id,
      serialNumber: dp2.serialNumber,
      productName: dp2.productName,
      modelNumber: dp2.modelNumber || 'ULT-500',
      serviceType: 'Customer Site',
      priority: 'Low',
      issueDescription: 'IQ/OQ datalogger USB port configuration and operator handover training.',
      isUnderWarranty: true,
      warrantyClaimValid: true,
      warrantyRemarks: 'New installation commissioning support covered under warranty.',
      status: 'Assigned',
      assignedJobId: 'job-4',
      assignedTechnicianId: 'emp-12',
      assignedTechnicianName: 'Vikram Patel',
      scheduledDate: '2026-11-25',
      createdBy: 'Rajesh Kumar',
    },
    {
      id: 'srv-5',
      docNo: 'SRV-0005',
      requestDate: '2026-11-22',
      customerId: dp1.customerId,
      customerName: dp1.customerName,
      contactPerson: 'Dr. Meera Deshmukh',
      contactPhone: '+91 98201 44510',
      contactEmail: 'procurement@biogenix.in',
      serviceAddress: dp1.deliveryAddress,
      deliveredProductId: dpUlt2.id,
      serialNumber: dpUlt2.serialNumber,
      productName: dpUlt2.productName,
      modelNumber: dpUlt2.modelNumber || 'ULT-500',
      serviceType: 'Customer Site',
      priority: 'Medium',
      issueDescription: 'Requesting NABL traceable temperature calibration audit before regulatory inspection.',
      isUnderWarranty: true,
      warrantyClaimValid: false,
      warrantyRemarks: 'Calibration audit requested during warranty; third-party traceability verification open for triage.',
      status: 'Open',
      createdBy: 'Rajesh Kumar',
    },
  ]);

  await ServiceJobModel.insertMany([
    {
      id: 'job-1',
      docNo: 'JOB-0001',
      serviceRequestId: 'srv-1',
      serviceRequestDocNo: 'SRV-0001',
      customerId: dp1.customerId,
      customerName: dp1.customerName,
      deliveredProductId: dp1.id,
      serialNumber: dp1.serialNumber,
      productName: dp1.productName,
      serviceType: 'Customer Site',
      priority: 'High',
      assignedTechnicianId: 'emp-9',
      assignedTechnicianName: 'Anil Sharma',
      scheduledDate: '2026-11-23',
      scheduledTime: '10:00 AM',
      instructions: 'Carry spare PT100 probe and condenser coil cleaning kit.',
      status: 'In Progress',
      checkIn: {
        timestamp: '2026-11-23T04:45:00Z',
        performedBy: 'Anil Sharma',
        location: 'Biogenix Central Biobank, Hinjewadi Phase 2',
        notes: 'On-site arrival logged; diagnostic checks started.',
      },
      checkInTime: '2026-11-23T04:45:00Z',
      visits: [
        {
          visitNumber: 1,
          checkInTime: '2026-11-21T05:00:00Z',
          checkOutTime: '2026-11-21T08:30:00Z',
          durationMinutes: 210,
          technicianId: 'emp-9',
          technicianName: 'Anil Sharma',
          location: 'Biogenix Central Biobank, Hinjewadi Phase 2',
          resolutionSummary: 'Initial diagnostics identified faulty PT100 sensor; indented replacement.',
        },
      ],
      diagnosisSummary: 'PT100 evaporator probe showing +4.2C drift and auxiliary condenser dust build-up.',
      rootCause: 'Probe insulation fatigue and restricted condenser airflow.',
      correctiveAction: 'Cleaned condenser fins; awaiting replacement PT100 probe installation.',
      totalHoursSpent: 3.5,
      isChargeable: false,
    },
    {
      id: 'job-2',
      docNo: 'JOB-0002',
      serviceRequestId: 'srv-2',
      serviceRequestDocNo: 'SRV-0002',
      customerId: dpLegacy2.customerId,
      customerName: dpLegacy2.customerName,
      deliveredProductId: dpLegacy2.id,
      serialNumber: dpLegacy2.serialNumber,
      productName: dpLegacy2.productName,
      serviceType: 'CRYO Workshop',
      priority: 'Urgent',
      assignedTechnicianId: 'emp-12',
      assignedTechnicianName: 'Vikram Patel',
      scheduledDate: '2026-11-22',
      scheduledTime: '09:30 AM',
      instructions: 'Complete nitrogen pressure decay test before recharging mixed refrigerant.',
      status: 'In Progress',
      workshopDetails: {
        receivedDate: '2026-11-21',
        receivedBy: 'Rajesh Kumar',
        receivedCondition: 'Outer cabinet intact; compressor draws locked rotor amperage.',
        photos: ['workshop_intake_job2.jpg'],
        returnStatus: 'Pending',
        customerConfirmation: false,
      },
      diagnosisSummary: 'Stage-2 hermetic compressor winding shorted; oil acid test positive.',
      rootCause: 'Sustained voltage fluctuation in customer annex room.',
      correctiveAction: 'Compressor unbrazed; replacing compressor, filter drier, and refrigerant charge.',
      totalHoursSpent: 5,
      isChargeable: true,
    },
    {
      id: 'job-3',
      docNo: 'JOB-0003',
      serviceRequestId: 'srv-3',
      serviceRequestDocNo: 'SRV-0003',
      customerId: dpLegacy1.customerId,
      customerName: dpLegacy1.customerName,
      deliveredProductId: dpLegacy1.id,
      serialNumber: dpLegacy1.serialNumber,
      productName: dpLegacy1.productName,
      serviceType: 'Customer Site',
      priority: 'Medium',
      assignedTechnicianId: 'emp-9',
      assignedTechnicianName: 'Anil Sharma',
      scheduledDate: '2026-11-10',
      scheduledTime: '11:00 AM',
      status: 'Closed',
      checkIn: {
        timestamp: '2026-11-10T05:30:00Z',
        performedBy: 'Anil Sharma',
        location: 'NovaGene Bio-Repository Wing 1, Gurugram',
      },
      checkOut: {
        timestamp: '2026-11-10T10:30:00Z',
        performedBy: 'Anil Sharma',
        resolutionSummary: 'Replaced door silicone gasket set, calibrated PID across 5 points (-150C +/- 0.8C).',
        customerRepresentativeName: 'Dr. Kavita Krishnan',
        customerSignatureAck: true,
      },
      checkInTime: '2026-11-10T05:30:00Z',
      checkOutTime: '2026-11-10T10:30:00Z',
      visits: [
        {
          visitNumber: 1,
          checkInTime: '2026-11-10T05:30:00Z',
          checkOutTime: '2026-11-10T10:30:00Z',
          durationMinutes: 300,
          technicianId: 'emp-9',
          technicianName: 'Anil Sharma',
          location: 'NovaGene Bio-Repository Wing 1, Gurugram',
          resolutionSummary: 'Preventive maintenance & gasket replacement completed cleanly.',
        },
      ],
      diagnosisSummary: 'Inner silicone gasket hardening causing minor frost formation near latch.',
      rootCause: 'Normal 3-year elastomeric wear.',
      correctiveAction: 'Installed new dual silicone gasket kit and completed 5-point calibration.',
      finalProductCondition: 'Optimal Operational Readiness (-150°C Stable)',
      completionSummary: 'Unit passed 4-hour soak stability test and calibration certificate handed over.',
      totalHoursSpent: 5,
      customerFeedbackScore: 5,
      customerFeedbackNotes: 'Very thorough preventive service and clean calibration documentation.',
      isChargeable: true,
      billingId: 'sbl-1',
      completionDate: '2026-11-10',
    },
    {
      id: 'job-4',
      docNo: 'JOB-0004',
      serviceRequestId: 'srv-4',
      serviceRequestDocNo: 'SRV-0004',
      customerId: dp2.customerId,
      customerName: dp2.customerName,
      deliveredProductId: dp2.id,
      serialNumber: dp2.serialNumber,
      productName: dp2.productName,
      serviceType: 'Customer Site',
      priority: 'Low',
      assignedTechnicianId: 'emp-12',
      assignedTechnicianName: 'Vikram Patel',
      scheduledDate: '2026-11-25',
      scheduledTime: '02:00 PM',
      instructions: 'Carry USB-RS485 adapter and IQ/OQ commissioning binder.',
      status: 'Scheduled',
      totalHoursSpent: 0,
      isChargeable: false,
    },
  ]);

  await ServiceWorkUpdateModel.insertMany([
    {
      id: 'swu-1',
      serviceJobId: 'job-1',
      date: '2026-11-21',
      technicianId: 'emp-9',
      technicianName: 'Anil Sharma',
      stageName: 'Diagnostic & Condenser Cleaning',
      hoursSpent: 3.5,
      highlights: ['Cleaned auxiliary condenser coil fins', 'Verified stage-1 & stage-2 suction pressures'],
      checklist: [
        { id: 'chk-s1', item: 'Condenser Airflow Check', result: 'Pass', remarks: 'Restored after brush cleaning' },
        { id: 'chk-s2', item: 'PT100 Sensor Resistance Verification', result: 'Fail', remarks: '+4.2C offset detected' },
        { id: 'chk-s3', item: 'Compressor Amp Draw', result: 'Pass', remarks: 'Nominal 5.8A' },
      ],
      findingsNotes: 'Replacement PT100 probe indented from CRYO Supply Chain stores.',
      createdAt: '2026-11-21T08:30:00Z',
    },
    {
      id: 'swu-2',
      serviceJobId: 'job-2',
      date: '2026-11-22',
      technicianId: 'emp-12',
      technicianName: 'Vikram Patel',
      stageName: 'Workshop Compressor Teardown & Brazing',
      hoursSpent: 5,
      highlights: ['Recovered residual refrigerant safely', 'Brazed new Cascade Compressor & flush line'],
      checklist: [
        { id: 'chk-s4', item: 'Nitrogen Leak Test (250 PSI)', result: 'Pass', remarks: 'Zero drop over 6 hrs' },
        { id: 'chk-s5', item: 'Vacuum Pull Down (<500 Microns)', result: 'Pass', remarks: 'Achieved 280 microns' },
        { id: 'chk-s6', item: 'Final Pull-Down to -40C Soak', result: 'Pending', remarks: 'Charge & soak running overnight' },
      ],
      findingsNotes: 'Compressor replacement complete; running overnight pull-down chamber test.',
      createdAt: '2026-11-22T17:00:00Z',
    },
    {
      id: 'swu-3',
      serviceJobId: 'job-3',
      date: '2026-11-10',
      technicianId: 'emp-9',
      technicianName: 'Anil Sharma',
      stageName: 'Gasket Replacement & NABL Calibration',
      hoursSpent: 5,
      highlights: ['Installed Magnetic Dual Silicone Gasket Kit', 'Verified -150C holdover stability'],
      checklist: [
        { id: 'chk-s7', item: 'Door Vacuum Seal Paper-Strip Test', result: 'Pass', remarks: 'Uniform compression all 4 edges' },
        { id: 'chk-s8', item: '5-Point Calibration Tolerance', result: 'Pass', remarks: 'Within +/- 0.8C' },
      ],
      findingsNotes: 'Signed handover obtained from Dr. Kavita Krishnan.',
      createdAt: '2026-11-10T10:30:00Z',
    },
  ]);

  // Service Spare Parts Indents + Linked SCM Material Requests
  await ServiceMaterialRequestModel.insertMany([
    {
      id: 'smr-1',
      docNo: 'SMR-0001',
      serviceJobId: 'job-1',
      serviceJobDocNo: 'JOB-0001',
      customerId: dp1.customerId,
      customerName: dp1.customerName,
      requestedBy: 'Anil Sharma',
      requestDate: '2026-11-21',
      items: [
        {
          materialId: 'mat-3',
          materialName: 'PT100 Cryogenic Temperature Sensor',
          partNumber: 'MAT-003',
          quantityRequested: 1,
          quantityIssued: 1,
          quantityUsed: 0,
          quantityReturned: 0,
          unit: 'Nos',
          unitCost: 2400,
          totalCost: 2400,
        },
      ],
      status: 'Issued',
      issuedDate: '2026-11-22',
      notes: 'Urgent spare for Biogenix ULT-500 repair.',
      linkedMaterialRequestId: 'mr-srv-1',
    },
    {
      id: 'smr-2',
      docNo: 'SMR-0002',
      serviceJobId: 'job-2',
      serviceJobDocNo: 'JOB-0002',
      customerId: dpLegacy2.customerId,
      customerName: dpLegacy2.customerName,
      requestedBy: 'Vikram Patel',
      requestDate: '2026-11-21',
      items: [
        {
          materialId: 'mat-1',
          materialName: 'Cascade Refrigeration Compressor',
          partNumber: 'MAT-001',
          quantityRequested: 1,
          quantityIssued: 1,
          quantityUsed: 1,
          quantityReturned: 0,
          unit: 'Nos',
          unitCost: 34500,
          totalCost: 34500,
        },
        {
          materialId: 'mat-9',
          materialName: 'Cryo Mixed Refrigerant Blend (R170/R290/N2)',
          partNumber: 'MAT-009',
          quantityRequested: 1,
          quantityIssued: 1,
          quantityUsed: 1,
          quantityReturned: 0,
          unit: 'Cylinders',
          unitCost: 8500,
          totalCost: 8500,
        },
      ],
      status: 'Received',
      issuedDate: '2026-11-21',
      receivedDate: '2026-11-22',
      notes: 'Workshop compressor overhaul kit.',
      linkedMaterialRequestId: 'mr-srv-2',
    },
  ]);

  await MaterialRequestModel.insertMany([
    {
      id: 'mr-srv-1',
      docNo: 'MR-0006',
      productionOrderId: 'job-1',
      productionOrderDocNo: 'JOB-0001',
      salesOrderId: 'srv-1',
      salesOrderDocNo: 'SRV-0001',
      bomId: 'smr-1',
      bomDocNo: 'SMR-0001',
      productName: 'Service Spares — ULT-500 (JOB-0001)',
      department: 'service',
      priority: 'High',
      items: [
        {
          materialId: 'mat-3',
          materialCode: 'MAT-003',
          materialName: 'PT100 Cryogenic Temperature Sensor',
          unit: 'Nos',
          requiredQty: 1,
          issuedQty: 1,
          receivedQty: 1,
        },
      ],
      status: 'Fully Issued',
      receiptStatus: 'Fully Received',
      requestedBy: 'Anil Sharma',
      requestDate: '2026-11-21',
      createdAt: '2026-11-21T09:00:00Z',
    },
    {
      id: 'mr-srv-2',
      docNo: 'MR-0007',
      productionOrderId: 'job-2',
      productionOrderDocNo: 'JOB-0002',
      salesOrderId: 'srv-2',
      salesOrderDocNo: 'SRV-0002',
      bomId: 'smr-2',
      bomDocNo: 'SMR-0002',
      productName: 'Service Overhaul Spares — LAB-350 (JOB-0002)',
      department: 'service',
      priority: 'Urgent',
      items: [
        {
          materialId: 'mat-1',
          materialCode: 'MAT-001',
          materialName: 'Cascade Refrigeration Compressor',
          unit: 'Nos',
          requiredQty: 1,
          issuedQty: 1,
          receivedQty: 1,
        },
        {
          materialId: 'mat-9',
          materialCode: 'MAT-009',
          materialName: 'Cryo Mixed Refrigerant Blend (R170/R290/N2)',
          unit: 'Cylinders',
          requiredQty: 1,
          issuedQty: 1,
          receivedQty: 1,
        },
      ],
      status: 'Fully Issued',
      receiptStatus: 'Fully Received',
      requestedBy: 'Vikram Patel',
      requestDate: '2026-11-21',
      createdAt: '2026-11-21T11:30:00Z',
    },
  ]);

  // Technician Advances & Expense Claims
  await TechnicianAdvanceModel.insertMany([
    {
      id: 'adv-1',
      docNo: 'ADV-0001',
      technicianId: 'emp-9',
      technicianName: 'Anil Sharma',
      serviceJobId: 'job-3',
      serviceJobDocNo: 'JOB-0003',
      amount: 12000,
      advanceDate: '2026-11-09',
      paymentMode: 'UPI',
      purpose: 'Gurugram flight & hotel travel advance for NovaGene AMC',
      status: 'Settled',
      approvedBy: 'Rajesh Kumar',
      settledDate: '2026-11-12',
      createdAt: '2026-11-09T09:00:00Z',
    },
    {
      id: 'adv-2',
      docNo: 'ADV-0002',
      technicianId: 'emp-9',
      technicianName: 'Anil Sharma',
      serviceJobId: 'job-1',
      serviceJobDocNo: 'JOB-0001',
      amount: 4500,
      advanceDate: '2026-11-21',
      paymentMode: 'Bank Transfer',
      purpose: 'Pune field site travel & local conveyance advance',
      status: 'Disbursed',
      approvedBy: 'Rajesh Kumar',
      createdAt: '2026-11-21T07:00:00Z',
    },
  ]);

  await ServiceExpenseModel.insertMany([
    {
      id: 'exp-1',
      docNo: 'EXP-0001',
      serviceJobId: 'job-3',
      serviceJobDocNo: 'JOB-0003',
      technicianId: 'emp-9',
      technicianName: 'Anil Sharma',
      date: '2026-11-10',
      category: 'Travel',
      description: 'Round-trip airfare Bengaluru–Delhi (DEL) + airport cab to Gurugram',
      amount: 11450,
      paidBy: 'Technician',
      status: 'Verified',
      verifiedBy: 'Rajesh Kumar',
      verifiedAt: '2026-11-11T10:00:00Z',
      settledAt: '2026-11-12T15:00:00Z',
      settlementId: 'SETTL-20261112',
      createdAt: '2026-11-10T18:00:00Z',
    },
    {
      id: 'exp-2',
      docNo: 'EXP-0002',
      serviceJobId: 'job-1',
      serviceJobDocNo: 'JOB-0001',
      technicianId: 'emp-9',
      technicianName: 'Anil Sharma',
      date: '2026-11-21',
      category: 'Lodging',
      description: '1-night business stay near Hinjewadi Phase 2 Industrial Park',
      amount: 2800,
      paidBy: 'Technician',
      status: 'Verified',
      verifiedBy: 'Rajesh Kumar',
      verifiedAt: '2026-11-22T09:00:00Z',
      createdAt: '2026-11-21T20:00:00Z',
    },
    {
      id: 'exp-3',
      docNo: 'EXP-0003',
      serviceJobId: 'job-1',
      serviceJobDocNo: 'JOB-0001',
      technicianId: 'emp-9',
      technicianName: 'Anil Sharma',
      date: '2026-11-22',
      category: 'Local Transport',
      description: 'Hinjewadi site transit & spare parts pickup courier charges',
      amount: 850,
      paidBy: 'Technician',
      status: 'Pending',
      createdAt: '2026-11-22T18:30:00Z',
    },
    {
      id: 'exp-4',
      docNo: 'EXP-0004',
      serviceJobId: 'job-2',
      serviceJobDocNo: 'JOB-0002',
      technicianId: 'emp-12',
      technicianName: 'Vikram Patel',
      date: '2026-11-22',
      category: 'Tools/Hardware',
      description: 'Silver brazing rods (15%) & flare union fittings for workshop overhaul',
      amount: 1650,
      paidBy: 'Technician',
      status: 'Pending',
      createdAt: '2026-11-22T19:00:00Z',
    },
  ]);

  await ServiceBillingModel.insertMany([
    {
      id: 'sbl-1',
      docNo: 'SBL-0001',
      serviceJobId: 'job-3',
      serviceJobDocNo: 'JOB-0003',
      customerId: dpLegacy1.customerId,
      customerName: dpLegacy1.customerName,
      billingDate: '2026-11-10',
      items: [
        { description: 'Dual Silicone Cryo Door Gasket Kit', itemType: 'Spare', quantity: 1, unitPrice: 14500, totalPrice: 14500, isWarrantyCovered: false },
        { description: '5-Point NABL Calibration & Preventive Maintenance Labor', itemType: 'Labor', quantity: 1, unitPrice: 8500, totalPrice: 8500, isWarrantyCovered: false },
        { description: 'Outstation Engineer Visit Charge', itemType: 'Travel', quantity: 1, unitPrice: 3500, totalPrice: 3500, isWarrantyCovered: false },
      ],
      subtotal: 26500,
      taxPercent: 18,
      taxAmount: 4770,
      discountAmount: 0,
      grandTotal: 31270,
      paidAmount: 31270,
      outstandingAmount: 0,
      paymentStatus: 'Paid',
      paymentMode: 'NEFT',
      paymentReference: 'HDFCR5202611110048',
      paymentDate: '2026-11-11',
      notes: 'Paid in full via NEFT against calibration certificate handover.',
    },
    {
      id: 'sbl-2',
      docNo: 'SBL-0002',
      serviceJobId: 'job-2',
      serviceJobDocNo: 'JOB-0002',
      customerId: dpLegacy2.customerId,
      customerName: dpLegacy2.customerName,
      billingDate: '2026-11-22',
      items: [
        { description: 'Stage-2 Hermetic Cascade Compressor Assembly', itemType: 'Spare', quantity: 1, unitPrice: 38000, totalPrice: 38000, isWarrantyCovered: false },
        { description: 'Mixed Cryo Refrigerant Recharge & Vacuum Soak', itemType: 'Spare', quantity: 1, unitPrice: 9500, totalPrice: 9500, isWarrantyCovered: false },
        { description: 'Workshop Overhaul & Brazing Labor', itemType: 'Labor', quantity: 1, unitPrice: 7500, totalPrice: 7500, isWarrantyCovered: false },
      ],
      subtotal: 55000,
      taxPercent: 18,
      taxAmount: 9900,
      discountAmount: 2000,
      grandTotal: 62900,
      paidAmount: 25000,
      outstandingAmount: 37900,
      paymentStatus: 'Pending',
      paymentMode: 'UPI',
      paymentReference: 'UPI-6321894401',
      paymentDate: '2026-11-22',
      notes: 'Advance Rs. 25,000 received; balance due before dispatch handover.',
    },
  ]);

  // 8. Rich R&D Management Projects (5 projects across stages + Specs, BOM, SCM MRs, Updates, Retesting)
  await RDProjectModel.deleteMany({});
  await RDSpecificationModel.deleteMany({});
  await RDBOMModel.deleteMany({});
  await RDWorkUpdateModel.deleteMany({});
  await RDTestRecordModel.deleteMany({});

  await RDProjectModel.insertMany([
    {
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
      targetCompletionDate: '2026-12-30',
      budgetEstimated: 850000,
      budgetUtilized: 194500,
      status: 'Prototyping',
      currentStage: 'Secondary Stage Brazing & Leak Testing',
    },
    {
      id: 'rnd-2',
      projectCode: 'RND-0002',
      title: 'IoT LoRaWAN Cryo Telemetry & Predictive Alarm Node',
      objective: 'Design battery-backed sub-GHz telemetry module capable of 14-day autonomous logging inside -86C chambers.',
      projectType: 'Component Research',
      leadEngineerId: 'emp-11',
      leadEngineerName: 'Karthik Raman',
      teamMembers: [
        { id: 'emp-11', name: 'Karthik Raman', role: 'Embedded Hardware Lead' },
        { id: 'emp-10', name: 'Dr. Sunita Rao', role: 'Validation Supervisor' },
      ],
      targetCompletionDate: '2026-12-15',
      budgetEstimated: 320000,
      budgetUtilized: 118000,
      status: 'Testing',
      currentStage: 'Thermal Chamber Drift Retesting',
    },
    {
      id: 'rnd-3',
      projectCode: 'RND-0003',
      title: 'Solar-Hybrid Off-Grid Vaccine Carrier (-20°C / 120L)',
      objective: 'Engineer PCM ice-lined phase-change vaccine carrier with 72-hour grid-off holdover for rural clinics.',
      projectType: 'Custom Prototype',
      leadEngineerId: 'emp-10',
      leadEngineerName: 'Dr. Sunita Rao',
      teamMembers: [{ id: 'emp-10', name: 'Dr. Sunita Rao', role: 'Thermal Architect' }],
      targetCompletionDate: '2026-11-10',
      budgetEstimated: 450000,
      budgetUtilized: 412000,
      status: 'Successfully Completed',
      currentStage: 'Validated & Archived',
      finalConclusion: 'Prototype passed 78-hour power-off holdover test at +43C ambient chamber. Archived in R&D ledger.',
      completedAt: '2026-11-09T16:30:00Z',
    },
    {
      id: 'rnd-4',
      projectCode: 'RND-0004',
      title: 'Low-GWP Hydrocarbon R290/R170 Heat Exchanger Optimization',
      objective: 'Reduce steady-state power consumption by 18% using micro-channel brazed plate heat exchangers.',
      projectType: 'Efficiency Optimization',
      leadEngineerId: 'emp-11',
      leadEngineerName: 'Karthik Raman',
      teamMembers: [{ id: 'emp-11', name: 'Karthik Raman', role: 'Heat Transfer Engineer' }],
      targetCompletionDate: '2027-01-20',
      budgetEstimated: 520000,
      budgetUtilized: 45000,
      status: 'Specification Done',
      currentStage: 'BOM Sourcing & Rig Allocation',
    },
    {
      id: 'rnd-5',
      projectCode: 'RND-0005',
      title: 'Automated Motorized LN2 Biobank Carousel Mechanism',
      objective: 'Concept feasibility study for frost-free stepper-driven cryogenic sample rack indexing at -196C.',
      projectType: 'New Product Development',
      leadEngineerId: 'emp-10',
      leadEngineerName: 'Dr. Sunita Rao',
      teamMembers: [{ id: 'emp-10', name: 'Dr. Sunita Rao', role: 'Principal Investigator' }],
      targetCompletionDate: '2027-02-28',
      budgetEstimated: 640000,
      budgetUtilized: 0,
      status: 'Initiated',
      currentStage: 'Conceptualization',
    },
  ]);

  await RDSpecificationModel.insertMany([
    {
      id: 'spec-1',
      rdProjectId: 'rnd-1',
      version: '1.1',
      parameters: [
        { id: 'sp-1', category: 'Thermal', parameterName: 'Ultimate Low Temperature', targetValue: '-150', tolerance: '±2', unit: '°C' },
        { id: 'sp-2', category: 'Thermal', parameterName: 'Pull-Down Time (+25C to -150C)', targetValue: '190', tolerance: '<= 220', unit: 'Minutes' },
        { id: 'sp-3', category: 'Electrical', parameterName: 'Steady-State Power Draw', targetValue: '1750', tolerance: '±120', unit: 'Watts' },
        { id: 'sp-4', category: 'Acoustic', parameterName: 'Sound Pressure @ 1m', targetValue: '51', tolerance: '<= 55', unit: 'dBA' },
      ],
      approvedBy: 'Dr. Sunita Rao',
      approvedAt: '2026-10-18T11:00:00Z',
    },
    {
      id: 'spec-2',
      rdProjectId: 'rnd-2',
      version: '1.0',
      parameters: [
        { id: 'sp-5', category: 'Electrical', parameterName: 'Backup Battery Runtime (-20C Ambient)', targetValue: '336', tolerance: '>= 300', unit: 'Hours' },
        { id: 'sp-6', category: 'Measurement', parameterName: 'Sensor Sampling Accuracy', targetValue: '±0.1', tolerance: '<= ±0.2', unit: '°C' },
      ],
      approvedBy: 'Dr. Sunita Rao',
      approvedAt: '2026-11-02T14:00:00Z',
    },
    {
      id: 'spec-3',
      rdProjectId: 'rnd-3',
      version: '2.0',
      parameters: [
        { id: 'sp-7', category: 'Thermal', parameterName: 'Grid-Off Holdover (+43C Ambient)', targetValue: '72', tolerance: '>= 72', unit: 'Hours' },
      ],
      approvedBy: 'Dr. Sunita Rao',
      approvedAt: '2026-10-05T10:00:00Z',
    },
    {
      id: 'spec-4',
      rdProjectId: 'rnd-4',
      version: '1.0',
      parameters: [
        { id: 'sp-8', category: 'Efficiency', parameterName: 'Energy Savings vs Legacy Tube Coil', targetValue: '18', tolerance: '>= 15', unit: '%' },
      ],
      approvedBy: 'Dr. Sunita Rao',
      approvedAt: '2026-11-18T16:00:00Z',
    },
  ]);

  await RDBOMModel.insertMany([
    {
      id: 'rdbom-1',
      rdProjectId: 'rnd-1',
      version: '1.0',
      items: [
        {
          id: 'rdbomi-1',
          materialId: 'mat-1',
          name: 'Cascade Refrigeration Compressor',
          partNumber: 'MAT-001',
          category: 'Refrigeration',
          quantityRequired: 2,
          unit: 'Nos',
          source: 'Stock',
          estimatedUnitCost: 34500,
          totalCost: 69000,
          quantityRequested: 2,
          quantityIssued: 2,
          quantityReceived: 2,
          quantityConsumed: 2,
          quantityReturned: 0,
        },
        {
          id: 'rdbomi-2',
          materialId: 'mat-3',
          name: 'PT100 Cryogenic Temperature Sensor',
          partNumber: 'MAT-003',
          category: 'Instrumentation',
          quantityRequired: 4,
          unit: 'Nos',
          source: 'Stock',
          estimatedUnitCost: 2400,
          totalCost: 9600,
          quantityRequested: 4,
          quantityIssued: 4,
          quantityReceived: 4,
          quantityConsumed: 3,
          quantityReturned: 0,
        },
        {
          id: 'rdbomi-3',
          materialId: 'mat-9',
          name: 'Cryo Mixed Refrigerant Blend (R170/R290/N2)',
          partNumber: 'MAT-009',
          category: 'Refrigerants',
          quantityRequired: 2,
          unit: 'Cylinders',
          source: 'Stock',
          estimatedUnitCost: 8500,
          totalCost: 17000,
          quantityRequested: 2,
          quantityIssued: 2,
          quantityReceived: 2,
          quantityConsumed: 1,
          quantityReturned: 0,
        },
        {
          id: 'rdbomi-4',
          name: 'Custom Brazed Micro-Channel Interstage Heat Exchanger',
          partNumber: 'PROTO-HX-150',
          category: 'Custom Fabrication',
          quantityRequired: 1,
          unit: 'Nos',
          source: 'Custom Fabrication',
          estimatedUnitCost: 48000,
          totalCost: 48000,
          quantityRequested: 0,
          quantityIssued: 0,
          quantityReceived: 0,
          quantityConsumed: 1,
          quantityReturned: 0,
        },
      ],
      totalEstimatedCost: 143600,
      linkedMaterialRequestId: 'mr-rnd-1',
      receiptStatus: 'Fully Received',
      requisitionStatus: 'Issued',
    },
    {
      id: 'rdbom-2',
      rdProjectId: 'rnd-2',
      version: '1.0',
      items: [
        {
          id: 'rdbomi-5',
          materialId: 'mat-2',
          name: 'Microprocessor PID Controller',
          partNumber: 'MAT-002',
          category: 'Electronics',
          quantityRequired: 2,
          unit: 'Nos',
          source: 'Stock',
          estimatedUnitCost: 9200,
          totalCost: 18400,
          quantityRequested: 2,
          quantityIssued: 2,
          quantityReceived: 2,
          quantityConsumed: 2,
          quantityReturned: 0,
        },
        {
          id: 'rdbomi-6',
          name: 'LoRaWAN 865MHz RF Shielded Transceiver PCB',
          partNumber: 'LORA-865-REV2',
          category: 'Electronics',
          quantityRequired: 4,
          unit: 'Boards',
          source: 'Procurement',
          estimatedUnitCost: 6500,
          totalCost: 26000,
          quantityRequested: 0,
          quantityIssued: 0,
          quantityReceived: 0,
          quantityConsumed: 3,
          quantityReturned: 0,
        },
      ],
      totalEstimatedCost: 44400,
      linkedMaterialRequestId: 'mr-rnd-2',
      receiptStatus: 'Fully Received',
      requisitionStatus: 'Issued',
    },
  ]);

  await MaterialRequestModel.insertMany([
    {
      id: 'mr-rnd-1',
      docNo: 'MR-0008',
      productionOrderId: 'rnd-1',
      productionOrderDocNo: 'RND-RND-0001',
      salesOrderId: 'RND-rnd-1',
      salesOrderDocNo: 'RND-0001',
      bomId: 'rdbom-1',
      bomDocNo: 'RND-BOM-v1.0',
      productName: 'Ultra-Fast Cryo Cascade Refrigeration Engine (-150°C)',
      department: 'rd',
      priority: 'High',
      items: [
        { materialId: 'mat-1', materialCode: 'MAT-001', materialName: 'Cascade Refrigeration Compressor', unit: 'Nos', requiredQty: 2, issuedQty: 2, receivedQty: 2 },
        { materialId: 'mat-3', materialCode: 'MAT-003', materialName: 'PT100 Cryogenic Temperature Sensor', unit: 'Nos', requiredQty: 4, issuedQty: 4, receivedQty: 4 },
        { materialId: 'mat-9', materialCode: 'MAT-009', materialName: 'Cryo Mixed Refrigerant Blend (R170/R290/N2)', unit: 'Cylinders', requiredQty: 2, issuedQty: 2, receivedQty: 2 },
      ],
      status: 'Fully Issued',
      receiptStatus: 'Fully Received',
      requestedBy: 'Karthik Raman',
      requestDate: '2026-11-10',
      createdAt: '2026-11-10T10:00:00Z',
    },
    {
      id: 'mr-rnd-2',
      docNo: 'MR-0009',
      productionOrderId: 'rnd-2',
      productionOrderDocNo: 'RND-RND-0002',
      salesOrderId: 'RND-rnd-2',
      salesOrderDocNo: 'RND-0002',
      bomId: 'rdbom-2',
      bomDocNo: 'RND-BOM-v1.0',
      productName: 'IoT LoRaWAN Cryo Telemetry & Predictive Alarm Node',
      department: 'rd',
      priority: 'Normal',
      items: [
        { materialId: 'mat-2', materialCode: 'MAT-002', materialName: 'Microprocessor PID Controller', unit: 'Nos', requiredQty: 2, issuedQty: 2, receivedQty: 2 },
      ],
      status: 'Fully Issued',
      receiptStatus: 'Fully Received',
      requestedBy: 'Karthik Raman',
      requestDate: '2026-11-14',
      createdAt: '2026-11-14T11:30:00Z',
    },
  ]);

  await RDWorkUpdateModel.insertMany([
    {
      id: 'rdwu-1',
      rdProjectId: 'rnd-1',
      date: '2026-11-19',
      engineerId: 'emp-11',
      engineerName: 'Karthik Raman',
      selectedStages: ['Evaporator & Piping Brazing', 'Vacuum Dehydration & Leak Testing'],
      hoursSpent: 6.5,
      highlights: ['Completed interstage copper brazing with nitrogen purge', 'Helium leak detector confirmed < 1x10^-7 mbar-l/s'],
      technicalObservations: 'No oxidation inside lines during brazing; pressure decay held steady for 12 hours.',
      createdAt: '2026-11-19T17:30:00Z',
    },
    {
      id: 'rdwu-2',
      rdProjectId: 'rnd-2',
      date: '2026-11-20',
      engineerId: 'emp-11',
      engineerName: 'Karthik Raman',
      selectedStages: ['Microcontroller & Sensor Integration'],
      customStage: 'RF Attenuation Inside SS Inner Chamber',
      hoursSpent: 5,
      highlights: ['Tuned external SMA bulkhead antenna cable routing', 'Logged RSSI -84 dBm across 400m lab campus'],
      technicalObservations: 'Silicone gasket feedthrough preserves thermal seal without cable condensation.',
      createdAt: '2026-11-20T16:45:00Z',
    },
  ]);

  await RDTestRecordModel.insertMany([
    {
      id: 'rdtr-1',
      rdProjectId: 'rnd-2',
      testName: 'Cold-Soak RF Telemetry & Battery Drain Validation',
      testProtocolNumber: 'TP-LORA-001',
      iteration: 1,
      testDate: '2026-11-18',
      testedById: 'emp-11',
      testedByName: 'Karthik Raman',
      status: 'Failed',
      checklist: [
        { id: 'tc-1', parameterOrCheck: 'Packet Reception Rate (-40C Test)', expectedCondition: '>= 99%', measuredValue: '99.4%', result: 'Pass' },
        { id: 'tc-2', parameterOrCheck: 'LiFePO4 Cell Voltage Under Load', expectedCondition: '>= 3.1V after 48h', measuredValue: '2.82V', result: 'Fail', remarks: 'Low temperature battery heater loop needed' },
      ],
      environmentalConditions: 'Test chamber at -25C',
      testNotes: 'Voltage sag observed after 36h cold soak without insulation wrap.',
      retestRequired: true,
    },
    {
      id: 'rdtr-2',
      rdProjectId: 'rnd-2',
      testName: 'Cold-Soak RF Telemetry & Battery Drain Validation',
      testProtocolNumber: 'TP-LORA-001',
      iteration: 2,
      testDate: '2026-11-22',
      testedById: 'emp-10',
      testedByName: 'Dr. Sunita Rao',
      status: 'Passed',
      checklist: [
        { id: 'tc-3', parameterOrCheck: 'Packet Reception Rate (-40C Test)', expectedCondition: '>= 99%', measuredValue: '99.7%', result: 'Pass' },
        { id: 'tc-4', parameterOrCheck: 'LiFePO4 Cell Voltage With Aerogel Wrap', expectedCondition: '>= 3.1V after 48h', measuredValue: '3.24V', result: 'Pass', remarks: 'Aerogel battery jacket solved sag completely' },
      ],
      environmentalConditions: 'Test chamber at -25C',
      testNotes: 'Retest passed all thresholds cleanly after aerogel battery insulation.',
      retestRequired: false,
      retestReason: 'Added 6mm silica aerogel wrap around LiFePO4 battery pack.',
    },
    {
      id: 'rdtr-3',
      rdProjectId: 'rnd-3',
      testName: '72-Hour Grid-Off Thermal Holdover Certification',
      testProtocolNumber: 'TP-SOL-009',
      iteration: 1,
      testDate: '2026-11-08',
      testedById: 'emp-10',
      testedByName: 'Dr. Sunita Rao',
      status: 'Passed',
      checklist: [
        { id: 'tc-5', parameterOrCheck: 'Internal Core Temp @ 72 Hours Power Off', expectedCondition: '<= -15C', measuredValue: '-17.8C', result: 'Pass' },
        { id: 'tc-6', parameterOrCheck: 'Solar MPPT Re-charge Recovery Time', expectedCondition: '<= 6 Hours', measuredValue: '4.5 Hours', result: 'Pass' },
      ],
      environmentalConditions: 'Hot Chamber +43°C Ambient',
      testNotes: 'Full compliance for rural vaccine cold chain deployment.',
      retestRequired: false,
    },
  ]);

  // 9. Notifications & Activity Logs
  await NotificationModel.insertMany([
    ...seed.notifications,
    {
      id: 'notif-srv-1',
      title: 'Warranty Breakdown Ticket In Progress',
      message: 'SRV-0001 (Biogenix Diagnostics ULT-500) assigned to Anil Sharma; replacement PT100 issued.',
      department: 'service',
      severity: 'info',
      link: '/service/jobs/job-1',
      readBy: [],
      createdAt: '2026-11-22T10:00:00Z',
    },
    {
      id: 'notif-rd-1',
      title: 'R&D Retest Validation Passed',
      message: 'RND-0002 (IoT LoRaWAN Telemetry Node) passed TP-LORA-001 Iteration 2 validation.',
      department: 'rd',
      severity: 'success',
      link: '/rd/projects/rnd-2',
      readBy: [],
      createdAt: '2026-11-22T12:00:00Z',
    },
  ]);

  await ActivityLogModel.insertMany([
    ...seed.activityLogs,
    {
      id: 'act-5',
      actorId: 'emp-8',
      actorName: 'Rajesh Kumar',
      department: 'service',
      action: 'Dispatched Service Job',
      entityType: 'ServiceJob',
      entityId: 'job-1',
      entityDocNo: 'JOB-0001',
      details: 'Assigned Anil Sharma to SRV-0001 (Biogenix ULT-500 sensor diagnostics).',
      timestamp: '2026-11-21T08:00:00Z',
    },
    {
      id: 'act-6',
      actorId: 'emp-10',
      actorName: 'Dr. Sunita Rao',
      department: 'rd',
      action: 'Passed Prototype Retest',
      entityType: 'RDTestRecord',
      entityId: 'rdtr-2',
      entityDocNo: 'TP-LORA-001',
      details: 'RND-0002 Iteration 2 retest passed after aerogel battery wrap upgrade.',
      timestamp: '2026-11-22T12:00:00Z',
    },
  ]);

  // 10. Sync DocCounters safely above all seeded document numbers
  const counters: Record<string, number> = {
    ENQ: 20,
    QT: 20,
    PI: 20,
    CPO: 20,
    PAY: 20,
    SO: 20,
    PROD: 20,
    BOM: 20,
    MR: 30,
    MI: 20,
    SPO: 20,
    GRN: 20,
    SRET: 10,
    DEL: 20,
    DP: 20,
    SRV: 15,
    JOB: 15,
    SMR: 15,
    ADV: 15,
    EXP: 15,
    SBL: 15,
    RND: 15,
    WF: 10,
    APR: 10,
  };
  await DocCounterModel.deleteMany({});
  await DocCounterModel.insertMany(Object.entries(counters).map(([key, value]) => ({ key, value })));

  // Summary printout
  const summary: Record<string, number> = {
    roles: await RoleModel.countDocuments(),
    employees: await EmployeeModel.countDocuments(),
    customers: await CustomerModel.countDocuments(),
    suppliers: await SupplierModel.countDocuments(),
    materials: await MaterialModel.countDocuments(),
    products: await ProductModel.countDocuments(),
    enquiries: await EnquiryModel.countDocuments(),
    quotations: await QuotationModel.countDocuments(),
    salesOrders: await SalesOrderModel.countDocuments(),
    productionOrders: await ProductionOrderModel.countDocuments(),
    materialRequests: await MaterialRequestModel.countDocuments(),
    deliveryOrders: await DeliveryOrderModel.countDocuments(),
    deliveredProducts: await DeliveredProductModel.countDocuments(),
    serviceRequests: await ServiceRequestModel.countDocuments(),
    serviceJobs: await ServiceJobModel.countDocuments(),
    serviceMaterialRequests: await ServiceMaterialRequestModel.countDocuments(),
    serviceExpenses: await ServiceExpenseModel.countDocuments(),
    serviceBillings: await ServiceBillingModel.countDocuments(),
    rdProjects: await RDProjectModel.countDocuments(),
    rdSpecifications: await RDSpecificationModel.countDocuments(),
    rdBOMs: await RDBOMModel.countDocuments(),
    rdWorkUpdates: await RDWorkUpdateModel.countDocuments(),
    rdTestRecords: await RDTestRecordModel.countDocuments(),
  };

  console.log('\n=== CLIENT DEMO DATABASE SEEDED SUCCESSFULLY ===');
  console.log(JSON.stringify(summary, null, 2));

  await disconnectDatabase();
}

seedClientDemo().catch((err) => {
  console.error('Failed to seed client demo database:', err);
  process.exit(1);
});
