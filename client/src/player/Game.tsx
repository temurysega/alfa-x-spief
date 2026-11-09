import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ApiError, request } from '../api';
import { serverNow, syncClock } from '../clock';
import { LETTERS, type Pending, type Snapshot } from './types';
import { Screen, Spark, Top } from './ui';

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
    // К10 — нет связи, пока не пришёл ни один снимок.
    return (
      <Screen>
        <Top />
        <div className="q-center">
          {online ? (
            <p className="q-t">Подключаемся к игре…</p>
          ) : (
            <>
              <div className="q-card offline">
                <span className="q-tag">Нет связи</span>
                <p className="q-h">Переподключаемся…</p>
                <p className="q-s">Ответы и ник сохранены. Не закрывай страницу</p>
              </div>
              <button className="q-btn q-btn--ghost" type="button" onClick={() => window.location.reload()}>
                Обновить страницу
              </button>
            </>
          )}
        </div>
      </Screen>
    );
  }

  // К10 — плашка поверх любого экрана, пока клиент переподключается.
  const offline = !online && (
    <div className="q-card offline">
      <span className="q-tag">Нет связи</span>
      <p className="q-h">Переподключаемся…</p>
      <p className="q-s">Ответы и ник сохранены. Не закрывай страницу</p>
    </div>
  );

  // К04 — лобби.
  if (snap.phase === 'lobby') {
    return (
      <Screen tone="red">
        <Top white tag={snap.nick} tagClass="q-tag--white" />
        {offline}
        <div className="q-center">
          <Spark size={96} />
          <h1 className="q-h q-h--xl">Ты в игре!</h1>
          <p className="q-t">Ждём начала. Первый вопрос появится здесь сам, страницу обновлять не нужно</p>
          <p className="q-s">Квиз / игра {snap.game} из 2</p>
        </div>
      </Screen>
    );
  }

  // К09 — игра окончена.
  if (snap.phase === 'finished') {
    return (
      <Screen tone="red">
        <Top white tag={snap.nick} tagClass="q-tag--white" />
        {offline}
        <div className="q-center">
          <div className="thanks">
            <span className="warp" style={{ '--wa': '30deg' } as CSSProperties}>Спасибо!</span>
          </div>
          {snap.game === 1 ? (
            <>
              <p className="q-t">Первая часть квиза позади. Итоги — в конце практики, чт 12.11 / 17:00</p>
              <p className="q-s">Во вторую игру заходи с этого же телефона, а с другого устройства — по секретному коду</p>
            </>
          ) : (
            <p className="q-t">Итоги — на экране у ведущего</p>
          )}
        </div>
      </Screen>
    );
  }

  const t = serverNow();
  const opensAt = Date.parse(snap.opensAt ?? '') + OPEN_MARGIN_MS;
  const deadline = Date.parse(snap.deadline ?? '');
  let phase = snap.phase;
  if (phase === 'countdown' && t >= opensAt) phase = 'question';
  if (phase === 'question' && t < opensAt) phase = 'countdown';

  const counter = `${snap.questionNo} / ${snap.questionsTotal}`;

  // К05 — отсчёт 5 секунд.
  if (phase === 'countdown') {
    const left = Math.max(1, Math.ceil((opensAt - t) / 1000));
    return (
      <Screen tone="red">
        <Top white tag={snap.nick} tagClass="q-tag--white" />
        {offline}
        <div className="q-center q-center--middle">
          <p className="q-t q-t--strong">
            Вопрос {snap.questionNo} из {snap.questionsTotal} через
          </p>
          <p className="q-count">{left}</p>
          {snap.double && <span className="q-tag q-tag--lime">Двойные баллы</span>}
        </div>
      </Screen>
    );
  }

  // К06–К08 — вопрос, ответ принят, ответ показан.
  const revealed = phase === 'revealed';
  const local = pending && pending.questionId === snap.questionId && pending.status !== 'rejected' && pending.status !== 'failed'
    ? pending.option
    : null;
  const myAnswer = snap.myAnswer ?? local;
  const timeLeft = Math.max(0, deadline - t);
  const canAnswer = !revealed && myAnswer === null && t >= opensAt && t <= deadline + GRACE_MS;
  const total = Math.max(1, deadline - opensAt);
  const secs = Math.ceil(timeLeft / 1000);

  let status: { text: string; error?: boolean } | null = null;
  if (revealed) {
    if (myAnswer === null) status = { text: 'Ответа не было. Следующий вопрос — на экране эфира' };
    else if (myAnswer === snap.correct) status = { text: 'Твой ответ верный. Следующий вопрос — на экране эфира' };
    else status = { text: 'Следующий вопрос — на экране эфира' };
  } else if (pending?.questionId === snap.questionId && pending.status === 'rejected' && snap.myAnswer === null) {
    status = { text: 'Ответ не принят — время вышло', error: true };
  } else if (pending?.questionId === snap.questionId && pending.status === 'failed' && snap.myAnswer === null) {
    status = { text: 'Ответ не отправился. Проверь интернет и нажми ещё раз', error: true };
  } else if (myAnswer !== null) {
    status = { text: snap.myAnswer === null && pending?.status === 'sending' ? 'Отправляем ответ…' : 'Ответ принят. Правильный покажем после таймера' };
  } else if (!canAnswer) {
    status = { text: 'Время вышло' };
  }

  return (
    <Screen>
      <Top tag={counter} />
      {offline}
      <div className="q-body">
        {revealed ? (
          <span className="q-tag q-tag--lime">Время вышло</span>
        ) : (
          // Полоса уменьшается через scaleX(доля оставшегося времени), последние 5 секунд — красная.
          <div className={`q-timer${secs <= 5 ? ' is-low' : ''}`}>
            <div className="timer">
              <i style={{ transform: `scaleX(${Math.min(1, timeLeft / total)})` }} />
            </div>
            <span className="q-timer__sec">{secs}</span>
          </div>
        )}
        {snap.double && <span className="q-tag">Двойные баллы</span>}
        {snap.image && (
          <div className="q-pic">
            <img src={snap.image} alt="" />
          </div>
        )}
        <h1 className="q-h q-h--question">{snap.text}</h1>
        <div className="q-opts">
          {snap.options?.map((text, i) => {
            let state = '';
            let note = '';
            if (revealed) {
              if (i === snap.correct) {
                state = 'is-correct';
                note = 'Верно';
              } else if (i === myAnswer) {
                state = 'is-wrong';
                note = 'Твой ответ';
              } else state = 'is-dim';
            } else if (i === myAnswer) {
              state = 'is-selected';
              note = 'Твой ответ';
            } else if (myAnswer !== null) state = 'is-dim';
            return (
              <button
                key={i}
                type="button"
                className={`q-opt ${state}`.trim()}
                disabled={!canAnswer}
                aria-pressed={i === myAnswer}
                onClick={() => snap.questionId !== null && choose(snap.questionId, i)}
              >
                <span className="q-opt__k">{LETTERS[i]}</span>
                <span className="q-opt__text">{text}</span>
                {note && <span className="q-opt__note">{note}</span>}
              </button>
            );
          })}
        </div>
        {status && <p className={status.error ? 'q-err' : 'q-s'}>{status.text}</p>}
      </div>
    </Screen>
  );
}
