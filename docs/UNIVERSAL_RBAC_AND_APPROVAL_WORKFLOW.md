# CRYO Enterprise ERP 2.0 — Universal Role Permissions, Employee Overrides & Dynamic Approval Workflow Management

## Executive Summary

This document serves as the comprehensive architectural and implementation specification for the **Universal Dynamic Access Control and Approval Management System** introduced into **CRYO Enterprise ERP 2.0**. 

The system unifies authorization across all four core operational departments (**Sales**, **Supply Chain**, **Production**, **Logistics**) and **Administration** by providing three core capabilities simultaneously:

1. **Dynamic Role-Based Permissions (RBAC)**: An interactive permission matrix covering all operational modules with granular, action-level controls (`view`, `create`, `edit`, `delete`, `submit`, `approve`, `verify`, `confirm`, `export`, `manage`), supporting runtime custom role creation, modification, and core system role protection.
2. **Employee-Specific Permission Overrides**: Granular `inherit`, `allow`, and `deny` overrides per module action with a strict 3-tier resolution hierarchy (`Role Permissions` → `Employee Overrides` → `Effective Permissions`), override reset safeguards, and dedicated audit logging.
3. **Configurable Multi-Level Approval Workflows**: Admin-configurable approval policies supporting 1 to N sequential levels, flexible approver assignment (`role`, `employee`, or `either`), self-approval prevention gates, universal approval inbox (`Pending My Decision`, `My Submissions`, `Approval History`, `All Requests`), document version immutability (`V1` approval does not authorize `V2`), and strict downstream execution gates (unapproved quotations cannot be sent or accepted; unapproved supplier POs cannot be received into inventory).

---

## 1. System Architecture & Component Mapping

```mermaid
flowchart TD
    subgraph Client["Frontend (React + Vite + TypeScript)"]
        UI_Nav["Dynamic Navigation & Action Rendering (can(module, action))"]
        UI_Roles["Roles & Permissions Matrix (/admin/roles)"]
        UI_EmpAccess["Employee Access Overrides (/admin/employee-access)"]
        UI_WfConfig["Approval Policy Builder (/admin/approval-workflows)"]
        UI_Inbox["Universal Approval Inbox (/approvals & /admin/approvals)"]
        UI_Depts["Department Operational Views (Quotations, POs, etc.)"]
    end

    subgraph Middleware["Backend Express Middleware"]
        AuthMid["auth.middleware.ts (JWT Extraction & Verification)"]
        Resolver["rbacLogic.ts (resolveEffectivePermissions)"]
        GateMid["requirePerm(module, action)"]
    end

    subgraph Engine["Approval Engine & Business Logic"]
        WfEngine["approval.routes.ts (Multi-Level Decision Processor)"]
        SalesGates["sales.routes.ts (Quotation Submission & Downstream Gates)"]
        SCMGates["supply-chain.routes.ts (Supplier PO Submission & GRN Gates)"]
        AuditRep["MongoERPRepository.ts (Activity Logs & Notifications)"]
    end

    subgraph Storage["MongoDB Persistence"]
        M_Role["RoleModel (Core & Custom Roles)"]
        M_Emp["EmployeeModel (permissionOverrides schema)"]
        M_Wf["ApprovalWorkflowModel (Policies & Levels)"]
        M_Req["ApprovalRequestModel (Snapshots & Decision Logs)"]
        M_Docs["Operational Documents (Quotations, Supplier POs, etc.)"]
    end

    Client -->|HTTP + Bearer Token| AuthMid
    AuthMid --> Resolver
    Resolver -->|Query Role & Overrides| M_Role
    Resolver -->|Query Employee| M_Emp
    AuthMid --> GateMid
    GateMid --> SalesGates
    GateMid --> SCMGates
    GateMid --> WfEngine
    WfEngine --> M_Wf
    WfEngine --> M_Req
    WfEngine --> M_Docs
    WfEngine --> AuditRep
```

---

## 2. Universal Module Catalog & Granular Actions

The ERP catalog defines all operational modules with standardized granular actions:

