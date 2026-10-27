// Ход игры (ТЗ, п. 3): ЛОББИ → ОТСЧЁТ → ВОПРОС → ОТВЕТ ПОКАЗАН → … → ИГРА ОКОНЧЕНА.
// Состояния меняет ведущий; сами по себе меняются только два — отсчёт переходит в вопрос
// и вопрос закрывается по таймеру. Все сравнения времени — в базе.

import { config } from './config.ts';
import { HttpError, journal, pool, tx } from './db.ts';
import { reportError } from './errors.ts';
import { markAll } from './snapshots.ts';

export type Phase = 'lobby' | 'question' | 'revealed' | 'finished';

export async function startNextQuestion(): Promise<number> {
  const id = await tx(async (c) => {
    const {
      rows: [s],
    } = await c.query('select game, phase from game_state where id = 1 for update');
    if (s.phase === 'question') throw new HttpError(409, 'Вопрос ещё идёт');
    const {
      rows: [q],
    } = await c.query(
      'select id from questions where game = $1 and opens_at is null order by position, id limit 1',
      [s.game],
    );
    if (!q) throw new HttpError(409, 'Вопросы этой игры закончились');
    await c.query(
      `with t as (select clock_timestamp() + make_interval(secs => $2) as opens)
       update questions set opens_at = t.opens, deadline = t.opens + make_interval(secs => seconds)
       from t where id = $1`,
      [q.id, config.countdownSeconds],
    );
    await c.query(
      `update game_state set phase = 'question', question_id = $1, updated_at = clock_timestamp() where id = 1`,
      [q.id],
    );
    await journal(c, 'question_start', { questionId: q.id, game: s.game });
    return q.id as number;
  });
  markAll();
  return id;
}

export async function finishGame(): Promise<void> {
  await tx(async (c) => {
    const {
      rows: [s],
    } = await c.query('select game, phase from game_state where id = 1 for update');
    if (s.phase === 'question') throw new HttpError(409, 'Дождитесь конца вопроса');
    await c.query(`update game_state set phase = 'finished', updated_at = clock_timestamp() where id = 1`);
    await journal(c, 'game_finish', { game: s.game });
  });
  markAll();
}

export async function selectGame(game: number): Promise<void> {
  if (game !== 1 && game !== 2) throw new HttpError(400, 'Игра — 1 или 2');
  await tx(async (c) => {
    const {
      rows: [s],
    } = await c.query('select phase from game_state where id = 1 for update');
    if (s.phase === 'question') throw new HttpError(409, 'Дождитесь конца вопроса');
    await c.query(
      `update game_state set game = $1, phase = 'lobby', question_id = null, updated_at = clock_timestamp() where id = 1`,
      [game],
    );
    await journal(c, 'game_select', { game });
  });
  markAll();
}

// Закрытие атомарное: даже если сработает дважды, закроется и посчитается один раз.
async function closeQuestion(id: number): Promise<void> {
  const changed = await tx(async (c) => {
    await c.query('update questions set closed_at = clock_timestamp() where id = $1 and closed_at is null', [id]);
    const r = await c.query(
      `update game_state set phase = 'revealed', updated_at = clock_timestamp()
       where id = 1 and phase = 'question' and question_id = $1`,
      [id],
    );
    if (r.rowCount) {
      const {
        rows: [n],
      } = await c.query('select count(*)::int as answers from answers where question_id = $1', [id]);
      await journal(c, 'question_close', { questionId: id, answers: n.answers });
    }
    return Boolean(r.rowCount);
  });
  if (changed) markAll();
}

let openedFor: number | null = null;

async function tick(): Promise<void> {
  const {
    rows: [row],
  } = await pool.query(
    `select q.id,
            clock_timestamp() >= q.opens_at as opened,
            clock_timestamp() >= q.deadline + make_interval(secs => $1) as expired
     from game_state g join questions q on q.id = g.question_id
     where g.id = 1 and g.phase = 'question'`,
    [config.graceSeconds],
  );
  if (!row) return;
  // Отсчёт закончился — пересобираем снимки с фазой «вопрос».
  if (row.opened && openedFor !== row.id) {
    openedFor = row.id;
    markAll();
  }
  if (row.expired) await closeQuestion(row.id);
}

export function startTicker(): void {
  const loop = async () => {
    try {
      await tick();
    } catch (e) {
      reportError('Тикер закрытия вопросов', e);
    }
    setTimeout(loop, 200);
  };
  void loop();
}
