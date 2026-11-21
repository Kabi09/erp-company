import type {
  ActivityLog,
  ApprovalDecisionType,
  ApprovalRequest,
  ApprovalWorkflow,
  AuthUser,
  DeliveryOrder,
  Enquiry,
  ERPDatabase,
  GRN,
  Material,
  MaterialRequest,
  ProductionOrder,
  Quotation,
  Role,
  SalesOrder,
  SupplierPO,
} from '../types/erp';

const TOKEN_KEY = 'cryo_erp_jwt_token';
const REFRESH_KEY = 'cryo_erp_jwt_refresh';

const RAW_API_BASE = ((import.meta.env.VITE_API_BASE_URL as string) || '').replace(/\/$/, '');
export const API_BASE = RAW_API_BASE ? `${RAW_API_BASE}/api` : '/api';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setRefreshToken(token: string | null): void {
  if (token) {
    localStorage.setItem(REFRESH_KEY, token);
  } else {
    localStorage.removeItem(REFRESH_KEY);
  }
}

export function clearAuthTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  category?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function toQueryString(params?: Record<string, any>): string {
  if (!params) return '';
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  }
  const str = searchParams.toString();
  return str ? `?${str}` : '';
}

export interface ERPBootstrapPayload extends ERPDatabase {
  stockMap: Record<string, number>;
  currentUser: AuthUser;
}

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function onRefreshed(token: string) {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
}

async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      clearAuthTokens();
      return null;
    }
    const data = await res.json();
    setAuthToken(data.token);
    setRefreshToken(data.refreshToken);
    return data.token;
  } catch {
    clearAuthTokens();
    return null;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && path !== '/auth/login' && path !== '/auth/refresh') {
    // Attempt automatic silent refresh
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await tryRefreshToken();
      isRefreshing = false;
      if (newToken) {
        onRefreshed(newToken);
        headers.Authorization = `Bearer ${newToken}`;
        const retryRes = await fetch(`${API_BASE}${path}`, { ...options, headers });
        const retryText = await retryRes.text();
        return (retryText ? JSON.parse(retryText) : {}) as T;
      }
    } else {
      // Wait for ongoing refresh
      return new Promise<T>((resolve, reject) => {
        refreshSubscribers.push(async (newToken) => {
          try {
            headers.Authorization = `Bearer ${newToken}`;
            const retryRes = await fetch(`${API_BASE}${path}`, { ...options, headers });
            const retryText = await retryRes.text();
            resolve((retryText ? JSON.parse(retryText) : {}) as T);
          } catch (e) {
            reject(e);
          }
        });
      });
    }
    clearAuthTokens();
  }

  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || 'Invalid server response' };
  }
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data as T;
}

