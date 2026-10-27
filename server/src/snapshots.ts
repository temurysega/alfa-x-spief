// Снимки участников (ТЗ, п. 7): на каждое изменение сервер пишет готовый файл
// state/<токен>.json, nginx раздаёт его как статику, клиент опрашивает раз в 2–3 с.
// Все сборки идут строго по очереди: поздняя сборка всегда читает свежее состояние из базы.

import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.ts';
import { pool } from './db.ts';
import { reportError } from './errors.ts';

export type Snapshot = {
  phase: 'lobby' | 'countdown' | 'question' | 'revealed' | 'finished';
  game: number;
  nick: string;
  questionId: number | null;
  questionNo: number | null;
  questionsTotal: number;
  opensAt: string | null;
  deadline: string | null;
  text: string | null;
  image: string | null;
  options: string[] | null;
  double: boolean;
  myAnswer: number | null;
  correct: number | null; // только в фазе revealed
};

const stateDir = path.join(config.dataDir, 'state');
const tmpDir = path.join(config.dataDir, 'tmp');

export async function initSnapshotDirs(): Promise<void> {
  await mkdir(stateDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });
}

let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn);
  chain = next.catch(() => {});
  return next;
}

let dirtyAll = false;
const dirty = new Set<number>();
let scheduled = false;

export function markAll(): void {
  dirtyAll = true;
  schedule();
}

export function markPlayer(id: number): void {
  dirty.add(id);
  schedule();
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  setImmediate(() => {
    scheduled = false;
    void exclusive(drain);
  });
}

async function drain(): Promise<void> {
  // Ответы прилетают залпом: копим грязных участников и собираем их одной пачкой.
  if (!dirtyAll && dirty.size === 0) return;
  const ids = dirtyAll ? null : [...dirty];
  dirtyAll = false;
  dirty.clear();
  try {
    await build(ids);
  } catch (e) {
    reportError('Сборка снимков', e);
    if (ids) ids.forEach((id) => dirty.add(id));
    else dirtyAll = true;
    setTimeout(schedule, 1000);
  }
}

// Собрать снимок участника сразу и дождаться записи: нужно при входе,
// чтобы первый же опрос клиента нашёл файл.
export function flushPlayer(id: number): Promise<void> {
  return exclusive(() => build([id]));
}

export function removeSnapshot(token: string): Promise<void> {
  return exclusive(() => rm(path.join(stateDir, `${token}.json`), { force: true }));
}

export function clearSnapshots(): Promise<void> {
  return exclusive(async () => {
    for (const name of await readdir(stateDir)) await rm(path.join(stateDir, name), { force: true });
  });
}

async function build(ids: number[] | null): Promise<void> {
  const {
    rows: [s],
  } = await pool.query(`
    select g.game, g.phase, g.question_id,
           q.text, q.image, q.options, q.correct, q.double, q.opens_at, q.deadline,
           coalesce(clock_timestamp() >= q.opens_at, false) as opened
    from game_state g
    left join questions q on q.id = g.question_id
    where g.id = 1`);
  const { rows: order } = await pool.query<{ id: number }>(
    'select id from questions where game = $1 order by position, id',
    [s.game],
  );

  const withQuestion = (s.phase === 'question' || s.phase === 'revealed') && s.question_id !== null;
  const phase: Snapshot['phase'] =
    s.phase === 'question' && !s.opened ? 'countdown' : (s.phase as Snapshot['phase']);

  const shared = {
    phase,
    game: s.game as number,
    questionId: withQuestion ? (s.question_id as number) : null,
    questionNo: withQuestion ? order.findIndex((r) => r.id === s.question_id) + 1 : null,
    questionsTotal: order.length,
    opensAt: withQuestion ? (s.opens_at as Date).toISOString() : null,
    deadline: withQuestion ? (s.deadline as Date).toISOString() : null,
    text: withQuestion ? (s.text as string) : null,
    image: withQuestion ? (s.image as string | null) : null,
    options: withQuestion ? (s.options as string[]) : null,
    double: withQuestion ? (s.double as boolean) : false,
    correct: s.phase === 'revealed' ? (s.correct as number) : null,
  };

  const { rows: players } = await pool.query<{ id: number; token: string; nick: string; option: number | null }>(
    `select p.id, p.token, p.nick, a.option
     from players p
     left join answers a on a.player_id = p.id and a.question_id = $1
     where $2::int[] is null or p.id = any($2::int[])`,
    [withQuestion ? s.question_id : null, ids],
  );

  const BATCH = 50;
  for (let i = 0; i < players.length; i += BATCH) {
    await Promise.all(
      players.slice(i, i + BATCH).map((p) => {
        const snap: Snapshot = { ...shared, nick: p.nick, myAnswer: p.option };
        return writeAtomic(p.token, JSON.stringify(snap));
      }),
    );
  }
}

async function writeAtomic(token: string, body: string): Promise<void> {
  // Пишем во временный файл и переименовываем: nginx никогда не отдаст недописанный снимок.
  const tmp = path.join(tmpDir, `${token}.json`);
  await writeFile(tmp, body);
  await rename(tmp, path.join(stateDir, `${token}.json`));
}
