import { useEffect, useState } from 'react';
import { errorText } from '../api';
import { serverNow } from '../clock';
import { LETTERS, type TabProps } from './types';

const PHASES: Record<string, string> = {
  countdown: 'отсчёт',
  question: 'идёт',
  revealed: 'ответ показан',
};

export function Control({ api, state, refresh }: TabProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);

  if (!state) return <p className="q-s">Загружаем…</p>;

  const run = async (path: string) => {
    setBusy(true);
    setError('');
    try {
      await api.post(path);
      await refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const q = state.current;
  const now = serverNow();
  const opensAt = q ? Date.parse(q.opensAt) : 0;
  const deadline = q ? Date.parse(q.deadline) : 0;
  const phase = state.phase === 'question' && now < opensAt ? 'countdown' : state.phase;
  const live = q && (state.phase === 'question' || state.phase === 'revealed');
  const canStart = (state.phase === 'lobby' || state.phase === 'revealed') && state.next;
  const total = state.questions.length;

  let timer = '';
  if (phase === 'countdown') timer = `через ${Math.ceil((opensAt - now) / 1000)}`;
  if (phase === 'question') timer = `${Math.max(0, Math.ceil((deadline - now) / 1000))} с`;

  return (
    <div className="adm-grid">
      <section className="adm-card">
        {live ? (
          <>
            <div className="adm-split">
              <span className="adm-h">
                Вопрос {q.no} из {total} / {PHASES[phase]}
              </span>
              <div className="adm-row">
                {q.double && <span className="q-tag q-tag--lime">Двойные баллы</span>}
                {timer ? <span className="adm-timer">{timer}</span> : <span className="q-tag">{q.seconds} с</span>}
              </div>
            </div>
            <div className="adm-row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              {q.image && <img className="adm-qimg" src={q.image} alt="" />}
              <p className="adm-qtext">{q.text}</p>
            </div>
            <div className="adm-bars">
              {q.options.map((text, i) => {
                const n = q.distribution?.[i] ?? 0;
                const share = q.answered ? Math.round((n / q.answered) * 100) : 0;
                const correct = phase === 'revealed' && i === q.correct;
                return (
                  <div key={i} className={`adm-bar${correct ? ' is-correct' : ''}`}>
                    <span>{LETTERS[i]}</span>
                    <div className="adm-bar__track">
                      <div className="adm-bar__fill" style={{ width: `${q.distribution ? share : 0}%` }} />
                      <span className="adm-bar__text">{text}</span>
                    </div>
                    <span>{q.distribution ? n : ''}</span>
                  </div>
                );
              })}
            </div>
            {phase !== 'revealed' && <p className="q-s">Правильный ответ появится, когда закроется таймер</p>}
          </>
        ) : (
          <>
            <span className="adm-h">
              {state.phase === 'finished' ? `Игра ${state.game} окончена` : `Лобби / игра ${state.game}`}
            </span>
            <p className="adm-qtext">
              {state.phase === 'finished'
                ? 'Рейтинг и выгрузка — во вкладке «Рейтинг»'
                : 'Участники входят по ссылке. Запустите первый вопрос, когда будете готовы'}
            </p>
            {total === 0 && <p className="q-err">В этой игре нет вопросов — загрузите их во вкладке «Вопросы»</p>}
          </>
        )}

        <div className="adm-row">
          {canStart && (
            <button className="adm-btn" type="button" disabled={busy} onClick={() => run('/start')}>
              Запустить вопрос {state.next!.no}
            </button>
          )}
          {(state.phase === 'lobby' || state.phase === 'revealed') && (
            <button className="adm-btn adm-btn--ghost" type="button" disabled={busy}
              onClick={() => window.confirm(`Завершить игру ${state.game}? Участники увидят «Спасибо!».`) && run('/finish')}>
              Завершить игру
            </button>
          )}
          {state.phase === 'revealed' && !state.next && <span className="q-s">Вопросы игры закончились</span>}
        </div>
        {error && <p className="q-err">{error}</p>}
      </section>

      <div className="adm-side">
        <section className="adm-card adm-stats">
          <div>
            <p className="adm-stat">{state.players}</p>
            <p className="q-s">в игре</p>
          </div>
          <div>
            <p className="adm-stat">{live ? q.answered : '—'}</p>
            <p className="q-s">ответили</p>
          </div>
        </section>
        {total > 0 && (
          <section className="adm-card">
            <span className="adm-h">Игра {state.game}</span>
            <ol className="adm-progress">
              {state.questions.map((x, i) => (
                <li key={x.id} className={x.id === state.questionId && state.phase !== 'finished' ? 'is-current' : x.closed ? 'is-done' : ''}>
                  <span className="adm-progress__no">{i + 1}</span>
                  <span className="adm-progress__text">{x.text}</span>
                  {x.double && <span className="q-tag q-tag--lime">×2</span>}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
