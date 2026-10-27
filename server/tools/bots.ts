// Нагрузочный тест (ТЗ, п. 12): N ботов входят, робот-ведущий запускает вопросы,
// боты узнают о вопросе из своих снимков и отвечают в первые 1–2 секунды.
// Проверяем, что каждый ответ принят и посчитан, и меряем время ответа сервера на залп.
//
//   node tools/bots.ts --url http://localhost:8080 --password <ADMIN_PASSWORD> --bots 300 --reset
//
// --reset стирает всех участников и ответы и загружает примерные вопросы в игру 1.
// Только для локального стенда и прогонов, не во время эфира.

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:8080' },
    password: { type: 'string' },
    bots: { type: 'string', default: '300' },
    reset: { type: 'boolean', default: false },
  },
});
const BASE = values.url!;
const N = Number(values.bots);
if (!values.password) throw new Error('Нужен --password (ADMIN_PASSWORD из .env)');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LETTERS = ['А', 'Б', 'В', 'Г', 'Д'];

async function call<T>(path: string, body?: unknown, token?: string): Promise<{ status: number; data: T }> {
  const res = await fetch(BASE + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as T };
}

let offset = 0;
async function syncClock() {
  const t0 = Date.now();
  const { data } = await call<{ t: number }>('/api/time');
  offset = data.t * 1000 - (t0 + Date.now()) / 2;
}
const serverNow = () => Date.now() + offset;

function percentile(xs: number[], p: number) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

type Snap = { phase: string; questionId: number | null; opensAt: string | null; correct: number | null; options: string[] | null };

const stats = {
  answerMs: [] as number[],
  answerOk: 0,
  answerRejected: 0,
  answerErrors: 0,
  answer429: 0,
  pollMs: [] as number[],
  pollErrors: 0,
  poll429: 0,
};

class Bot {
  nick: string;
  token = '';
  answered = new Map<number, number>(); // вопрос → вариант
  stopped = false;
  constructor(i: number) {
    this.nick = `bot-${String(i).padStart(3, '0')}`;
  }

  async join() {
    for (let attempt = 0; attempt < 5; attempt++) {
      const r = await call<{ token: string; error?: string }>('/api/join', { nick: this.nick });
      if (r.status === 200) {
        this.token = r.data.token;
        return;
      }
      await sleep(500 + Math.random() * 1000);
    }
    throw new Error(`${this.nick} не смог войти`);
  }

  async run() {
    await sleep(Math.random() * 2500); // боты опрашивают не синхронно, как живые телефоны
    while (!this.stopped) {
      const t0 = performance.now();
      try {
        const res = await fetch(`${BASE}/state/${this.token}.json`, { cache: 'no-store' });
        stats.pollMs.push(performance.now() - t0);
        if (res.status === 429) stats.poll429++;
        if (res.ok) this.onSnap((await res.json()) as Snap);
      } catch {
        stats.pollErrors++;
      }
      await sleep(2500);
    }
  }

  onSnap(s: Snap) {
    if ((s.phase !== 'countdown' && s.phase !== 'question') || s.questionId === null) return;
    if (this.answered.has(s.questionId)) return;
    const option = Math.floor(Math.random() * (s.options?.length ?? 1));
    this.answered.set(s.questionId, -1);
    // Как настоящий клиент: варианты открываются через 0,3 с после opensAt.
    const at = Math.max(Date.parse(s.opensAt!) + 300, serverNow()) + Math.random() * 2000;
    void sleep(at - serverNow()).then(() => this.answer(s.questionId!, option));
  }

  async answer(questionId: number, option: number) {
    const t0 = performance.now();
    try {
      const r = await call<{ ok: boolean }>('/api/answer', { token: this.token, questionId, option });
      stats.answerMs.push(performance.now() - t0);
      if (r.status === 200) {
        stats.answerOk++;
        this.answered.set(questionId, option);
      } else if (r.status === 429) stats.answer429++;
      else stats.answerRejected++;
    } catch {
      stats.answerErrors++;
    }
  }
}

