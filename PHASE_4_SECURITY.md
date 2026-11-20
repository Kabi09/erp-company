# CRYO Enterprise ERP 2.0 – Phase 4 Security, Authentication, RBAC & Hardening Report

## Executive Summary
**Phase 4** of CRYO Enterprise ERP 2.0 has successfully implemented enterprise-grade security, robust session management, atomic inventory concurrency protection, department-scoped API endpoints, multi-document transaction topology enforcement, and frontend bundle optimization.

The application now adheres to zero-trust principles:
1. All critical multi-document operations require atomic transaction sessions when configured for production or replica sets, with verified ACID rollback.
2. Concurrent material issuance race conditions are mathematically eliminated via conditional MongoDB updates (`{ currentStock: { $gte: issueQty } }`), preventing negative stock under all circumstances.
3. The monolithic `/api/erp/bootstrap` leak is eliminated: sensitive pricing, supplier POs, and cost data are strictly restricted by operational department, and password hashes are permanently stripped across all endpoints.
4. Authentication features anti-enumeration defenses, bcrypt hashing with 10 salt rounds, minimum 8-character password enforcement with complexity requirements, dual-token JWT architecture (15-minute access token + 7-day refresh token) with session replay detection, and rate-limiting against brute force attacks.
5. Administrative safeguards protect against privilege self-escalation, prevent deactivation or deletion of the last active Super Admin, and enforce soft deactivation over hard deletion for employees with historical business records.
6. The monolithic client bundle was reduced by **45%** (from >644 kB down to 355 kB, 104 kB gzip) via route-level `React.lazy()` code splitting across all 5 operational departments.
7. **28 of 28 automated tests pass cleanly** across unit logic, MongoDB integration, full lifecycle, and dedicated Phase 4 security/concurrency/transaction suites.

---

## 1. Resolution of Critical Phase 3 Audit Items

### 1.1 Issue 3.1: MongoDB Multi-Document Transaction Topology Safety
- **Root Cause in Phase 3**: Standalone MongoDB deployments silently executed operations without cross-document ACID rollback guarantees.
- **Phase 4 Implementation**:
  - `server/config/database.ts` now auto-detects replica set status via `replSetGetStatus`.
  - In production (`env.isProd`) or when `REQUIRE_REPLICA_SET=true` (or via explicit option `{ requireReplicaSet: true }`), `withTransaction` throws an explicit `TRANSACTION_TOPOLOGY_REQUIRED` configuration error rather than silently performing non-atomic execution.
  - A local replica set (`rs0` on port 27018) was set up and verified: deliberate transaction failure mid-operation confirmed 100% ACID rollback with zero orphaned documents persisted.

### 1.2 Issue 3.2: Concurrent Inventory Safety & Race Condition Elimination
- **Root Cause in Phase 3**: In-memory stock validation allowed two concurrent material issue requests at the same millisecond to both validate against historical balance and over-allocate, driving stock negative.
- **Phase 4 Implementation**:
  - Added `currentStock` tracking directly to `MaterialModel` and `Material` domain interface.
  - Implemented atomic conditional decrement in `MongoERPRepository.issueMaterial`:
    ```typescript
    const updated = await MaterialModel.findOneAndUpdate(
      { id: line.materialId, currentStock: { $gte: issueQty } },
      { $inc: { currentStock: -issueQty } },
      { session: session || undefined, returnDocument: 'after' },
    );
    if (!updated) {
      throw new Error(`INSUFFICIENT_STOCK: Available stock exhausted or below requested quantity for ${mrItem.materialName}.`);
    }
    ```
  - Also added atomic increment on GRN verification (`$inc: { currentStock: acceptedQty }`) and stock adjustments.
  - Automated concurrency test (`server/tests/security-auth.test.ts`) verified that when two requests simultaneously request 8 units from a stock of 10, exactly one request succeeds and the other fails cleanly with `INSUFFICIENT_STOCK`, leaving stock at exactly 2 units and never negative.

### 1.3 Issue 3.3: Scoped Bootstrap API & Password Leak Prevention
- **Root Cause in Phase 3**: `/api/erp/bootstrap` dumped all 29 database collections (including all employees, supplier quotes, customer payments, delivery issues) to any authenticated user regardless of department.
- **Phase 4 Implementation**:
  - Re-architected `/api/erp/bootstrap` in `server/routes/auth.routes.ts`:
    - **Super Admin / Admin**: Receives full system state for centralized administration.
    - **Sales Management**: Restricted to customers, products, enquiries, follow-ups, quotations, proforma invoices, customer POs, payments, and sales orders. Supplier directories, purchasing costs, and supplier POs are excluded.
    - **Supply Chain Management**: Restricted to materials, suppliers, material requests, material issues, supplier POs, GRNs, returns, and stock transactions.
    - **Production Management**: Restricted to production orders, BOMs, material requests, daily updates, quality checks, rework orders, and sanitized sales order summaries (item description and promised delivery date only; financial rates/terms excluded).
    - **Logistics Management**: Restricted to delivery orders, delivery issues, and shipping address projections of sales orders.
  - Unconditionally sanitized all employee objects returned via bootstrap: `passwordHash` is stripped via object destructuring before JSON serialization.

