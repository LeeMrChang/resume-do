import { useEffect, useState } from 'react';
import { api, ApiError, type User } from './api';
import LoginPage from './LoginPage';
import EditorPage from './EditorPage';

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState('');

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

  if (error) {
    return (
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
  }

  if (user === undefined) {
    return <div className="boot">正在加载…</div>;
  }

  if (!user) {
    return <LoginPage onAuthenticated={(next) => setUser(next)} />;
  }

  return <EditorPage user={user} onLogout={() => setUser(null)} />;
}
