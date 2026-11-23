# CRYO Enterprise ERP 2.0 — Client User Manual QA & Verification Report

## 1. Deliverable Inventory

All client manual deliverables reside inside `client-user-guide/` and were generated from live Chromium (`1440×900`, Light Mode) screenshots captured against an isolated QA database (`cryo_erp_manual_qa`).

| Deliverable | Path | Verified Metrics | Page / Canvas Spec |
| :--- | :--- | :--- | :--- |
| Complete Visual User Manual (PDF) | `client-user-guide/CRYO_ERP_VISUAL_USER_MANUAL.pdf` | 103 pages, 107 embedded images, 11,429 KB | A4 Landscape (`842×595 pt`) |
| Complete Visual User Manual (Word) | `client-user-guide/CRYO_ERP_VISUAL_USER_MANUAL.docx` | 1 section, 201 tables, 107 inline shapes, 12,495 KB | A4 Landscape (`11.69"×8.27"`) |
| Cross-Department Workflow Guide (PDF) | `client-user-guide/CRYO_ERP_COMPLETE_WORKFLOW.pdf` | 40 pages, 44 embedded images, 4,892 KB | A4 Landscape (`842×595 pt`) |
| Employee Desk Quick-Start Guide (PDF) | `client-user-guide/CRYO_ERP_QUICK_START.pdf` | 21 pages, 20 embedded images, 2,574 KB | A4 Landscape (`842×595 pt`) |
| Annotated Screenshot Set | `client-user-guide/screenshots/*.png` | 93 annotated PNG files (temporary `raw/` removed) | `1440×900` px |
| Screenshot Inventory | `client-user-guide/SCREENSHOT_INDEX.md` | Full screen-by-screen index table | Markdown |
| QA & Verification Report | `client-user-guide/DOCUMENT_VERIFICATION.md` | This verification summary | Markdown |

---

## 2. Live End-to-End Business Scenario Covered

All workflow screenshots depict connected business records rather than isolated empty forms:

- **Primary Order Flow (Sales → Production → Supply Chain → Logistics)**:
  - **Customer & Equipment**: `ABC Research Labs` (`Dr. Ananya Nair`) — `Ultra Low Temperature Freezer (ULT-500)`, Qty `2`.
  - **Document Chain**: `ENQ-0008` → `QT-0008-V1` → `PI-0007` → `PAY-0007` → `SO-0006` → `PROD-0005` → `MR-0006` → `SPO-0004` → `GRN-0003` → `DEL-0003`.
  - **Partial Issue & Replenishment**: `MR-0006` performs a partial stock issue on available materials, triggers `SPO-0004` supplier replenishment, receives stock via `GRN-0003` (Verified), and completes full material issue to Production.
- **Service Management Flows**:
  - **Customer Site Warranty Repair**: `SRV-0001` → `JOB-0001` → `SMR-0001` / `MR-0007` (spare parts linked to Supply Chain PT100 stock) → technician advance ₹1,500 vs expense ₹1,200 (`₹300` return due settlement) → `SBL-0001` → closure & sign-off.
  - **CRYO Workshop Chargeable Overhaul**: Expired unit `CRYO-ULT-2023-088` under `SRV-0002` / `JOB-0002`.
- **Research & Development Flow**:
  - **Isolated R&D Prototype**: `RND-0001` → `MR-0008` → Prototype BOM & Material Receipt → Iteration 1 Test Fail → Iteration 2 Retest Pass → `Successfully Completed`.
- **Screenshot Module Coverage (`93` Screens)**:
  - Getting Started (`01`)
  - Sales (`02`–`19`)
  - Production (`20`–`26`, `40`–`46`)
  - Supply Chain (`27`–`39`, `67`, `79`)
  - Logistics (`47`–`55`)
  - Service (`56`–`66`, `68`–`73`)
  - R&D (`74`–`85`, including `78b_rd_bom_requested_state`)
  - Administration (`86`–`91`)
  - Centralized Order Tracking (`92`)

---

## 3. Annotation, Security Redaction & Visual Checks