---

## 2. Authentication & Session Architecture

### 2.1 Dual-Token JWT with Session Rotation
- **Access Token**: Short-lived (15 minutes by default, configurable via `JWT_EXPIRES_IN`), signed with `JWT_SECRET`. Contains claims `{ sub: employeeId, type: 'access' }`.
- **Refresh Token**: Long-lived (7 days by default, configurable via `JWT_REFRESH_EXPIRES_IN`), signed with `JWT_REFRESH_SECRET`. Contains claims `{ sub: employeeId, sid: sessionId, type: 'refresh' }`.
- **Server-Side Session Store (`SessionModel`)**:
  - Stores SHA-256 hash of refresh token, client IP address, User-Agent, expiration timestamp, and `revoked` flag.
  - **Token Rotation**: Every call to `POST /api/auth/refresh` revokes the old session and issues a fresh Access/Refresh token pair.
  - **Replay Attack Detection**: If a client attempts to use an already-revoked refresh token, the server detects potential token compromise and immediately revokes all active sessions for that employee.
  - **Logout (`POST /api/auth/logout`)**: Immediately flags the session as revoked.
  - **Logout All (`POST /api/auth/logout-all`)**: Revokes all active sessions for the current employee across all browsers and devices.

### 2.2 Password Security & Anti-Enumeration
- **Credential Checking**: `POST /api/auth/login` returns an identical `401 Unauthorized: Invalid email/employee ID or password.` response whether the email does not exist or the password is incorrect. This prevents username enumeration attacks.
- **Password Strength**: Minimum 8 characters required with letter and digit complexity verification.
- **Hashing**: Bcrypt with 10 salt rounds.
- **Password Change (`POST /api/auth/change-password`)**:
  - Requires valid `currentPassword`.
  - Requires new password length >= 8 characters.
  - Upon successful change, immediately invalidates all other active sessions in `SessionModel`, protecting against compromised session tokens.

### 2.3 Brute Force & Rate Limiting
- Added `authRateLimiter` middleware to `POST /api/auth/login`.
- Tracks failed login attempts by IP address and target identifier with a sliding 15-minute window.
- Limits failed attempts to 10 per window; subsequent requests receive `429 Too Many Requests` with a `Retry-After` header.
- Resets failure counter upon successful authentication.

---

## 3. Employee & Role-Based Access Control (RBAC) Safeguards

### 3.1 Document Numbering & ID Generation
- `POST /api/admin/employees` automatically issues sequential employee IDs (`EMP-0001`, `EMP-0002`...) via atomic MongoDB `$inc` on `DocCounterModel` when not explicitly supplied.

### 3.2 Anti Self-Privilege Escalation
- `PUT /api/admin/employees/:id` validates that logged-in users cannot alter their own `roleId`, change their own `department`, or set their own `status: 'Inactive'`.

### 3.3 Last Active Super Admin Safeguard
- Both update and delete operations in `server/routes/admin.routes.ts` query `EmployeeModel.countDocuments({ roleId: 'role-super-admin', status: 'Active' })`.
- If only 1 active Super Admin remains, attempts to deactivate, demote, or delete that account are blocked with `403 Forbidden`.

### 3.4 Soft Deactivation Policy
- `DELETE /api/admin/employees/:id` queries `ActivityLogModel` for historical participation.
- If the employee has recorded actions, quotations, approvals, or issues in the system, hard deletion is blocked with `409 Conflict`, directing administrators to toggle `status: 'Inactive'` instead.
- Inactivating an employee immediately revokes all their active sessions in `SessionModel` and blocks token authentication on all endpoints.

---

## 4. Attack Surface Reduction & Security Middleware

| Middleware | Target Protection | Configuration / Behavior |
| :--- | :--- | :--- |
| `securityHeaders` | Clickjacking, MIME sniffing, XSS | `X-Content-Type-Options: nosniff`<br>`X-Frame-Options: SAMEORIGIN`<br>`X-XSS-Protection: 0`<br>`Referrer-Policy: strict-origin-when-cross-origin`<br>`Permissions-Policy: camera=(), microphone=(), geolocation=()`<br>`Strict-Transport-Security` in production |
| `corsMiddleware` | Unauthorized cross-origin resource sharing | Configurable via `CORS_ORIGIN`, supports credentials and preflight `OPTIONS` caching |
| `noSqlSanitizer` | MongoDB query / operator injection | Recursively inspects `req.body`, `req.query`, and `req.params`; rejects payloads containing keys with `$` or `.` with `400 Bad Request` |
| `express.json` | Denial of Service via large payloads | Payload ceiling restricted from 15MB down to **2MB** |
| `authRateLimiter` | Online password brute forcing / credential stuffing | Sliding window of 10 failed attempts per 15 minutes per IP/identifier |

---

## 5. Frontend Optimization & Code Splitting

