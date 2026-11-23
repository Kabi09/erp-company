# CRYO Enterprise ERP 2.0 — Frontend & Backend Separation Architecture Report

**Version:** 2.9.0  
**Status:** Completed & Fully Verified  
**Date:** November 21, 2026  
**Automated Tests:** 107/107 Passing (100% Pass Rate across 10 Test Suites)  
**Compilation:** TypeScript (Frontend & Backend) Clean (0 Errors)  
**Production Build:** Vite 8 Client Bundle Built (358 kB JS, 52 kB CSS)  

---

## 1. Executive Summary & Architecture Overview

CRYO Enterprise ERP 2.0 was originally generated as a monolithic fullstack application where the Express backend (`server.ts`) embedded the Vite development server in middleware mode. While functional for initial prototyping, this monolithic structure tied client-side React rendering directly into the Node.js server lifecycle, hindered independent scalability, complicated isolated testing, and conflated browser vs. server environment requirements.

Under this architectural refactoring, CRYO Enterprise ERP 2.0 has been cleanly separated into two completely independent, decoupled projects managed seamlessly via **npm workspaces**:

1. **`frontend/`**: Standalone React 19 Single Page Application (SPA) powered by Vite 8, TypeScript, Tailwind CSS v4, Lucide Icons, and React Router v7. Operates independently on `http://localhost:5173` with reverse-proxy support for backend API communication.
2. **`backend/`**: Standalone Express 5 REST API server powered by Node.js, TypeScript, Mongoose 9, JWT authentication, and native PDFKit rendering. Operates independently on `http://localhost:5000` (or configured `PORT`) with zero frontend bundling or Vite dependencies.
3. **`shared/`**: Independent, zero-dependency domain layer (`shared/types/erp.ts` and `shared/utils/erpLogic.ts`) shared between frontend and backend for pure type contracts and deterministic business calculation formulas with zero database or backend secret leakage.

---

## 2. Directory Structure Comparison (Before vs. After)

### Before (Monolithic Combined Structure)
```
K:\2.0\erp-company\
├── server.ts                  # Combined entrypoint: Express + Vite middleware
├── package.json               # Mixed frontend and backend dependencies
├── tsconfig.json              # Shared tsconfig with DOM + Node.js types
├── vite.config.ts             # Combined Vite configuration
├── src/                       # React components, pages, services, types, utils
│   ├── types/erp.ts           # Types shared with backend via relative imports
│   └── utils/erpLogic.ts      # Pure utils imported across backend
├── server/                    # Express routes, models, middleware, repositories
│   └── ...                    # Imported ../src/types/erp and ../src/utils/erpLogic
├── data/                      # Backup files and database seeds
└── uploads/                   # Uploaded attachments
```

