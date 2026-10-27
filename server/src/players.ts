// Вход участника и ответы (ТЗ, п. 4 и 8).

import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from './config.ts';
import { HttpError, journal, pool } from './db.ts';
import { checkNick, nickKey } from './nick.ts';
import { flushPlayer, markPlayer } from './snapshots.ts';

// Без похожих друг на друга символов: нет I, L, O, 0, 1.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

export function makeCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

// Код могут набрать русскими буквами: «К7М2Х» — то же, что «K7M2X».
const CYR_TO_LAT: Record<string, string> = {
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', У: 'Y',
};

export function normalizeCode(raw: string): string {
  return [...raw.toUpperCase()]
    .map((ch) => CYR_TO_LAT[ch] ?? ch)
    .join('')
    .replace(/[^A-Z0-9]/g, '');
}

export function sameCode(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function clientInfo(req: FastifyRequest) {
  const ip = (req.headers['x-real-ip'] as string | undefined) ?? req.ip;
  return { ip, ua: (req.headers['user-agent'] ?? '').slice(0, 300) };
}

// Подбор кода: после 10 неудачных попыток ник закрыт для входа на 15 минут.
const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILURES = 10;
const LOCK_MS = 15 * 60_000;

export function registerPlayerRoutes(app: FastifyInstance): void {
  app.post<{ Body: { nick?: unknown } }>('/api/join', async (req, reply) => {
    const check = checkNick(req.body?.nick);
    if (!check.ok) throw new HttpError(400, check.error);
    const token = randomBytes(24).toString('base64url');
    const code = makeCode();
    let id: number;
    try {
      const { rows } = await pool.query(
        'insert into players (nick, nick_key, token, code) values ($1, $2, $3, $4) returning id',
        [check.nick, nickKey(check.nick), token, code],
      );
      id = rows[0].id;
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        throw new HttpError(409, 'Этот ник уже занят, выбери другой. Если это ты — войди по коду');
      }
      throw e;
    }
    await journal(pool, 'join', clientInfo(req), { id, nick: check.nick });
    await flushPlayer(id);
    return reply.send({ token, code, nick: check.nick });
  });

  app.post<{ Body: { nick?: unknown; code?: unknown } }>('/api/login', async (req, reply) => {
    const { nick, code } = req.body ?? {};
    if (typeof nick !== 'string' || typeof code !== 'string') throw new HttpError(400, 'Введи ник и код');
    const key = nickKey(nick);
    const f = failures.get(key);
    if (f && f.count >= MAX_FAILURES && f.until > Date.now()) {
      throw new HttpError(429, 'Слишком много попыток. Подожди 15 минут или напиши модераторам');
    }
    const {
      rows: [p],
    } = await pool.query('select id, nick, token, code from players where nick_key = $1', [key]);
    if (!p || !sameCode(p.code, normalizeCode(code))) {
      const count = (f && f.until > Date.now() ? f.count : 0) + 1;
      failures.set(key, { count, until: Date.now() + LOCK_MS });
      await journal(pool, 'login_failed', { nick, ...clientInfo(req) }, p ? { id: p.id, nick: p.nick } : undefined);
      throw new HttpError(401, 'Ник или код не подходят');
    }
    failures.delete(key);
    await journal(pool, 'login', clientInfo(req), { id: p.id, nick: p.nick });
    await flushPlayer(p.id);
    return reply.send({ token: p.token, nick: p.nick });
  });

  app.post<{ Body: { token?: unknown; questionId?: unknown; option?: unknown } }>(
    '/api/answer',
    async (req, reply) => {
      const { token, questionId, option } = req.body ?? {};
      if (typeof token !== 'string' || !Number.isInteger(questionId) || !Number.isInteger(option)) {
        throw new HttpError(400, 'Неверный запрос');
      }
      const {
        rows: [p],
      } = await pool.query('select id, nick from players where token = $1', [token]);
      if (!p) throw new HttpError(404, 'Участник не найден');

      // Окно приёма и номер текущего вопроса проверяются в базе одним запросом;
      // повторный ответ отсекает первичный ключ (участник, вопрос).
      const { rowCount } = await pool.query(
        `with ins as (
           insert into answers (player_id, question_id, option)
           select $1, q.id, $3
           from questions q
           join game_state g on g.id = 1 and g.question_id = q.id and g.phase = 'question'
           where q.id = $2
             and q.closed_at is null
             and clock_timestamp() >= q.opens_at
             and clock_timestamp() <= q.deadline + make_interval(secs => $4)
             and $3 >= 0 and $3 < jsonb_array_length(q.options)
           on conflict (player_id, question_id) do nothing
           returning player_id
         )
         insert into journal (kind, player_id, nick, data)
         select 'answer', $1, $5, jsonb_build_object('questionId', $2::int, 'option', $3::int) from ins`,
        [p.id, questionId, option, config.graceSeconds, p.nick],
      );
      if (rowCount) {
        markPlayer(p.id);
        return reply.send({ ok: true });
      }

      const {
        rows: [prev],
      } = await pool.query('select option from answers where player_id = $1 and question_id = $2', [
        p.id,
        questionId,
      ]);
      await journal(pool, 'answer_rejected', { questionId, option, already: Boolean(prev) }, p);
      if (prev) return reply.code(409).send({ ok: false, reason: 'already', option: prev.option });
      return reply.code(409).send({ ok: false, reason: 'closed' });
    },
  );
}
