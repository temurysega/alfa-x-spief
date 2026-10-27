// Токен участника живёт в localStorage. Вкладки одного браузера делят его, поэтому для тестов
// есть ?slot=N в адресе: у каждого слота свой токен (ТЗ, п. 9).

const slot = new URLSearchParams(window.location.search).get('slot');
const KEY = `alfa-quiz:token${slot ? `:${slot}` : ''}`;

// Проверяем до того, как занять ник: иначе ник займётся, а токен потеряется.
export function storageWorks(): boolean {
  try {
    const probe = `${KEY}:probe`;
    localStorage.setItem(probe, '1');
    const ok = localStorage.getItem(probe) === '1';
    localStorage.removeItem(probe);
    return ok;
  } catch {
    return false;
  }
}

export function loadToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string): boolean {
  try {
    localStorage.setItem(KEY, token);
    return localStorage.getItem(KEY) === token;
  } catch {
    return false;
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // нечего чистить
  }
}
