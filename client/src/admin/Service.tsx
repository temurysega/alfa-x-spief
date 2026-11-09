import { useState, type FormEvent } from 'react';
import { errorText } from '../api';
import type { TabProps } from './types';

type Entry = { id: number; at: string; kind: string; playerId: number | null; nick: string | null; data: Record<string, unknown> };

const KINDS: Record<string, string> = {
  join: 'Вход (новый ник)',
  login: 'Вход по коду',
  login_failed: 'Неверный код',
  answer: 'Ответ',
  answer_rejected: 'Ответ отклонён',
  admin_rename: 'Переименован ведущим',
  admin_delete: 'Удалён ведущим',
  admin_verify: 'Проверка кода',
  question_start: 'Запуск вопроса',
  question_close: 'Закрытие вопроса',
};

function Verify({ api }: Pick<TabProps, 'api'>) {
  const [nick, setNick] = useState('');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api.post<{ found: boolean; match: boolean }>('/verify', { nick, code });
      setResult(
        !r.found
          ? { text: 'Такого ника нет', ok: false }
          : r.match
            ? { text: 'Код совпадает', ok: true }
            : { text: 'Код не совпадает', ok: false },
      );
    } catch (err) {
      setResult({ text: errorText(err), ok: false });
    }
  };
  return (
    <section className="adm-card">
      <span className="adm-h">Проверить победителя</span>
      <p className="q-s">Победитель присылает свой секретный код. Сверяем пару «ник — код»</p>
      <form className="adm-row" style={{ flexWrap: 'nowrap' }} onSubmit={submit}>
        <input className="q-input adm-input" placeholder="Ник" aria-label="Ник" value={nick}
          onChange={(e) => setNick(e.target.value)} required />
        <input className="q-input adm-input adm-input--sm" placeholder="Код" aria-label="Код" value={code}
          onChange={(e) => setCode(e.target.value)} required />
        <button className="adm-btn" type="submit">Проверить</button>
      </form>
      {result && <span className={`q-tag${result.ok ? ' q-tag--lime' : ''}`}>{result.text}</span>}
    </section>
  );
}

function Journal({ api }: Pick<TabProps, 'api'>) {
  const [nick, setNick] = useState('');
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      setRows(await api.get<Entry[]>(`/journal?nick=${encodeURIComponent(nick)}`));
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <section className="adm-card">
      <span className="adm-h">Журнал</span>
      <p className="q-s">Входы, ответы и команды со временем, IP и браузером — для споров о победителях. Пустой ник — последние 300 записей</p>
      <form className="adm-row" onSubmit={submit}>
        <input className="q-input adm-input" style={{ width: 240 }} placeholder="Ник" aria-label="Ник" value={nick}
          onChange={(e) => setNick(e.target.value)} />
        <button className="adm-btn adm-btn--ghost adm-btn--sm" type="submit">Показать</button>
      </form>
      {error && <p className="q-err">{error}</p>}
      {rows && (
        <table className="adm-table adm-table--small">
          <thead>
            <tr><th>Время (МСК)</th><th>Событие</th><th>Ник</th><th>Подробности</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}</td>
                <td>{KINDS[r.kind] ?? r.kind}</td>
                <td className="adm-nick">{r.nick}</td>
                <td className="adm-json">{JSON.stringify(r.data)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Reset({ api, refresh }: Pick<TabProps, 'api' | 'refresh'>) {
  const [msg, setMsg] = useState('');
  const reset = async (what: 'progress' | 'all') => {
    const text =
      what === 'all'
        ? 'Удалить ВСЕХ участников и все ответы? Это для чистого старта перед эфиром. Чтобы подтвердить, введите СБРОС'
        : 'Стереть все ответы и запуски вопросов? Участники останутся. Чтобы подтвердить, введите СБРОС';
    if (window.prompt(text)?.trim().toUpperCase() !== 'СБРОС') return;
    try {
      await api.post('/reset', { what });
      setMsg(what === 'all' ? 'Полный сброс сделан' : 'Прогресс сброшен');
      refresh();
    } catch (e) {
      setMsg(errorText(e));
    }
  };
  return (
    <section className="adm-card">
      <span className="adm-h">Сброс после прогона</span>
      <p className="q-s">Прогнали игру с командой — обнуляем перед эфиром. Вопросы не удаляются</p>
      <div className="adm-row">
        <button className="adm-btn adm-btn--ghost adm-btn--sm" type="button" onClick={() => reset('progress')}>
          Сбросить ответы и запуски
        </button>
        <button className="adm-btn adm-btn--sm" type="button" onClick={() => reset('all')}>
          Полный сброс с участниками
        </button>
      </div>
      {msg && <span className="q-tag q-tag--lime">{msg}</span>}
    </section>
  );
}

export function Service({ api, refresh }: TabProps) {
  return (
    <>
      <div className="adm-grid">
        <Verify api={api} />
        <Reset api={api} refresh={refresh} />
      </div>
      <Journal api={api} />
    </>
  );
}
