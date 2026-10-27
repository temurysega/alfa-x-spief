import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkNick, isProfane, nickKey } from './nick.ts';

test('обычные ники проходят', () => {
  for (const nick of [
    'neuro_masha', 'Тимур', 'Софья 9Б', 'Корабль', 'рубля', 'хлеб', 'небо', 'ребус',
    'команда', 'Мандарин', 'barsuk', 'Night Owl', 'Nikita', 'k-pop', 'Ёжик',
  ]) {
    assert.equal(checkNick(nick).ok, true, nick);
  }
});

test('мат ловится в разных написаниях', () => {
  for (const nick of [
    'хуй', 'XYЙ', 'х.у.й', 'хууууй', 'neuro_блять', '6лядь', 'п1зда', 'pizda', 'P!ZDA', 'blyat',
    'fuck', 'fuсk', 'f_u_c_k', 'сука', 'Suka228', 'ебать', 'долбоёб', 'hitler', 'nick1488',
  ]) {
    assert.equal(isProfane(nick), true, nick);
  }
});

test('длина и символы', () => {
  assert.equal(checkNick('a').ok, false);
  assert.equal(checkNick('a'.repeat(21)).ok, false);
  assert.equal(checkNick('a'.repeat(20)).ok, true);
  assert.equal(checkNick('ник🙂').ok, false);
  assert.equal(checkNick('<script>').ok, false);
  assert.equal(checkNick('__').ok, false);
  assert.equal(checkNick(42).ok, false);
});

test('пробелы схлопываются, уникальность без учёта регистра и ё', () => {
  const r = checkNick('  Ёжик   в тумане ');
  assert.deepEqual(r, { ok: true, nick: 'Ёжик в тумане' });
  assert.equal(nickKey('Ёжик в Тумане'), nickKey('ежик  в тумане'));
});
