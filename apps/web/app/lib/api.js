export function getApiUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:5000/api/v1`;
  }
  return 'http://localhost:5000/api/v1';
}

export async function apiRequest(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(`${getApiUrl()}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(response.ok ? 'The server returned an invalid response.' : 'The request failed.');
  }
  if (!response.ok) {
    throw new Error(result?.message || 'The request failed.');
  }
  return result;
}

export function roleDashboard(role) {
  if (role === 'admin') {
    return '/admin/dashboard';
  }
  if (role === 'fundi') {
    return '/fundi/dashboard';
  }
  return '/customer/dashboard';
}

export function formatKES(amount) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}
