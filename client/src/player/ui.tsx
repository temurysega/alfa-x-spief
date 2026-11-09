import { useEffect, type CSSProperties, type ReactNode } from 'react';
import abInk from '../assets/logos/alfa-budushchee-h.svg';
import abWhite from '../assets/logos/alfa-budushchee-h-white.svg';
import kontentInk from '../assets/logos/fond-kontent-ink.png';
import kontentWhite from '../assets/logos/fond-kontent-white.png';

// Логоблок брендбука: «Альфа-Будущее» + «Альфа Банк» одним файлом и Фонд «Контент» в зоне партнёра.
// На светлом фоне — тёмный вариант, на красном — белый. Не разделять и не перекрашивать.
export function Lockup({ white = false }: { white?: boolean }) {
  return (
    <div className="lockup">
      <img className="lockup__ab" src={white ? abWhite : abInk} alt="Альфа-Будущее и Альфа-Банк" />
      <span className="lockup__box">
        <img src={white ? kontentWhite : kontentInk} alt="Фонд «Контент»" />
      </span>
    </div>
  );
}

// Знак ИИ — пиксельная искра. Один знак на экран.
export function Spark({ size }: { size: number }) {
  return (
    <svg className="spark" style={{ '--s': `${size}px` } as CSSProperties} viewBox="0 0 9 9" aria-hidden="true">
      <path d="M4 0h1v2h1v1h1v1h2v1h-2v1h-1v1h-1v2h-1v-2h-1v-1h-1v-1h-2v-1h2v-1h1v-1h1z" />
    </svg>
  );
}

type Tone = 'paper' | 'red';

// Экран участника. Красный экран красит и фон страницы, и полосу браузера сверху —
// без светлых краёв при прокрутке.
export function Screen({ tone = 'paper', children }: { tone?: Tone; children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.tone = tone;
    const color = getComputedStyle(root).getPropertyValue(tone === 'red' ? '--red' : '--paper').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }, [tone]);
  return <main className={`q-screen${tone === 'red' ? ' on-red' : ''}`}>{children}</main>;
}

// Верх экрана: логоблок и метка справа (ник или номер вопроса).
// На экранах входа логоблок крупнее (entry), на экранах игры — как в макете.
export function Top({ white = false, entry = false, tag, tagClass = '' }: {
  white?: boolean;
  entry?: boolean;
  tag?: string;
  tagClass?: string;
}) {
  return (
    <div className={`q-top${entry ? ' q-top--entry' : ''}`}>
      <Lockup white={white} />
      {tag && <span className={`q-tag ${tagClass}`.trim()}>{tag}</span>}
    </div>
  );
}
