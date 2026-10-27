import { useEffect, useState } from 'react';
import { errorText } from '../api';
import { serverNow } from '../clock';
import { LETTERS, type TabProps } from './types';

const PHASES: Record<string, string> = {
  lobby: 'Лобби',
  countdown: 'Отсчёт',
  question: 'Вопрос идёт',
  revealed: 'Ответ показан',
  finished: 'Игра окончена',
};

export function Control({ api, state, refresh }: TabProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);

  if (!state) return <p className="adm-muted">Загружаем…</p>;

  const run = async (path: string, body?: unknown) => {
    setBusy(true);
    setError('');
    try {
      await api.post(path, body);
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
  const canStart = (state.phase === 'lobby' || state.phase === 'revealed') && state.next;
  const total = state.questions.length;

  return (
    <section className="adm-stack">
      <div className="adm-row">
        <div className="adm-switch" role="group" aria-label="Игра">
          {[1, 2].map((g) => (
            <button key={g} type="button" className={`adm-switch__btn${state.game === g ? ' is-on' : ''}`}
              disabled={busy || state.phase === 'question' || state.game === g}
              onClick={() => window.confirm(`Переключиться на игру ${g}? Участники вернутся в лобби.`) && run('/game', { game: g })}>
              Игра {g}
            </button>
          ))}
        </div>
        <span className={`ai-tag${phase === 'question' || phase === 'countdown' ? ' ai-tag--red' : ' ai-tag--ink'}`}>
          {PHASES[phase]}
        </span>
        <span className="ai-tag">В игре: {state.players}</span>
      </div>

      {q && (state.phase === 'question' || state.phase === 'revealed') ? (
        <article className="adm-card adm-live">
          <div className="adm-live__head">
            <span className="count">Вопрос {q.no} / {total}</span>
            {q.double && <span className="ai-tag ai-tag--red">Двойные баллы</span>}
            <span className="adm-live__timer">
              {phase === 'countdown' && `Отсчёт ${Math.ceil((opensAt - now) / 1000)}`}
              {phase === 'question' && `0:${String(Math.max(0, Math.ceil((deadline - now) / 1000))).padStart(2, '0')}`}
              {phase === 'revealed' && 'Закрыт'}
            </span>
          </div>
          <div className="adm-live__body">
            {q.image && <img className="adm-live__img" src={q.image} alt="" />}
            <p className="adm-live__text">{q.text}</p>
          </div>
          <div className="adm-big">
            Ответили: <b>{q.answered}</b> из {state.players}
          </div>
          <ul className="adm-options">
            {q.options.map((text, i) => {
              const n = q.distribution?.[i] ?? 0;
              const pct = q.answered ? Math.round((n / q.answered) * 100) : 0;
              const correct = phase === 'revealed' && i === q.correct;
              return (
                <li key={i} className={`adm-option${correct ? ' is-correct' : ''}`}>
                  <span className="adm-option__key">{LETTERS[i]}</span>
                  <span className="adm-option__text">{text}</span>
                  {q.distribution && (
                    <span className="adm-option__stat">
                      <span className="adm-bar"><span style={{ width: `${pct}%` }} /></span>
                      {n} · {pct}%
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {phase !== 'revealed' && <p className="adm-muted">Правильный ответ появится, когда закроется таймер.</p>}
        </article>
      ) : (
        <article className="adm-card">
          <p className="adm-big">
            {state.phase === 'finished'
              ? `Игра ${state.game} окончена. Рейтинг — во вкладке «Рейтинг».`
              : `Лобби игры ${state.game}. Участников в игре: ${state.players}.`}
          </p>
          {total === 0 && <p className="adm-muted">В этой игре нет вопросов — загрузите их во вкладке «Вопросы».</p>}
        </article>
      )}

      <div className="adm-row">
        {canStart && (
          <button className="ai-btn ai-btn--primary ai-btn--l" type="button" disabled={busy} onClick={() => run('/start')}>
            Запустить вопрос {state.next!.no}
          </button>
        )}
        {(state.phase === 'lobby' || state.phase === 'revealed') && (
          <button className="ai-btn ai-btn--outline ai-btn--l" type="button" disabled={busy}
            onClick={() => window.confirm(`Завершить игру ${state.game}? Участники увидят «Спасибо!».`) && run('/finish')}>
            Завершить игру
          </button>
        )}
        {state.phase === 'revealed' && !state.next && <span className="adm-muted">Вопросы игры закончились</span>}
      </div>
      {error && <p className="form-error">{error}</p>}

      {total > 0 && (
        <ol className="adm-progress">
          {state.questions.map((x, i) => (
            <li key={x.id} className={x.id === state.questionId ? 'is-current' : x.closed ? 'is-done' : ''}>
              <span className="adm-progress__no">{i + 1}</span>
              <span className="adm-progress__text">{x.text}</span>
              {x.double && <span className="ai-tag ai-tag--outline">×2</span>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
