// Подсчёт рейтинга (ТЗ, п. 6). Чистая функция: на вход ответы, на выход рейтинг.
// Верный ответ — 1 балл, на вопросе с двойными баллами — 2. Скорость решает только при
// равенстве баллов: выше тот, у кого меньше суммарное время на верные ответы.

export type ScoredQuestion = {
  id: number;
  correct: number;
  double: boolean;
  opensAt: number; // мс
  deadline: number; // мс
};

export type ScoredAnswer = {
  playerId: number;
  questionId: number;
  option: number;
  receivedAt: number; // мс
};

export type RatedPlayer = { id: number; nick: string };

export type RatingRow = {
  place: number;
  playerId: number;
  nick: string;
  points: number;
  correctCount: number;
  timeMs: number;
};

export function rate(
  players: RatedPlayer[],
  questions: ScoredQuestion[],
  answers: ScoredAnswer[],
  graceMs = 1000,
): RatingRow[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const totals = new Map(players.map((p) => [p.id, { points: 0, correctCount: 0, timeMs: 0 }]));
  const seen = new Set<string>();

  for (const a of [...answers].sort((x, y) => x.receivedAt - y.receivedAt)) {
    const q = byId.get(a.questionId);
    const t = totals.get(a.playerId);
    if (!q || !t) continue;
    // В зачёт идёт только первый ответ участника на вопрос.
    const key = `${a.playerId}:${a.questionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Сервер и так не принимает ответы вне окна; здесь — вторая линия защиты.
    if (a.receivedAt < q.opensAt || a.receivedAt > q.deadline + graceMs) continue;
    if (a.option !== q.correct) continue;
    t.points += q.double ? 2 : 1;
    t.correctCount += 1;
    t.timeMs += a.receivedAt - q.opensAt;
  }

  const rows = players.map((p) => ({ playerId: p.id, nick: p.nick, ...totals.get(p.id)!, place: 0 }));
  rows.sort((a, b) => b.points - a.points || a.timeMs - b.timeMs || a.nick.localeCompare(b.nick, 'ru'));

  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    row.place = prev && prev.points === row.points && prev.timeMs === row.timeMs ? prev.place : i + 1;
  });
  return rows;
}
