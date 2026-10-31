import { useState, type FormEvent } from 'react';
import { api, ApiError, type User } from './api';
import ThemeToggle from './ThemeToggle';

type Mode = 'login' | 'register';

export default function LoginPage({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register(email, password, displayName);
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '网络异常，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError('');
  }

  return (
    <div className="login-shell">
      <div className="login-bar">
        <div className="login-brand">
          <span className="brand-mark" aria-hidden="true">简</span>
          Resume Do
        </div>
        <ThemeToggle />
      </div>
      <div className="login-main">
        <div className="login-card">
          <div className="logo login-logo">
            <span aria-hidden="true">简</span>Resume Do · 简历工作台
          </div>
          <p className="login-pill">
            <span>本地优先 · 简历数据不出你的设备</span>
          </p>

          <div className="segmented" role="tablist" aria-label="登录或注册">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'active' : ''}
              onClick={() => switchMode('login')}
            >
              登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={mode === 'register' ? 'active' : ''}
              onClick={() => switchMode('register')}
            >
              注册
            </button>
          </div>

          <form onSubmit={submit}>
            {mode === 'register' && (
              <label>
                称呼
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={100}
                  autoComplete="nickname"
                  placeholder="用于界面上称呼你"
                />
              </label>
            )}
            <label>
              邮箱
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={190}
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
            <label>
              密码
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={mode === 'register' ? 8 : undefined}
                maxLength={72}
                required
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                placeholder={mode === 'register' ? '至少 8 位' : '输入密码'}
              />
            </label>

            {error && <div className="error" role="alert">{error}</div>}

            <button type="submit" className="primary login-submit" disabled={busy}>
              {busy ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录'}
            </button>
          </form>

          <p className="login-note">
            简历只保存在你部署的数据库中，不会发送到第三方服务。
            <br />
            本地开发环境首次使用请先注册。
          </p>
        </div>
      </div>
      <footer className="site-registration">
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">粤ICP备2026169848号-1</a>
      </footer>
    </div>
  );
}
