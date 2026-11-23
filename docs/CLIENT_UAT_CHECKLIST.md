# CRYO Enterprise ERP 2.0 — Client User Acceptance Testing (UAT) Checklist

**Project Version**: v2.9.0  
**Phase**: Phase 10 – Complete Integration Testing, Workflow Validation, Bug Fixes, Performance & Final Client Acceptance Preparation  
**Target Environment**: Client Staging / Pilot Testing  
**Applicable Roles**: Sales Team, Stores & Supply Chain, Production Engineering, Quality Control, Logistics & Delivery, Super Admin  

---

## 1. Instructions for UAT Evaluators

This document provides structured, departmental test scripts for evaluating **CRYO Enterprise ERP 2.0** during formal client acceptance testing. 

Each test case specifies:
1. **Target Persona / Role**: The logged-in user profile with appropriate RBAC credentials.
2. **Prerequisites**: Necessary upstream data required before executing the test.
3. **Step-by-Step Actions**: Exact UI or API actions to perform.
4. **Expected Business Outcomes**: The verifiable state change in the ERP.
5. **Sign-off Checkbox**: Evaluation status (`PASSED`, `FAILED`, `BLOCKED`).

---

## 2. Role-Based User Personas & Default Test Credentials

| Persona | Name | Email | Password | Allowed Departments | Role |
|---|---|---|---|---|---|
| **Super Admin** | System Administrator | `admin@cryoerp.com` | `admin123` | All (`sales`, `supply_chain`, `production`, `logistics`, `admin`) | Admin |
| **Sales Manager** | Rajesh Sharma | `sales.mgr@cryoerp.com` | `sales123` | `sales`, `admin` (view) | Manager |
| **Supply Chain Lead** | Amit Patel | `sc.mgr@cryoerp.com` | `supply123` | `supply_chain` | Manager |
| **Production Lead** | Kavitha Iyer | `prod.mgr@cryoerp.com` | `prod123` | `production` | Manager |
| **Logistics Lead** | Suresh Kumar | `log.mgr@cryoerp.com` | `logistics123` | `logistics` | Manager |
| **QC Inspector** | Senior QC Specialist | `prod.mgr@cryoerp.com` | `prod123` | `production` (QC Authorized) | Inspector |

---

## 3. Department 1: Sales Management (`/sales`)

### UAT-SALES-01: Customer Enquiry Capture & Qualification Gate
- **Persona**: Sales Manager (`sales.mgr@cryoerp.com`)
- **Prerequisites**: Logged in to `/sales`.
- **Steps**:
  1. Navigate to `/sales/enquiries` and click **New Customer Enquiry**.
  2. Select existing customer or enter new client details (GSTIN: `29AAACA1234D1Z8`).
  3. Add product line: `Cryogenic Liquid Vessel 500L`, Qty: `2`, Expected Date: 30 days ahead.
  4. Save enquiry. Verify status is `New`.
  5. Click **Log Follow-up**, record call outcome: `Positive technical discussion`.
  6. Click **Qualify Enquiry** and enter commercial justification notes.
- **Expected Outcome**:
  - [ ] Enquiry transitions to `Qualified` status.
  - [ ] Enquiry appears in `/sales/qualified` conversion queue.
  - [ ] Enquiry follow-up history is chronologically visible in the drawer.

---

### UAT-SALES-02: Quotation Versioning & Customer Acceptance
- **Persona**: Sales Manager (`sales.mgr@cryoerp.com`)
- **Prerequisites**: UAT-SALES-01 complete.
- **Steps**:
  1. From `/sales/qualified`, click **Create Quotation** against the qualified enquiry.
  2. System generates `QT-XXXX-V1`. Review subtotal, 18% GST, and validity period. Save as Draft.
  3. Open quotation, enter client negotiation notes, and click **Revise Quotation**.
  4. Apply 5% commercial discount. Save revision.
  5. Verify `QT-XXXX-V1` is marked `Superseded` and `QT-XXXX-V2` is active with status `Negotiation`.
  6. Click **Customer Accepted** and enter client confirmation notes.
- **Expected Outcome**:
  - [ ] Quotation V1 is permanently locked as `Superseded`.
  - [ ] Quotation V2 status updates to `Accepted`.
  - [ ] **Download PDF** generates vector A4 PDF quotation with corporate letterhead.

---

