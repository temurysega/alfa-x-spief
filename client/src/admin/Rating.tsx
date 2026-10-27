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
    <section className="adm-stack">
      <div className="adm-row">
        <button className="ai-btn ai-btn--primary ai-btn--s" type="button" onClick={() => download('/export/rating.csv', 'rating.csv')}>
          Скачать рейтинг CSV
        </button>
        <button className="ai-btn ai-btn--outline ai-btn--s" type="button" onClick={() => download('/export/answers.csv', 'answers.csv')}>
          Скачать все ответы CSV
        </button>
        <button className="ai-btn ai-btn--ghost ai-btn--s" type="button" onClick={load}>Обновить</button>
      </div>
      <p className="adm-muted">
        Общий рейтинг двух игр по закрытым вопросам. Верный ответ — 1 балл, на вопросе с двойными баллами — 2. При
        равных баллах выше тот, у кого меньше суммарное время на верные ответы.
      </p>
      {error && <p className="form-error">{error}</p>}
      <table className="adm-table">
        <thead>
          <tr><th>Место</th><th>Ник</th><th>Баллы</th><th>Верных</th><th>Время, с</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.playerId}>
              <td className="adm-place">{r.place}</td>
              <td className="adm-nick">{r.nick}</td>
              <td><b>{r.points}</b></td>
              <td>{r.correctCount}</td>
              <td>{(r.timeMs / 1000).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
