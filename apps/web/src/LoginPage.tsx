import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type User } from './api';
import ThemeToggle from './ThemeToggle';
import CaptchaDialog from './CaptchaDialog';

type Mode = 'login' | 'register';

const EMAIL_PATTERN = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

function emailProblem(raw: string) {
  const value = raw.trim();
  if (!value) {
    return '请输入邮箱地址';
  }
  return EMAIL_PATTERN.test(value) ? '' : '请输入有效的邮箱地址';
}

export default function LoginPage({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [displayName, setDisplayName] = useState('');
  const [target, setTarget] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [captchaOpen, setCaptchaOpen] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (mode === 'register') {
      const problem = emailProblem(target);
      if (problem) {
        setError(problem);
        return;
      }
      if (!/^\d{6}$/.test(code.trim())) {
        setError('请输入 6 位数字验证码');
        return;
      }
      if (password.length < 8) {
        setError('密码至少 8 位');
        return;
      }
      if (!agreed) {
        setError('请先阅读并同意《用户协议》与《隐私政策》');
        return;
      }
    }

    setBusy(true);
    try {
      const user = mode === 'login'
        ? await api.login(target.trim(), password)
        : await api.register({
            channel: 'email',
            target: target.trim(),
            code: code.trim(),
            password,
            displayName,
          });
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
    setNotice('');
  }

  function requestCode() {
    setError('');
    setNotice('');
    const problem = emailProblem(target);
    if (problem) {
      setError(problem);
      return;
    }
    setCaptchaOpen(true);
  }

  async function handleCaptchaSolved(ticket: string) {
    setCaptchaOpen(false);
    setBusy(true);
    setError('');
    try {
      const sent = await api.sendVerificationCode('email', target.trim(), ticket);
      setCooldown(sent.retryAfterSeconds);
      if (sent.devCode) {
        setNotice(`本地开发模式（未真实发信）：验证码 ${sent.devCode}`);
      } else {
        setNotice('验证码已发送，请到邮箱查收（10 分钟内有效）');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '验证码发送失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  }

  const register = mode === 'register';

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
          <h1 className="login-title">{register ? '创建你的账号' : '登录你的账号'}</h1>

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
            {register && (
              <label>
                称呼（选填）
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
              {register ? '邮箱' : '邮箱或手机号'}
              <input
                type={register ? 'email' : 'text'}
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                maxLength={190}
                inputMode={register ? 'email' : undefined}
                autoComplete={register ? 'email' : 'username'}
                placeholder={register ? 'you@example.com' : '邮箱或手机号'}
              />
            </label>

            {register && (
              <label>
                验证码
                <span className="code-row">
                  <input
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="6 位数字验证码"
                  />
                  <button
                    type="button"
                    className="code-button"
                    onClick={requestCode}
                    disabled={busy || cooldown > 0}
                  >
                    {cooldown > 0 ? `${cooldown} 秒后重发` : '获取验证码'}
                  </button>
                </span>
              </label>
            )}

            <label>
              {register ? '设置密码' : '密码'}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                maxLength={72}
                required
                autoComplete={register ? 'new-password' : 'current-password'}
                placeholder={register ? '8–72 位密码' : '输入密码'}
              />
            </label>

            {register && (
              <label className="agreement">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                />
                <span>我已阅读并同意《用户协议》与《隐私政策》</span>
              </label>
            )}

            {error && <div className="error" role="alert">{error}</div>}
            {notice && <div className="notice" role="status">{notice}</div>}

            <button
              type="submit"
              className="primary login-submit"
              disabled={busy || (register && !agreed)}
            >
              {busy ? '请稍候…' : register ? '注册' : '登录'}
            </button>
          </form>
        </div>
      </div>
      <footer className="site-registration">
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">粤ICP备2026169848号-1</a>
      </footer>

      {captchaOpen && (
        <CaptchaDialog
          onCancel={() => setCaptchaOpen(false)}
          onSolved={(ticket) => void handleCaptchaSolved(ticket)}
        />
      )}
    </div>
  );
}