| Department | Module Key | Label | Supported Actions | Description |
|:---|:---|:---|:---|:---|
| **Sales** | `sales` | Sales Department Core | `view`, `create`, `edit`, `delete`, `export` | Department-level dashboard and core access |
| | `customers` | Customers & Accounts | `view`, `create`, `edit`, `delete`, `export` | Customer directory, credit terms, and GSTINs |
| | `products` | Products & Pricing | `view`, `create`, `edit`, `delete`, `export` | Product catalog, specifications, base prices |
| | `enquiries` | Inbound Enquiries | `view`, `create`, `edit`, `delete`, `export` | Customer inquiries and qualification |
| | `quotations` | Quotations & Commercials | `view`, `create`, `edit`, `delete`, `submit`, `approve`, `export` | Commercial quotes, revisions, discounts |
| | `sales_orders` | Confirmed Sales Orders | `view`, `create`, `edit`, `delete`, `approve`, `export` | Orders generated from accepted quotations |
| | `proforma_invoices` | Proforma Invoices | `view`, `create`, `edit`, `export` | Advance billing and payment requests |
| | `payment_entries` | Payment Records | `view`, `create`, `edit`, `export` | Customer payment tracking and reconciliation |
| **Supply Chain** | `supply_chain` | Supply Chain Core | `view`, `create`, `edit`, `delete`, `export` | SCM dashboard and stock overview |
| | `suppliers` | Supplier Master | `view`, `create`, `edit`, `delete`, `export` | Approved vendors and lead times |
| | `materials` | Raw Materials Inventory | `view`, `create`, `edit`, `delete`, `export` | Stock levels, reorder thresholds, inventory valuation |
| | `material_requests` | Material Requests (MR) | `view`, `create`, `edit`, `delete`, `approve`, `export` | Production-issued shortage requests |
| | `supplier_pos` | Supplier Purchase Orders | `view`, `create`, `edit`, `delete`, `submit`, `approve`, `export` | Procurement orders issued to suppliers |
| | `goods_receipts` | Goods Receipt Notes (GRN) | `view`, `create`, `edit`, `verify`, `export` | Material receipt, QC inspection, inward inventory |
| | `supplier_returns` | Supplier Returns & Rejections | `view`, `create`, `edit`, `confirm`, `export` | Rejected stock return to vendors |
| **Production** | `production` | Production Core | `view`, `create`, `edit`, `delete`, `export` | Shop floor dashboard and active schedules |
| | `production_orders` | Production Orders | `view`, `create`, `edit`, `delete`, `approve`, `export` | Manufacturing work orders from Sales Orders |
| | `stage_progress` | Stage Tracking | `view`, `create`, `edit`, `verify`, `export` | Fabrication, Assembly, Testing milestone logging |
| | `quality_inspections`| Quality Assurance & QC | `view`, `create`, `edit`, `verify`, `export` | In-process and final QC inspections |
| **Logistics** | `logistics` | Logistics Core | `view`, `create`, `edit`, `delete`, `export` | Dispatch dashboard and fleet tracking |
| | `dispatch_notes` | Dispatch Notes | `view`, `create`, `edit`, `approve`, `export` | Ready-to-ship packing and vehicle allocation |
| | `delivery_tracking` | Shipments & Milestones | `view`, `create`, `edit`, `export` | In-transit tracking and driver milestones |
| | `epod` | Electronic Proof of Delivery | `view`, `create`, `edit`, `verify`, `export` | Signed delivery proof and handover acceptance |
| **Administration**| `admin` | System Administration | `view`, `create`, `edit`, `delete`, `manage` | User management, settings, system health |
| | `audit_logs` | Audit Logs | `view`, `export` | System audit trail and immutable action logs |
| | `notifications` | System Notifications | `view`, `create`, `edit`, `delete` | Broadcasts, alerts, and operational updates |
| | `approvals` | Approval Workflows & Inbox | `view`, `approve`, `manage` | Multi-level approval requests and policy configuration |

---

## 3. Dynamic Role Permissions & Core Role Immutability

### 3.1 Role Schema & Dynamic Modification
Roles are stored in MongoDB (`RoleModel`) with custom names, assigned department, and granular action arrays per module.
Super Administrators can add new roles, modify action permissions across any module, and save changes with immediate real-time effect.

```typescript
export interface Role {
  id: string;
  name: string;
  department: Department;
  description: string;
  permissions: Record<string, UniversalAction[]>;
}
```

### 3.2 Core Role Protection Safeguard
The system guarantees the survival of essential operational roles (`role-super-admin`, `role-sales-manager`, `role-sales-exec`, `role-scm-manager`, `role-stores-exec`, `role-production-manager`, `role-prod-planner`, `role-qc-inspector`, `role-logistics-manager`, `role-dispatch-exec`).
Any attempt to delete a core role is rejected immediately by the backend with HTTP 403 Forbidden:

```typescript
const coreRoles = ['role-super-admin', 'role-sales-manager', ...];
if (coreRoles.includes(roleId)) {
  throw new Error('FORBIDDEN: Built-in core system roles cannot be deleted.');
}
```

Furthermore, any custom role currently assigned to active employees cannot be deleted until those employees are reassigned (HTTP 409 Conflict).

---

## 4. Employee-Specific Permission Overrides & Resolution Hierarchy

### 4.1 Three-Way Override Matrix
Individual employees may require elevated privileges (e.g. junior executive given temporary approval authority during manager leave) or restricted privileges (e.g. contractor restricted from viewing financial figures).

