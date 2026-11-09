import { useState, type FormEvent } from 'react';
import { errorText, request } from '../api';
import { saveToken, storageWorks } from './storage';
import { Screen, Top } from './ui';

const STORAGE_PROBLEM =
  'Браузер не даёт сохранить вход — так ты потеряешь ник при обновлении страницы. Открой ссылку в обычном, не приватном окне или в другом браузере';

// К01, К02 — вход и «ник занят».
export function Join({ notice, onJoined, onLogin }: {
  notice?: string;
  onJoined: (token: string, nick: string, code: string) => void;
  onLogin: () => void;
}) {
  const [nick, setNick] = useState('');
  const [error, setError] = useState('');
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
      <Top />
      <form className="q-center" onSubmit={submit}>
        {notice && (
          <div className="q-card">
            <p className="q-t">{notice}</p>
          </div>
        )}
        <span className="q-tag">Точка будущего / квиз</span>
        <h1 className="q-h">Придумай ник для игры</h1>
        <p className="q-s">Только ник, без имени и фамилии. Вопросы покажут в эфире, отвечать — здесь</p>
        <input
          className={`q-input${error ? ' is-error' : ''}`}
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          placeholder="Например, neuro_fox"
          aria-label="Ник"
          autoComplete="off"
          autoCapitalize="off"
          maxLength={20}
          required
        />
        {error && <p className="q-err" role="alert">{error}</p>}
        <button className="q-btn" type="submit" disabled={busy}>
          Войти в игру
        </button>
        <button className="q-btn q-btn--ghost" type="button" onClick={onLogin}>
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
      <Top />
      <form className="q-center" onSubmit={submit}>
        <span className="q-tag">Точка будущего / квиз</span>
        <h1 className="q-h">Вход по коду</h1>
        <p className="q-s">Код был на экране после первого входа — поищи его в скриншотах</p>
        <input className={`q-input${error ? ' is-error' : ''}`} value={nick} onChange={(e) => setNick(e.target.value)}
          placeholder="Ник" aria-label="Ник" autoComplete="off" autoCapitalize="off" maxLength={20} required />
        <input className={`q-input${error ? ' is-error' : ''}`} value={code} onChange={(e) => setCode(e.target.value)}
          placeholder="Секретный код" aria-label="Секретный код" autoComplete="off" autoCapitalize="characters"
          maxLength={12} required />
        {error && <p className="q-err" role="alert">{error}</p>}
        <button className="q-btn" type="submit" disabled={busy}>
          Войти
        </button>
        <button className="q-btn q-btn--ghost" type="button" onClick={onBack}>
          Назад
        </button>
      </form>
    </Screen>
  );
}

// К03 — секретный код. Показывается один раз (ТЗ, п. 4): нигде больше его не увидеть.
export function CodeReveal({ nick, code, onNext }: { nick: string; code: string; onNext: () => void }) {
  return (
    <Screen>
      <Top tag={nick} tagClass="q-tag--line" />
      <div className="q-center">
        <span className="sticker sticker--sm code-sticker">Сделай скриншот</span>
        <h1 className="q-h">Твой секретный код</h1>
        <p className="q-code">{code}</p>
        <p className="q-t">
          По коду войдёшь с другого устройства и во вторую игру 12.11, а если победишь — подтвердишь, что это ты.
          Больше мы его не покажем
        </p>
        <p className="q-s">Никому не показывай код: по нему можно войти под твоим ником</p>
        <button className="q-btn" type="button" onClick={onNext}>
          Скриншот сделан
        </button>
      </div>
    </Screen>
  );
}

export function NoStorage() {
  return (
    <Screen>
      <Top />
      <div className="q-center">
        <h1 className="q-h">Открой в другом окне</h1>
        <p className="q-t">{STORAGE_PROBLEM}</p>
      </div>
    </Screen>
  );
}
