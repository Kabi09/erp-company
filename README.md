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

CRYO Enterprise ERP 2.0 is organized into decoupled, 100% standalone `frontend/` and `backend/` applications (each with its own `package.json`, `package-lock.json`, `node_modules/`, `tsconfig.json`, and `.env`):

```
K:\2.0\erp-company\
├── frontend\                  # Standalone React 19 + TypeScript + Vite 8 SPA (Port 5173)
│   ├── src\                   # React components, pages, hooks, utils, types, services
│   ├── .env                   # Frontend environment config (VITE_API_BASE_URL)
│   ├── .env.example
│   ├── .gitignore
│   ├── package.json           # Frontend dependencies (Tailwind v4, Lucide, Motion)
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── vercel.json            # SPA routing rewrites
│   └── vite.config.ts         # Vite bundler with /api proxy to backend
│
├── backend\                   # Standalone Node.js + Express 5 + Mongoose 9 REST API (Port 5000)
│   ├── server.ts              # Standalone Express server (with /health check & default app export)
│   ├── server\                # Routes, controllers, models, services, repositories
│   │   └── tests\             # Automated test suites
│   ├── src\                   # Domain types & calculation utilities (self-contained)
│   ├── uploads\               # Private file uploads storage directory
│   ├── .env                   # Backend environment config (PORT, MONGODB_URI, JWT secrets, CORS)
│   ├── .env.example
│   ├── .gitignore
│   ├── package.json           # Backend dependencies (Express, JWT, PDFKit, Multer, tsx)
│   ├── package-lock.json
│   └── tsconfig.json
│
├── docs\                      # Architecture reports, phase logs & workflow Markdown docs
├── client-user-guide\         # Visual Client User Manuals (PDF, DOCX, annotated PNGs)
└── README.md
```

---

## Prerequisites

1. **Node.js**: `v20.x` or higher (ESNext module support)
2. **MongoDB**: Local MongoDB `v6.0+` instance running on `mongodb://127.0.0.1:27017` (or MongoDB Atlas connection string)
3. **npm**: `v10.x` or higher

---

## Quick Start (Run Backend & Frontend Independently)

1. **Configure Environment Variables:**
   - **Backend (`backend/.env`)**: Copy `backend/.env.example` to `backend/.env`:
     ```env
     PORT=5000
     NODE_ENV=development
     MONGODB_URI=mongodb://127.0.0.1:27017/cryo_erp
     JWT_SECRET=cryo-erp-2-local-dev-secret-key-at-least-32chars
     JWT_REFRESH_SECRET=cryo-erp-2-refresh-dev-secret-key-at-least-32chars
     CLIENT_URL=http://localhost:5173
     CORS_ORIGIN=http://localhost:5173
     ```
   - **Frontend (`frontend/.env`)**: Copy `frontend/.env.example` to `frontend/.env`:
     ```env
     VITE_API_BASE_URL=http://localhost:5000
     ```

2. **Start Backend Terminal (`http://localhost:5000`):**
   ```bash
   cd backend
   npm install
   npm run dev
   ```

3. **Start Frontend Terminal (`http://localhost:5173`):**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

---

## Independent Folder Scripts

### Frontend (`cd frontend`)
```bash
npm install        # Installs dependencies into frontend/node_modules & frontend/package-lock.json
npm run dev        # Starts Vite dev server on http://localhost:5173
npm run lint       # Typecheck frontend (tsc --noEmit)
npm run build      # Builds production SPA to frontend/dist/
npm run preview    # Preview production build locally
```

### Backend (`cd backend`)
```bash
npm install        # Installs dependencies into backend/node_modules & backend/package-lock.json
npm run dev        # Starts Express server on http://localhost:5000 with tsx watch
npm run start      # Starts production API server via tsx server.ts
npm run lint       # Typecheck backend (tsc --noEmit)
npm run build      # Typecheck backend (tsc --noEmit)
npm test           # Runs all backend and integration test suites
```

---

## Script Reference

| Folder | Command | Description |
| :--- | :--- | :--- |
| `backend/` | `npm run dev` | Starts standalone Express API server with file watching (`5000`) |
| `backend/` | `npm run start` | Runs `tsx server.ts` for production Node hosting |
| `backend/` | `npm run lint` / `build` | Typechecks backend TypeScript (`0` errors) |
| `backend/` | `npm test` | Executes all backend test suites sequentially |
| `backend/` | `npm run test:sales` | Runs Sales department workflow tests |
| `backend/` | `npm run test:supply-chain` | Runs Supply Chain & inventory tests |
| `backend/` | `npm run test:production` | Runs Production & manufacturing tests |
| `backend/` | `npm run test:logistics` | Runs Logistics & dispatch tests |
| `backend/` | `npm run test:security` | Runs Auth, RBAC, and session tests |
| `backend/` | `npm run test:shared` | Runs Tracking, PDFs, storage, search tests |
| `backend/` | `npm run test:full` | Runs Master cross-department lifecycle test |
| `frontend/` | `npm run dev` | Starts Vite dev server with HMR (`5173`) |
| `frontend/` | `npm run lint` | Typechecks frontend TypeScript only |
| `frontend/` | `npm run build` | Builds optimized production client bundle (`frontend/dist`) |

---

## Test Verification

All automated tests use the Node.js native test runner (`node:test`) and verify real database transactions and business gates against MongoDB:

```bash
npm test
```

**Results:**
- **107 passing tests** across 10 test suites.
- **0 failing, 0 skipped**.
- Full test breakdown and architecture documentation is available in [docs/FRONTEND_BACKEND_SEPARATION.md](docs/FRONTEND_BACKEND_SEPARATION.md).

---

## Technology Stack

- **Frontend:** React 19, TypeScript, Vite 8, Tailwind CSS v4, Lucide Icons, React Router v7, Motion.
- **Backend:** Node.js, Express 5, TypeScript, Mongoose 9, MongoDB, JWT (`jsonwebtoken`), bcrypt (`bcryptjs`).
- **PDF Generation:** PDFKit vector PDF engine (13 business document types).
- **File Storage:** Sandboxed private local file storage with SHA-256 checksum tracking and traversal protection.
- **Testing:** Node.js native test runner (`node:test`, `node:assert/strict`) + TSX.