### UAT-SALES-03: Proforma Invoice & Customer PO Entry
- **Persona**: Sales Manager (`sales.mgr@cryoerp.com`)
- **Prerequisites**: UAT-SALES-02 complete (`Accepted` Quote).
- **Steps**:
  1. Navigate to `/sales/proforma-invoices`, click **Generate Proforma Invoice**.
  2. Select accepted quotation `QT-XXXX-V2`. Review bank details and payment terms. Save.
  3. Navigate to `/sales/customer-pos`, click **Record Customer PO**.
  4. Link to the generated PI, enter Customer PO Number (`APEX-PO-2026-001`), and upload PDF copy.
  5. Verify discrepancy toggle is unchecked (`Terms match PI`).
- **Expected Outcome**:
  - [ ] PI generated with status `Issued` and unique `PI-XXXX` document number.
  - [ ] Customer PO linked and validated with no discrepancy block.

---

### UAT-SALES-04: Advance Payment Remittance & Commercial Sales Order Confirmation
- **Persona**: Sales Manager (`sales.mgr@cryoerp.com`) & Super Admin (`admin@cryoerp.com`)
- **Prerequisites**: UAT-SALES-03 complete.
- **Steps**:
  1. Navigate to `/sales/payments`, click **Register Payment**.
  2. Select PI, enter 50% advance amount, select `NEFT/RTGS`, enter UTR number, and upload bank receipt.
  3. Log in as Super Admin (`admin@cryoerp.com`), open payment, and click **Verify Payment**.
  4. Log back in as Sales Manager, navigate to `/sales/sales-orders`, click **Confirm Sales Order**.
  5. Select PI, verify customer PO and advance payment are verified, and confirm order.
- **Expected Outcome**:
  - [ ] Payment verified with status `Verified` by Admin.
  - [ ] Sales Order confirmed with unique `SO-XXXX` document number.
  - [ ] Commercial status marked `Confirmed`; fulfillment status marked `Awaiting Production`.
  - [ ] Sales Order appears in Production department received orders queue.

---

## 4. Department 2: Production Management (`/production`)

### UAT-PROD-01: Order Intake, Duration Planning & BOM Preparation
- **Persona**: Production Lead (`prod.mgr@cryoerp.com`)
- **Prerequisites**: Confirmed Sales Order (`SO-XXXX`) from UAT-SALES-04.
- **Steps**:
  1. Navigate to `/production/received-orders`.
  2. Locate `SO-XXXX` and click **Plan Production Order**.
  3. Enter planned duration (e.g., 22 days), priority (`High`), and engineer in charge.
  4. Save Production Order (`PO-XXXX`).
  5. Open Production Order, navigate to **BOM** tab, and click **Prepare Bill of Materials**.
  6. Add materials: `SS304 Cryo Grade Plate` (100 KG) and `High-Pressure Cryo Valve` (4 Nos). Save BOM.
  7. Click **Submit Material Request to Stores**.
- **Expected Outcome**:
  - [ ] Production Order created with status `Awaiting Materials`.
  - [ ] BOM scaled to order quantity.
  - [ ] Material Request (`MR-XXXX`) submitted to Supply Chain department with status `Pending`.

---

## 5. Department 3: Supply Chain Management (`/supply-chain`)

### UAT-SC-01: Material Request Intake & Partial Stock Issue
- **Persona**: Supply Chain Lead (`sc.mgr@cryoerp.com`)
- **Prerequisites**: Submitted Material Request (`MR-XXXX`) from UAT-PROD-01.
- **Steps**:
  1. Navigate to `/supply-chain/material-requests`.
  2. Open `MR-XXXX`. Verify SS plates show sufficient ledger stock; cryo valves show shortage (0 available).
  3. Click **Issue Available Stock**.
  4. Enter 100 KG for SS plates, 0 for valves. Enter remarks and confirm issue.
- **Expected Outcome**:
  - [ ] Material Issue Voucher (`MI-XXXX`) created.
  - [ ] Warehouse stock for SS plates decremented by 100 KG in stock history ledger.
  - [ ] Material Request status updates to `Partially Issued`.

---

### UAT-SC-02: Emergency Shortage Purchase Order & GRN Verification
- **Persona**: Supply Chain Lead (`sc.mgr@cryoerp.com`)
- **Prerequisites**: UAT-SC-01 complete.
- **Steps**:
  1. Navigate to `/supply-chain/purchase-orders`, click **New Supplier Purchase Order**.
  2. Select purchase type `Request-Based`, link `MR-XXXX`, select vendor `Precision Cryo Components`.
  3. Line item auto-populates 4 cryo valves. Save PO (`SPO-XXXX`).
  4. Navigate to `/supply-chain/grn`, click **Record GRN**.
  5. Select `SPO-XXXX`, enter vendor Delivery Challan No (`DC-PREC-01`), Received Qty: 4 Nos. Save GRN.
  6. Click **Verify GRN Materials**.
  7. Enter: Accepted Qty: `3`, Rejected Qty: `1` (Reason: `Flange seal face micro-scratch`). Save verification.
