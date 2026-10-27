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
            ? { text: 'Код совпадает — это тот самый участник', ok: true }
            : { text: 'Код НЕ совпадает', ok: false },
      );
    } catch (err) {
      setResult({ text: errorText(err), ok: false });
    }
  };
  return (
    <article className="adm-card">
      <h2 className="adm-h2">Проверка победителя</h2>
      <p className="adm-muted">Победитель присылает свой секретный код. Сверяем пару «ник — код».</p>
      <form className="adm-row" onSubmit={submit}>
        <input className="ai-input adm-search" placeholder="Ник" value={nick} onChange={(e) => setNick(e.target.value)} required />
        <input className="ai-input adm-search code-input" placeholder="Код" value={code} onChange={(e) => setCode(e.target.value)} required />
        <button className="ai-btn ai-btn--primary ai-btn--s" type="submit">Проверить</button>
      </form>
      {result && <div className={`ai-status${result.ok ? ' ai-status--ok' : ''}`}>{result.text}</div>}
    </article>
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
    <article className="adm-card">
      <h2 className="adm-h2">Журнал</h2>
      <p className="adm-muted">Входы, ответы и команды со временем, IP и браузером — для споров о победителях. Пустой ник — последние 300 записей.</p>
      <form className="adm-row" onSubmit={submit}>
        <input className="ai-input adm-search" placeholder="Ник" value={nick} onChange={(e) => setNick(e.target.value)} />
        <button className="ai-btn ai-btn--outline ai-btn--s" type="submit">Показать</button>
      </form>
      {error && <p className="form-error">{error}</p>}
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
    </article>
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
    <article className="adm-card">
      <h2 className="adm-h2">Сброс после прогона</h2>
      <p className="adm-muted">Прогнали игру с командой — обнуляем перед эфиром. Вопросы не удаляются.</p>
      <div className="adm-row">
        <button className="ai-btn ai-btn--outline ai-btn--s" type="button" onClick={() => reset('progress')}>
          Сбросить ответы и запуски
        </button>
        <button className="ai-btn ai-btn--red ai-btn--s" type="button" onClick={() => reset('all')}>
          Полный сброс с участниками
        </button>
      </div>
      {msg && <div className="ai-status">{msg}</div>}
    </article>
  );
}

export function Service({ api, refresh }: TabProps) {
  return (
    <section className="adm-stack">
      <Verify api={api} />
      <Journal api={api} />
      <Reset api={api} refresh={refresh} />
    </section>
  );
}