### After (Decoupled Workspace Architecture)
```
K:\2.0\erp-company\
├── package.json               # Root workspace manager (npm workspaces: ["frontend", "backend"])
├── FRONTEND_BACKEND_SEPARATION.md # Architectural report and reference manual
├── project.md                 # Complete system specification & architecture log
├── README.md                  # Developer quickstart and execution guide
├── shared/                    # PURE SHARED DOMAIN LAYER (Zero dependencies)
│   ├── types/
│   │   └── erp.ts             # Strict TypeScript domain entity interfaces & enums
│   └── utils/
│       ├── erpLogic.ts        # Pure, deterministic calculations & state derivations
│       └── erpLogic.test.ts   # 11 unit tests for deterministic business formulas
│
├── frontend/                  # INDEPENDENT FRONTEND SPA (Port 5173)
│   ├── index.html             # HTML entrypoint
│   ├── package.json           # Frontend dependencies (React 19, Vite 8, Tailwind v4, Lucide)
│   ├── tsconfig.json          # DOM + React JSX compiler configuration
│   ├── vite.config.ts         # Vite config with /api reverse proxy -> http://localhost:5000
│   ├── .env.example           # VITE_API_BASE_URL configuration
│   ├── .gitignore             # Frontend ignores (node_modules, dist, .env)
│   ├── public/                # Static public assets
│   └── src/                   # React application
│       ├── components/        # Layout, modals, navigation, cards, PDF previews
│       ├── pages/             # Sales, Supply Chain, Production, Logistics, Admin
│       ├── services/
│       │   └── api.ts         # Centralized API client (supports both proxy & CORS base URLs)
│       ├── types/erp.ts       # Re-exports from @shared/types/erp
│       └── utils/erpLogic.ts  # Re-exports from @shared/utils/erpLogic
│
└── backend/                   # INDEPENDENT STANDALONE REST API SERVER (Port 5000)
    ├── server.ts              # Pure Express API server with /health and /api router
    ├── package.json           # Backend dependencies (Express 5, Mongoose 9, JWT, PDFKit, Multer)
    ├── tsconfig.json          # Node.js backend compiler configuration
    ├── .env.example           # Backend environment configuration
    ├── .gitignore             # Backend ignores (node_modules, dist, uploads, .env)
    ├── data/                  # Historical JSON database snapshots & backups
    ├── uploads/               # Private file uploads storage directory
    ├── src/                   # Bridge re-exports to @shared domain layer
    │   ├── types/erp.ts       # Re-exports from @shared/types/erp
    │   └── utils/erpLogic.ts  # Re-exports from @shared/utils/erpLogic
    └── server/
        ├── config/            # database.ts, environment.ts
        ├── middleware/        # auth.middleware.ts (JWT, RBAC, Rate Limiting, CORS, Security)
        ├── migrations/        # migrateJsonToMongo.ts, migrateAttachments.ts
        ├── models/            # Mongoose models (Sales, SC, Prod, Logistics, Auth, Attachments)
        ├── repositories/      # contracts.ts, MongoERPRepository.ts, JsonERPRepository.ts
        ├── routes/            # REST API route handlers
        ├── services/          # PDFService (pdfkit), StorageService (Multer/Local/S3)
        ├── utils/             # routeUtils.ts
        └── tests/             # 10 comprehensive automated test suites (107 tests)
            ├── erpLogic.test.ts
            ├── mongo-integration.test.ts
            ├── api-lifecycle.test.ts
            ├── security-auth.test.ts
            ├── sales-workflow.test.ts
            ├── supply-chain-workflow.test.ts
            ├── production-workflow.test.ts
            ├── logistics-workflow.test.ts
            ├── shared-modules.test.ts
            └── full-system-integration.test.ts
```

---

## 3. Frontend Architecture Details

### 3.1 Technology Stack
- **Framework:** React 19.0.1
- **Language:** TypeScript 5.8
- **Bundler & Dev Server:** Vite 8.3.8
- **Styling:** Tailwind CSS v4.3.3 (`@tailwindcss/vite` plugin)
- **Routing:** React Router v7.18.6 (`createBrowserRouter`)
- **Icons:** Lucide React (`lucide-react`)
- **Animation:** Motion (`motion`)

### 3.2 Vite Configuration & Reverse Proxy
The frontend `frontend/vite.config.ts` runs on port **5173**. During development, it proxies all `/api` requests to the backend server (defaulting to `http://localhost:5000`):

```typescript
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const targetBackend = env.VITE_API_BASE_URL || 'http://localhost:5000';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@shared': path.resolve(__dirname, '../shared'),
      },
    },
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': {
          target: targetBackend,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
```

### 3.3 Centralized API Client (`frontend/src/services/api.ts`)
The API service dynamically adapts to either same-origin proxy requests or cross-origin base URLs configured via `VITE_API_BASE_URL`:
- When `VITE_API_BASE_URL` is omitted or empty: Requests default to relative `/api/...`, seamlessly handled by the Vite proxy in development or Nginx/reverse-proxy in production.
- When `VITE_API_BASE_URL` is defined (e.g., `http://localhost:5000`): Requests target `${VITE_API_BASE_URL}/api/...` directly, supported by backend CORS headers.
- Automatically handles Authorization Bearer tokens from localStorage, silent token refresh via `/auth/refresh`, and transparent file upload/download stream handling.

### 3.4 Environment Variables (`frontend/.env.example`)
```env
# URL of the backend API server (leave blank to use Vite dev proxy)
VITE_API_BASE_URL=http://localhost:5000
```

---

## 4. Backend Architecture Details

