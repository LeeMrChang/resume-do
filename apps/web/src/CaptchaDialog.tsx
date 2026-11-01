import { useEffect, useState, type MouseEvent } from 'react';
import { api, ApiError, type CaptchaChallenge, type CaptchaPoint } from './api';

type Phase = 'confirm' | 'loading' | 'challenge';

const MIN_SPIN_MS = 700;

function message(error: unknown) {
  return error instanceof ApiError ? error.message : '网络异常，请稍后重试';
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </svg>
  );
}

export default function CaptchaDialog({
  onCancel,
  onSolved,
}: {
  onCancel: () => void;
  onSolved: (ticket: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>('confirm');
  const [confirmed, setConfirmed] = useState(false);
  const [challenge, setChallenge] = useState<CaptchaChallenge | null>(null);
  const [points, setPoints] = useState<CaptchaPoint[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  async function loadChallenge(fromConfirm = false) {
    const started = Date.now();
    setBusy(true);
    setError('');
    setPoints([]);
    try {
      const next = await api.requestCaptcha();
      const wait = MIN_SPIN_MS - (Date.now() - started);
      if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait));
      setChallenge(next);
      setPhase('challenge');
    } catch (err) {
      setError(message(err));
      if (fromConfirm) {
        setConfirmed(false);
        setPhase('confirm');
      }
    } finally {
      setBusy(false);
    }
  }

  function toggleConfirmed(checked: boolean) {
    if (busy) return;
    setConfirmed(checked);
    setError('');
    if (checked) {
      setPhase('loading');
      void loadChallenge(true);
    }
  }

  function addPoint(event: MouseEvent<HTMLDivElement>) {
    if (!challenge || busy || points.length >= 8) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    setPoints((previous) => [...previous, { x, y }]);
    setError('');
  }

  async function verify() {
    if (!challenge) return;
    if (points.length === 0) {
      setError('请点击图片中的闭合环形');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api.verifyCaptcha(challenge.captchaId, points);
      onSolved(result.ticket);
    } catch (err) {
      setError(message(err));
      if (err instanceof ApiError && /过期|未通过|次数过多/.test(err.message)) {
        void loadChallenge();
      }
    } finally {
      setBusy(false);
    }
  }

  const challengePhase = phase === 'challenge';

  return (
    <div
      className="modal show"
      role="dialog"
      aria-modal="true"
      aria-labelledby="captcha-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className={`dialog captcha-dialog${challengePhase ? ' is-challenge' : ''}`}>
        {!challengePhase && (
          <button type="button" className="close" onClick={onCancel} aria-label="关闭">
            ×
          </button>
        )}

        {challengePhase ? (
          <>
            <div className="captcha-challenge">
              <div className="captcha-challenge-head">
                <span id="captcha-title">{challenge?.question ?? '点击所有闭合环形'}</span>
                <button
                  type="button"
                  className="captcha-refresh"
                  onClick={() => void loadChallenge()}
                  disabled={busy}
                  aria-label="换一题"
                  title="换一题"
                >
                  <RefreshIcon />
                </button>
              </div>
              <div
                className="captcha-canvas"
                role="img"
                aria-label={challenge?.question ?? '点击所有闭合环形'}
                onClick={addPoint}
              >
                {challenge && <img src={challenge.image} alt="" draggable={false} />}
                {points.map((point, index) => (
                  <i
                    key={index}
                    className="captcha-dot"
                    style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                  />
                ))}
              </div>
              <div className="captcha-challenge-foot">
                <span className="captcha-hint">点选图中所有闭合环形，再点「验证」</span>
                <span className="captcha-logo">
                  <span aria-hidden="true">简</span>
                  Resume Do
                </span>
              </div>
            </div>
            {error && <div className="error" role="alert">{error}</div>}
            <footer>
              <button type="button" onClick={onCancel}>取消</button>
              <button type="button" className="primary" onClick={() => void verify()} disabled={busy}>
                {busy ? '校验中…' : '验证'}
              </button>
            </footer>
          </>
        ) : (
          <>
            <h2 id="captcha-title">人机验证</h2>
            <p className="sub">勾选后完成图形验证，即可获取验证码。</p>
            <label className="captcha-widget">
              <input
                type="checkbox"
                className="captcha-native"
                checked={confirmed}
                disabled={busy}
                onChange={(event) => toggleConfirmed(event.target.checked)}
              />
              <span className={`captcha-box${phase === 'loading' ? ' loading' : ''}`} aria-hidden="true">
                {phase === 'loading' && <span className="captcha-spinner" />}
              </span>
              <span className="captcha-widget-text">
                <b>我是真实访客</b>
                <small>{phase === 'loading' ? '正在加载验证…' : '点击勾选开始验证'}</small>
              </span>
              <span className="captcha-widget-brand" aria-hidden="true">
                <span className="captcha-widget-mark">简</span>
                <small>Resume Do<br />安全验证</small>
              </span>
            </label>
            {error && <div className="error" role="alert">{error}</div>}
            <footer>
              <button type="button" onClick={onCancel}>取消</button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
