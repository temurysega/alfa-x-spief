export class ApiError extends Error {
  status: number;
  data: Record<string, unknown> | null;
  constructor(status: number, message: string, data: Record<string, unknown> | null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

type Options = { method?: 'GET' | 'POST'; body?: unknown; token?: string; timeoutMs?: number };

// Таймаут одного запроса — 8 с (ТЗ, п. 9).
export async function request<T>(url: string, { method = 'GET', body, token, timeoutMs = 8000 }: Options = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        (data && typeof data.error === 'string' && data.error) ||
        (res.status === 429 ? 'Слишком много запросов — подожди немного' : `Ошибка ${res.status}`);
      throw new ApiError(res.status, message, data);
    }
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof DOMException && e.name === 'AbortError') return 'Сервер не ответил — проверь интернет';
  if (e instanceof TypeError) return 'Нет связи — проверь интернет';
  if (e instanceof Error) return e.message;
  return 'Нет связи — проверь интернет';
}
