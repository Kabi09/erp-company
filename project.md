# CRYO Enterprise ERP 2.0 — Project Architecture & Implementation Record

## 1. Project Overview
**CRYO Enterprise ERP 2.0** is an industrial, multi-department Enterprise Resource Planning web application engineered for cryogenic and precision thermal manufacturing operations. It automates and connects the complete quote-to-cash, procure-to-pay, plan-to-produce, quality-control, and order-to-delivery lifecycle across four strictly separated operational departments plus centralized administration and tracking:

`Customer Enquiry → Follow-up → Qualified Enquiry → Quotation (V1/V2/V3) → Proforma Invoice → Customer PO → Payment Entry → Sales Order → Production Order & Duration Plan → BOM Request → Supply Chain Material Issue / Purchase & GRN Verification → Physical Receipt → Manufacturing & Daily Updates → Quality Check → Rework / Acceptance → Logistics Dispatch (Own Vehicle / Courier) → Delivery Completion`

---

## 2. Architecture & Technology Stack
- **Frontend**: React 19 + TypeScript + Vite + React Router v7 + Tailwind CSS v4 (`@custom-variant dark` light & dark modes) + Lucide Icons.
- **Backend**: Express.js (`server.ts`, running on port 3000 with Vite middleware in development and static `dist/` serving in production).
- **Authentication & Authorization**: JWT Bearer tokens (`jsonwebtoken`), bcrypt password hashing (`bcryptjs`), and module-by-action Role-Based Access Control (RBAC) enforced on both Express API middleware (`server/auth.ts`) and React route guards (`src/App.tsx`).
- **Persistence**: Production-ready MongoDB + Mongoose 9 persistence layer with connection pooling, graceful shutdown, replica set/Atlas auto-detection, and atomic document numbering via `$inc` on `DocCounterModel`. Historical JSON snapshot preserved in `data/cryo-erp-db.json` and timestamped backups in `data/backups/`. Normal operations execute 100% on MongoDB without JSON fallback.
- **Pure Business Logic & Unit Tests**: Decoupled deterministic calculators and validators in `src/utils/erpLogic.ts`, verified by `node:test` (`src/utils/erpLogic.test.ts`, `server/tests/mongo-integration.test.ts`, and `server/tests/api-lifecycle.test.ts`).

---

## 3. Department Modules & Screens

### Department 1: Sales Management (`/sales`, Blue Accent)
- **Dashboard** (`/sales`): Pipeline KPIs, overdue follow-ups, pending quotations, recent orders, quick actions.
- **Enquiries** (`/sales/enquiries`, `/sales/enquiries/:id`): Multi-product enquiry capture, customer snapshot, source tracking, qualification/rejection workflow, linked follow-up timeline.
- **Qualified Enquiries** (`/sales/qualified`): Filtered conversion queue ready for Quotation creation.
- **Follow-ups** (`/sales/follow-ups`): Unified Enquiry & Quotation follow-up log with outcome-driven state updates (`Accepted`, `Rejected`, `Negotiation`, `Pending`).
- **Customers & Products** (`/sales/customers`, `/sales/products`): Master catalogs with customer history tabs and reusable product BOM templates + production stage definitions.
- **Quotations** (`/sales/quotations`): Dynamic product highlights, automatic totals/discounts/GST, immutable revision chains (`V1 → V2 → V3` with prior versions marked `Superseded`), printable/downloadable PDF preview.
- **Proforma Invoices** (`/sales/proforma-invoices`): Generated strictly from `Accepted` quotation versions with company bank details and PDF preview.
- **Customer POs** (`/sales/customer-pos`): PO recording against PI with attachment upload and discrepancy flagging/resolution gate.
- **Payment Entries** (`/sales/payments`): Advance, partial, and full payments with duplicate transaction reference protection, overpayment blocking, and manager verification.
- **Sales Orders** (`/sales/sales-orders`): Strict commercial confirmation gate (Accepted Quote + PI + Discrepancy-Free Customer PO + Verified Payment or agreed credit), separate commercial vs. fulfillment vs. payment statuses.
- **Sales Reports** (`/sales/reports`): Conversion funnel, revenue collected vs. outstanding balance.