### 4.1 Technology Stack
- **Runtime:** Node.js 20+ (ESNext modules)
- **Framework:** Express 5.2.1
- **Database:** MongoDB 6.0+ via Mongoose 9.0.0
- **Authentication:** JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`)
- **Document Generation:** PDFKit 0.17.2
- **File Uploads:** Multer 2.0.2 with SHA-256 checksum tracking
- **Execution & Testing:** TSX 4.19.4 + Node.js Native Test Runner (`node:test`, `node:assert/strict`)

### 4.2 Standalone Express Server (`backend/server.ts`)
The backend is completely detached from Vite and serves strictly as an enterprise REST API:
- **Port:** Defaults to `5000` (configurable via `process.env.PORT`).
- **Health Check Endpoint:** `GET /health` returns JSON health status, service name, version, and server timestamp.
- **Root Discovery Endpoint:** `GET /` returns API metadata and available endpoints.
- **Security Middleware:** Strict enterprise security headers (CSP, HSTS, X-Content-Type-Options, Frameguard), CORS middleware, 2MB body size limit, and NoSQL injection sanitizer.
- **REST Router:** Mounted cleanly at `/api`.

### 4.3 Database Connection & Concurrency
- Configured in `backend/server/config/database.ts` with connection pooling (`maxPoolSize: 20`).
- Supports standalone MongoDB, replica sets, and MongoDB Atlas with automatic fallback logic for non-replica local environments.
- High-concurrency operations utilize atomic Mongoose updates (`$inc`, `$set`, `$addToSet`) and document versioning to prevent race conditions.

### 4.4 Environment Variables (`backend/.env.example`)
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/cryo_erp
JWT_SECRET=cryo-erp-2-local-dev-secret-key-at-least-32chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=cryo-erp-2-refresh-dev-secret-key-at-least-32chars
JWT_REFRESH_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173
ALLOW_DEMO_RESET=true
REQUIRE_REPLICA_SET=false
```

---

## 5. Shared Domain Layer (`shared/`)

A core architectural principle of this separation is maintaining **zero code duplication** without coupling the frontend to server-side code or leaking sensitive backend implementations into the browser bundle.

### 5.1 Structure
- **`shared/types/erp.ts`**: Pure TypeScript interfaces and types for all ERP domain entities:
  - Sales: `Customer`, `Product`, `Enquiry`, `Quotation`, `ProformaInvoice`, `CustomerPO`, `PaymentEntry`, `SalesOrder`
  - Supply Chain: `Supplier`, `Material`, `MaterialRequest`, `SupplierPO`, `GoodsReceiptNote`, `StockTransaction`, `SupplierReturn`
  - Production: `BOM`, `ProductionOrder`, `DailyProductionUpdate`, `QualityCheck`, `ReworkOrder`
  - Logistics: `DeliveryOrder`, `DeliveryIssue`, `VehicleDispatch`
  - Auth & Admin: `AuthUser`, `Employee`, `Role`, `Permission`, `CompanySettings`, `ActivityLog`, `NotificationItem`, `AttachmentRecord`
- **`shared/utils/erpLogic.ts`**: Deterministic, pure calculation functions:
  - `formatDocNo`: Formats sequential document identifiers (e.g., `SO-0042`, `ENQ-0001`).
  - `calculateQuotationTotals`: Computes subtotal, line discounts, GST taxes, and grand totals.
  - `calculateDurationDays`: Derives inclusive calendar days between planned manufacturing dates.
  - `computeMaterialStockMap`: Aggregates ledger transaction deltas into real-time available stock levels.
  - `validateMaterialIssueLine`: Verifies stock sufficiency and guards against over-issuance.
  - `deriveMaterialRequestStatus`: Computes fulfillment and physical receipt states.
  - `calculatePaymentSummary`: Sums invoiced, realized, and outstanding payment amounts.
  - `deriveSalesOrderFulfillment`: Derives production and dispatch percentages against sales order lines.
  - `calculateProductionProgress`: Derives order completion percentages across product lines.
  - `isProductionOrderDelayed`: Flags overdue active manufacturing orders.
  - `getAvailableDispatchQty`: Calculates allocatable finished goods for logistics dispatch.
  - `getRemainingSOAllocatableQty`: Calculates unallocated sales order quantities for production.
- **`shared/utils/erpLogic.test.ts`**: 11 unit tests running in `node:test` verifying the accuracy of all pure business logic functions.

