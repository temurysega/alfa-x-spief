// Ошибки не глотаются молча: последняя показывается в админке крупно (ТЗ, п. 8).

export type ServerError = { at: string; where: string; message: string };

let last: ServerError | null = null;

export function reportError(where: string, e: unknown): void {
  const message = e instanceof Error ? e.message : String(e);
  last = { at: new Date().toISOString(), where, message };
  console.error(`[ОШИБКА] ${where}:`, e);
}

export function lastError(): ServerError | null {
  return last;
}

export function clearError(): void {
  last = null;
}
