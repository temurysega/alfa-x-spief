import { ApiError, request } from '../api';

const KEY = 'alfa-quiz:admin';

export function loadAdminToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveAdminToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    // без localStorage просто придётся входить заново
  }
}

export type Api = {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  download(path: string, filename: string): Promise<void>;
};

export function makeApi(token: string, onUnauthorized: () => void): Api {
  const guard = async <T>(p: Promise<T>): Promise<T> => {
    try {
      return await p;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onUnauthorized();
      throw e;
    }
  };
  return {
    get: (path) => guard(request(`/api/admin${path}`, { token })),
    post: (path, body = {}) => guard(request(`/api/admin${path}`, { method: 'POST', body, token, timeoutMs: 30_000 })),
    async download(path, filename) {
      const res = await fetch(`/api/admin${path}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (res.status === 401) onUnauthorized();
      if (!res.ok) throw new ApiError(res.status, `Не удалось скачать (${res.status})`, null);
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: filename });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
}
