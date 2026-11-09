import { useCallback, useEffect, useState } from 'react';
import { errorText } from '../api';
import type { TabProps } from './types';

type Row = { place: number; playerId: number; nick: string; points: number; correctCount: number; timeMs: number };

export function Rating({ api }: TabProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setRows(await api.get<Row[]>('/rating'));
    } catch (e) {
      setError(errorText(e));
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const download = (path: string, name: string) => api.download(path, name).catch((e) => setError(errorText(e)));

  return (
    <section className="adm-card">
      <div className="adm-split">
        <span className="adm-h">Рейтинг</span>
        <div className="adm-row">
          <button className="adm-btn adm-btn--sm" type="button" onClick={() => download('/export/rating.csv', 'rating.csv')}>
            Выгрузить CSV
          </button>
          <button className="adm-btn adm-btn--ghost adm-btn--sm" type="button" onClick={() => download('/export/answers.csv', 'answers.csv')}>
            Все ответы CSV
          </button>
          <button className="adm-btn adm-btn--ghost adm-btn--sm" type="button" onClick={load}>Обновить</button>
        </div>
      </div>
      <p className="q-s">
        Общий рейтинг двух игр по закрытым вопросам. Верный ответ — 1 балл, на вопросе с двойными баллами — 2. При
        равных баллах выше тот, у кого меньше суммарное время на верные ответы
      </p>
      {error && <p className="q-err">{error}</p>}
      <table className="adm-table">
        <thead>
          <tr><th>Место</th><th>Ник</th><th>Баллы</th><th>Верных</th><th>Время, с</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.playerId} className={r.place <= 3 && r.points > 0 ? 'is-top' : ''}>
              <td>{r.place}</td>
              <td className="adm-nick">{r.nick}</td>
              <td>{r.points}</td>
              <td>{r.correctCount}</td>
              <td>{(r.timeMs / 1000).toFixed(1).replace('.', ',')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