- **Annotation Pipeline**: Two-pass RGBA compositing applied numbered highlight boxes, directional arrows, and Blue (`#2563EB`), Green (`#059669`), and Orange (`#EA580C`) callout pills using DOM bounding-box telemetry captured on `1440×900` Light Mode screens.
- **Credential & Bank Redactions**:
  - `01_login_screen.png`: Login password input (`#login-password`) and Quick Access credential card passwords (`Zxcvbnm09#`, `cryo123`) masked.
  - `87_admin_create_employee_modal.png`: Employee Initial Password field and `Default: cryo123` hint masked.
  - `91_admin_company_settings.png`: Company Profile Bank Account Number, IFSC, and UPI fields covered with dark `PROTECTED` masks.
- **PDF & Image Inspection**:
  - Structural checks via PyMuPDF (`fitz`) and `python-docx` confirmed page dimensions, image counts, table structures, and zero-byte issues.
  - Rendered sample PDF pages (cover, table of contents, step page, and side-by-side handoff spread) and key annotated PNGs (`01`, `13`, `21`, `28`, `44`, `53`, `68`, `71`, `72`, `73`, `80`, `83`, `87`, `91`, `92`) were visually inspected to verify margin clarity, zero clipping, readable step cards, and redaction alignment.

---

## 4. UI Findings & Route Observations (Application Left Unmodified)

Per the read-only application constraint, no application source files were modified. The following behaviors were observed during live capture:

1. **R&D Prototype BOM Requisition Modal (`frontend/src/pages/rd/RDProjectDetailPage.tsx`)**:
   - Clicking `Request from Stores` toggles `mrModalOpen = true` (observed around lines `120`, `280`, `657`), but no `<Modal open={mrModalOpen}>` dialog is rendered in the component JSX.
   - During QA capture, `POST /api/rd/projects/:id/material-request` was dispatched directly with `materialId: 'mat-1'` (`MAT-001`) so `MR-0008` appeared normally on Supply Chain Stores, enabling live UI capture of `Issue Available`, R&D `Acknowledge Material Receipt`, daily work logs, Iteration 1 Fail -> Iteration 2 Retest Pass, and `Successfully Completed`.
2. **Service Spare Parts Material Selection (`frontend/src/pages/service/ServiceJobDetailPage.tsx`, `backend/server/routes/service.routes.ts`)**:
   - The `Indent Spare Parts` modal uses a free-text `Spare Part Name...` input without selecting a Supply Chain `materialId` (observed at `ServiceJobDetailPage.tsx:1236-1265`), causing `service.routes.ts:896` to fall back to unlinked `mat-spare-0` (`SPARE-1`) with `Available Stock: 0` / `Shortage: 1` on `/supply-chain/material-requests`.
   - QA captured the genuine modal screenshot (`65_srv_request_spares_modal.png`) and dispatched `POST /api/service/jobs/:id/material-requests` with `materialId: 'mat-3'` (`MAT-003`) so `SMR-0001` / `MR-0007` linked to Supply Chain PT100 stock (`Available Stock: 4`), allowing live UI execution of Supply Chain `Issue Available` and Service `Acknowledge Physical Receipt` → `Reconcile Used & Returned`.
3. **Delivered Products Route Location (`frontend/src/App.tsx`)**:
   - Delivered Products is mounted under `/production/delivered-products` and `/service/delivered-products` (`App.tsx:476, 568`), rather than `/logistics/delivered-products`. Logistics completion archives reside at `/logistics/completed` and `/logistics/history`.

---

## 5. Workspace & Environment Hygiene

- **Source Code Integrity**: `git status --short` shows only untracked `client-user-guide/` additions; zero tracked files in `frontend/`, `backend/`, `shared/`, `.env`, or `package.json` were modified.
- **Database Isolation**: All screenshots and scenario records were generated against ephemeral local database `mongodb://127.0.0.1:27017/cryo_erp_manual_qa` on dedicated QA ports (`5055` backend / `5179` frontend), leaving `cryo_live` and active servers untouched.
- **Daemon & Temp Cleanup**: Both QA background processes and the temporary `client-user-guide/screenshots/raw/` folder were removed after capture and annotation finished.