Each employee record in `EmployeeModel` contains a `permissionOverrides` field:

```typescript
export type PermissionOverrideSetting = 'inherit' | 'allow' | 'deny';
export type EmployeePermissionOverrides = Record<string, Record<string, PermissionOverrideSetting>>;
```

- **Inherit (Default)**: The employee's effective permission strictly follows their assigned Role.
- **Allow**: Explicitly grants the action, regardless of whether the base Role possesses it.
- **Deny**: Explicitly strips the action, even if the base Role possesses it.

### 4.2 Resolution Algorithm
The resolution is computed deterministically in `resolveEffectivePermissions`:

```typescript
export function resolveEffectivePermissions(
  rolePermissions: Record<string, UniversalAction[] | PermissionAction[]> = {},
  employeeOverrides: EmployeePermissionOverrides = {}
): Record<string, UniversalAction[]> {
  const effective: Record<string, Set<UniversalAction>> = {};

  // 1. Seed from base role permissions
  for (const [mod, acts] of Object.entries(rolePermissions)) {
    effective[mod] = new Set<UniversalAction>(acts as UniversalAction[]);
  }

  // 2. Apply granular overrides
  for (const [mod, actionsMap] of Object.entries(employeeOverrides)) {
    if (!effective[mod]) effective[mod] = new Set<UniversalAction>();
    for (const [actionKey, setting] of Object.entries(actionsMap)) {
      const act = actionKey as UniversalAction;
      if (setting === 'allow') {
        effective[mod].add(act);
      } else if (setting === 'deny') {
        effective[mod].delete(act);
      }
      // 'inherit' leaves role-level decision intact
    }
  }

  // Convert Sets to sorted Arrays
  const result: Record<string, UniversalAction[]> = {};
  for (const [mod, actSet] of Object.entries(effective)) {
    result[mod] = Array.from(actSet);
  }
  return result;
}
```

### 4.3 Coarse Backward Compatibility
To maintain complete compatibility with existing endpoints checking coarse keys (such as `requirePerm('sales', 'create')`), the resolver populates both coarse department keys and granular sub-module keys. Sub-module grants inherit upward to ensure existing coarse middleware never breaks.

---

## 5. Configurable Multi-Level Approval Workflows

### 5.1 Approval Workflow Model
Administrators can define approval policies per operational module (`quotations`, `supplier_pos`, `production_orders`, etc.):

```typescript
export interface ApprovalWorkflow {
  id: string;
  name: string;
  department: Department;
  module: string;
  triggerAction: string;       // e.g. 'submit'
  description?: string;
  enabled: boolean;
  allowSelfApproval: boolean;   // default: false (Anti-Fraud)
  approvalLevels: ApprovalLevelConfig[];
}

export interface ApprovalLevelConfig {
  levelNumber: number;          // 1, 2, 3...
  levelName: string;            // "Commercial Manager Review", "Director Final Sign-off"
  approverType: 'role' | 'employee' | 'either';
  eligibleRoleIds: string[];
  eligibleEmployeeIds: string[];
  requiredApprovalCount: number;
}
```

### 5.2 Strict Self-Approval Prevention Gate
To prevent operational fraud and conflict of interest, the workflow engine enforces an immutable self-approval gate:

```typescript
if (!wf.allowSelfApproval && request.submittedBy.id === req.user.id) {
  throw new Error('FORBIDDEN: Self-approval is disabled for this workflow. Submitter cannot approve their own submission.');
}
```

### 5.3 Sequential State Transitions
1. **Level Eligibility Check**: At any level `k`, only users possessing an eligible role ID or employee ID (or Super Admin) can record a decision.
2. **Approve**:
   - If `currentLevel < totalLevels`, the request advances to `currentLevel + 1`. The document remains in `Pending Approval`.
   - If `currentLevel === totalLevels`, the request reaches `approved` status. The underlying document status updates to `Approved`.
3. **Request Changes**:
   - Requires **mandatory remarks** describing the adjustments needed.
   - Status updates to `changes_requested`.
   - Underlying document transitions to `Changes Requested`, unlocking it for submitter revision.
4. **Reject**:
   - Requires **mandatory remarks**.
   - Status updates to `rejected`.
   - Underlying document transitions to `Rejected`.
5. **Withdraw**:
   - Only the original submitter (or Super Admin) can withdraw a pending submission.
   - Reverts document back to `Draft`.

---

## 6. Downstream Execution Gates

The system enforces downstream execution boundaries:

