// Файлы вопросов: JSON или CSV (ТЗ, п. 5). В файле правильный вариант — номер с 1
// (или буква А–Д), внутри программы — индекс с нуля. Переводится только здесь.

import { LETTERS, type Question } from './types';

export type FileQuestion = {
  text: string;
  image: string | null; // имя файла картинки из выбранных вместе с файлом вопросов
  options: string[];
  correct: number; // с нуля
  seconds: number;
  double: boolean;
};

function parseCorrect(raw: unknown, count: number, n: number): number {
  const s = String(raw ?? '').trim().toUpperCase();
  const letter = LETTERS.indexOf(s);
  const latin = ['A', 'B', 'C', 'D', 'E'].indexOf(s);
  const index = letter >= 0 ? letter : latin >= 0 ? latin : Number(s) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new Error(`Вопрос ${n}: правильный вариант — номер от 1 до ${count} или буква`);
  }
  return index;
}

function parseBool(raw: unknown): boolean {
  return ['1', 'true', 'да', 'x', 'х', '+', 'yes'].includes(String(raw ?? '').trim().toLowerCase());
}

export function parseJsonQuestions(text: string): FileQuestion[] {
  const data = JSON.parse(text);
  const list: unknown[] = Array.isArray(data) ? data : data?.questions;
  if (!Array.isArray(list)) throw new Error('В JSON нет списка questions');
  return list.map((raw, i) => {
    const q = raw as Record<string, unknown>;
    const options = Array.isArray(q.options) ? q.options.map(String) : [];
    return {
      text: String(q.text ?? ''),
      image: q.image ? String(q.image) : null,
      options,
      correct: parseCorrect(q.correct, options.length, i + 1),
      seconds: q.seconds === undefined ? 30 : Number(q.seconds),
      double: q.double === true || parseBool(q.double),
    };
  });
}

function splitCsv(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const HEADERS: Record<string, string> = {
  вопрос: 'text', text: 'text',
  картинка: 'image', image: 'image',
  правильный: 'correct', correct: 'correct',
  секунды: 'seconds', seconds: 'seconds', таймер: 'seconds',
  двойные: 'double', double: 'double',
};

// Колонки: вопрос; картинка; вариант 1 … вариант 5; правильный; секунды; двойные.
export function parseCsvQuestions(text: string): FileQuestion[] {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const [head, ...rows] = splitCsv(text, sep);
  if (!head) throw new Error('Файл пустой');
  const cols = head.map((h) => {
    const key = h.trim().toLowerCase().replace(/\s+/g, '');
    const option = /^(вариант|option)(\d)$/.exec(key);
    return option ? `option${option[2]}` : HEADERS[key] ?? '';
  });
  if (!cols.includes('text')) throw new Error('В первой строке CSV нет колонки «вопрос»');
  return rows.map((row, i) => {
    const get = (name: string) => row[cols.indexOf(name)]?.trim() ?? '';
    const options = [1, 2, 3, 4, 5].map((k) => get(`option${k}`)).filter(Boolean);
    return {
      text: get('text'),
      image: get('image') || null,
      options,
      correct: parseCorrect(get('correct'), options.length, i + 1),
      seconds: get('seconds') ? Number(get('seconds')) : 30,
      double: parseBool(get('double')),
    };
  });
}

// Excel по умолчанию сохраняет CSV в windows-1251, «CSV UTF-8» — в UTF-8. Понимаем оба.
export async function readTextFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1251').decode(bytes);
  }
  return text.replace(/^﻿/, '');
}

export function questionsToJson(questions: Question[]): string {
  return JSON.stringify(
    {
      questions: questions.map((q) => ({
        text: q.text,
        image: q.image,
        options: q.options,
        correct: q.correct + 1,
        seconds: q.seconds,
        double: q.double,
      })),
    },
    null,
    2,
  );
}