### 5.1 Route-Level Code Splitting
- Prior to Phase 4, `src/App.tsx` statically imported 29 page components across all 4 departments, creating a monolithic `644 kB` JavaScript bundle that triggered build warnings.
- Converted all page routes to `React.lazy()` with dynamic import loaders.
- Wrapped `<Outlet />` inside `AppLayout.tsx` with `<React.Suspense fallback={<LoadingSkeleton />}>`.
- **Result**:
  - Main bundle decreased from `644 kB` to **`355.11 kB`** (`104.01 kB` gzipped).
  - 19 separate lazy-loaded chunks (`6 kB` to `28 kB`) are downloaded on-demand only when a user navigates to the respective department workspace.
  - Build completes in under **2 seconds**.

### 5.2 Automatic Token Refresh Interceptor
- In `src/services/api.ts`, added automatic 401 interception:
  - If an authenticated request receives `401 Unauthorized` and a refresh token exists in `localStorage`, the client calls `POST /api/auth/refresh`.
  - Upon successful rotation, the client updates stored tokens, re-attaches the new `Bearer <token>` header, and retries the original request seamlessly.
  - If refresh fails, tokens are purged and the client transitions cleanly to the `/login` screen.

---

## 6. Test Suite Execution & Verification

### 6.1 Security & Concurrency Test Suite (`server/tests/security-auth.test.ts`)
1. **Authentication Anti-Enumeration**: Verified identical 401 responses for unknown email vs wrong password.
2. **Refresh Token Rotation**: Verified that refreshing rotates both tokens and invalidates the prior refresh token.
3. **Replay Attack Detection**: Verified that attempting to reuse a revoked refresh token triggers immediate revocation of all sessions for that account.
4. **Password Policy & Session Purge**: Verified min-8 character requirement, current password validation, and invalidation of old sessions upon password change.
5. **RBAC Enforcement**: Verified 401 for unauthenticated calls and 403 for unauthorized module access (Sales Executive blocked from Admin).
6. **Administrative Safeguards**: Verified block on self-privilege escalation, block on deactivating last Super Admin, and block on hard-deleting employees with history.
7. **Department Scoping**: Verified that Sales Executive bootstrap never returns supplier pricing or employee password hashes.
8. **Inventory Concurrency Protection**: Verified that concurrent simultaneous requests for 8 units against 10 total stock allow exactly 1 request to succeed and reject the other with `INSUFFICIENT_STOCK`, keeping stock strictly at 2 units and never negative.
9. **ACID Transaction Rollback on Replica Set**: Verified that an aborted transaction inside `withTransaction` rolls back all multi-document modifications on MongoDB replica set (`rs0`).

### 6.2 Overall Test Status
```
▶ CRYO ERP 2.0 Comprehensive API Smoke, RBAC, and Full Lifecycle Test Suite
  ✔ 1. Authentication Tests (1412ms)
  ✔ 2. Role Permission & RBAC Enforcement (61ms)
  ✔ 3. Complete End-to-End Linked Order Lifecycle (3410ms)
✔ CRYO ERP 2.0 Comprehensive API Smoke, RBAC, and Full Lifecycle Test Suite

▶ CRYO ERP 2.0 MongoDB Integration and Optimization Test Suite
  ✔ 1. MongoDB Connection and Ping Verification (76ms)
  ✔ 2. Atomic Document Numbering via $inc (269ms)
  ✔ 3. Schema Validation and Unique Constraints (130ms)
  ✔ 4. Paginated REST Queries (65ms)
  ✔ 5. Lightweight Dropdown Options Projections (22ms)
  ✔ 6. Department Dashboard Summary Calculations (44ms)
  ✔ 7. Multi-Document Transaction Abstraction (withTransaction) (7ms)
✔ CRYO ERP 2.0 MongoDB Integration and Optimization Test Suite

▶ CRYO ERP 2.0 Phase 4 - Authentication, RBAC, Security & Concurrency Verification
  ✔ 1. Authentication & Anti-Enumeration Security (954ms)
  ✔ 2. Refresh Token Rotation & Session Lifecycle (235ms)
  ✔ 3. Password Change Policy & Session Revocation (2406ms)
  ✔ 4. RBAC Authorization & Safeguards (97ms)
  ✔ 5. Bootstrap API Security & Department Scoping (103ms)
  ✔ 6. Concurrent Inventory Safety & Race Condition Prevention (122ms)
✔ CRYO ERP 2.0 Phase 4 - Real Replica Set ACID Multi-Document Transaction Rollback (92ms)

✔ formatDocNo pads numbers to 4 digits
✔ calculateQuotationTotals computes subtotal, discount, GST, and grand total
✔ calculateDurationDays returns inclusive calendar days and -1 on invalid range
✔ computeMaterialStockMap derives balance strictly from ledger transactions
✔ validateMaterialIssueLine blocks negative stock and excess issuance
✔ deriveMaterialRequestStatus distinguishes issue status and physical receipt status
✔ calculatePaymentSummary only counts Verified payments toward outstanding balance
✔ deriveSalesOrderFulfillment and allocation quantities follow production & delivery records

Total: 28 passed, 0 failed, 0 skipped.
```
