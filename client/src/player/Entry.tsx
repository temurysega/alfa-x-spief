import { useState, type FormEvent } from 'react';
import { errorText, request } from '../api';
import { saveToken, storageWorks } from './storage';
import { Pair, Screen, Wordmark } from './ui';

function Bar() {
  return (
    <div className="ai-quizbar">
      <Wordmark />
      <span className="count">Квиз</span>
    </div>
  );
}

const STORAGE_PROBLEM =
  'Браузер не даёт сохранить вход — так ты потеряешь ник при обновлении страницы. Открой ссылку в обычном, не приватном окне или в другом браузере';

export function Join({ notice, onJoined, onLogin }: {
  notice?: string;
  onJoined: (token: string, nick: string, code: string) => void;
  onLogin: () => void;
}) {
  const [nick, setNick] = useState('');
  const [error, setError] = useState(notice ?? '');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!storageWorks()) return setError(STORAGE_PROBLEM);
    setBusy(true);
    setError('');
    try {
      const r = await request<{ token: string; nick: string; code: string }>('/api/join', {
        method: 'POST',
        body: { nick },
      });
      if (!saveToken(r.token)) return setError(STORAGE_PROBLEM);
      onJoined(r.token, r.nick, r.code);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Bar />
      <div className="hero">
        <Pair big={['star', 'red']} small={['sphere', 'pink']} />
      </div>
      <div>
        <h1 className="title">Квиз начинается</h1>
        <p className="sub">Вопросы — на экране эфира, отвечаешь здесь. 30 секунд на ответ.</p>
      </div>
      <form className="stack" onSubmit={submit}>
        <label className="ai-field" htmlFor="nick">
          <span className="ai-field__label">Твой ник</span>
          <input
            className="ai-input"
            id="nick"
            value={nick}
            onChange={(e) => setNick(e.target.value)}
            placeholder="Например, neuro_masha"
            autoComplete="off"
            autoCapitalize="off"
            maxLength={20}
            required
          />
          <span className="ai-field__hint">Без имени и фамилии — только ник</span>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="ai-btn ai-btn--primary ai-btn--block ai-btn--l" type="submit" disabled={busy}>
          Войти в игру
        </button>
        <button className="ai-btn ai-btn--ghost ai-btn--block" type="button" onClick={onLogin}>
          У меня уже есть код
        </button>
      </form>
    </Screen>
  );
}

export function Login({ onDone, onBack }: { onDone: (token: string) => void; onBack: () => void }) {
  const [nick, setNick] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!storageWorks()) return setError(STORAGE_PROBLEM);
    setBusy(true);
    setError('');
    try {
      const r = await request<{ token: string }>('/api/login', { method: 'POST', body: { nick, code } });
      if (!saveToken(r.token)) return setError(STORAGE_PROBLEM);
      onDone(r.token);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Bar />
      <div>
        <h1 className="title">Вход по коду</h1>
        <p className="sub">Код был на экране после первого входа — поищи его в скриншотах.</p>
      </div>
      <form className="stack" onSubmit={submit}>
        <label className="ai-field" htmlFor="login-nick">
          <span className="ai-field__label">Твой ник</span>
          <input className="ai-input" id="login-nick" value={nick} onChange={(e) => setNick(e.target.value)}
            autoComplete="off" autoCapitalize="off" maxLength={20} required />
        </label>
        <label className="ai-field" htmlFor="login-code">
          <span className="ai-field__label">Секретный код</span>
          <input className="ai-input code-input" id="login-code" value={code} onChange={(e) => setCode(e.target.value)}
            autoComplete="off" autoCapitalize="characters" maxLength={12} required />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="ai-btn ai-btn--primary ai-btn--block ai-btn--l" type="submit" disabled={busy}>
          Войти
        </button>
        <button className="ai-btn ai-btn--ghost ai-btn--block" type="button" onClick={onBack}>
          Назад
        </button>
      </form>
    </Screen>
  );
}

// Код показывается один раз (ТЗ, п. 4): нигде больше его не увидеть.
export function CodeReveal({ nick, code, onNext }: { nick: string; code: string; onNext: () => void }) {
  return (
    <Screen>
      <Bar />
      <div>
        <h1 className="title">Сделай скриншот</h1>
        <p className="sub">Это твой секретный код. Больше мы его не покажем.</p>
      </div>
      <div className="code-card">
        <span className="ai-field__label code-card__label">Ник · {nick}</span>
        <span className="code-card__code">{code}</span>
        <span className="ai-field__label code-card__label">Секретный код</span>
      </div>
      <ul className="code-uses">
        <li>войти с другого телефона или компьютера</li>
        <li>продолжить во второй части квиза 12.11</li>
        <li>подтвердить, что победитель — это ты</li>
      </ul>
      <p className="sub">Никому его не показывай: по коду можно войти под твоим ником.</p>
      <button className="ai-btn ai-btn--primary ai-btn--block ai-btn--l" type="button" onClick={onNext}>
        Скриншот сделан
      </button>
    </Screen>
  );
}

export function NoStorage() {
  return (
    <Screen>
      <Bar />
      <div>
        <h1 className="title">Открой в другом окне</h1>
        <p className="sub">{STORAGE_PROBLEM}.</p>
      </div>
    </Screen>
  );
}