export const erpApi = {
  // Auth
  login: (identifier: string, password: string) =>
    request<{ token: string; refreshToken: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }),
  refresh: (refreshToken: string) =>
    request<{ token: string; refreshToken: string; user: AuthUser }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
  logout: (refreshToken?: string) =>
    request<{ ok: boolean }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }),
  logoutAll: () =>
    request<{ ok: boolean; revokedCount: number }>('/auth/logout-all', {
      method: 'POST',
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean; message: string; token: string; refreshToken: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  me: () => request<{ user: AuthUser }>('/auth/me'),
  updateProfile: (payload: { name?: string; phone?: string; currentPassword?: string; newPassword?: string }) =>
    request<{ user: AuthUser }>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  // Bootstrap
  bootstrap: () => request<ERPBootstrapPayload>('/erp/bootstrap'),

  // Notifications
  markNotificationRead: (id: string) => request<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request<{ ok: boolean }>('/notifications/read-all', { method: 'POST' }),

  // Sales
  createCustomer: (payload: any) =>
    request('/sales/customers', { method: 'POST', body: JSON.stringify(payload) }),
  updateCustomer: (id: string, payload: any) =>
    request(`/sales/customers/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  createProduct: (payload: any) =>
    request('/sales/products', { method: 'POST', body: JSON.stringify(payload) }),
  updateProduct: (id: string, payload: any) =>
    request(`/sales/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  createEnquiry: (payload: any) =>
    request('/sales/enquiries', { method: 'POST', body: JSON.stringify(payload) }),
  updateEnquiry: (id: string, payload: any) =>
    request(`/sales/enquiries/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  updateEnquiryStatus: (id: string, status: string, rejectionReason?: string) =>
    request(`/sales/enquiries/${id}/status`, { method: 'POST', body: JSON.stringify({ status, rejectionReason }) }),
  addFollowUp: (payload: any) =>
    request('/sales/follow-ups', { method: 'POST', body: JSON.stringify(payload) }),
  createFollowUp: (payload: any) =>
    request('/sales/follow-ups', { method: 'POST', body: JSON.stringify(payload) }),
  createQuotation: (payload: any) =>
    request('/sales/quotations', { method: 'POST', body: JSON.stringify(payload) }),
  reviseQuotation: (id: string, payload: any) =>
    request(`/sales/quotations/${id}/revise`, { method: 'POST', body: JSON.stringify(payload) }),
  acceptQuotation: (id: string, notes?: string) =>
    request(`/sales/quotations/${id}/accept`, { method: 'POST', body: JSON.stringify({ notes }) }),
  rejectQuotation: (id: string, reason: string) =>
    request(`/sales/quotations/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  updateQuotationStatus: (id: string, status: string, reason?: string) =>
    request(`/sales/quotations/${id}/${status.toLowerCase()}`, { method: 'POST', body: JSON.stringify({ reason }) }),
  generatePI: (payload: any) =>
    request('/sales/proforma-invoices', { method: 'POST', body: JSON.stringify(payload) }),
  createProformaInvoice: (payload: any) =>
    request('/sales/proforma-invoices', { method: 'POST', body: JSON.stringify(payload) }),
  createCustomerPO: (payload: any) =>
    request('/sales/customer-pos', { method: 'POST', body: JSON.stringify(payload) }),
  resolveCustomerPODiscrepancy: (id: string, payload?: any) =>
    request(`/sales/customer-pos/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify(typeof payload === 'string' ? { resolutionNotes: payload } : payload || {}),
    }),
  createPayment: (payload: any) =>
    request('/sales/payments', { method: 'POST', body: JSON.stringify(payload) }),
  verifyPayment: (id: string, status?: string) =>
    request(`/sales/payments/${id}/verify`, { method: 'POST', body: JSON.stringify({ status }) }),
  confirmSalesOrder: (payload: any) =>
    request('/sales/orders/confirm', { method: 'POST', body: JSON.stringify(payload) }),
  createSalesOrder: (payload: any) =>
    request('/sales/orders/confirm', { method: 'POST', body: JSON.stringify(payload) }),

  // Supply Chain
  createMaterial: (payload: any) =>
    request('/supply-chain/materials', { method: 'POST', body: JSON.stringify(payload) }),
  updateMaterial: (id: string, payload: any) =>
    request(`/supply-chain/materials/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  stockAdjustment: (payload: any) =>
    request('/supply-chain/stock-adjustments', { method: 'POST', body: JSON.stringify(payload) }),
  adjustStock: (payload: any) =>
    request('/supply-chain/stock-adjustments', { method: 'POST', body: JSON.stringify(payload) }),
  createSupplier: (payload: any) =>
    request('/supply-chain/suppliers', { method: 'POST', body: JSON.stringify(payload) }),
  updateSupplier: (id: string, payload: any) =>
    request(`/supply-chain/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  createMaterialIssue: (payload: any) =>
    request('/supply-chain/material-issues', { method: 'POST', body: JSON.stringify(payload) }),
  createSupplierPO: (payload: any) =>
    request('/supply-chain/purchase-orders', { method: 'POST', body: JSON.stringify(payload) }),
  createGRN: (payload: any) =>
    request('/supply-chain/grns', { method: 'POST', body: JSON.stringify(payload) }),
  verifyGRN: (id: string, payload: any) =>
    request(`/supply-chain/grns/${id}/verify`, { method: 'POST', body: JSON.stringify(payload) }),
  createSupplierReturn: (payload: any) =>
    request('/supply-chain/supplier-returns', { method: 'POST', body: JSON.stringify(payload) }),
  getMaterialRequestShortage: (id: string) =>
    request(`/supply-chain/material-requests/${id}/shortage`),
  createProductionReturn: (payload: any) =>
    request('/supply-chain/production-returns', { method: 'POST', body: JSON.stringify(payload) }),
  getStockReconciliation: () =>
    request('/supply-chain/stock-reconciliation'),
  reconcileStock: () =>
    request('/supply-chain/stock-reconciliation/reconcile', { method: 'POST' }),

  // Production
  createProductionOrder: (payload: any) =>
    request('/production/orders', { method: 'POST', body: JSON.stringify(payload) }),
  getProductionOrderDetail: (id: string) =>
    request<any>(`/production/orders/${id}`),
  rescheduleProductionOrder: (id: string, payload: { newStartDate: string; newEndDate: string; reason: string }) =>
    request(`/production/orders/${id}/reschedule`, { method: 'POST', body: JSON.stringify(payload) }),
  returnProductionMaterials: (payload: any) =>
    request('/production/material-returns', { method: 'POST', body: JSON.stringify(payload) }),
  updateProductionOrderStatus: (id: string, status: string, notes?: string) =>
    request(`/production/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, notes }) }),
  startProduction: (id: string, payload?: any) =>
    request(`/production/orders/${id}/start`, { method: 'POST', body: JSON.stringify(payload || {}) }),
  completeManufacturing: (id: string, payload?: any) =>
    request(`/production/orders/${id}/complete-manufacturing`, { method: 'POST', body: JSON.stringify(payload || {}) }),
  createBOM: (payload: any) =>
    request('/production/boms', { method: 'POST', body: JSON.stringify(payload) }),
  saveBOM: (payload: any) =>
    request('/production/boms', { method: 'POST', body: JSON.stringify(payload) }),
  createMaterialRequest: (payload: any) =>
    request('/production/material-requests', { method: 'POST', body: JSON.stringify(payload) }),
  sendBOMRequest: (id: string) =>
    request(`/production/boms/${id}/send-request`, { method: 'POST' }),
  getMaterialReceipts: (params?: Record<string, any>) =>
    request<any[]>(`/production/material-receipts${toQueryString(params)}`),
  acknowledgeMaterialReceipt: (id: string, payload?: any) =>
    request(`/production/material-receipts/${id}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify(typeof payload === 'string' ? { discrepancyNotes: payload } : payload || {}),
    }),
  addDailyUpdate: (payload: any) =>
    request('/production/daily-updates', { method: 'POST', body: JSON.stringify(payload) }),
  createDailyUpdate: (payload: any) =>
    request('/production/daily-updates', { method: 'POST', body: JSON.stringify(payload) }),
  createQC: (payload: any) =>
    request('/production/quality-checks', { method: 'POST', body: JSON.stringify(payload) }),
  createQualityCheck: (payload: any) =>
    request('/production/quality-checks', { method: 'POST', body: JSON.stringify(payload) }),
  resolveRework: (id: string, payload: any) =>
    request(`/production/rework/${id}/resolve`, { method: 'POST', body: JSON.stringify(payload) }),
  completeRework: (id: string, payload: any) =>
    request(`/production/rework/${id}/complete`, { method: 'POST', body: JSON.stringify(payload) }),

  // Logistics
  getReadyForDispatch: () => request<any[]>('/logistics/ready'),
  getDeliveryOrderDetail: (id: string) => request<any>(`/logistics/delivery-orders/${id}`),
  createDeliveryOrder: (payload: any) =>
    request('/logistics/delivery-orders', { method: 'POST', body: JSON.stringify(payload) }),
  cancelDeliveryOrder: (id: string, reason: string) =>
    request(`/logistics/delivery-orders/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  updateDeliveryStatus: (id: string, payload: any) =>
    request(`/logistics/delivery-orders/${id}/status`, { method: 'PATCH', body: JSON.stringify(payload) }),
  confirmDispatch: (id: string, payload?: any) =>
    request(`/logistics/delivery-orders/${id}/dispatch`, { method: 'POST', body: JSON.stringify(payload || {}) }),
  confirmDelivery: (id: string, payload?: any) =>
    request(`/logistics/delivery-orders/${id}/deliver`, { method: 'POST', body: JSON.stringify(payload || {}) }),
  getDeliveryIssues: (params?: any) =>
    request<any[]>(`/logistics/issues${toQueryString(params)}`),
  reportDeliveryIssue: (payload: any) =>
    request('/logistics/issues', { method: 'POST', body: JSON.stringify(payload) }),
  resolveDeliveryIssue: (id: string, payload: any) =>
    request(`/logistics/issues/${id}/resolve`, { method: 'POST', body: JSON.stringify(payload) }),
  getLogisticsReports: () => request<any>('/logistics/reports'),

  // Admin
  createEmployee: (payload: any) =>
    request('/admin/employees', { method: 'POST', body: JSON.stringify(payload) }),
  updateEmployee: (id: string, payload: any) =>
    request(`/admin/employees/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteEmployee: (id: string) =>
    request(`/admin/employees/${id}`, { method: 'DELETE' }),
  getRoles: () => request<Role[]>('/admin/roles'),
  createRole: (payload: any) =>
    request<Role>('/admin/roles', { method: 'POST', body: JSON.stringify(payload) }),
  updateRole: (id: string, payload: any) =>
    request<Role>(`/admin/roles/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteRole: (id: string) =>
    request<{ ok: boolean; deletedRoleId: string }>(`/admin/roles/${id}`, { method: 'DELETE' }),

  // Employee Access Overrides
  getEmployeePermissions: (id: string) =>
    request<any>(`/admin/employees/${id}/permissions`),
  updateEmployeePermissions: (id: string, overrides: any) =>
    request<any>(`/admin/employees/${id}/permissions`, { method: 'PUT', body: JSON.stringify({ overrides }) }),
  resetEmployeePermissions: (id: string) =>
    request<any>(`/admin/employees/${id}/permissions/reset`, { method: 'POST' }),

  // Approval Workflows Policy
  getApprovalWorkflows: () =>
    request<ApprovalWorkflow[]>('/admin/approval-workflows'),
  createApprovalWorkflow: (payload: any) =>
    request<ApprovalWorkflow>('/admin/approval-workflows', { method: 'POST', body: JSON.stringify(payload) }),
  updateApprovalWorkflow: (id: string, payload: any) =>
    request<ApprovalWorkflow>(`/admin/approval-workflows/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  toggleApprovalWorkflow: (id: string) =>
    request<{ ok: boolean; id: string; enabled: boolean }>(`/admin/approval-workflows/${id}/toggle`, { method: 'PATCH' }),
  deleteApprovalWorkflow: (id: string) =>
    request<{ ok: boolean; deletedId: string }>(`/admin/approval-workflows/${id}`, { method: 'DELETE' }),

  // Approval Inbox & Decisions
  getApprovalInbox: () =>
    request<{ pending: ApprovalRequest[]; mySubmissions: ApprovalRequest[]; history: ApprovalRequest[]; all?: ApprovalRequest[] }>('/approvals/inbox'),
  getApprovalRequest: (id: string) =>
    request<{ request: ApprovalRequest; workflow?: ApprovalWorkflow; canDecide: boolean; decideBlockReason?: string }>(`/approvals/requests/${id}`),
  decideApprovalRequest: (id: string, decision: ApprovalDecisionType, remarks?: string) =>
    request<{ ok: boolean; request: ApprovalRequest }>(`/approvals/requests/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify({ decision, remarks }),
    }),
  withdrawApprovalRequest: (id: string) =>
    request<{ ok: boolean; request: ApprovalRequest }>(`/approvals/requests/${id}/withdraw`, { method: 'POST' }),

  // Quotation & Supplier PO Submissions
  submitQuotationForApproval: (id: string) =>
    request<{ ok: boolean; approvalRequired: boolean; quotation: any; approvalRequest?: any }>(`/sales/quotations/${id}/submit-approval`, { method: 'POST' }),
  submitSupplierPOForApproval: (id: string) =>
    request<{ ok: boolean; approvalRequired: boolean; supplierPO: any; approvalRequest?: any }>(`/supply-chain/supplier-pos/${id}/submit-approval`, { method: 'POST' }),
  updateCompany: (payload: any) =>
    request('/admin/company', { method: 'PUT', body: JSON.stringify(payload) }),
  resetDemoData: (mode: 'seed' | 'clean') =>
    request('/admin/reset-demo', { method: 'POST', body: JSON.stringify({ mode }) }),
  getAuditLogs: (params?: PaginationParams & { department?: string; actorId?: string; action?: string }) =>
    request<PaginatedResponse<ActivityLog>>(`/admin/audit-logs${toQueryString(params)}`),

  // Phase 3: Paginated Queries
  getEnquiries: (params?: PaginationParams) =>
    request<PaginatedResponse<Enquiry>>(`/sales/enquiries${toQueryString(params)}`),
  getQuotations: (params?: PaginationParams) =>
    request<PaginatedResponse<Quotation>>(`/sales/quotations${toQueryString(params)}`),
  getSalesOrders: (params?: PaginationParams) =>
    request<PaginatedResponse<SalesOrder>>(`/sales/orders${toQueryString(params)}`),
  getMaterials: (params?: PaginationParams) =>
    request<PaginatedResponse<Material>>(`/supply-chain/materials${toQueryString(params)}`),
  getMaterialRequests: (params?: PaginationParams) =>
    request<PaginatedResponse<MaterialRequest>>(`/supply-chain/material-requests${toQueryString(params)}`),
  getSupplierPOs: (params?: PaginationParams) =>
    request<PaginatedResponse<SupplierPO>>(`/supply-chain/purchase-orders${toQueryString(params)}`),
  getGRNs: (params?: PaginationParams) =>
    request<PaginatedResponse<GRN>>(`/supply-chain/grns${toQueryString(params)}`),
  getProductionOrders: (params?: PaginationParams) =>
    request<PaginatedResponse<ProductionOrder>>(`/production/orders${toQueryString(params)}`),
  getDeliveryOrders: (params?: PaginationParams) =>
    request<PaginatedResponse<DeliveryOrder>>(`/logistics/delivery-orders${toQueryString(params)}`),

  // Phase 3: Lightweight Dropdown Options
  getCustomerOptions: () =>
    request<Array<{ id: string; name: string; contactPerson: string; phone: string; gstin: string }>>('/sales/customers/options'),
  getProductOptions: () =>
    request<Array<{ id: string; name: string; model: string; category: string; sellingPrice: number }>>('/sales/products/options'),
  getMaterialOptions: () =>
    request<Array<{ id: string; code: string; name: string; unit: string; minStock: number }>>('/supply-chain/materials/options'),
  getSupplierOptions: () =>
    request<Array<{ id: string; name: string; contactPerson: string; phone: string; email: string }>>('/supply-chain/suppliers/options'),

  // Phase 3: Dashboard Summaries
  getSalesSummary: () => request<any>('/sales/summary'),
  getSupplyChainSummary: () => request<any>('/supply-chain/summary'),
  getProductionSummary: () => request<any>('/production/summary'),
  getLogisticsSummary: () => request<any>('/logistics/summary'),

  // Phase 9: Shared Enterprise Integration Endpoints
  getAdminSummary: () => request<any>('/admin/summary'),
  getOrderTrackingDetail: (salesOrderId: string) => request<any>(`/tracking/${salesOrderId}`),
  getTrackingOrders: (params?: PaginationParams & { status?: string }) =>
    request<PaginatedResponse<SalesOrder>>(`/tracking${toQueryString(params)}`),
  globalSearch: (q: string) => request<any>(`/search?q=${encodeURIComponent(q)}`),
  getSharedReports: () => request<any>('/reports/cross-department'),
  uploadFile: async (formData: FormData) => {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/files/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'File upload failed');
    }
    return res.json();
  },
  getDocumentPDFBlob: async (type: string, id: string): Promise<Blob> => {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/documents/${type}/${id}/pdf`, {
      method: 'GET',
      headers,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to generate PDF document');
    }
    return res.blob();
  },
  getDocumentPDFUrl: (type: string, id: string): string => {
    const token = getAuthToken();
    return `${API_BASE}/documents/${type}/${id}/pdf${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },
  downloadDocumentPDF: async (type: string, id: string, docNo: string) => {
    const blob = await erpApi.getDocumentPDFBlob(type, id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docNo.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