### Department 2: Supply Chain Management (`/supply-chain`, Amber Accent)
- **Dashboard** (`/supply-chain`): Pending MRs, low-stock materials, pending GRN verifications, open Supplier POs.
- **Material Requests** (`/supply-chain/material-requests`): Live BOM requirements vs. ledger stock, shortage indicators, partial/full **Issue Available** workflow.
- **Materials & Inventory / Stock** (`/supply-chain/materials`, `/supply-chain/inventory`): Raw material catalog, ledger-computed live stock levels, reorder alerts, authorized stock adjustments.
- **Suppliers** (`/supply-chain/suppliers`): Vendor master and supplied material mapping.
- **Purchase Orders** (`/supply-chain/purchase-orders`): Request-Based (shortage-driven) and Normal restock Supplier POs with printable PDF preview.
- **GRN & Material Verification** (`/supply-chain/grn`, `/supply-chain/verification`): Goods Receipt recording against Supplier POs (or Replacement GRNs) with mandatory two-step verification (`Accepted + Rejected = Received`; only accepted stock enters usable inventory).
- **Supplier Returns** (`/supply-chain/returns`): Formal return notes for rejected GRN stock with optional replacement tracking.
- **Material Issues** (`/supply-chain/issues`): Audit log of all store-to-production issue vouchers and acknowledgement status.
- **Stock History** (`/supply-chain/stock-history`): Immutable stock movement ledger (`Opening Balance`, `GRN Accepted`, `Material Issue`, `Stock Adjustment`).
- **Supply Chain Reports** (`/supply-chain/reports`): Stock valuation summary, procurement & rejection analytics.

### Department 3: Production Management (`/production`, Purple Accent)
- **Dashboard** (`/production`): Unallocated SOs, active orders, awaiting materials, QC pending, rework counts.
- **Received Sales Orders** (`/production/received-orders`): Confirmed SOs with allocatable unit tracking and **Create Production Order & Duration Plan** modal.
- **Production Orders / Active / Completed** (`/production/orders`, `/production/orders/:id`, `/production/active`, `/production/completed`): Full lifecycle views with Overview, Materials, Daily Updates, QC, and History tabs plus Start & Complete Manufacturing controls.
- **Production Planning** (`/production/planning`): Schedule & duration visibility across planned/active orders.
- **BOM & Material Requests** (`/production/bom`): Auto-loads product BOM templates, multiplies by production quantity, shows real-time store stock/shortage, and submits Material Requests to Supply Chain.
- **Material Receipts** (`/production/material-receipts`): Physical receipt acknowledgement of Supply Chain issues; automatically transitions Production Order to `Ready to Start` when all BOM materials are received.
- **Daily Production Updates** (`/production/daily-updates`): Stage-by-stage floor logs with hours, completed qty, blockers, and optional progress photo.
- **Quality Check (QC)** (`/production/quality-check`): Multi-point technical checklist (`Visual`, `Electrical`, `Thermal`, `Calibration`). `Accepted` releases units to Logistics; `Rejected` auto-creates a Rework Order.
- **Rework** (`/production/rework`): Corrective action tracking that returns finished rework back to `QC Pending` for formal reinspection.
- **Production Reports** (`/production/reports`): Output metrics, QC pass/fail rates, rework summary.

### Department 4: Logistics & Delivery Management (`/logistics`, Teal Accent)
- **Dashboard** (`/logistics`): Ready-for-dispatch count, planned deliveries, in-transit shipments, delivered orders, open issues.
- **Ready for Dispatch** (`/logistics/ready`): Strict QC-gating—only `Completed` QC-accepted production orders appear here. Supports conditional transport fields:
  - **Own Vehicle**: Vehicle Number, Driver Name, Driver Phone.
  - **Courier**: Courier Company, Tracking/AWB Number, Courier Contact.
- **Delivery Orders / In Transit / Completed / History** (`/logistics/delivery-orders`, `/logistics/in-transit`, `/logistics/completed`, `/logistics/history`): Dispatch confirmation (Challan & Courier AWB validation) and final Delivery Confirmation (Received By, POD upload, Good condition, or Delivery Issue reporting). Delivery updates SO fulfillment status without falsely marking unpaid balances as Paid.
- **Delivery Issues** (`/logistics/issues`): Exception tracking (`Delay`, `Failed Attempt`, `Damage`, `Shortage`) with resolution and transit retry.
- **Logistics Reports** (`/logistics/reports`): Fleet vs. Courier breakdown and delivery completion totals.

