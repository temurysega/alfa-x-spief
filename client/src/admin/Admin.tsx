import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { errorText, request } from '../api';
import { syncClock } from '../clock';
import { Lockup } from '../player/ui';
import '../styles/admin.css';
import { loadAdminToken, makeApi, saveAdminToken } from './api';
import { Control } from './Control';
import { Players } from './Players';
import { Questions } from './Questions';
import { Rating } from './Rating';
import { Service } from './Service';
import type { AdminState } from './types';

const TABS = [
  ['control', 'Пульт'],
  ['questions', 'Вопросы'],
  ['players', 'Участники'],
  ['rating', 'Рейтинг'],
  ['service', 'Сервис'],
] as const;
type Tab = (typeof TABS)[number][0];

function LoginForm({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const { token } = await request<{ token: string }>('/api/admin/login', { method: 'POST', body: { password } });
      onLogin(token);
    } catch (err) {
      setError(errorText(err));
    }
  };
  return (
    <main className="adm adm-page">
      <form className="adm-card adm-login" onSubmit={submit}>
        <Lockup />
        <h1 className="adm-h">Пульт квиза</h1>
        <input className={`q-input adm-input${error ? ' is-error' : ''}`} type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" aria-label="Пароль" autoFocus required />
        {error && <p className="q-err">{error}</p>}
        <button className="adm-btn" type="submit">Войти</button>
      </form>
    </main>
  );
}

export function Admin() {
  const [token, setToken] = useState<string | null>(() => loadAdminToken());
  const [tab, setTab] = useState<Tab>('control');
  const [state, setState] = useState<AdminState | null>(null);
  const [offline, setOffline] = useState(false);
  const [gameError, setGameError] = useState('');

  const logout = useCallback(() => {
    saveAdminToken(null);
    setToken(null);
  }, []);
  const api = useMemo(() => (token ? makeApi(token, logout) : null), [token, logout]);

  const refresh = useCallback(async () => {
    if (!api) return;
    try {
      setState(await api.get<AdminState>('/state'));
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [api]);

  useEffect(() => {
    if (!api) return;
    void syncClock();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await refresh();
      if (!stopped) timer = setTimeout(loop, 1000);
    };
    void loop();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [api, refresh]);

  if (!api) {
    return (
      <LoginForm
        onLogin={(t) => {
          saveAdminToken(t);
          setToken(t);
        }}
      />
    );
  }

  const selectGame = async (game: number) => {
    if (!window.confirm(`Переключиться на игру ${game}? Участники вернутся в лобби.`)) return;
    setGameError('');
    try {
      await api.post('/game', { game });
      await refresh();
    } catch (e) {
      setGameError(errorText(e));
    }
  };

  const props = { api, state, refresh };
  return (
    <main className="adm adm-page">
      <header className="adm-head">
        <div className="adm-row" style={{ gap: 24 }}>
          <Lockup />
          <span className="adm-h">Пульт квиза</span>
        </div>
        <div className="adm-row">
          {state && (
            <span className="adm-seg" role="group" aria-label="Игра в эфире">
              {[1, 2].map((g) => (
                <button key={g} type="button" className={state.game === g ? 'is-on' : ''}
                  disabled={state.phase === 'question' || state.game === g} onClick={() => selectGame(g)}>
                  Игра {g}
                </button>
              ))}
            </span>
          )}
          <button className="adm-btn adm-btn--line adm-btn--sm" type="button" onClick={logout}>Выйти</button>
        </div>
      </header>

      <nav className="adm-seg adm-seg--white" aria-label="Разделы пульта">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {offline && <div className="adm-alert adm-alert--soft">Нет связи с сервером — пульт переподключается</div>}
      {gameError && <div className="adm-alert">{gameError}</div>}
      {state?.error && (
        <div className="adm-alert" role="alert">
          <div>
            ОШИБКА / {state.error.where}
            <div className="adm-alert__text">
              {state.error.message} / {new Date(state.error.at).toLocaleString('ru-RU')}
            </div>
          </div>
          <button className="adm-btn adm-btn--sm" type="button" onClick={() => api.post('/clear-error').then(refresh)}>
            Скрыть
          </button>
        </div>
      )}

      {tab === 'control' && <Control {...props} />}
      {tab === 'questions' && <Questions {...props} />}
      {tab === 'players' && <Players {...props} />}
      {tab === 'rating' && <Rating {...props} />}
      {tab === 'service' && <Service {...props} />}
    </main>
  );
}
