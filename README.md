# CRYO Enterprise ERP 2.0

Industrial, multi-department Enterprise Resource Planning (ERP) platform engineered for cryogenic equipment and precision thermal engineering operations.

The system automates the complete operational lifecycle across four strictly segregated departments plus centralized tracking and administration:

```
Customer Enquiry → Follow-up → Qualified Enquiry → Quotation (V1/V2/V3) → Proforma Invoice → Customer PO →
Payment Entry → Sales Order → Production Order & Duration Plan → BOM Request → Supply Chain Material Issue /
Purchase & GRN Verification → Physical Receipt → Manufacturing & Daily Updates → Quality Check →
Rework / Acceptance → Logistics Dispatch (Own Vehicle / Courier) → Delivery Completion
```

---

## Architecture Overview

CRYO Enterprise ERP 2.0 is architected as two decoupled, independent applications unified by a zero-dependency domain layer and managed via **npm workspaces**:

```
K:\2.0\erp-company\
├── frontend/                  # React 19 + TypeScript + Vite 8 SPA (Port 5173)
│   ├── src/                   # React components, pages, hooks, services
│   ├── vite.config.ts         # Vite bundler with /api proxy to backend
│   └── package.json           # Frontend dependencies (Tailwind v4, Lucide, Motion)
│
├── backend/                   # Node.js + Express 5 + Mongoose 9 REST API (Port 5000)
│   ├── server.ts              # Standalone Express server (with /health check)
│   ├── server/                # Routes, controllers, models, services, repositories
│   │   └── tests/             # 10 test suites (107 automated tests)
│   ├── uploads/               # Private file uploads storage directory
│   └── package.json           # Backend dependencies (Express, JWT, PDFKit, Multer)
│
├── shared/                    # Zero-dependency domain layer (DRY, Zero secret leakage)
│   ├── types/erp.ts           # Shared TypeScript domain models & enums
│   └── utils/erpLogic.ts      # Pure deterministic business calculation formulas
│
├── package.json               # Root workspace orchestrator
└── FRONTEND_BACKEND_SEPARATION.md # Detailed architectural report
```

---

## Prerequisites

1. **Node.js**: `v20.x` or higher (ESNext module support)
2. **MongoDB**: Local MongoDB `v6.0+` instance running on `mongodb://127.0.0.1:27017` (or MongoDB Atlas connection string)
3. **npm**: `v10.x` or higher

---

## Quick Start (Run Both Tiers)

1. **Install dependencies across all workspaces:**
   ```bash
   npm install
   ```

2. **Configure Environment Variables:**
   - Backend: Copy `backend/.env.example` to `backend/.env` (or root `.env`):
     ```env
     PORT=5000
     NODE_ENV=development
     MONGODB_URI=mongodb://127.0.0.1:27017/cryo_erp
     JWT_SECRET=cryo-erp-2-local-dev-secret-key-at-least-32chars
     JWT_REFRESH_SECRET=cryo-erp-2-refresh-dev-secret-key-at-least-32chars
     CLIENT_URL=http://localhost:5173
     CORS_ORIGIN=http://localhost:5173
     ```
   - Frontend: Copy `frontend/.env.example` to `frontend/.env` (optional, defaults to proxy):
     ```env
     VITE_API_BASE_URL=http://localhost:5000
     ```

3. **Start both Frontend & Backend concurrently:**
   ```bash
   npm run dev
   ```
   - **Backend REST API:** `http://localhost:5000` (Health Check: `http://localhost:5000/health`)
   - **Frontend Web UI:** `http://localhost:5173`

---

## Independent Workspace Workflows

### Working on the Frontend Only
```bash
cd frontend
npm install
npm run dev        # Starts Vite dev server on http://localhost:5173
npm run lint       # Typecheck frontend (tsc --noEmit)
npm run build      # Builds production SPA to frontend/dist/
npm run preview    # Preview production build locally
```

### Working on the Backend Only
```bash
cd backend
npm install
npm run dev        # Starts Express server on http://localhost:5000 with tsx watch
npm run lint       # Typecheck backend (tsc --noEmit)
npm test           # Runs all 107 backend and integration tests
```

---

## Workspace Script Reference

All commands can be executed directly from the project root:

| Command | Workspace Target | Description |
| :--- | :--- | :--- |
| `npm run dev` | Both | Runs backend on 5000 and frontend on 5173 concurrently |
| `npm run dev:backend` | Backend | Starts standalone Express API server with file watching |
| `npm run dev:frontend` | Frontend | Starts Vite dev server with HMR and reverse proxy |
| `npm run lint` | Both | Typechecks TypeScript across frontend and backend (0 errors) |
| `npm run lint:frontend` | Frontend | Typechecks frontend TypeScript only |
| `npm run lint:backend` | Backend | Typechecks backend TypeScript only |
| `npm run build` | Both | Builds frontend production assets and verifies backend types |
| `npm run build:frontend` | Frontend | Builds optimized production client bundle (`frontend/dist`) |
| `npm test` | Backend | Executes all 107 tests across 10 test suites sequentially |
| `npm run test:sales` | Backend | Runs Sales department workflow tests (8 tests) |
| `npm run test:supply-chain` | Backend | Runs Supply Chain & inventory tests (12 tests) |
| `npm run test:production` | Backend | Runs Production & manufacturing tests (14 tests) |
| `npm run test:logistics` | Backend | Runs Logistics & dispatch tests (22 tests) |
| `npm run test:security` | Backend | Runs Auth, RBAC, and session tests (7 tests) |
| `npm run test:shared` | Backend | Runs Tracking, PDFs, storage, search tests (13 tests) |
| `npm run test:full` | Backend | Runs Master 24-step cross-department lifecycle test (11 tests) |

---

## Test Verification

All automated tests use the Node.js native test runner (`node:test`) and verify real database transactions and business gates against MongoDB:

```bash
npm test
```

**Results:**
- **107 passing tests** across 10 test suites.
- **0 failing, 0 skipped**.
- Full test breakdown and architecture documentation is available in [FRONTEND_BACKEND_SEPARATION.md](FRONTEND_BACKEND_SEPARATION.md).

---

## Technology Stack

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide Icons, React Router v7, Motion.
- **Backend:** Node.js, Express 5, TypeScript, Mongoose 9, MongoDB, JWT (`jsonwebtoken`), bcrypt (`bcryptjs`).
- **PDF Generation:** PDFKit vector PDF engine (13 business document types).
- **File Storage:** Sandboxed private local file storage with SHA-256 checksum tracking and traversal protection.
- **Testing:** Node.js native test runner (`node:test`, `node:assert/strict`) + TSX.
