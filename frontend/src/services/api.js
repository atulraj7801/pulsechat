import { useAuth } from '../stores/auth';
let refreshPromise;
export class ApiError extends Error {
  constructor(message, status, code, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}
export async function refreshSession() {
  if (!refreshPromise) {
    const rotate = async () => {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        if (res.status === 401) useAuth.getState().clear();
        throw new ApiError('Please sign in again.', res.status);
      }
      const session = await res.json();
      useAuth.getState().setSession(session);
      return session;
    };
    // Serialize cookie rotation across tabs as well as requests within this tab.
    refreshPromise = (navigator.locks ? navigator.locks.request('pulse-refresh', rotate) : rotate()).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}
export async function api(path, options = {}, retry = true) {
  const token = useAuth.getState().token;
  let res;
  try {
    res = await fetch(`/api${path}`, {
      ...options,
      signal: options.signal || AbortSignal.timeout(15000),
      credentials: 'include',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(
      'Could not reach PulseChat. Check your connection and try again.',
      0,
      'OFFLINE',
    );
  }
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    await refreshSession();
    return api(path, options, false);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(
      data.error?.message || 'Request failed.',
      res.status,
      data.error?.code,
      data.error?.fields,
    );
  }
  return res.status === 204 ? null : res.json();
}