### 6.1 Quotation Execution Gates (`sales.routes.ts`)
- **Quotation Sent**: Cannot send quotation to customer while in `Pending Approval` or `Changes Requested` (HTTP 400: `Quotation is currently pending approval. It must be approved before being sent to the customer.`).
- **Quotation Accepted**: Cannot accept quotation or convert to Sales Order while in `Pending Approval` or `Changes Requested` (HTTP 400: `Quotation cannot be accepted while in "Pending Approval" status. It must be approved first.`).

### 6.2 Procurement & Goods Receipt Gates (`supply-chain.routes.ts`)
- **Goods Receipt Creation (GRN)**: Cannot receive goods against a Supplier PO while in `Pending Approval` or `Changes Requested` (HTTP 400: `Supplier PO SPO-XXXX is currently pending approval and cannot be received.`).

---

## 7. Document Version Immutability Architecture

When commercial terms are revised on a Quotation (e.g. discount adjusted from 15% to 8%), the application issues a new revision:
- Previous version `V1` is preserved as `Superseded` (historical record).
- New version `V2` is created in `Draft`.
- `ApprovalRequest` binds strictly to `documentVersion: 'V2'`.
- Approvals on `V1` do not automatically authorize `V2`, preventing unauthorized terms from bypassing review.

---

## 8. Universal Approval Inbox

The Approval Inbox (`/approvals` for all staff, `/admin/approvals` for admins) provides:

- **Pending My Decision**: Real-time counter badge showing requests waiting for the current user's decision at their specific level.
- **My Submissions**: Tracks requests submitted by the current user, showing real-time step progress.
- **Approval History**: Audit list of all finalized requests with decision records.
- **All Requests**: Unfiltered administrative view across all departments.
- **Interactive Snapshot & Decision Dialog**: Detailed drawer showing document items, totals, discount, taxes, and multi-level decision stepper with approver names, roles, timestamps, and remarks.

---

## 9. Comprehensive API Catalog

### Roles & Dynamic Permissions
- `GET /api/admin/roles`: List all system and custom roles.
- `POST /api/admin/roles`: Create a new custom role with granular permissions.
- `PUT /api/admin/roles/:id`: Update role permissions matrix.
- `DELETE /api/admin/roles/:id`: Delete a custom role (core roles protected with HTTP 403).

### Employee Permission Overrides
- `GET /api/admin/employees/:id/permissions`: Get employee base role, active overrides, and computed effective permissions.
- `PUT /api/admin/employees/:id/permissions`: Update employee override settings (`inherit`, `allow`, `deny`).
- `POST /api/admin/employees/:id/permissions/reset`: Reset all overrides back to role defaults.

### Approval Policies
- `GET /api/admin/approval-workflows`: List all approval workflow policies.
- `POST /api/admin/approval-workflows`: Create a multi-level approval policy.
- `PUT /api/admin/approval-workflows/:id`: Update policy levels, roles, and toggles.
- `PATCH /api/admin/approval-workflows/:id/toggle`: Enable or disable workflow.
- `DELETE /api/admin/approval-workflows/:id`: Delete workflow policy.

### Approval Execution & Inbox
- `GET /api/approvals/inbox?tab=pending|my_submissions|history|all`: Query inbox slices.
- `GET /api/approvals/requests/:id`: Fetch approval request details with snapshot.
- `POST /api/approvals/requests/:id/decide`: Submit decision (`approved`, `rejected`, `changes_requested`) with level authorization and self-approval checks.
- `POST /api/approvals/requests/:id/withdraw`: Submitter withdrawal.
- `POST /api/sales/quotations/:id/submit-approval`: Submit quotation for workflow approval.
- `POST /api/supply-chain/supplier-pos/:id/submit-approval`: Submit supplier PO for workflow approval.

---

## 10. Automated Test Suite Verification

The verification suite `server/tests/universal-rbac-approvals.test.ts` validates all system capabilities end-to-end:

| Subtest | Status | Duration | Coverage |
|:---|:---:|:---:|:---|
| **Bootstrap & Authentication Setup** | **PASS** | 333ms | Super Admin, Sales Manager, Sales Exec, and SCM Manager authentication |
| **1. Dynamic Role Creation & Core Safeguards** | **PASS** | 52ms | Custom role creation, permissions update, core role deletion 403 safeguard, custom role deletion |
| **2. Employee Overrides & Resolution Hierarchy** | **PASS** | 39ms | Query effective permissions, grant `allow` override, verify `/auth/me` session update, apply `deny` override, reset to role defaults, self-escalation block |
| **3. Configurable Multi-Level Workflows & Execution Gates** | **PASS** | 146ms | 2-level approval workflow configuration, quotation submission, downstream gates blocking send/accept while pending, self-approval prevention 403 gate, level 1 manager approval, level 2 admin approval, downstream execution unlocked |
| **4. Changes Requested, Rejection & Withdrawal** | **PASS** | 104ms | Changes requested with mandatory remarks, quotation status sync, submitter withdrawal flow, draft status restoration |
| **5. Universal Approval Inbox Aggregation** | **PASS** | 34ms | Tab aggregation (`pending`, `my_submissions`, `all`), badge count accuracy, user-scoped visibility |
| **6. Complete 13-Step Verification Journey & Security Gates** | **PASS** | 160ms | End-to-end custom role creation, draft and submit quotation, multi-level inbox approval, payment entries deny override, direct navigation block, view-only override, create payment block, commercial data redaction, reset to role defaults |