### 5.2 Zero Backend Leakage
- Contains **no** Node.js `fs`, `path`, or `crypto` modules.
- Contains **no** database connection strings, Mongoose models, or schema definitions.
- Contains **no** JWT secrets or server authentication middleware.
- Both `frontend/src/types/erp.ts` and `backend/src/types/erp.ts` re-export from `shared/`, ensuring 100% type alignment with zero boundary violations.

---

## 6. API Contract, Authentication & Integration

### 6.1 Authentication Lifecycle
1. **Login:** `POST /api/auth/login` validates credentials against bcrypt-hashed passwords in MongoDB and issues:
   - Short-lived Access Token (15 min) in JSON payload.
   - Long-lived Refresh Token (7 days) tied to an active session in MongoDB.
2. **Authorization:** Frontend includes `Authorization: Bearer <token>` in every outgoing API request.
3. **RBAC Middleware:** Backend `requirePermission(module, action)` middleware checks user permissions dynamically against MongoDB `RoleModel`.
4. **Token Refresh:** When access token expires (401), the frontend API client automatically posts to `/api/auth/refresh` to obtain a fresh access token without user disruption.

### 6.2 CORS Policy
- Backend `corsMiddleware` dynamically checks `env.corsOrigin` (default `http://localhost:5173` or `CLIENT_URL`).
- Supports credentialed requests (`Access-Control-Allow-Credentials: true`) and allows headers `Content-Type`, `Authorization`, and `X-Requested-With`.

### 6.3 Standard API Endpoints
| Department / Domain | Key REST Endpoints | Description |
| :--- | :--- | :--- |
| **System** | `GET /health` | Service health status & timestamp |
| **Auth** | `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me` | Authentication & session control |
| **Sales** | `/api/sales/enquiries`, `/api/sales/quotations`, `/api/sales/proforma-invoices`, `/api/sales/customer-pos`, `/api/sales/payments`, `/api/sales/sales-orders` | Quote-to-order pipeline |
| **Supply Chain** | `/api/supply-chain/materials`, `/api/supply-chain/suppliers`, `/api/supply-chain/purchase-orders`, `/api/supply-chain/grn`, `/api/supply-chain/material-requests` | Procure-to-inventory & stock ledger |
| **Production** | `/api/production/orders`, `/api/production/daily-updates`, `/api/production/quality-checks`, `/api/production/rework-orders` | Plan-to-produce & QC gates |
| **Logistics** | `/api/logistics/delivery-orders`, `/api/logistics/ready-for-dispatch`, `/api/logistics/delivery-issues` | Dispatch & delivery tracking |
| **Tracking** | `/api/tracking/:salesOrderId`, `/api/tracking` | 15-stage cross-department lifecycle engine |
| **PDF Documents** | `GET /api/documents/:type/:id/preview`, `GET /api/documents/:type/:id/download` | Vector PDF generation (13 doc types) |
| **Files & Storage**| `POST /api/files/upload`, `GET /api/files/:id/download` | Secure private attachment repository |
| **Global Search** | `GET /api/search?q=...` | Cross-entity indexed search with RBAC |
| **Admin** | `/api/admin/summary`, `/api/admin/employees`, `/api/admin/roles`, `/api/admin/settings` | Operational metrics & system settings |

---

## 7. Verification & Automated Test Results

The restructured architecture was rigorously validated across all 10 automated test suites using the Node.js native test runner (`node:test`, `node:assert/strict`) running sequentially (`--test-concurrency=1`).

### Test Execution Summary
```
> cryo-erp-root@2.9.0 test
> npm run test --workspace backend

> cryo-erp-backend@2.9.0 test
> tsx --test --test-concurrency=1 server/tests/erpLogic.test.ts server/tests/mongo-integration.test.ts server/tests/api-lifecycle.test.ts server/tests/security-auth.test.ts server/tests/sales-workflow.test.ts server/tests/supply-chain-workflow.test.ts server/tests/production-workflow.test.ts server/tests/logistics-workflow.test.ts server/tests/shared-modules.test.ts server/tests/full-system-integration.test.ts

ℹ tests 107
ℹ suites 0
ℹ pass 107
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 34312.7608
```

