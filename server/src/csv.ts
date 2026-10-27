// CSV для Excel: UTF-8 с BOM (иначе кракозябры) и «;» — разделитель русского Excel.

function cell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);
  // Ник вида «=1+1» Excel принял бы за формулу.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

export function moscowTime(ms: number): string {
  return new Date(ms).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
}
