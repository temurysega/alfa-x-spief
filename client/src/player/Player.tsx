import { useCallback, useState } from 'react';
import { CodeReveal, Join, Login, NoStorage } from './Entry';
import { Game } from './Game';
import { clearToken, loadToken, storageWorks } from './storage';

type Stage =
  | { kind: 'nostorage' }
  | { kind: 'join'; notice?: string }
  | { kind: 'login' }
  | { kind: 'code'; nick: string; code: string }
  | { kind: 'game' };

export function Player() {
  const [token, setToken] = useState<string | null>(() => loadToken());
  const [stage, setStage] = useState<Stage>(() =>
    token ? { kind: 'game' } : storageWorks() ? { kind: 'join' } : { kind: 'nostorage' },
  );

  const onRemoved = useCallback(() => {
    clearToken();
    setToken(null);
    setStage({ kind: 'join', notice: 'Ведущий сбросил игру или удалил твой ник — войди заново' });
  }, []);

  switch (stage.kind) {
    case 'nostorage':
      return <NoStorage />;
    case 'join':
      return (
        <Join
          notice={stage.notice}
          onLogin={() => setStage({ kind: 'login' })}
          onJoined={(t, nick, code) => {
            setToken(t);
            setStage({ kind: 'code', nick, code });
          }}
        />
      );
    case 'login':
      return (
        <Login
          onBack={() => setStage({ kind: 'join' })}
          onDone={(t) => {
            setToken(t);
            setStage({ kind: 'game' });
          }}
        />
      );
    case 'code':
      return <CodeReveal nick={stage.nick} code={stage.code} onNext={() => setStage({ kind: 'game' })} />;
    case 'game':
      return token ? <Game token={token} onRemoved={onRemoved} /> : null;
  }
}
