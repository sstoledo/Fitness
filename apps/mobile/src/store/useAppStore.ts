import type { LoginDto, RegisterDto } from '@fitness/contracts';
import { create } from 'zustand';

import { apiFetch, ApiRequestError, NetworkRequestError, parseAuthPayload, parseSessionUser } from '@/lib/api';
import { clearSessionToken, loadSessionToken, saveSessionToken } from '@/lib/session-storage';

type SocketStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

/**
 * Session lifecycle:
 * - unknown: storage has not been read yet (app just launched).
 * - restoring: a stored token exists and is being validated against the API.
 * - authenticated: a token is present (validated, or kept while offline).
 * - unauthenticated: no usable session; the auth gate routes to login.
 */
export type SessionStatus = 'unknown' | 'restoring' | 'authenticated' | 'unauthenticated';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

interface AppState {
  socketStatus: SocketStatus;
  setSocketStatus: (status: SocketStatus) => void;

  sessionStatus: SessionStatus;
  token: string | null;
  user: SessionUser | null;
  /** True when the last API call failed at the network level (server down / offline). */
  offline: boolean;

  bootstrapSession: () => Promise<void>;
  /** Re-validates the stored token (boot restore + manual retry). */
  validateSession: () => Promise<void>;
  signIn: (input: LoginDto) => Promise<void>;
  registerAccount: (input: RegisterDto) => Promise<void>;
  signOut: () => Promise<void>;
  /** Drops the local session without hitting the API (401 handler). */
  clearSession: () => void;
  setOffline: (offline: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  socketStatus: 'idle',
  setSocketStatus: (socketStatus) => set({ socketStatus }),

  sessionStatus: 'unknown',
  token: null,
  user: null,
  offline: false,

  bootstrapSession: async () => {
    const token = await loadSessionToken();
    if (!token) {
      set({ sessionStatus: 'unauthenticated', token: null, user: null });
      return;
    }
    set({ token, sessionStatus: 'restoring' });
    await get().validateSession();
  },

  validateSession: async () => {
    const { token } = get();
    if (!token) {
      set({ sessionStatus: 'unauthenticated', token: null, user: null });
      return;
    }
    try {
      const data = await apiFetch<unknown>('/api/auth/session');
      set({ user: parseSessionUser(data), sessionStatus: 'authenticated', offline: false });
    } catch (error) {
      // A 401 already cleared the session inside apiFetch.
      if (error instanceof ApiRequestError && error.status === 401) return;
      if (error instanceof NetworkRequestError || error instanceof ApiRequestError) {
        // The API is unreachable (or failing): keep the stored token and let
        // the user into the app in offline mode with a retry affordance,
        // instead of bouncing them to login for a backend outage.
        set({ sessionStatus: 'authenticated', offline: true });
      }
    }
  },

  signIn: async (input) => {
    const data = await apiFetch<unknown>('/api/auth/login', {
      method: 'POST',
      body: input,
      auth: false,
    });
    const { token, user } = parseAuthPayload(data);
    await saveSessionToken(token);
    set({ token, user, sessionStatus: 'authenticated', offline: false });
  },

  registerAccount: async (input) => {
    const data = await apiFetch<unknown>('/api/auth/register', {
      method: 'POST',
      body: input,
      auth: false,
    });
    const { token, user } = parseAuthPayload(data);
    await saveSessionToken(token);
    set({ token, user, sessionStatus: 'authenticated', offline: false });
  },

  signOut: async () => {
    const { token } = get();
    if (token) {
      try {
        await apiFetch<unknown>('/api/auth/logout', { method: 'POST' });
      } catch {
        // Best-effort server-side invalidation; local cleanup runs regardless.
      }
    }
    await clearSessionToken();
    set({ sessionStatus: 'unauthenticated', token: null, user: null, offline: false });
  },

  clearSession: () => {
    void clearSessionToken();
    set({ sessionStatus: 'unauthenticated', token: null, user: null, offline: false });
  },

  setOffline: (offline) => set({ offline }),
}));
