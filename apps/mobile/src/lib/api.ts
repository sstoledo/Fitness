import { useAppStore } from '@/store/useAppStore';

/**
 * Central HTTP client for the Fitness API.
 *
 * Transport decision (Cut 1): bearer token in the Authorization header.
 * Cookies are awkward in React Native (httpOnly cookie jars need extra
 * plumbing and Expo web breaks cookie isolation), so the backend issues an
 * opaque session token and the app attaches it to every request.
 *
 * Auth endpoint contract (assumed until task #4 wires the real API):
 * - POST /api/auth/register   → 201 { token, user }
 * - POST /api/auth/login      → 200 { token, user }
 * - POST /api/auth/logout     → 204
 * - GET  /api/auth/session    → 200 { user }
 */

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export class NetworkRequestError extends Error {
  constructor() {
    super('Could not reach the server. Check your connection and try again.');
    this.name = 'NetworkRequestError';
  }
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  /** When true (default), a 401 response clears the local session. */
  auth?: boolean;
}

function extractErrorMessage(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const { message, error } = data as Record<string, unknown>;
  if (typeof message === 'string' && message.length > 0) return message;
  if (typeof error === 'string' && error.length > 0) return error;
  return null;
}

export function parseSessionUser(data: unknown): { id: string; email: string; name: string } | null {
  if (typeof data !== 'object' || data === null) return null;
  const { user } = data as Record<string, unknown>;
  if (typeof user !== 'object' || user === null) return null;
  const { id, email, name } = user as Record<string, unknown>;
  return {
    id: typeof id === 'string' ? id : '',
    email: typeof email === 'string' ? email : '',
    name: typeof name === 'string' && name.length > 0 ? name : 'Athlete',
  };
}

export function parseAuthPayload(data: unknown): { token: string; user: ReturnType<typeof parseSessionUser> } {
  if (typeof data !== 'object' || data === null) {
    throw new ApiRequestError(502, 'Unexpected server response.');
  }
  const { token } = data as Record<string, unknown>;
  if (typeof token !== 'string' || token.length === 0) {
    throw new ApiRequestError(502, 'Unexpected server response.');
  }
  return { token, user: parseSessionUser(data) };
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const { token, clearSession, setOffline } = useAppStore.getState();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth && token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // DNS failure, refused connection, offline device, etc.
    setOffline(true);
    throw new NetworkRequestError();
  }

  // A response means the network is fine even if the request failed.
  setOffline(false);

  const data: unknown = response.status === 204 ? null : await response.json().catch(() => null);

  if (response.status === 401 && auth) {
    // The stored session was rejected: clear it so the auth gate redirects.
    clearSession();
    throw new ApiRequestError(401, 'Your session has expired. Please sign in again.');
  }

  if (!response.ok) {
    const message = extractErrorMessage(data) ?? `Request failed with status ${response.status}`;
    throw new ApiRequestError(response.status, message);
  }

  return data as T;
}
