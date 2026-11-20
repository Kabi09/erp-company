import type { AuthUser, ERPDatabase } from '../types/erp';

const TOKEN_KEY = 'cryo_erp_jwt_token';

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

export interface ERPBootstrapPayload extends ERPDatabase {
  stockMap: Record<string, number>;
  currentUser: AuthUser;
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
  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
  });
  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || 'Invalid server response' };
  }
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') {
      setAuthToken(null);
    }
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data as T;
}

export const erpApi = {
  // Auth
  login: (identifier: string, password: string) =>
    request<{ token: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }),
  me: () => request<{ user: AuthUser }>('/auth/me'),
  updateProfile: (payload: { name?: string; phone?: string; newPassword?: string }) =>
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
  updateEnquiryStatus: (id: string, status: string, rejectionReason?: string) =>
    request(`/sales/enquiries/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, rejectionReason }),
    }),
  createFollowUp: (payload: any) =>
    request('/sales/follow-ups', { method: 'POST', body: JSON.stringify(payload) }),
  createQuotation: (payload: any) =>
    request('/sales/quotations', { method: 'POST', body: JSON.stringify(payload) }),
  reviseQuotation: (id: string, payload: any) =>
    request(`/sales/quotations/${id}/revise`, { method: 'POST', body: JSON.stringify(payload) }),
  updateQuotationStatus: (id: string, status: string, rejectionReason?: string) =>
    request(`/sales/quotations/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, rejectionReason }),
    }),
  createProformaInvoice: (payload: any) =>
    request('/sales/proforma-invoices', { method: 'POST', body: JSON.stringify(payload) }),
  createCustomerPO: (payload: any) =>
    request('/sales/customer-pos', { method: 'POST', body: JSON.stringify(payload) }),
  resolveCustomerPODiscrepancy: (id: string, resolutionNotes: string) =>
    request(`/sales/customer-pos/${id}/resolve-discrepancy`, {
      method: 'POST',
      body: JSON.stringify({ resolutionNotes }),
    }),
  createPayment: (payload: any) =>
    request('/sales/payments', { method: 'POST', body: JSON.stringify(payload) }),
  verifyPayment: (id: string, status: 'Verified' | 'Rejected' | 'Reversed', remarks?: string) =>
    request(`/sales/payments/${id}/verify`, {
      method: 'POST',
      body: JSON.stringify({ status, remarks }),
    }),
  createSalesOrder: (payload: any) =>
    request('/sales/sales-orders', { method: 'POST', body: JSON.stringify(payload) }),

  // Supply Chain
  createMaterial: (payload: any) =>
    request('/supply-chain/materials', { method: 'POST', body: JSON.stringify(payload) }),
  adjustStock: (payload: { materialId: string; quantityDelta: number; remarks: string }) =>
    request('/supply-chain/stock-adjustment', { method: 'POST', body: JSON.stringify(payload) }),
  createSupplier: (payload: any) =>
    request('/supply-chain/suppliers', { method: 'POST', body: JSON.stringify(payload) }),
  createMaterialIssue: (payload: any) =>
    request('/supply-chain/material-issues', { method: 'POST', body: JSON.stringify(payload) }),
  createSupplierPO: (payload: any) =>
    request('/supply-chain/supplier-pos', { method: 'POST', body: JSON.stringify(payload) }),
  createGRN: (payload: any) =>
    request('/supply-chain/grns', { method: 'POST', body: JSON.stringify(payload) }),
  verifyGRN: (id: string, payload: any) =>
    request(`/supply-chain/grns/${id}/verify`, { method: 'POST', body: JSON.stringify(payload) }),
  createSupplierReturn: (payload: any) =>
    request('/supply-chain/supplier-returns', { method: 'POST', body: JSON.stringify(payload) }),

  // Production
  createProductionOrder: (payload: any) =>
    request('/production/orders', { method: 'POST', body: JSON.stringify(payload) }),
  saveBOM: (payload: any) =>
    request('/production/boms', { method: 'POST', body: JSON.stringify(payload) }),
  sendBOMRequest: (bomId: string) =>
    request(`/production/boms/${bomId}/send-request`, { method: 'POST' }),
  acknowledgeMaterialReceipt: (issueId: string, discrepancyNotes?: string) =>
    request(`/production/material-receipts/${issueId}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ discrepancyNotes }),
    }),
  startProduction: (id: string, payload: any) =>
    request(`/production/orders/${id}/start`, { method: 'POST', body: JSON.stringify(payload) }),
  createDailyUpdate: (payload: any) =>
    request('/production/daily-updates', { method: 'POST', body: JSON.stringify(payload) }),
  completeManufacturing: (id: string, payload: any) =>
    request(`/production/orders/${id}/complete-manufacturing`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createQualityCheck: (payload: any) =>
    request('/production/quality-checks', { method: 'POST', body: JSON.stringify(payload) }),
  completeRework: (id: string, payload: any) =>
    request(`/production/rework/${id}/complete`, { method: 'POST', body: JSON.stringify(payload) }),

  // Logistics
  createDeliveryOrder: (payload: any) =>
    request('/logistics/delivery-orders', { method: 'POST', body: JSON.stringify(payload) }),
  confirmDispatch: (id: string, payload: any) =>
    request(`/logistics/delivery-orders/${id}/dispatch`, { method: 'POST', body: JSON.stringify(payload) }),
  confirmDelivery: (id: string, payload: any) =>
    request(`/logistics/delivery-orders/${id}/deliver`, { method: 'POST', body: JSON.stringify(payload) }),
  resolveDeliveryIssue: (id: string, payload: { resolutionNotes: string; retryTransit: boolean }) =>
    request(`/logistics/delivery-issues/${id}/resolve`, { method: 'POST', body: JSON.stringify(payload) }),

  // Admin
  createEmployee: (payload: any) =>
    request('/admin/employees', { method: 'POST', body: JSON.stringify(payload) }),
  updateEmployee: (id: string, payload: any) =>
    request(`/admin/employees/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  updateRole: (id: string, payload: any) =>
    request(`/admin/roles/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  updateCompany: (payload: any) =>
    request('/admin/company', { method: 'PUT', body: JSON.stringify(payload) }),
  resetDemoData: (mode: 'seed' | 'clean') =>
    request('/admin/reset-demo', { method: 'POST', body: JSON.stringify({ mode }) }),
};
