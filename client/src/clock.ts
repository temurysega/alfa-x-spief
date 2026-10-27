// Часам телефона не доверяем: поправка к серверному времени, чтобы отсчёт и таймер
// шли у всех синхронно. Время отдаёт nginx на /api/time — ровно в момент ответа,
// поэтому оно точнее, чем время сборки снимка.

let offset = 0;

export function serverNow(): number {
  return Date.now() + offset;
}

export async function syncClock(): Promise<void> {
  let bestRtt = Infinity;
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    try {
      const res = await fetch('/api/time', { cache: 'no-store' });
      const { t } = (await res.json()) as { t: number };
      const t1 = Date.now();
      if (t1 - t0 < bestRtt) {
        bestRtt = t1 - t0;
        offset = t * 1000 - (t0 + t1) / 2;
      }
    } catch {
      // нет сети — оставляем прошлую поправку
    }
  }
}