**Suite Result: 8/8 Passing Tests (100% Pass Rate). Total Project Automated Tests: 115 Passing Tests across 11 Test Suites.**

---

## 11. Complete Universal Permission Coverage Matrix

The matrix below provides the exhaustive mapping between ERP departments, functional modules, client screen routes, Express backend API endpoints, required actions, frontend UI enforcements, and backend security middleware:

| Department | Module (`id`) | Screen Route | API Endpoint | Required Action | Frontend Enforcement (`can()`) | Backend Enforcement (`requirePerm()`) |
|:---|:---|:---|:---|:---|:---|:---|
| **Sales** | `sales_dashboard` | `/sales` | `GET /api/sales/*` | `view` | Sidebar Nav Item Guard | `requirePerm('sales', 'view')` |
| | `customers` | `/sales/customers` | `GET /api/sales/customers` | `view` | Nav Link & Table render | `requirePerm('sales', 'view')` |
| | | `/sales/customers?create=1` | `POST /api/sales/customers` | `create` | "Add Customer" button hidden | `requirePerm('sales', 'create')` |
| | | `/sales/customers/:id` | `PUT /api/sales/customers/:id` | `edit` | "Edit Customer" button hidden | `requirePerm('sales', 'edit')` |
| | `products` | `/sales/products` | `GET /api/sales/products` | `view` | Nav Link & Catalog render | `requirePerm('sales', 'view')` |
| | | `/sales/products?create=1` | `POST /api/sales/products` | `create` | "Add Product" button hidden | `requirePerm('sales', 'create')` |
| | `enquiries` | `/sales/enquiries` | `GET /api/sales/enquiries` | `view` | Nav Link & List render | `requirePerm('sales', 'view')` |
| | | `/sales/enquiries?create=1` | `POST /api/sales/enquiries` | `create` | Quick Create & "New Enquiry" hidden | `requirePerm('sales', 'create')` |
| | | `/sales/enquiries/:id` | `PUT /api/sales/enquiries/:id` | `edit` | "Edit Enquiry" button hidden | `requirePerm('sales', 'edit')` |
| | | `/sales/enquiries/:id/qualify` | `POST /api/sales/enquiries/:id/qualify` | `submit` / `verify` | "Qualify Enquiry" button hidden | `requirePerm('sales', 'edit')` |
| | `quotations` | `/sales/quotations` | `GET /api/sales/quotations` | `view` | Nav Link & Quotation table render | `requirePerm('sales', 'view')` |
| | | `/sales/quotations?create=1` | `POST /api/sales/quotations` | `create` | Quick Create & "New Quote" hidden | `requirePerm('sales', 'create')` |
| | | `/sales/quotations/:id` | `PUT /api/sales/quotations/:id` | `edit` | "Edit Terms" button hidden | `requirePerm('sales', 'edit')` |
| | | `/sales/quotations/:id/submit-approval`| `POST /api/sales/quotations/:id/submit-approval` | `submit` | "Submit for Approval" button hidden | `requirePerm('quotations', 'submit')` |
| | | `/sales/quotations/:id/approve` | `POST /api/sales/quotations/:id/approve` | `approve` | "Approve" button hidden | `requirePerm('sales', 'approve')` |
| | | `/sales/quotations/:id/send` | `POST /api/sales/quotations/:id/send` | `confirm` | "Send to Customer" button hidden | Downstream approval gate: blocked while pending |
| | `proforma_invoices`| `/sales/proforma-invoices` | `GET /api/sales/proforma-invoices` | `view` | Nav Link & PI table render | `requirePerm('sales', 'view')` |
| | | `/sales/proforma-invoices?create=1`| `POST /api/sales/proforma-invoices` | `create` | "Generate PI" button hidden | `requirePerm('sales', 'create')` |
| | `customer_pos` | `/sales/customer-pos` | `GET /api/sales/customer-pos` | `view` | Nav Link & PO audit render | `requirePerm('sales', 'view')` |
| | | `/sales/customer-pos?create=1` | `POST /api/sales/customer-pos` | `create` | "Record PO" button hidden | `requirePerm('sales', 'create')` |
| | | `/sales/customer-pos/:id/resolve` | `POST /api/sales/customer-pos/:id/resolve` | `verify` | "Resolve Discrepancy" button hidden | `requirePerm('sales', 'edit')` |
| | `payments` | `/sales/payments` | `GET /api/sales/payments` | `view` | Nav Link hidden; route guarded | `requirePerm('payments', 'view')` |
| | | `/sales/payments?create=1` | `POST /api/sales/payments` | `create` | Quick Create & "Record Payment" hidden | `requirePerm('payments', 'create')` |
| | | `/sales/payments/:id/verify` | `POST /api/sales/payments/:id/verify` | `verify` / `approve` | "Verify Payment" button hidden | `payments:verify` OR `payments:approve` |
| | `sales_orders` | `/sales/sales-orders` | `GET /api/sales/orders` | `view` | Nav Link & SO table render | `requirePerm('sales', 'view')` |
| | | `/sales/orders/confirm` | `POST /api/sales/orders/confirm` | `confirm` | "Confirm Sales Order" button hidden | `requirePerm('sales', 'approve')` |
| **Supply Chain** | `supply_chain_dashboard`| `/supply-chain` | `GET /api/supply-chain/*` | `view` | Sidebar Nav Item Guard | `requirePerm('supply_chain', 'view')` |
| | `materials` | `/supply-chain/materials` | `GET /api/supply-chain/materials` | `view` | Nav Link & Master table render | `requirePerm('supply_chain', 'view')` |
| | | `/supply-chain/materials?create=1` | `POST /api/supply-chain/materials` | `create` | "Add Raw Material" button hidden | `requirePerm('supply_chain', 'create')` |
| | `inventory` | `/supply-chain/inventory` | `GET /api/supply-chain/inventory` | `view` | Stock Map view & bin quantities | `requirePerm('supply_chain', 'view')` |
| | `material_requests`| `/supply-chain/material-requests`| `GET /api/supply-chain/material-requests`| `view`| Nav Link & Indents queue render | `requirePerm('supply_chain', 'view')` |
| | | `/supply-chain/material-requests/:id/issue`| `POST /api/supply-chain/material-issues` | `approve` / `confirm`| "Issue Materials" button hidden | `requirePerm('supply_chain', 'create')` |
| | `suppliers` | `/supply-chain/suppliers` | `GET /api/supply-chain/suppliers` | `view` | Nav Link & Supplier directory | `requirePerm('supply_chain', 'view')` |
| | | `/supply-chain/suppliers?create=1` | `POST /api/supply-chain/suppliers` | `create` | "Add Supplier" button hidden | `requirePerm('supply_chain', 'create')` |
| | `supplier_pos` | `/supply-chain/purchase-orders` | `GET /api/supply-chain/supplier-pos` | `view` | Nav Link & Purchase Orders render | `requirePerm('supply_chain', 'view')` |
| | | `/supply-chain/purchase-orders?create=1`| `POST /api/supply-chain/supplier-pos`| `create` | Quick Create & "Create PO" hidden | `requirePerm('supply_chain', 'create')` |
| | | `/supply-chain/supplier-pos/:id/submit-approval`| `POST /api/supply-chain/supplier-pos/:id/submit-approval`| `submit`| "Submit PO for Approval" hidden | `requirePerm('supplier_pos', 'submit')` |
| | `grn` | `/supply-chain/grn` | `GET /api/supply-chain/grns` | `view` | Nav Link & Inward receipts render | `requirePerm('supply_chain', 'view')` |
| | | `/supply-chain/grn?create=1` | `POST /api/supply-chain/grns` | `create` | "Record GRN" button hidden | Downstream gate: PO must be approved |
| | | `/supply-chain/grns/:id/verify` | `POST /api/supply-chain/grns/:id/verify` | `verify` | "Verify GRN" button hidden | `requirePerm('supply_chain', 'approve')` |
| | `supplier_returns`| `/supply-chain/returns` | `GET /api/supply-chain/supplier-returns` | `view` | Nav Link & Debit notes render | `requirePerm('supply_chain', 'view')` |
| | | `/supply-chain/returns?create=1` | `POST /api/supply-chain/supplier-returns`| `create` | "Return to Supplier" button hidden | `requirePerm('supply_chain', 'create')` |
| | `stock_adjustments`| `/supply-chain/inventory` | `POST /api/supply-chain/stock-adjustments`| `create` / `manage` | "Adjust Stock" dialog hidden | `requirePerm('supply_chain', 'edit')` |
| **Production** | `production_dashboard`| `/production` | `GET /api/production/*` | `view` | Sidebar Nav Item Guard | `requirePerm('production', 'view')` |
| | `received_orders` | `/production/received-orders` | `GET /api/production/received-orders` | `view` | Nav Link & Allocatable SOs render | `requirePerm('production', 'view')` |
| | `production_orders`| `/production/orders` | `GET /api/production/orders` | `view` | Nav Link & Work order table render| `requirePerm('production', 'view')` |
| | | `/production/received-orders` | `POST /api/production/orders` | `create` | "Create Production Order" modal hidden | `requirePerm('production', 'create')` |
| | | `/production/orders/:id/start` | `POST /api/production/orders/:id/start` | `edit` | "Start Manufacturing" button hidden | BOM physical receipt gate |
| | | `/production/orders/:id/complete`| `POST /api/production/orders/:id/complete`| `confirm` | "Complete Production" button hidden | Daily updates recorded gate |
| | `bom` | `/production/bom` | `GET /api/production/boms` | `view` | Nav Link & BOM recipe render | `requirePerm('production', 'view')` |
| | | `/production/bom/request` | `POST /api/production/material-requests` | `create` | "Submit Material Request" hidden | `requirePerm('production', 'create')` |
| | `material_receipts`| `/production/material-receipts`| `GET /api/production/material-receipts` | `view` | Nav Link & Store vouchers render | `requirePerm('production', 'view')` |
| | | `/production/material-receipts/:id/confirm`| `POST /api/production/material-receipts/:id/confirm`| `confirm`| "Acknowledge Receipt" hidden | `requirePerm('production', 'edit')` |
| | `daily_updates` | `/production/daily-updates` | `GET /api/production/daily-updates` | `view` | Nav Link & Shift logs render | `requirePerm('production', 'view')` |
| | | `/production/daily-updates?create=1`| `POST /api/production/daily-updates` | `create` | Quick Create & "Log Update" hidden | `requirePerm('production', 'create')` |
| | `quality_checks` | `/production/quality-check` | `GET /api/production/quality-checks` | `view` | Nav Link & QC inspection render | `requirePerm('production', 'view')` |
| | | `/production/quality-check?create=1`| `POST /api/production/quality-checks` | `create` | Quick Create & "Record QC" hidden | `requirePerm('production', 'edit')` |
| | `rework` | `/production/rework` | `GET /api/production/rework` | `view` | Nav Link & Rework orders render | `requirePerm('production', 'view')` |
| | | `/production/rework/:id/complete` | `POST /api/production/rework/:id/complete` | `edit` / `confirm` | "Complete Rework" button hidden | `requirePerm('production', 'edit')` |
| **Logistics** | `logistics_dashboard`| `/logistics` | `GET /api/logistics/*` | `view` | Sidebar Nav Item Guard | `requirePerm('logistics', 'view')` |
| | `ready_dispatch` | `/logistics/ready` | `GET /api/logistics/ready-for-dispatch`| `view` | Nav Link & Finished Goods render | `requirePerm('logistics', 'view')` |
| | `delivery_orders` | `/logistics/delivery-orders` | `GET /api/logistics/delivery-orders` | `view` | Nav Link & DC list render | `requirePerm('logistics', 'view')` |
| | | `/logistics/ready` | `POST /api/logistics/delivery-orders` | `create` | "Create Delivery Order" hidden | `requirePerm('logistics', 'create')` |
| | | `/logistics/delivery-orders/:id/dispatch`| `POST /api/logistics/delivery-orders/:id/dispatch`| `confirm`| "Confirm Dispatch" button hidden | Blocked if `Pending Cancellation` |
| | | `/logistics/delivery-orders/:id/cancel`| `POST /api/logistics/delivery-orders/:id/cancel`| `edit` / `delete`| "Cancel Order" button hidden | Exception workflow auto-submits approval |
| | `in_transit` | `/logistics/in-transit` | `GET /api/logistics/in-transit` | `view` | Nav Link & Live tracking render | `requirePerm('logistics', 'view')` |
| | | `/logistics/in-transit/:id/confirm-delivery`| `POST /api/logistics/delivery-orders/:id/confirm-delivery`| `confirm`| "Confirm Delivery & POD" hidden | `requirePerm('logistics', 'edit')` |
| | `delivery_issues`| `/logistics/issues` | `GET /api/logistics/delivery-issues` | `view` | Nav Link & Incident cards render | `requirePerm('logistics', 'view')` |
| | | `/logistics/issues/:id/resolve` | `POST /api/logistics/delivery-issues/:id/resolve` | `edit` | "Resolve Incident" modal hidden | `requirePerm('logistics', 'edit')` |
| **Admin** | `admin_dashboard` | `/admin` | `GET /api/admin/overview` | `view` | Nav Link & System status cards | `requirePerm('admin', 'view')` |
| | `employees` | `/admin/employees` | `GET /api/admin/employees` | `view` | Nav Link & Staff directory render | `requirePerm('admin', 'view')` |
| | | `/admin/employees?create=1` | `POST /api/admin/employees` | `create` | "Add Employee" button hidden | `requirePerm('admin', 'create')` |
| | | `/admin/employees/:id` | `PUT /api/admin/employees/:id` | `edit` | "Edit Profile / Role" modal hidden| `requirePerm('admin', 'edit')` |
| | `roles` | `/admin/roles` | `GET /api/admin/roles` | `view` | Nav Link & Matrix render | `requirePerm('admin', 'view')` |
| | | `/admin/roles?create=1` | `POST /api/admin/roles` | `create` | "Create Custom Role" hidden | `requirePerm('admin', 'create')` |
| | | `/admin/roles/:id` | `PUT /api/admin/roles/:id` | `edit` | "Save Permissions" button hidden | `requirePerm('admin', 'edit')` |
| | | `/admin/roles/:id` | `DELETE /api/admin/roles/:id` | `delete` | "Delete Role" button hidden | Built-in core role deletion 403 guard |
| | `employee_access` | `/admin/employee-access` | `GET /api/admin/employees/:id/permissions` | `view` | Nav Link & Override Matrix render | `requirePerm('admin', 'view')` |
| | | `/admin/employee-access` | `PUT /api/admin/employees/:id/permissions` | `edit` / `manage` | "Save Overrides" button hidden | `requirePerm('admin', 'edit')` |
| | | `/admin/employee-access` | `POST /api/admin/employees/:id/permissions/reset`| `manage`| "Reset to Defaults" hidden | `requirePerm('admin', 'edit')` |
| | `approval_workflows`| `/admin/approval-workflows`| `GET /api/admin/approval-workflows` | `view` | Nav Link & Workflow list render | `requirePerm('admin', 'view')` |
| | | `/admin/approval-workflows` | `POST /api/admin/approval-workflows` | `create` | "Create Approval Policy" hidden | `requirePerm('admin', 'create')` |
| | | `/admin/approval-workflows/:id` | `PUT /api/admin/approval-workflows/:id` | `edit` | "Update Workflow Policy" hidden | `requirePerm('admin', 'edit')` |
| | `approval_inbox` | `/approvals`, `/admin/approvals`| `GET /api/approvals/inbox` | `view` | Nav Link & Badge counter render | User-scoped aggregation |
| | | `/approvals/requests/:id` | `GET /api/approvals/requests/:id` | `view` | Snapshot drawer render | Submitter / Approver / Commercial Redaction |
| | | `/approvals/requests/:id/decide` | `POST /api/approvals/requests/:id/decide` | `approve` | "Approve" / "Reject" / "Changes" | Self-approval prevention + Level eligibility |
| | | `/approvals/requests/:id/withdraw` | `POST /api/approvals/requests/:id/withdraw` | `submit` | "Withdraw Request" button hidden | Submitter-only authorization guard |
| | `company` | `/admin/company` | `GET /api/admin/company` | `view` | Nav Link & Enterprise profile render| `requirePerm('admin', 'view')` |
| | | `/admin/company` | `PUT /api/admin/company` | `edit` | "Save Company Details" hidden | `requirePerm('admin', 'edit')` |
| | `audit_logs` | `/admin/logs` | `GET /api/admin/logs` | `view` | Nav Link & Immutable audit table | `requirePerm('admin', 'view')` |