- **Expected Outcome**:
  - [ ] GRN verified with status `Partially Accepted`.
  - [ ] 3 accepted valves added to usable warehouse inventory ledger.
  - [ ] 1 rejected valve flagged for supplier return.

---

### UAT-SC-03: Supplier Return, Replacement GRN & Final Material Issue
- **Persona**: Supply Chain Lead (`sc.mgr@cryoerp.com`)
- **Prerequisites**: UAT-SC-02 complete.
- **Steps**:
  1. Navigate to `/supply-chain/returns`, click **Create Supplier Return**.
  2. Select rejected valve from GRN, Return Qty: 1, toggle `Replacement Expected`. Save (`SR-XXXX`).
  3. When replacement arrives, record Replacement GRN linked to `SR-XXXX`, Qty: 1. Verify and accept.
  4. Navigate back to `MR-XXXX`, click **Issue Available Stock**.
  5. Issue all 4 cryo valves to shop floor. Save issue voucher.
- **Expected Outcome**:
  - [ ] Replacement valve verified and added to stock.
  - [ ] Material Request status transitions to `Fully Issued`.
  - [ ] Notification sent to Production that materials are ready for physical receipt.

---

## 6. Department 4: Production Execution & Quality Check

### UAT-PROD-02: Physical Receipt Acknowledgment & Manufacturing Floor Logs
- **Persona**: Production Lead (`prod.mgr@cryoerp.com`)
- **Prerequisites**: UAT-SC-03 complete.
- **Steps**:
  1. Navigate to `/production/material-receipts`.
  2. Locate unacknowledged issues for `PO-XXXX`.
  3. Click **Acknowledge Physical Receipt**, verify physical count of 100 KG plates and 4 valves. Confirm.
  4. Verify Production Order status updates to `Ready to Start`.
  5. Click **Start Production**, assign technician and enter work start date. Status: `In Progress`.
  6. Navigate to **Daily Updates** tab, log Stage 1: `Fabrication` (16 hours, Completed).
  7. Click **Complete Manufacturing**, enter completed quantity: `2`, allocate serial numbers (`SN-CV500-01`, `SN-CV500-02`).
- **Expected Outcome**:
  - [ ] MR receipt status updates to `Fully Received`.
  - [ ] Production order advances through `Ready to Start` → `In Progress` → `QC Pending`.

---

### UAT-PROD-03: Quality Inspection Rejection, Rework & Certification
- **Persona**: QC Inspector (`prod.mgr@cryoerp.com`)
- **Prerequisites**: UAT-PROD-02 complete (`QC Pending`).
- **Steps**:
  1. Navigate to `/production/quality-checks`, click **Record QC Inspection**.
  2. Inspect 2 units: Unit 1: Pass, Unit 2: Fail (Reason: `Vacuum port micro-leak detected`).
  3. Save QC Report. Final Result: `Rejected`.
  4. Verify Production Order automatically enters `Rework` status and Rework Order `RW-XXXX` is created.
  5. Navigate to `/production/rework`, open `RW-XXXX`, record corrective action (`TIG reweld completed`), and click **Complete Rework**.
  6. Record QC Inspection (Attempt 2): Inspect 2 units: Both Accepted (`10^-9 mbar*l/s vacuum verified`).
- **Expected Outcome**:
  - [ ] QC Attempt 1 automatically triggers Rework Order.
  - [ ] Corrective action log unblocks reinspection.
  - [ ] QC Attempt 2 passes 100% of units; Production Order status updates to `Completed`.
  - [ ] Notification sent to Logistics that finished units are ready for dispatch.

---

## 7. Department 5: Logistics & Delivery Management (`/logistics`)

### UAT-LOG-01: Logistics Dispatch via Dedicated Vehicle
- **Persona**: Logistics Lead (`log.mgr@cryoerp.com`)
- **Prerequisites**: Completed Production Order (`PO-XXXX`) from UAT-PROD-03.
- **Steps**:
  1. Navigate to `/logistics/ready`. Verify `PO-XXXX` appears with 2 available units.
  2. Click **Create Delivery Order**.
  3. Select transport method: `Own Vehicle`, enter Vehicle Number (`KA-01-MJ-8899`), Driver Name, and planned dates.
  4. Save Delivery Order (`DEL-XXXX`).
  5. Click **Confirm Dispatch**, enter Delivery Challan No (`DC-CRYO-001`), and confirm.