### Complete Test Suite Breakdown
| # | Test Suite File | Domain / Subject | Tests Passed | Status |
| :---: | :--- | :--- | :---: | :---: |
| 1 | `server/tests/erpLogic.test.ts` | Pure business logic, pricing, tax, stock ledger formulas | 11 | **PASS** |
| 2 | `server/tests/mongo-integration.test.ts` | MongoDB connection, atomic numbering (`$inc`), schema validation | 6 | **PASS** |
| 3 | `server/tests/api-lifecycle.test.ts` | End-to-end HTTP smoke test, authentication & linked order flow | 3 | **PASS** |
| 4 | `server/tests/security-auth.test.ts` | Anti-enumeration, refresh token rotation, password policy, RBAC | 7 | **PASS** |
| 5 | `server/tests/sales-workflow.test.ts` | Quote-to-Order lifecycle, revision chains, payment verification | 8 | **PASS** |
| 6 | `server/tests/supply-chain-workflow.test.ts` | Material availability, shortage POs, GRN inspection, stock ledger | 12 | **PASS** |
| 7 | `server/tests/production-workflow.test.ts` | Production planning, BOM preparation, QC checks, rework cycles | 14 | **PASS** |
| 8 | `server/tests/logistics-workflow.test.ts` | Dispatch handoff, own vehicle/courier delivery, POD validation | 22 | **PASS** |
| 9 | `server/tests/shared-modules.test.ts` | Tracking engine, PDF generation, file storage, notifications, search | 13 | **PASS** |
| 10 | `server/tests/full-system-integration.test.ts` | Master 24-step cross-department lifecycle & concurrent race gates | 11 | **PASS** |
| **TOTAL** | **10 Test Suites** | **Complete Enterprise ERP 2.0 System** | **107 / 107** | **100% PASS** |

### TypeScript Compilation & Production Build Verification
- **Frontend Typecheck:** `npm run lint:frontend` -> Exited with code 0 (0 errors).
- **Backend Typecheck:** `npm run lint:backend` -> Exited with code 0 (0 errors).
- **Frontend Production Build:** `npm run build:frontend` -> Built client bundle in 664ms:
  - `dist/index.html` (1.45 kB)
  - `dist/assets/index-B0DNM0HK.css` (52.11 kB)
  - `dist/assets/index-cyCJvu7H.js` (358.42 kB)
  - Clean code-split department chunks for Sales, SC, Production, Logistics, and Admin.

---

## 8. Developer Experience & Run Guide

The decoupled project structure is orchestrated via **npm workspaces**. Developers can run both tiers together or work entirely within an isolated frontend or backend workspace.

### 8.1 Root Workspace Commands
Run these commands from the root repository directory (`K:\2.0\erp-company`):

```bash
# 1. Run both Backend (port 5000) and Frontend (port 5173) concurrently
npm run dev

# 2. Run Backend server only
npm run dev:backend

# 3. Run Frontend dev server only
npm run dev:frontend

# 4. Run typecheck / linting across both frontend and backend
npm run lint

# 5. Build frontend production assets
npm run build:frontend

# 6. Run all 107 automated backend and integration tests
npm test

# 7. Run individual department test suites
npm run test:sales          # Sales management workflow tests
npm run test:supply-chain   # Supply chain & inventory tests
npm run test:production     # Production & manufacturing tests
npm run test:logistics      # Logistics & dispatch tests
npm run test:security       # Authentication & security tests
npm run test:shared         # Tracking, PDFs, storage, search tests
npm run test:full           # Master 24-step integration test suite
```

### 8.2 Frontend-Only Workspace
To work exclusively on the frontend application:
```bash
cd frontend

# Install frontend dependencies
npm install

# Start Vite dev server on http://localhost:5173
npm run dev

# Typecheck frontend
npm run lint

# Build production bundle
npm run build

# Preview production build locally
npm run preview
```

### 8.3 Backend-Only Workspace
To work exclusively on the backend REST API:
```bash
cd backend

# Install backend dependencies
npm install

# Start Express API server on http://localhost:5000 (with hot reload via tsx watch)
npm run dev

# Start production server
npm start

# Typecheck backend
npm run lint

# Run all 107 tests
npm test
```

---

## 9. Conclusion

The separation of CRYO Enterprise ERP 2.0 into independent `frontend/` and `backend/` directories, unified by the zero-dependency `shared/` domain layer, establishes a clean, enterprise-grade architecture. All 107 existing automated tests pass with 100% reliability, both workspaces typecheck with zero errors, and developers can develop, test, and deploy the frontend and backend independently without risk of cross-tier coupling.