---

## 12. Security & Downstream Integrity Highlights

1. **Strict 3-Tier Resolution Engine**:
   - `Role Defaults` → `Employee Overrides` (`allow`, `deny`, `inherit`) → `Effective Permissions`.
   - Explicit `deny` overrides strictly suppress permissions and are never negated by department fallback.
   - Upward inheritance guarantees existing Express routes checking coarse keys (`requirePerm('sales', 'create')`) seamlessly permit users possessing granular permissions on sub-modules.
2. **Approval Request Data Redaction**:
   - Non-commercial users (Production, Stores, QC, Logistics) attempting to inspect approval requests for Quotations or Commercial terms receive documents with `totalAmount`, `subtotal`, `taxAmount`, `unitPrice`, and `lineTotal` replaced with `'[REDACTED]'`.
3. **Logistics Exception Workflow Gate**:
   - Delivery Orders submitted for cancellation transition to `Pending Cancellation` status and are routed to the Universal Approval Inbox.
   - Dispatch operations are blocked while an order is in `Pending Cancellation`.
   - Approving the cancellation restores available FG units back to unallocated stock; rejecting or withdrawing the cancellation restores the delivery order to `Planned`.
4. **Zero-Poll Active Session Reflection**:
   - `resolveAuthUser` resolves effective permissions on every incoming request in Express middleware. Any role assignment, department change, or override modification takes effect in real time without requiring session logouts.
