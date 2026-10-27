import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ApiError, request } from '../api';
import { serverNow, syncClock } from '../clock';
import { LETTERS, type Pending, type Snapshot } from './types';
import { Nick, Pair, Screen } from './ui';

const POLL_MS = 2500;
const GRACE_MS = 1000;
// Варианты открываются чуть позже серверного opensAt: поправка часов неточна на десятки
// миллисекунд, и без запаса быстрый ответ может прийти раньше открытия — сервер его отклонит.
const OPEN_MARGIN_MS = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Клиент только показывает снимок с сервера (ТЗ, п. 7).
function useSnapshot(token: string, onRemoved: () => void) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [online, setOnline] = useState(true);
  const pollRef = useRef<() => void>(() => {});

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let misses = 0;
    let notFound = 0;

    const poll = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      clearTimeout(timer);
      const ctrl = new AbortController();
      const abort = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(`/state/${token}.json`, { cache: 'no-store', signal: ctrl.signal });
        if (res.status === 404) {
          // Файла нет — ведущий удалил ник или сбросил игру. Второй подряд 404 — не случайность.
          if (++notFound >= 2) {
            stopped = true;
            onRemoved();
            return;
          }
        } else if (res.ok) {
          notFound = 0;
          misses = 0;
          setOnline(true);
          setSnap((await res.json()) as Snapshot);
        } else if (++misses >= 2) setOnline(false);
      } catch {
        if (++misses >= 2) setOnline(false);
      } finally {
        clearTimeout(abort);
        inFlight = false;
        // Следующий опрос — только после завершения предыдущего.
        if (!stopped) timer = setTimeout(poll, POLL_MS);
      }
    };
    pollRef.current = poll;
    void poll();

    // Вернулись в свёрнутую вкладку или появилась сеть — забираем снимок сразу.
    const wake = () => {
      if (document.visibilityState === 'visible') {
        void syncClock();
        void poll();
      }
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    window.addEventListener('pageshow', wake);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      window.removeEventListener('pageshow', wake);
    };
  }, [token, onRemoved]);

  return { snap, online, pollNow: () => pollRef.current() };
}

function useTicker(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [active]);
}

