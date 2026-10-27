import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { errorText, request } from '../api';
import { syncClock } from '../clock';
import { Wordmark } from '../player/ui';
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
    <main className="adm-login">
      <Wordmark size={22} />
      <h1 className="adm-h1">Пульт ведущего</h1>
      <form className="stack" onSubmit={submit}>
        <label className="ai-field" htmlFor="password">
          <span className="ai-field__label">Пароль</span>
          <input className="ai-input" id="password" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)} autoFocus required />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="ai-btn ai-btn--primary ai-btn--block" type="submit">Войти</button>
      </form>
    </main>
  );
}

export function Admin() {
  const [token, setToken] = useState<string | null>(() => loadAdminToken());
  const [tab, setTab] = useState<Tab>('control');
  const [state, setState] = useState<AdminState | null>(null);
  const [offline, setOffline] = useState(false);

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

  const props = { api, state, refresh };
  return (
    <div className="adm">
      <header className="adm-top">
        <Wordmark size={18} />
        <nav className="adm-tabs">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" className={`adm-tab${tab === id ? ' is-on' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <button className="ai-btn ai-btn--ghost ai-btn--s" type="button" onClick={logout}>Выйти</button>
      </header>

      {offline && <div className="adm-alert">Нет связи с сервером — пульт переподключается</div>}
      {state?.error && (
        <div className="adm-alert adm-alert--error" role="alert">
          <div>
            <b>ОШИБКА</b> · {state.error.where}
            <div className="adm-alert__text">{state.error.message}</div>
            <div className="adm-muted">{new Date(state.error.at).toLocaleString('ru-RU')}</div>
          </div>
          <button className="ai-btn ai-btn--outline ai-btn--s" type="button"
            onClick={() => api.post('/clear-error').then(refresh)}>
            Скрыть
          </button>
        </div>
      )}

      <div className="adm-body">
        {tab === 'control' && <Control {...props} />}
        {tab === 'questions' && <Questions {...props} />}
        {tab === 'players' && <Players {...props} />}
        {tab === 'rating' && <Rating {...props} />}
        {tab === 'service' && <Service {...props} />}
      </div>
    </div>
  );
}
