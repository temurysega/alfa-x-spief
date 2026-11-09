import { useCallback, useEffect, useState } from 'react';
import { errorText } from '../api';
import type { TabProps } from './types';

type Row = { id: number; nick: string; createdAt: string; answers: number };

export function Players({ api }: TabProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await api.get<Row[]>('/players'));
    } catch (e) {
      setError(errorText(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const shown = rows.filter((r) => r.nick.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <section className="adm-card">
      <div className="adm-split">
        <div className="adm-row">
          <span className="adm-h">Участники</span>
          <span className="q-tag">{rows.length}</span>
        </div>
        <div className="adm-row">
          <input className="q-input adm-input" style={{ width: 240 }} placeholder="Поиск по нику" aria-label="Поиск по нику"
            value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button className="adm-btn adm-btn--ghost adm-btn--sm" type="button" onClick={load}>Обновить</button>
        </div>
      </div>
      {error && <p className="q-err">{error}</p>}
      <table className="adm-table">
        <thead>
          <tr><th>Ник</th><th>Вошёл (МСК)</th><th>Ответов</th><th /></tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              <td className="adm-nick">{r.nick}</td>
              <td>{new Date(r.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}</td>
              <td>{r.answers}</td>
              <td className="adm-actions">
                <button className="adm-link" type="button"
                  onClick={() => {
                    const nick = window.prompt('Новый ник', r.nick);
                    if (nick && nick !== r.nick) void act(() => api.post('/players/rename', { id: r.id, nick }));
                  }}>
                  переименовать
                </button>
                <button className="adm-link" type="button"
                  onClick={() =>
                    window.confirm(`Удалить «${r.nick}» вместе с ответами? Участник окажется на экране входа.`) &&
                    act(() => api.post('/players/delete', { id: r.id }))
                  }>
                  удалить
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
