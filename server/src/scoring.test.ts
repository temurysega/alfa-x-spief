import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rate, type ScoredQuestion } from './scoring.ts';

const q = (id: number, correct: number, opensAt: number, extra: Partial<ScoredQuestion> = {}): ScoredQuestion => ({
  id,
  correct,
  double: false,
  opensAt,
  deadline: opensAt + 30_000,
  ...extra,
});

const players = [
  { id: 1, nick: 'anna' },
  { id: 2, nick: 'boris' },
  { id: 3, nick: 'vera' },
];

test('при равных баллах выше тот, кто быстрее', () => {
  const rows = rate(players.slice(0, 2), [q(1, 0, 0), q(2, 1, 100_000)], [
    { playerId: 1, questionId: 1, option: 0, receivedAt: 5_000 },
    { playerId: 1, questionId: 2, option: 1, receivedAt: 105_000 },
    { playerId: 2, questionId: 1, option: 0, receivedAt: 2_000 },
    { playerId: 2, questionId: 2, option: 1, receivedAt: 103_000 },
  ]);
  assert.deepEqual(rows.map((r) => [r.place, r.nick, r.points, r.timeMs]), [
    [1, 'boris', 2, 5_000],
    [2, 'anna', 2, 10_000],
  ]);
});

test('скорость не даёт баллов: медленный с большим числом верных выше', () => {
  const rows = rate(players.slice(0, 2), [q(1, 0, 0), q(2, 0, 100_000)], [
    { playerId: 1, questionId: 1, option: 0, receivedAt: 29_000 },
    { playerId: 1, questionId: 2, option: 0, receivedAt: 129_000 },
    { playerId: 2, questionId: 1, option: 0, receivedAt: 1_000 },
    { playerId: 2, questionId: 2, option: 3, receivedAt: 101_000 },
  ]);
  assert.equal(rows[0].nick, 'anna');
  assert.equal(rows[0].points, 2);
  assert.equal(rows[1].points, 1);
});

test('двойные баллы', () => {
  const rows = rate(players.slice(0, 2), [q(1, 0, 0), q(2, 2, 100_000, { double: true })], [
    { playerId: 1, questionId: 1, option: 0, receivedAt: 1_000 },
    { playerId: 2, questionId: 2, option: 2, receivedAt: 101_000 },
  ]);
  assert.deepEqual(rows.map((r) => [r.nick, r.points, r.correctCount]), [
    ['boris', 2, 1],
    ['anna', 1, 1],
  ]);
});

test('нет ответа и неверный ответ — 0 баллов, участник всё равно в рейтинге', () => {
  const rows = rate(players, [q(1, 0, 0)], [
    { playerId: 1, questionId: 1, option: 0, receivedAt: 1_000 },
    { playerId: 2, questionId: 1, option: 4, receivedAt: 1_000 },
  ]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.slice(1).map((r) => [r.place, r.points, r.timeMs]), [
    [2, 0, 0],
    [2, 0, 0],
  ]);
});

test('граница дедлайна: допуск 1 с засчитывается, дальше и раньше открытия — нет', () => {
  const question = q(1, 0, 10_000);
  const one = (receivedAt: number) =>
    rate([players[0]], [question], [{ playerId: 1, questionId: 1, option: 0, receivedAt }])[0].points;
  assert.equal(one(40_000), 1); // ровно дедлайн
  assert.equal(one(41_000), 1); // дедлайн + 1 с
  assert.equal(one(41_001), 0);
  assert.equal(one(9_999), 0); // до открытия
  assert.equal(one(10_000), 1);
});

test('в зачёт идёт только первый ответ, ответы на незакрытые вопросы не считаются', () => {
  const rows = rate([players[0]], [q(1, 0, 0)], [
    { playerId: 1, questionId: 1, option: 3, receivedAt: 1_000 },
    { playerId: 1, questionId: 1, option: 0, receivedAt: 2_000 },
    { playerId: 1, questionId: 99, option: 0, receivedAt: 2_000 },
  ]);
  assert.equal(rows[0].points, 0);
});

test('полное равенство баллов и времени — одно место', () => {
  const rows = rate(players, [q(1, 0, 0)], [
    { playerId: 1, questionId: 1, option: 0, receivedAt: 3_000 },
    { playerId: 2, questionId: 1, option: 0, receivedAt: 3_000 },
    { playerId: 3, questionId: 1, option: 0, receivedAt: 4_000 },
  ]);
  assert.deepEqual(rows.map((r) => r.place), [1, 1, 3]);
});
