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
      <Top entry />
      <form className="q-center" onSubmit={submit}>
        {notice && (
          <div className="q-card">
            <p className="q-t">{notice}</p>
          </div>
        )}
        <span className="q-tag">Точка будущего / Квиз</span>
        <h1 className="q-h">Придумай ник для игры</h1>
        {/* Пересказывает проверки сервера (server/src/nick.ts), сами правила не меняются */}
        <p className="q-s">От 2 до 20 символов: русские или английские буквы, цифры, пробел, точка, _ или -</p>
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
      <Top entry />
      <form className="q-center" onSubmit={submit}>
        <span className="q-tag">Точка будущего / Квиз</span>
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
          Мы показываем код только один раз — сохрани его.
          <br />
          По нику и коду ты сможешь войти с другого устройства или браузера. Код понадобится во второй части квиза
          12 ноября, а если победишь — с ним ты подтвердишь победу.
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
