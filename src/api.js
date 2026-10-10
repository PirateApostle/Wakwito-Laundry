const API_ROOT = '/api';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      ...options,
      credentials: 'same-origin',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (error) {
    throw new ApiError('Unable to reach the Wakwito server. Check that the backend is running and try again.', 0);
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : null;
  if (!response.ok) {
    throw new ApiError(payload?.error || `Request failed (${response.status}).`, response.status);
  }
  return payload;
}

export async function getOrders() {
  const payload = await apiRequest('/orders');
  return payload.orders;
}

export async function getPaymentOptions() {
  return apiRequest('/payments/options');
}

export async function createOrder(orderPayload) {
  const payload = await apiRequest('/orders', { method: 'POST', body: orderPayload });
  return payload;
}

export async function requestMpesaPayment(orderCode) {
  const payload = await apiRequest(`/orders/${encodeURIComponent(orderCode)}/payment`, {
    method: 'POST',
    body: {},
  });
  return payload.order;
}

export async function updateOrderStatus(orderCode, status) {
  const payload = await apiRequest(`/orders/${encodeURIComponent(orderCode)}/status`, {
    method: 'PATCH',
    body: { status },
  });
  return payload.order;
}

export async function retryApprovalNotifications(orderCode) {
  const payload = await apiRequest(`/orders/${encodeURIComponent(orderCode)}/approval-notifications/retry`, {
    method: 'POST',
    body: {},
  });
  return payload.order;
}

export async function updateProfile(profile) {
  const payload = await apiRequest('/auth/profile', { method: 'PUT', body: profile });
  return payload.user;
}

export function readCart() {
  try {
    return JSON.parse(localStorage.getItem('wakwito-cart') || '[]');
  } catch {
    return [];
  }
}

export function clearCart() {
  localStorage.removeItem('wakwito-cart');
}
