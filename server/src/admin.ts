// Админка ведущего (ТЗ, п. 11): пароль плюс отдельный токен.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { config } from './config.ts';
import { toCsv, moscowTime } from './csv.ts';
import { HttpError, journal, pool, tx } from './db.ts';
import { clearError, lastError } from './errors.ts';
import { finishGame, selectGame, startNextQuestion } from './game.ts';
import { checkNick, nickKey } from './nick.ts';
import { clientInfo, normalizeCode, sameCode } from './players.ts';
import { rate } from './scoring.ts';
import { clearSnapshots, markAll, markPlayer, removeSnapshot } from './snapshots.ts';

const LETTERS = ['А', 'Б', 'В', 'Г', 'Д'];

function samePassword(given: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(config.adminPassword).digest();
  return timingSafeEqual(a, b);
}

type QuestionInput = {
  text: string;
  image: string | null;
  options: string[];
  correct: number; // с нуля
  seconds: number;
  double: boolean;
};

export function validateQuestion(raw: unknown): QuestionInput {
  const q = (raw ?? {}) as Record<string, unknown>;
  const text = typeof q.text === 'string' ? q.text.trim() : '';
  if (!text || text.length > 300) throw new HttpError(400, 'Текст вопроса — от 1 до 300 символов');
  const options = Array.isArray(q.options) ? q.options.map((o) => (typeof o === 'string' ? o.trim() : '')) : [];
  if (options.length < 2 || options.length > 5) throw new HttpError(400, 'Вариантов — от 2 до 5');
  if (options.some((o) => !o || o.length > 120)) throw new HttpError(400, 'Каждый вариант — от 1 до 120 символов');
  const correct = Number(q.correct);
  if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) {
    throw new HttpError(400, 'Не выбран правильный вариант');
  }
  const seconds = q.seconds === undefined || q.seconds === null ? 30 : Number(q.seconds);
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 300) throw new HttpError(400, 'Таймер — от 5 до 300 секунд');
  const image = typeof q.image === 'string' && q.image ? q.image : null;
  if (image && !/^\/img\/[a-f0-9]{16}\.(webp|jpg|png)$/.test(image)) throw new HttpError(400, 'Неверная картинка');
  return { text, image, options, correct, seconds, double: q.double === true };
}

async function assertNotOpened(game: number, ids?: number[]): Promise<void> {
  const { rows } = await pool.query(
    `select 1 from questions where game = $1 and opens_at is not null and ($2::int[] is null or id = any($2::int[])) limit 1`,
    [game, ids ?? null],
  );
  if (rows.length) throw new HttpError(409, 'Этот вопрос уже запускали. Сначала сбросьте прогресс игры в «Сервисе»');
}

async function ratingRows() {
  const [players, questions, answers] = await Promise.all([
    pool.query('select id, nick from players'),
    pool.query(
      `select id, correct, double,
              (extract(epoch from opens_at) * 1000)::float8 as "opensAt",
              (extract(epoch from deadline) * 1000)::float8 as "deadline"
       from questions where closed_at is not null`,
    ),
    pool.query(
      `select a.player_id as "playerId", a.question_id as "questionId", a.option,
              (extract(epoch from a.received_at) * 1000)::float8 as "receivedAt"
       from answers a join questions q on q.id = a.question_id where q.closed_at is not null`,
    ),
  ]);
  return rate(players.rows, questions.rows, answers.rows, config.graceSeconds * 1000);
}

