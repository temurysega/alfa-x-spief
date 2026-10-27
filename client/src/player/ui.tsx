import type { CSSProperties, ReactNode } from 'react';

export function Wordmark({ size = 15 }: { size?: number }) {
  return (
    <span className="ai-wordmark" style={{ fontSize: size }}>
      ALFA INSIDE{' '}
      <span className="ai-wordmark__track">
        <span className="ai-spark" />
        ИИ
      </span>
    </span>
  );
}

export function Nick({ nick }: { nick: string }) {
  return (
    <span className="nick">
      <span className="ai-spark" style={{ '--s': '14px' } as CSSProperties} />
      {nick}
    </span>
  );
}

type Shape = 'spark' | 'star' | 'sphere';
type Color = 'red' | 'pink' | 'ink';

function objClass(shape: Shape, color: Color) {
  return `ai-obj ai-obj--${shape}${color === 'red' ? '' : ` ai-obj--${color}`} ai-float`;
}

// Пара 3D-объектов: большой и маленький, разных форм и цветов (правило дизайн-системы).
// Размер пары задаёт CSS (.hero .ai-pair), чтобы на низких экранах она уменьшалась.
export function Pair({ big, small }: { big: [Shape, Color]; small: [Shape, Color] }) {
  return (
    <div className="ai-pair ai-play">
      <div className={objClass(...big)} />
      <div className={objClass(...small)} style={{ '--fd': '-3.5s' } as CSSProperties} />
    </div>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return <main className="screen">{children}</main>;
}
