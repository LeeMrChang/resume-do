import { useEffect, useState, type MouseEvent } from 'react';
import { api, ApiError, type CaptchaChallenge, type CaptchaPoint } from './api';

type Phase = 'confirm' | 'challenge';

function message(error: unknown) {
  return error instanceof ApiError ? error.message : '网络异常，请稍后重试';
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
    setBusy(true);
    setError('');
    setPoints([]);
    try {
      setChallenge(await api.requestCaptcha());
      setPhase('challenge');
    } catch (err) {
      setError(message(err));
      if (fromConfirm) setConfirmed(false);
    } finally {
      setBusy(false);
    }
  }

  function toggleConfirmed(checked: boolean) {
    setConfirmed(checked);
    setError('');
    if (checked) {
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
      <div className="dialog captcha-dialog">
        <button type="button" className="close" onClick={onCancel} aria-label="关闭">
          ×
        </button>
        <h2 id="captcha-title">人机验证</h2>

        {phase === 'confirm' ? (
          <>
            <p className="sub">勾选后会显示图形验证，请点击图中所有闭合环形。</p>
            <label className="captcha-card">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy}
                onChange={(event) => toggleConfirmed(event.target.checked)}
              />
              <span className="captcha-card-text">
                <b>我是真实访客</b>
                <small>Resume Do 安全验证</small>
              </span>
            </label>
            {error && <div className="error" role="alert">{error}</div>}
            <footer>
              <button type="button" onClick={onCancel}>取消</button>
            </footer>
          </>
        ) : (
          <>
            <p className="sub">{challenge?.question ?? '点击所有闭合环形'}</p>
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
            {error && <div className="error" role="alert">{error}</div>}
            <footer>
              <button type="button" onClick={() => void loadChallenge()} disabled={busy}>换一题</button>
              <button type="button" className="primary" onClick={() => void verify()} disabled={busy}>
                {busy ? '校验中…' : '验证'}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
