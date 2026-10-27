import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { config } from './config.ts';

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 20 });

export type Db = pg.Pool | pg.PoolClient;

export async function migrate(): Promise<void> {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const result = await fn(c);
    await c.query('commit');
    return result;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export async function journal(
  db: Db,
  kind: string,
  data: Record<string, unknown> = {},
  player?: { id: number; nick: string },
): Promise<void> {
  await db.query('insert into journal (kind, player_id, nick, data) values ($1, $2, $3, $4)', [
    kind,
    player?.id ?? null,
    player?.nick ?? null,
    data,
  ]);
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