### Shared Supporting & Administration Modules
- **Centralized Order Tracking** (`/tracking`, `/tracking/:soId`): 12-stage visual end-to-end timeline linking Enquiry through final Delivery with permission-gated deep links.
- **Notifications** (`/notifications`): Department-scoped handoff alerts with read/unread filtering.
- **User Profile** (`/profile`): Self-service profile/password updates and RBAC permission viewer.
- **Administration** (`/admin/*`, Slate Accent): Admin Dashboard, Employee CRUD & status toggle, interactive Role × Module × Action RBAC Matrix, Company Profile & Bank Details, Demo Data Restore / Clean Operational Reset, and full Activity Audit Logs.

---

## 4. Data Model & Key Integrity Rules
- **Immutable Ledger Inventory**: Current stock is never hand-edited; it is always derived by summing `StockTransaction.quantityDelta` (`computeMaterialStockMap`), preventing drift and negative stock.
- **Strict Workflow Gates**:
  - Quotations require `Qualified` enquiries; revisions supersede prior versions.
  - Proforma Invoices require `Accepted` quotations and prevent duplicate active PIs.
  - Sales Orders require Accepted Quotation + PI + Customer PO (with no unresolved discrepancy) + Verified Payment (or explicit credit terms).
  - Production cannot start until all BOM materials are physically acknowledged by Production (`Ready to Start`).
  - Manufacturing completion requires at least one Daily Production Update.
  - Logistics cannot dispatch units until QC marks the Production Order `Accepted` (`Completed`).
  - Completing delivery updates `SalesOrder.fulfillmentStatus = 'Delivered'` while leaving `SOPaymentStatus` computed strictly from verified payments.

---

