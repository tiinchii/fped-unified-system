import createClient, { type Middleware } from 'openapi-fetch';
import type { components, paths } from './schema';

/** Types of everything the API sends and accepts, generated from the Spring Boot app (npm run gen:api). */
export type Schemas = components['schemas'];
export type Role = Schemas['Me']['role'];

export const SESSION_EXPIRED_EVENT = 'fped:session-expired';

function readCookie(name: string): string | null {
  const found = document.cookie.split('; ').find((c) => c.startsWith(name + '='));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

const security: Middleware = {
  /** The login is a cookie, so every changing request must also carry the CSRF token the server gave us. */
  onRequest({ request }) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const token = readCookie('XSRF-TOKEN');
      if (token) request.headers.set('X-XSRF-TOKEN', token);
    }
    return request;
  },
  /** Login ended (8 hours idle, or the account was deactivated): the app goes back to the login page. */
  onResponse({ request, response }) {
    const path = new URL(request.url).pathname;
    if (response.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/me') {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    return response;
  },
};

export const api = createClient<paths>({ baseUrl: '', credentials: 'same-origin' });
api.use(security);

/** Gives the data of a call, or throws an Error with the message the server sent (shown to the user as is). */
export async function unwrap<T>(call: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await call;
  if (!response.ok) {
    const message =
      error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message
        : `Something went wrong (${response.status}). Please try again.`;
    throw new Error(message);
  }
  return data as T;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
