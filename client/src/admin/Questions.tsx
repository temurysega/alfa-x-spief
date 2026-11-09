import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { errorText } from '../api';
import { compressImage } from './image';
import { parseCsvQuestions, parseJsonQuestions, questionsToJson, readTextFile, type FileQuestion } from './questionsFile';
import { LETTERS, type Question, type TabProps } from './types';

type Draft = {
  id: number | null;
  text: string;
  image: string | null;
  options: string[];
  correct: number;
  seconds: number;
  double: boolean;
};

const EMPTY: Draft = { id: null, text: '', image: null, options: ['', '', '', '', ''], correct: 0, seconds: 30, double: false };

export function Questions({ api, state }: TabProps) {
  const [game, setGame] = useState(state?.game ?? 1);
  const [list, setList] = useState<Question[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await api.get<Question[]>(`/questions?game=${game}`));
    } catch (e) {
      setError(errorText(e));
    }
  }, [api, game]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await fn();
      await load();
      if (done) setInfo(done);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async (file: File) => {
    const dataUrl = await compressImage(file);
    const { path } = await api.post<{ path: string }>('/image', { dataUrl });
    return path;
  };

  // Импорт: один файл JSON или CSV и, по желанию, картинки, на которые он ссылается по имени.
  const importFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    const data = files.filter((f) => /\.(json|csv)$/i.test(f.name));
    const images = new Map(files.filter((f) => f.type.startsWith('image/')).map((f) => [f.name.toLowerCase(), f]));
    if (data.length !== 1) return setError('Выберите один файл .json или .csv (и картинки к нему, если есть)');
    await act(async () => {
      const text = await readTextFile(data[0]);
      const parsed: FileQuestion[] = /\.json$/i.test(data[0].name) ? parseJsonQuestions(text) : parseCsvQuestions(text);
      const missing = parsed
        .map((q) => q.image)
        .filter((name): name is string => !!name && !name.startsWith('/img/') && !images.has(name.toLowerCase()));
      if (missing.length) throw new Error(`Не выбраны картинки: ${missing.join(', ')}`);
      if (list.length && !window.confirm(`Заменить ${list.length} вопрос(ов) игры ${game} на ${parsed.length} из файла?`)) return;
      const uploaded = new Map<string, string>();
      for (const q of parsed) {
        if (q.image && !q.image.startsWith('/img/') && !uploaded.has(q.image.toLowerCase())) {
          uploaded.set(q.image.toLowerCase(), await uploadImage(images.get(q.image.toLowerCase())!));
        }
      }
      const questions = parsed.map((q) => ({
        ...q,
        image: q.image ? (q.image.startsWith('/img/') ? q.image : uploaded.get(q.image.toLowerCase())!) : null,
      }));
      await api.post('/questions/import', { game, questions });
    }, 'Вопросы загружены');
  };

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([questionsToJson(list)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: `questions-game${game}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const save = async () => {
    if (!draft) return;
    const options = draft.options.map((o) => o.trim());
    if (!options[draft.correct]) return setError('Правильный вариант не может быть пустым');
    // Пустые варианты выкидываем, номер правильного сдвигается на число пустых перед ним.
    const correct = options.slice(0, draft.correct).filter(Boolean).length;
    const ok = await act(() =>
      api.post('/questions/save', {
        id: draft.id,
        game,
        question: { ...draft, options: options.filter(Boolean), correct },
      }),
    'Вопрос сохранён');
    if (ok) setDraft(null);
  };

  const pickImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !draft) return;
    setBusy(true);
    try {
      const path = await uploadImage(file);
      setDraft((d) => d && { ...d, image: path });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="adm-card">
        <div className="adm-split">
          <div className="adm-row">
            <span className="adm-h">Вопросы</span>
            <span className="adm-seg" role="group" aria-label="Вопросы какой игры">
              {[1, 2].map((g) => (
                <button key={g} type="button" className={game === g ? 'is-on' : ''} onClick={() => setGame(g)}>
                  Игра {g}
                </button>
              ))}
            </span>
          </div>
          <div className="adm-row">
            <button className="adm-btn adm-btn--sm" type="button" disabled={busy}
              onClick={() => setDraft({ ...EMPTY, options: [...EMPTY.options] })}>
              Добавить вопрос
            </button>
            <label className="adm-btn adm-btn--ghost adm-btn--sm adm-btn--file">
              Загрузить файл
              <input type="file" hidden multiple accept=".json,.csv,image/*" onChange={importFiles} disabled={busy} />
            </label>
            <button className="adm-btn adm-btn--ghost adm-btn--sm" type="button" onClick={exportJson} disabled={!list.length}>
              Скачать JSON
            </button>
          </div>
        </div>
        <p className="q-s">
          Файл — JSON или CSV, вместе с ним можно выбрать картинки, на которые он ссылается по имени. Примеры — в папке
          questions репозитория. Загрузка заменяет все вопросы выбранной игры
        </p>
        {busy && <p className="q-s">Секунду…</p>}
        {error && <p className="q-err">{error}</p>}
        {info && <span className="q-tag q-tag--lime">{info}</span>}
      </section>

      {draft && (
        <section className="adm-card">
          <span className="adm-h">{draft.id ? 'Изменить вопрос' : 'Новый вопрос'}</span>
          <textarea className="q-input adm-textarea" value={draft.text} maxLength={300} placeholder="Текст вопроса"
            aria-label="Текст вопроса" onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
          <div className="adm-row">
            {draft.image && <img className="adm-thumb" src={draft.image} alt="" />}
            <label className="adm-btn adm-btn--ghost adm-btn--sm adm-btn--file">
              {draft.image ? 'Другая картинка' : 'Добавить картинку 16 : 9'}
              <input type="file" hidden accept="image/*" onChange={pickImage} />
            </label>
            {draft.image && (
              <button className="adm-link" type="button" onClick={() => setDraft({ ...draft, image: null })}>
                убрать картинку
              </button>
            )}
          </div>
          <p className="q-s">Варианты — отметьте правильный. Пустые не попадут в игру</p>
          {draft.options.map((o, i) => (
            <div key={i} className="adm-opt-edit">
              <input type="radio" name="correct" checked={draft.correct === i} aria-label={`Правильный — ${LETTERS[i]}`}
                onChange={() => setDraft({ ...draft, correct: i })} />
              <span className="adm-opt__k">{LETTERS[i]}</span>
              <input className="q-input adm-input" value={o} maxLength={120} aria-label={`Вариант ${LETTERS[i]}`}
                onChange={(e) => setDraft({ ...draft, options: draft.options.map((x, k) => (k === i ? e.target.value : x)) })} />
            </div>
          ))}
          <div className="adm-row">
            <label className="adm-check">
              Секунд на ответ
              <input className="q-input adm-input adm-input--sm" type="number" min={5} max={300} value={draft.seconds}
                onChange={(e) => setDraft({ ...draft, seconds: Number(e.target.value) })} />
            </label>
            <label className="adm-check">
              <input type="checkbox" checked={draft.double} onChange={(e) => setDraft({ ...draft, double: e.target.checked })} />
              Двойные баллы
            </label>
          </div>
          <div className="adm-row">
            <button className="adm-btn" type="button" onClick={save} disabled={busy}>Сохранить</button>
            <button className="adm-btn adm-btn--ghost" type="button" onClick={() => setDraft(null)}>Отмена</button>
          </div>
        </section>
      )}

      {list.length === 0 && <p className="adm-qtext">В игре {game} пока нет вопросов</p>}
      <ol className="adm-qlist">
        {list.map((q, i) => (
          <li key={q.id} className="adm-card adm-q">
            <span className="adm-q__no">{i + 1}</span>
            <div className="adm-q__body">
              <div className="adm-row">
                <span className="q-tag">{q.seconds} с</span>
                {q.double && <span className="q-tag q-tag--lime">Двойные баллы</span>}
                {q.opened && <span className="q-tag q-tag--line">Уже запускали</span>}
              </div>
              <p className="adm-qtext">{q.text}</p>
              {q.image && <img className="adm-thumb" src={q.image} alt="" />}
              <ul className="adm-opts">
                {q.options.map((o, k) => (
                  <li key={k} className={`adm-opt${k === q.correct ? ' is-correct' : ''}`}>
                    <span className="adm-opt__k">{LETTERS[k]}</span>
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="adm-q__actions">
              <button className="adm-btn adm-btn--ghost adm-btn--sm" type="button" disabled={busy || i === 0}
                onClick={() => act(() => api.post('/questions/move', { id: q.id, dir: -1 }))} aria-label="Выше">↑</button>
              <button className="adm-btn adm-btn--ghost adm-btn--sm" type="button" disabled={busy || i === list.length - 1}
                onClick={() => act(() => api.post('/questions/move', { id: q.id, dir: 1 }))} aria-label="Ниже">↓</button>
              <button className="adm-btn adm-btn--ghost adm-btn--sm" type="button" disabled={busy || q.opened}
                onClick={() => setDraft({
                  id: q.id, text: q.text, image: q.image, correct: q.correct, seconds: q.seconds, double: q.double,
                  options: [...q.options, '', '', '', ''].slice(0, 5),
                })}>
                Изменить
              </button>
              <button className="adm-btn adm-btn--ghost adm-btn--sm" type="button" disabled={busy || q.opened}
                onClick={() => window.confirm('Удалить вопрос?') && act(() => api.post('/questions/delete', { id: q.id }))}>
                Удалить
              </button>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