export function Game({ token, onRemoved }: { token: string; onRemoved: () => void }) {
  const { snap, online, pollNow } = useSnapshot(token, onRemoved);
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    void syncClock();
    const id = setInterval(syncClock, 60_000);
    return () => clearInterval(id);
  }, []);

  useTicker(snap?.phase === 'countdown' || snap?.phase === 'question');

  // Новый вопрос или новый экран — прокрутка наверх. Показ ответа того же вопроса страницу не дёргает.
  const screenKey = snap?.phase === 'question' || snap?.phase === 'revealed' ? `q${snap.questionId}` : snap?.phase;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screenKey]);

  // Картинка начинает грузиться во время отсчёта.
  useEffect(() => {
    if (snap?.image) new Image().src = snap.image;
  }, [snap?.image]);

  const choose = useCallback(
    async (questionId: number, option: number) => {
      setPending({ questionId, option, status: 'sending' });
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await request('/api/answer', { method: 'POST', body: { token, questionId, option } });
          setPending({ questionId, option, status: 'ok' });
          setTimeout(pollNow, 300);
          return;
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            const prev = e.data?.option;
            setPending(
              e.data?.reason === 'already' && typeof prev === 'number'
                ? { questionId, option: prev, status: 'ok' }
                : { questionId, option, status: 'rejected' },
            );
            return;
          }
          if (e instanceof ApiError && e.status === 404) return onRemoved();
          if (e instanceof ApiError && e.status < 500 && e.status !== 429) {
            setPending({ questionId, option, status: 'rejected' });
            return;
          }
          await sleep(1000);
        }
      }
      setPending({ questionId, option, status: 'failed' });
    },
    [token, pollNow, onRemoved],
  );

  if (!snap) {
    return (
      <Screen>
        <p className="sub">{online ? 'Подключаемся к игре…' : 'Нет связи — переподключаемся…'}</p>
      </Screen>
    );
  }

  const offline = !online && <div className="ai-status">Нет связи — переподключаемся…</div>;

  if (snap.phase === 'lobby') {
    return (
      <Screen>
        <div className="ai-quizbar">
          <Nick nick={snap.nick} />
          <span className="count">Игра {snap.game}</span>
        </div>
        {offline}
        <div className="hero">
          <Pair big={['spark', 'red']} small={['sphere', 'ink']} />
        </div>
        <div>
          <h1 className="title">Ты в игре</h1>
          <p className="sub">Ждём начала. Вопросы ведущий покажет в эфире, а отвечать — здесь.</p>
        </div>
        <div className="ai-status">Не закрывай эту страницу</div>
      </Screen>
    );
  }

  if (snap.phase === 'finished') {
    return (
      <Screen>
        <div className="ai-quizbar">
          <Nick nick={snap.nick} />
          <span className="count">Игра {snap.game}</span>
        </div>
        {offline}
        <div className="hero">
          <Pair big={['star', 'red']} small={['spark', 'ink']} />
        </div>
        <div>
          <h1 className="title">Спасибо!</h1>
          <p className="sub">Итоги — в конце практики 12.11, на экране эфира.</p>
        </div>
        {snap.game === 1 && (
          <div className="ai-status">
            Вторая часть квиза — чт 12.11 · 17:00 МСК. Заходи под этим же ником, с другого устройства — по коду.
          </div>
        )}
      </Screen>
    );
  }

  const t = serverNow();
  const opensAt = Date.parse(snap.opensAt ?? '') + OPEN_MARGIN_MS;
  const deadline = Date.parse(snap.deadline ?? '');
  let phase = snap.phase;
  if (phase === 'countdown' && t >= opensAt) phase = 'question';
  if (phase === 'question' && t < opensAt) phase = 'countdown';

  const counter = `Вопрос ${snap.questionNo} / ${snap.questionsTotal}`;

  if (phase === 'countdown') {
    const left = Math.max(1, Math.ceil((opensAt - t) / 1000));
    return (
      <Screen>
        <div className="ai-quizbar">
          <Nick nick={snap.nick} />
          <span className="count">{counter}</span>
        </div>
        {offline}
        <div className="countdown">
          <span className="count">Вопрос через</span>
          <span className="countdown__num" key={left}>{left}</span>
          {snap.double && <span className="ai-tag ai-tag--red">Двойные баллы</span>}
        </div>
      </Screen>
    );
  }

  const revealed = phase === 'revealed';
  const local = pending && pending.questionId === snap.questionId && pending.status !== 'rejected' && pending.status !== 'failed'
    ? pending.option
    : null;
  const myAnswer = snap.myAnswer ?? local;
  const timeLeft = Math.max(0, deadline - t);
  const canAnswer = !revealed && myAnswer === null && t >= opensAt && t <= deadline + GRACE_MS;
  const total = Math.max(1, deadline - opensAt);
  const percent = revealed ? 0 : Math.round((timeLeft / total) * 100);
  const secs = Math.ceil(timeLeft / 1000);

  let status: { text: string; ok?: boolean } | null = null;
  if (revealed) {
    if (myAnswer === null) status = { text: 'Ответа не было. Следующий вопрос — на экране эфира' };
    else if (myAnswer === snap.correct) status = { text: 'Твой ответ верный', ok: true };
    else status = { text: 'Следующий вопрос — на экране эфира' };
  } else if (pending?.questionId === snap.questionId && pending.status === 'rejected' && snap.myAnswer === null) {
    status = { text: 'Ответ не принят — время вышло' };
  } else if (pending?.questionId === snap.questionId && pending.status === 'failed' && snap.myAnswer === null) {
    status = { text: 'Ответ не отправился. Проверь интернет и нажми ещё раз' };
  } else if (myAnswer !== null) {
    status = { text: snap.myAnswer === null && pending?.status === 'sending' ? 'Отправляем ответ…' : 'Ответ принят. Правильный покажем после таймера' };
  } else if (!canAnswer) {
    status = { text: 'Время вышло' };
  }

  return (
    <Screen>
      <div className="ai-quizbar">
        <Nick nick={snap.nick} />
        <span className="ai-timer" style={{ '--p': percent } as CSSProperties}>
          0:{String(secs).padStart(2, '0')}
        </span>
      </div>
      {offline}
      <div className="question-meta">
        <span className="count">{revealed ? `${counter} · ответ` : counter}</span>
        {snap.double && <span className="ai-tag ai-tag--red">Двойные баллы</span>}
      </div>
      {snap.image && (
        <div className="ai-qimage">
          <img src={snap.image} alt="" />
        </div>
      )}
      <p className="ai-question">{snap.text}</p>
      <div className="ai-options">
        {snap.options?.map((text, i) => {
          let state = '';
          let mark = '';
          let key: ReactNode = LETTERS[i];
          if (revealed) {
            if (i === snap.correct) {
              state = 'is-correct';
              mark = 'Верно';
              key = <i className="ai-ico" />;
            } else if (i === myAnswer) {
              state = 'is-wrong';
              mark = 'Твой ответ';
              key = <i className="ai-ico ai-ico--cross" />;
            } else state = 'is-dim';
          } else if (i === myAnswer) {
            state = 'is-selected';
            mark = 'Твой выбор';
          }
          return (
            <button
              key={i}
              type="button"
              className={`ai-option ${state}`}
              disabled={!canAnswer}
              aria-pressed={i === myAnswer}
              onClick={() => snap.questionId !== null && choose(snap.questionId, i)}
            >
              <span className="ai-option__key">{key}</span>
              <span className="ai-option__text">{text}</span>
              {mark && <span className="ai-option__mark">{mark}</span>}
            </button>
          );
        })}
      </div>
      {status && <div className={`ai-status${status.ok ? ' ai-status--ok' : ''}`}>{status.text}</div>}
    </Screen>
  );
}