async function main() {
  await syncClock();
  const login = await call<{ token: string }>('/api/admin/login', { password: values.password });
  if (login.status !== 200) throw new Error('Неверный пароль ведущего');
  const admin = login.data.token;
  const post = (path: string, body: unknown = {}) => call<{ error?: string }>(`/api/admin${path}`, body, admin);
  const get = <T>(path: string) => call<T>(`/api/admin${path}`, undefined, admin);

  if (values.reset) {
    await post('/reset', { what: 'all' });
    const file = JSON.parse(await readFile(new URL('../../questions/example-game1.json', import.meta.url), 'utf8'));
    const questions = file.questions.map((q: { correct: number | string }) => ({
      ...q,
      correct: typeof q.correct === 'number' ? q.correct - 1 : LETTERS.indexOf(q.correct),
    }));
    const r = await post('/questions/import', { game: 1, questions });
    if (r.status !== 200) throw new Error(`Импорт вопросов: ${r.data.error}`);
    await post('/game', { game: 1 });
  }

  console.log(`Входят ${N} ботов…`);
  const bots = Array.from({ length: N }, (_, i) => new Bot(i + 1));
  const t0 = performance.now();
  await Promise.all(bots.map((b) => b.join()));
  console.log(`  все вошли за ${Math.round(performance.now() - t0)} мс`);
  bots.forEach((b) => void b.run());

  type State = { phase: string; next: { no: number } | null; current: { id: number; correct: number; answered: number; distribution: number[] | null } | null };
  const correctById = new Map<number, number>();
  const problems: string[] = [];

  for (;;) {
    const { data: s } = await get<State>('/state');
    if (!s.next) break;
    const okBefore = stats.answerOk;
    const start = await post('/start');
    if (start.status !== 200) throw new Error(`Запуск вопроса: ${start.data.error}`);
    process.stdout.write(`Вопрос ${s.next.no}: `);
    let st: State;
    do {
      await sleep(500);
      st = (await get<State>('/state')).data;
    } while (st.phase !== 'revealed');
    await sleep(500);
    const q = st.current!;
    correctById.set(q.id, q.correct);
    const accepted = stats.answerOk - okBefore;
    const sum = q.distribution!.reduce((a, b) => a + b, 0);
    console.log(`принято ${accepted} из ${N}, в базе ${q.answered}, в распределении ${sum}`);
    if (accepted !== N) problems.push(`вопрос ${s.next.no}: принято ${accepted} из ${N}`);
    if (q.answered !== accepted || sum !== accepted) problems.push(`вопрос ${s.next.no}: расходятся счётчики`);
    await sleep(1000);
  }
  bots.forEach((b) => (b.stopped = true));
  await post('/finish');

  // Сверяем рейтинг с тем, что боты знают о своих ответах.
  const { data: rating } = await get<{ nick: string; points: number }[]>('/rating');
  const { data: questions } = await get<{ id: number; double: boolean }[]>('/questions?game=1');
  const double = new Map(questions.map((q) => [q.id, q.double]));
  let mismatches = 0;
  for (const b of bots) {
    let expected = 0;
    for (const [qid, option] of b.answered) if (option === correctById.get(qid)) expected += double.get(qid) ? 2 : 1;
    const row = rating.find((r) => r.nick === b.nick);
    if (!row || row.points !== expected) mismatches++;
  }
  if (mismatches) problems.push(`рейтинг не совпал у ${mismatches} ботов`);

  console.log('\nОтветы:');
  console.log(`  приняты ${stats.answerOk}, отклонены ${stats.answerRejected}, 429 — ${stats.answer429}, сетевых ошибок ${stats.answerErrors}`);
  console.log(
    `  время ответа сервера: p50 ${Math.round(percentile(stats.answerMs, 50))} мс, p95 ${Math.round(percentile(stats.answerMs, 95))} мс, ` +
      `p99 ${Math.round(percentile(stats.answerMs, 99))} мс, макс ${Math.round(Math.max(...stats.answerMs))} мс`,
  );
  console.log('Опрос снимков:');
  console.log(`  ${stats.pollMs.length} запросов, p95 ${Math.round(percentile(stats.pollMs, 95))} мс, 429 — ${stats.poll429}, ошибок ${stats.pollErrors}`);
  console.log(`Рейтинг: ${mismatches ? `НЕ совпал у ${mismatches}` : 'совпал у всех ботов'}`);

  const slow = percentile(stats.answerMs, 100) > 500;
  if (slow) problems.push('есть ответы медленнее 0,5 с');
  console.log(problems.length ? `\nПРОБЛЕМЫ:\n  ${problems.join('\n  ')}` : '\nВсё сошлось.');
  process.exit(problems.length ? 1 : 0);
}

await main();
