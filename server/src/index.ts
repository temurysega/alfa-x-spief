import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import Fastify from 'fastify';
import { registerAdminRoutes } from './admin.ts';
import { config } from './config.ts';
import { HttpError, migrate, pool } from './db.ts';
import { reportError } from './errors.ts';
import { startTicker } from './game.ts';
import { registerPlayerRoutes } from './players.ts';
import { initSnapshotDirs, markAll } from './snapshots.ts';

const app = Fastify({ logger: { level: 'warn' }, bodyLimit: 64 * 1024 });

app.setErrorHandler((err, req, reply) => {
  if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message });
  const status = (err as { statusCode?: number }).statusCode;
  if (status && status >= 400 && status < 500) return reply.code(status).send({ error: 'Неверный запрос' });
  reportError(`${req.method} ${req.url}`, err);
  return reply.code(500).send({ error: 'Ошибка сервера' });
});

registerPlayerRoutes(app);
registerAdminRoutes(app);

process.on('unhandledRejection', (e) => reportError('Необработанная ошибка', e));

if (config.adminPassword.length < 12) {
  console.warn('[ВНИМАНИЕ] ADMIN_PASSWORD короче 12 символов — на сервере так оставлять нельзя');
}

await migrate();
await initSnapshotDirs();
await mkdir(path.join(config.dataDir, 'img'), { recursive: true });
// После перезапуска игра продолжается с того же места: снимки пересобираются из базы.
markAll();
startTicker();
await app.listen({ host: '0.0.0.0', port: config.port });
console.log(`Сервер квиза слушает порт ${config.port}`);

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
