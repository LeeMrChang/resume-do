import { useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type User } from './api';
import LoginPage from './LoginPage';
import EditorPage from './EditorPage';
import ResumeListPage from './ResumeListPage';
import { ThemeProvider, useThemePreference } from './ThemeToggle';

type View = { kind: 'list' } | { kind: 'editor'; resumeId: string };

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [error, setError] = useState('');
  const theme = useThemePreference(user);

  useEffect(() => {
    let alive = true;
    api
      .me()
      .then((current) => {
        if (alive) setUser(current);
      })
      .catch((err) => {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 401) {
          setUser(null);
          return;
        }
        setError(err instanceof ApiError ? err.message : '无法连接服务，请确认 API 已启动。');
      });
    return () => {
      alive = false;
    };
  }, []);

  let content: ReactNode;
  if (error) {
    content = (
      <div className="boot">
        <div className="boot-card">
          <h1>无法连接简历服务</h1>
          <div className="error" role="alert">
            {error}
          </div>
          <div className="boot-actions">
            <button type="button" onClick={() => window.location.reload()}>
              重试
            </button>
          </div>
        </div>
      </div>
    );
  } else if (user === undefined) {
    content = <div className="boot">正在加载…</div>;
  } else if (!user) {
    content = <LoginPage onAuthenticated={(next) => { setView({ kind: 'list' }); setUser(next); }} />;
  } else if (view.kind === 'list') {
    content = (
      <ResumeListPage
        user={user}
        onOpen={(resumeId) => setView({ kind: 'editor', resumeId })}
        onLogout={() => { setView({ kind: 'list' }); setUser(null); }}
      />
    );
  } else {
    content = (
      <EditorPage
        key={view.resumeId}
        user={user}
        resumeId={view.resumeId}
        onBack={() => setView({ kind: 'list' })}
        onLogout={() => { setView({ kind: 'list' }); setUser(null); }}
      />
    );
  }

  return <ThemeProvider value={theme}>{content}</ThemeProvider>;
}