## 5. REST API Structure (`/api/*`)
- **Auth**: `POST /api/auth/login`, `GET /api/auth/me`, `PATCH /api/auth/profile`
- **State & Alerts**: `GET /api/erp/bootstrap`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`
- **Sales**: `/api/sales/{customers,products,enquiries,follow-ups,quotations,proforma-invoices,customer-pos,payments,sales-orders}`
- **Supply Chain**: `/api/supply-chain/{materials,stock-adjustment,suppliers,material-issues,supplier-pos,grns,supplier-returns}`
- **Production**: `/api/production/{orders,boms,material-receipts,daily-updates,quality-checks,rework}`
- **Logistics**: `/api/logistics/{delivery-orders,delivery-issues}`
- **Admin**: `/api/admin/{employees,roles,company,reset-demo}`

---

## 6. Demo Accounts (Password: `cryo123`)
| Role | Email | Default Department |
| --- | --- | --- |
| Super Admin | `admin@cryoerp.com` | All Departments + Admin |
| Sales Manager | `sales.mgr@cryoerp.com` | Sales Management |
| Sales Executive | `sales.exec@cryoerp.com` | Sales Management |
| Supply Chain Manager | `sc.mgr@cryoerp.com` | Supply Chain Management |
| Production Manager | `prod.mgr@cryoerp.com` | Production Management |
| Logistics Manager | `log.mgr@cryoerp.com` | Logistics & Delivery |

---

## 7. Technical Decisions & UX Patterns
- **Responsive Navigation**: Desktop collapsible deep-navy sidebar + top header with breadcrumbs, global search (`⌘K`/modal), light/dark toggle, notifications badge, and profile menu; mobile compact header + fixed 5-tab bottom nav (`Home`, `Work`, `Create`, `Alerts`, `More`) with department-aware action sheets and mobile card layouts for all data tables (zero horizontal page overflow).
- **Document Previews**: Self-contained modal previews (`DocumentPreviewModal.tsx`) with print-friendly CSS and HTML download, avoiding blocked iframe popups (`window.open` / `window.alert`).
- **Typography**: `Plus Jakarta Sans` + `Public Sans` + `IBM Plex Mono` with `tabular-nums` on all prices, stock quantities, and document numbers.

---

## 8. Completed Features, Known Issues & Pending Work
- **Completed**:
  - Full Express + JWT + bcrypt + RBAC backend with complete MongoDB + Mongoose persistence.
  - Phase 2 Backend Modularization into enterprise tiered architecture: `server/config/`, `server/middleware/`, `server/routes/` (`auth`, `sales`, `supply-chain`, `production`, `logistics`, `admin`), `server/repositories/`, `server/models/`, `server/validators/`, `server/services/`, and `server/tests/`.
  - Phase 3 MongoDB Migration & Optimization:
    - 29 Concrete Mongoose Models + `DocCounterModel` across `server/models/`.
    - Executable JSON-to-MongoDB migration script (`server/migrations/migrateJsonToMongo.ts`) with 100% record match across 30 collections and automated backup in `data/backups/`.
    - `MongoERPRepository` implementing `IERPRepository` with atomic `$inc` document numbering, ACID transaction wrappers, ledger-derived stock computation, and parallel state reconstruction.
    - Department REST API integration: all 6 route files converted to direct MongoDB persistence.
    - Paginated REST APIs for 9 key collections (`/sales/enquiries`, `/sales/quotations`, `/sales/orders`, `/supply-chain/materials`, `/supply-chain/material-requests`, `/supply-chain/purchase-orders`, `/supply-chain/grns`, `/production/orders`, `/logistics/delivery-orders`).
    - Lightweight dropdown options endpoints (`/options`) with minimal projection.
    - Department dashboard summary endpoints (`/summary`).
    - Frontend API service (`src/services/api.ts`) updated with paginated and options querying.
    - 20/20 automated tests passing across domain logic, MongoDB integration, and 28-step full lifecycle suite.
- **Known Issues & Technical Debt (Analyzed for Phase 4)**:
  - *H-02 (Storage)*: Client-side base64 Data URL file attachments stored in database fields. Needs cloud object storage (S3/GCS/MinIO) with signed URLs in Phase 4.
  - *H-04 (Documents)*: HTML/Print-based simulated PDF generation. Needs server-side binary PDF generation in Phase 4.
  - *M-04 (Frontend Bundle)*: Monolithic >640KB client chunk. Needs route-level `React.lazy()` code splitting in Phase 4.
- **Pending Work for Phase 4 (Production Hardening & Cloud Deploy)**:
  - Cloud object storage for binary document attachments.
  - Server-side PDF generation service.
  - Route-level lazy loading and bundle optimization.
  - Containerization (Dockerfile & Docker Compose) with MongoDB replica set automation.

---

## 9. Change History
- **v2.0.0 (Initial Build)**: Implemented complete CRYO Enterprise ERP 2.0 full-stack architecture, 4 operational departments, Administration, Centralized Order Tracking, RBAC enforcement, persistent storage, and `project.md`.
- **v2.0.1 (Verification & Polish)**: Resolved document numbers (`SO-0001`, `ENQ-0001`, `PROD-0001`) in top breadcrumbs, enforced single-line date formatting in Logistics delivery tables, improved mobile status filter wrapping (`FilterBar`) for zero clipping/overflow, and verified live persistence and RBAC in headless Chromium.
- **v2.1.0 (Phase 2 – Project Audit, Stabilization & Architecture Preparation)**:
  - Deep codebase audit across all 4 departments and admin modules against `CRYO_ERP_Workflow_a6216875.md`.
  - Modularized backend into `server/config/`, `middleware/`, `routes/`, `repositories/`, `models/`, `validators/`, `services/`, and `tests/`.
  - Added 28-step automated integration test suite (`api-lifecycle.test.ts`), verifying auth, RBAC, partial material issue, shortage procurement, GRN partial verification with rejection, rework return to QC, own-vehicle delivery, and separate fulfillment vs payment balance tracking.
  - Fixed silent password length bypass in user profile update.
  - Fixed Vite 8 `__dirname` configuration deprecation warning.
  - Added `"test"` command in `package.json`.
  - Prepared full MongoDB migration plan and Mongoose collection specifications for all 29 collections.
  - Created detailed root-level technical audit document `PHASE_2_AUDIT.md`.
- **v2.2.0 (Phase 3 – MongoDB Migration, Database Integration & API Optimization)**:
  - Configured MongoDB connection manager (`server/config/database.ts`) with connection pooling, replica set / Atlas auto-detection, and graceful shutdown.
  - Implemented concrete Mongoose models for all 29 entity collections + document counters in `server/models/`.
  - Built `MongoERPRepository.ts` with atomic document numbering via MongoDB `$inc`, parallel snapshot queries, ledger stock computation, and transaction abstractions.
  - Successfully migrated all 30 collections from JSON to MongoDB (100% record match verified).
  - Integrated all 6 department routers with MongoDB, removing normal runtime JSON dependency.
  - Added paginated endpoints for 9 entities, lightweight dropdown options, and dashboard summary endpoints.
  - Updated frontend API services (`src/services/api.ts`).
  - Added `server/tests/mongo-integration.test.ts` and verified 20/20 test suites passing.
  - Authored comprehensive `PHASE_3_MIGRATION.md` report.