- **Expected Outcome**:
  - [ ] Delivery Order created with status `Planned`.
  - [ ] Dispatch confirmed; status updates to `In Transit`.
  - [ ] Printable Delivery Challan available via Document Preview.

---

### UAT-LOG-02: Final Customer Handover & Proof of Delivery (POD)
- **Persona**: Logistics Lead (`log.mgr@cryoerp.com`)
- **Prerequisites**: UAT-LOG-01 complete (`In Transit`).
- **Steps**:
  1. Navigate to `/logistics/delivery-orders`. Open `DEL-XXXX`.
  2. Click **Confirm Delivery & Upload POD**.
  3. Enter Received By: `Dr. Vikram Raman`, Delivered Qty: `2`, Condition: `Good`.
  4. Upload signed POD PDF document. Confirm delivery.
- **Expected Outcome**:
  - [ ] Delivery Order status updates to `Delivered`.
  - [ ] Sales Order fulfillment status transitions to `Delivered`.
  - [ ] Sales Order commercial status remains `Confirmed` (independent financial gate).

---

## 8. Department 6: Centralized Tracking, Settlement & Administration

### UAT-TRACK-01: Centralized 15-Stage Order Tracking & RBAC Redaction
- **Persona**: Sales Manager (`sales.mgr@cryoerp.com`) vs Production Lead (`prod.mgr@cryoerp.com`)
- **Prerequisites**: UAT-LOG-02 complete.
- **Steps**:
  1. As Sales Manager, navigate to `/tracking/:salesOrderId`.
  2. Verify all 15 discrete stages show `Completed` with green checkmarks.
  3. Verify Line Progress shows 2 of 2 units delivered (100% progress).
  4. Verify financial totals (Subtotal, GST, Total Amount: ₹10,08,900) are fully visible.
  5. Log out and log in as Production Lead (`prod.mgr@cryoerp.com`).
  6. Navigate to the same tracking URL `/tracking/:salesOrderId`.
- **Expected Outcome**:
  - [ ] Sales Manager sees all 15 stages, line progress, and full commercial financials.
  - [ ] Production Lead sees technical progress, but commercial amounts show `Commercial data redacted`.

---

### UAT-SETTLE-01: Final Balance Settlement & Closed Order State
- **Persona**: Sales Manager & Super Admin
- **Prerequisites**: UAT-LOG-02 complete.
- **Steps**:
  1. As Sales Manager, navigate to `/sales/payments`, click **Register Payment**.
  2. Select `SO-XXXX`, enter remaining 50% balance (₹5,04,450), UTR reference, and receipt attachment.
  3. As Super Admin, click **Verify Payment**.
- **Expected Outcome**:
  - [ ] Payment verified.
  - [ ] Sales Order payment status calculates `Paid`.
  - [ ] Order lifecycle completely fulfilled and commercially closed.

---

## 9. Exception & Edge Case Testing Scenarios

| Test ID | Scenario Description | Action Steps | Expected Outcome | Sign-off |
|---|---|---|---|:---:|
| **UAT-EXC-01** | **Overpayment Attempt Guard** | Try recording payment exceeding remaining balance on SO. | System rejects with 400 error: payment exceeds outstanding balance. | [ ] |
| **UAT-EXC-02** | **Duplicate Delivery Confirmation** | Click "Deliver" twice concurrently or consecutively on same delivery order. | First call succeeds; second call rejected with 400: already delivered. | [ ] |
| **UAT-EXC-03** | **Unreceived Material Start Guard** | Try starting production before stores materials are physically acknowledged. | System blocks with 400 error: materials must be received first. | [ ] |
| **UAT-EXC-04** | **Unapproved PO Dispatch Guard** | Try dispatching production order that is in `QC Pending` or `Rework`. | Order does NOT appear in Logistics ready queue; API rejects dispatch. | [ ] |
| **UAT-EXC-05** | **Unauthorized RBAC Route Access** | Logistics user tries accessing `/sales/quotations` or `/admin/users`. | React route guard redirects to forbidden page / API returns 403 Forbidden. | [ ] |
| **UAT-EXC-06** | **Global Search RBAC Scoping** | Shop floor technician searches for client quote numbers in `Ctrl+K` search. | Search returns zero results for commercial documents outside user's department. | [ ] |
| **UAT-EXC-07** | **Notification Deduplication** | Retrying automated operational notification with duplicate `dedupKey`. | Second notification is deduplicated; user is not spammed with duplicate alerts. | [ ] |