export function registerAdminRoutes(app: FastifyInstance): void {
  app.post<{ Body: { password?: unknown } }>('/api/admin/login', async (req) => {
    const password = req.body?.password;
    if (typeof password !== 'string' || !samePassword(password)) {
      await journal(pool, 'admin_login_failed', clientInfo(req));
      throw new HttpError(401, 'Неверный пароль');
    }
    const token = randomBytes(32).toString('base64url');
    await pool.query('insert into admin_sessions (token) values ($1)', [token]);
    await journal(pool, 'admin_login', clientInfo(req));
    return { token };
  });

  app.register(
    async (admin) => {
      admin.addHook('onRequest', async (req) => {
        const header = req.headers.authorization ?? '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : '';
        const { rowCount } = await pool.query(
          `select 1 from admin_sessions where token = $1 and created_at > clock_timestamp() - interval '24 hours'`,
          [token],
        );
        if (!rowCount) throw new HttpError(401, 'Войдите заново');
      });

      admin.get('/state', async () => {
        const {
          rows: [s],
        } = await pool.query(
          `select g.game, g.phase, g.question_id as "questionId", clock_timestamp() as "serverTime",
                  (select count(*)::int from players) as players
           from game_state g where g.id = 1`,
        );
        const { rows: questions } = await pool.query(
          `select id, text, double, opens_at is not null as opened, closed_at is not null as closed
           from questions where game = $1 order by position, id`,
          [s.game],
        );
        let current = null;
        if (s.questionId !== null) {
          const {
            rows: [q],
          } = await pool.query(
            `select id, game, text, image, options, correct, double, seconds,
                    opens_at as "opensAt", deadline, closed_at as "closedAt",
                    (select count(*)::int from answers where question_id = q.id) as answered
             from questions q where id = $1`,
            [s.questionId],
          );
          if (q) {
            let distribution: number[] | null = null;
            if (q.closedAt) {
              const { rows } = await pool.query(
                'select option, count(*)::int as n from answers where question_id = $1 group by option',
                [q.id],
              );
              distribution = (q.options as string[]).map((_, i) => rows.find((r) => r.option === i)?.n ?? 0);
            }
            current = {
              ...q,
              no: questions.findIndex((x) => x.id === q.id) + 1,
              distribution,
            };
          }
        }
        const next = questions.find((q) => !q.opened);
        return {
          ...s,
          questions,
          current,
          next: next ? { id: next.id, no: questions.indexOf(next) + 1 } : null,
          error: lastError(),
        };
      });

      admin.post('/start', async () => ({ questionId: await startNextQuestion() }));
      admin.post('/finish', async () => {
        await finishGame();
        return { ok: true };
      });
      admin.post<{ Body: { game?: unknown } }>('/game', async (req) => {
        await selectGame(Number(req.body?.game));
        return { ok: true };
      });
      admin.post('/clear-error', async () => {
        clearError();
        return { ok: true };
      });

      // ---------- Вопросы ----------
      admin.get<{ Querystring: { game?: string } }>('/questions', async (req) => {
        const { rows } = await pool.query(
          `select id, game, position, text, image, options, correct, seconds, double,
                  opens_at is not null as opened
           from questions where game = $1 order by position, id`,
          [Number(req.query.game ?? 1)],
        );
        return rows;
      });

      admin.post<{ Body: { game?: unknown; questions?: unknown } }>('/questions/import', async (req) => {
        const game = Number(req.body?.game);
        if (game !== 1 && game !== 2) throw new HttpError(400, 'Игра — 1 или 2');
        if (!Array.isArray(req.body?.questions) || req.body.questions.length === 0) {
          throw new HttpError(400, 'В файле нет вопросов');
        }
        const list = req.body.questions.map((q, i) => {
          try {
            return validateQuestion(q);
          } catch (e) {
            throw new HttpError(400, `Вопрос ${i + 1}: ${(e as Error).message}`);
          }
        });
        await assertNotOpened(game);
        await tx(async (c) => {
          await c.query('delete from questions where game = $1', [game]);
          for (const [i, q] of list.entries()) {
            await c.query(
              `insert into questions (game, position, text, image, options, correct, seconds, double)
               values ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [game, i + 1, q.text, q.image, JSON.stringify(q.options), q.correct, q.seconds, q.double],
            );
          }
          await journal(c, 'questions_import', { game, count: list.length });
        });
        markAll();
        return { count: list.length };
      });

      admin.post<{ Body: { id?: unknown; game?: unknown; question?: unknown } }>('/questions/save', async (req) => {
        const q = validateQuestion(req.body?.question);
        const id = req.body?.id === undefined || req.body?.id === null ? null : Number(req.body.id);
        const game = Number(req.body?.game);
        if (game !== 1 && game !== 2) throw new HttpError(400, 'Игра — 1 или 2');
        if (id !== null) {
          await assertNotOpened(game, [id]);
          await pool.query(
            `update questions set text = $2, image = $3, options = $4, correct = $5, seconds = $6, double = $7
             where id = $1 and game = $8`,
            [id, q.text, q.image, JSON.stringify(q.options), q.correct, q.seconds, q.double, game],
          );
          await journal(pool, 'question_edit', { id });
          return { id };
        }
        const {
          rows: [row],
        } = await pool.query(
          `insert into questions (game, position, text, image, options, correct, seconds, double)
           values ($1, (select coalesce(max(position), 0) + 1 from questions where game = $1), $2, $3, $4, $5, $6, $7)
           returning id`,
          [game, q.text, q.image, JSON.stringify(q.options), q.correct, q.seconds, q.double],
        );
        await journal(pool, 'question_add', { id: row.id, game });
        markAll();
        return { id: row.id };
      });

      admin.post<{ Body: { id?: unknown } }>('/questions/delete', async (req) => {
        const id = Number(req.body?.id);
        const {
          rows: [q],
        } = await pool.query('select game from questions where id = $1', [id]);
        if (!q) throw new HttpError(404, 'Вопрос не найден');
        await assertNotOpened(q.game, [id]);
        await pool.query('delete from questions where id = $1', [id]);
        await journal(pool, 'question_delete', { id });
        markAll();
        return { ok: true };
      });

      admin.post<{ Body: { id?: unknown; dir?: unknown } }>('/questions/move', async (req) => {
        const id = Number(req.body?.id);
        const dir = req.body?.dir === -1 ? -1 : 1;
        await tx(async (c) => {
          const {
            rows: [q],
          } = await c.query('select game from questions where id = $1', [id]);
          if (!q) throw new HttpError(404, 'Вопрос не найден');
          const { rows } = await c.query<{ id: number; opened: boolean }>(
            'select id, opens_at is not null as opened from questions where game = $1 order by position, id for update',
            [q.game],
          );
          const i = rows.findIndex((r) => r.id === id);
          const j = i + dir;
          if (j < 0 || j >= rows.length) return;
          if (rows[i].opened || rows[j].opened) throw new HttpError(409, 'Запущенные вопросы двигать нельзя');
          [rows[i], rows[j]] = [rows[j], rows[i]];
          for (const [k, r] of rows.entries()) {
            await c.query('update questions set position = $2 where id = $1', [r.id, k + 1]);
          }
        });
        markAll();
        return { ok: true };
      });

      admin.post<{ Body: { dataUrl?: unknown } }>('/image', { bodyLimit: 6 * 1024 * 1024 }, async (req) => {
        const m = /^data:image\/(webp|jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.dataUrl ?? ''));
        if (!m) throw new HttpError(400, 'Картинка — webp, jpeg или png');
        const data = Buffer.from(m[2], 'base64');
        if (data.length > 1.5 * 1024 * 1024) throw new HttpError(400, 'Картинка больше 1,5 МБ');
        const name = `${randomBytes(8).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
        await writeFile(path.join(config.dataDir, 'img', name), data);
        return { path: `/img/${name}` };
      });

      // ---------- Участники ----------
      admin.get('/players', async () => {
        const { rows } = await pool.query(
          `select p.id, p.nick, p.created_at as "createdAt", count(a.question_id)::int as answers
           from players p left join answers a on a.player_id = p.id
           group by p.id order by p.created_at`,
        );
        return rows;
      });

      admin.post<{ Body: { id?: unknown; nick?: unknown } }>('/players/rename', async (req) => {
        const id = Number(req.body?.id);
        const check = checkNick(req.body?.nick);
        if (!check.ok) throw new HttpError(400, check.error);
        try {
          const { rowCount } = await pool.query('update players set nick = $2, nick_key = $3 where id = $1', [
            id,
            check.nick,
            nickKey(check.nick),
          ]);
          if (!rowCount) throw new HttpError(404, 'Участник не найден');
        } catch (e) {
          if ((e as { code?: string }).code === '23505') throw new HttpError(409, 'Такой ник уже занят');
          throw e;
        }
        await journal(pool, 'admin_rename', { to: check.nick }, { id, nick: check.nick });
        markPlayer(id);
        return { ok: true };
      });

      admin.post<{ Body: { id?: unknown } }>('/players/delete', async (req) => {
        const id = Number(req.body?.id);
        const {
          rows: [p],
        } = await pool.query('delete from players where id = $1 returning id, nick, token', [id]);
        if (!p) throw new HttpError(404, 'Участник не найден');
        await journal(pool, 'admin_delete', {}, { id: p.id, nick: p.nick });
        await removeSnapshot(p.token);
        return { ok: true };
      });

      admin.post<{ Body: { nick?: unknown; code?: unknown } }>('/verify', async (req) => {
        const { nick, code } = req.body ?? {};
        if (typeof nick !== 'string' || typeof code !== 'string') throw new HttpError(400, 'Нужны ник и код');
        const {
          rows: [p],
        } = await pool.query('select id, nick, code from players where nick_key = $1', [nickKey(nick)]);
        const match = Boolean(p && sameCode(p.code, normalizeCode(code)));
        await journal(pool, 'admin_verify', { nick, match }, p ? { id: p.id, nick: p.nick } : undefined);
        return { found: Boolean(p), match };
      });

      // ---------- Рейтинг и выгрузки ----------
      admin.get('/rating', async () => ratingRows());

      admin.get('/export/rating.csv', async (_req, reply) => {
        const rows = await ratingRows();
        const csv = toCsv([
          ['Место', 'Ник', 'Баллы', 'Верных ответов', 'Суммарное время, с'],
          ...rows.map((r) => [r.place, r.nick, r.points, r.correctCount, (r.timeMs / 1000).toFixed(3).replace('.', ',')]),
        ]);
        return reply
          .header('content-type', 'text/csv; charset=utf-8')
          .header('content-disposition', 'attachment; filename="rating.csv"')
          .send(csv);
      });

      admin.get('/export/answers.csv', async (_req, reply) => {
        const { rows } = await pool.query(
          `select q.game, q.position, q.id as qid, q.text, q.options, q.correct, p.nick, a.option,
                  (extract(epoch from a.received_at - q.opens_at))::float8 as secs,
                  (extract(epoch from a.received_at) * 1000)::float8 as at
           from answers a join questions q on q.id = a.question_id join players p on p.id = a.player_id
           order by q.game, q.position, q.id, a.received_at`,
        );
        // Номер вопроса — как у участника на экране: по порядку внутри игры.
        const numbers = new Map<number, number>();
        const { rows: order } = await pool.query('select id, game from questions order by game, position, id');
        const perGame = new Map<number, number>();
        for (const r of order) {
          perGame.set(r.game, (perGame.get(r.game) ?? 0) + 1);
          numbers.set(r.id, perGame.get(r.game)!);
        }
        const csv = toCsv([
          ['Игра', 'Вопрос', 'Текст вопроса', 'Ник', 'Ответ', 'Текст ответа', 'Верно', 'Время ответа, с', 'Получен (МСК)'],
          ...rows.map((r) => [
            r.game,
            numbers.get(r.qid),
            r.text,
            r.nick,
            LETTERS[r.option] ?? r.option + 1,
            r.options[r.option],
            r.option === r.correct ? 'да' : 'нет',
            r.secs.toFixed(3).replace('.', ','),
            moscowTime(r.at),
          ]),
        ]);
        return reply
          .header('content-type', 'text/csv; charset=utf-8')
          .header('content-disposition', 'attachment; filename="answers.csv"')
          .send(csv);
      });

      admin.get<{ Querystring: { nick?: string } }>('/journal', async (req) => {
        const nick = (req.query.nick ?? '').trim();
        const { rows } = await pool.query(
          `select id, at, kind, player_id as "playerId", nick, data from journal
           where $1 = '' or lower(nick) = lower($1) or player_id in (select id from players where nick_key = $2)
           order by id desc limit 300`,
          [nick, nickKey(nick)],
        );
        return rows;
      });

      // ---------- Сброс после прогонов ----------
      admin.post<{ Body: { what?: unknown } }>('/reset', async (req) => {
        const all = req.body?.what === 'all';
        await tx(async (c) => {
          await c.query('delete from answers');
          await c.query('update questions set opens_at = null, deadline = null, closed_at = null');
          await c.query(
            `update game_state set game = 1, phase = 'lobby', question_id = null, updated_at = clock_timestamp() where id = 1`,
          );
          if (all) await c.query('delete from players');
          await journal(c, all ? 'reset_all' : 'reset_progress', clientInfo(req));
        });
        if (all) await clearSnapshots();
        markAll();
        return { ok: true };
      });
    },
    { prefix: '/api/admin' },
  );
}
