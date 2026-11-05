import { useEffect, useRef, useState } from 'react';
import { Modal } from './Dialogs';
import AiSettingsDialog from './AiSettingsDialog';
import {
  apiKeyLooksValid,
  maskApiKey,
  readAiSettings,
  type AiSettings,
} from './aiSettings';
import { DeepSeekError, rewriteWithDeepSeek, type AiAction } from './deepseek';
import { AI_REWRITE_MAX_TEXT } from './aiRewrite';

const ACTIONS: { action: AiAction; label: string; busy: string }[] = [
  { action: 'polish', label: 'AI 润色', busy: '正在润色正文…' },
  { action: 'condense', label: '精炼内容', busy: '正在精炼正文…' },
];

type Phase = 'idle' | 'consent' | 'loading' | 'result' | 'error';

interface AiResult {
  action: AiAction;
  originalText: string;
  rewrittenText: string;
  warnings: string[];
}

interface AiRewritePanelProps {
  section: string;
  targetRole: string;
  currentText: () => string;
  onApply: (text: string) => void;
}

export default function AiRewritePanel({ section, targetRole, currentText, onApply }: AiRewritePanelProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [action, setAction] = useState<AiAction>('polish');
  const [text, setText] = useState('');
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<AiResult | null>(null);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [settings, setSettings] = useState<AiSettings>(() => readAiSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsReason, setSettingsReason] = useState('');
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pendingAction = useRef<AiAction | null>(null);

  const selected = ACTIONS.find((item) => item.action === action) ?? ACTIONS[0];
  const role = targetRole.trim();
  const blocked = errorCode === 'EMPTY_TEXT' || errorCode === 'TOO_LONG';

  useEffect(() => () => {
    sequence.current += 1;
    controller.current?.abort();
  }, []);

  useEffect(() => {
    if (phase === 'loading' || phase === 'result' || phase === 'error') {
      panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [phase]);

  function openSettings(reason: string, next: AiAction | null = null) {
    setSettingsReason(reason);
    pendingAction.current = next;
    setSettingsOpen(true);
  }

  function closeSettings() {
    pendingAction.current = null;
    setSettingsOpen(false);
    setSettingsReason('');
  }

  function settingsSaved(next: AiSettings) {
    setSettings(next);
    const queued = pendingAction.current;
    pendingAction.current = null;
    setSettingsReason('');
    if (queued) start(queued, next);
  }

  function start(nextAction: AiAction, current: AiSettings = settings) {
    const snapshot = currentText().trim();
    setAction(nextAction);
    setText(snapshot);
    setConsent(false);
    setResult(null);
    setError('');
    setErrorCode('');
    setConfirmOverwrite(false);
    if (!snapshot) {
      setErrorCode('EMPTY_TEXT');
      setError('请先填写正文，再使用 AI。');
      setPhase('error');
      return;
    }
    if (snapshot.length > AI_REWRITE_MAX_TEXT) {
      setErrorCode('TOO_LONG');
      setError(`正文共 ${snapshot.length} 字，超过 ${AI_REWRITE_MAX_TEXT} 字上限，请先精简后再使用。`);
      setPhase('error');
      return;
    }
    if (!current.enabled) {
      openSettings('启用 AI 改写需要使用你自己的 DeepSeek API Key，费用计入你的账户。', nextAction);
      return;
    }
    if (!apiKeyLooksValid(current.apiKey)) {
      openSettings('请先填写有效的 DeepSeek API Key。', nextAction);
      return;
    }
    setPhase('consent');
  }

  async function send() {
    const current = ++sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    setPhase('loading');
    setConsent(false);
    setConfirmOverwrite(false);
    setError('');
    setErrorCode('');
    const timer = window.setTimeout(() => abort.abort(), 40_000);
    try {
      const output = await rewriteWithDeepSeek({
        apiKey: settings.apiKey,
        model: settings.model,
        action,
        text,
        section,
        ...(role ? { targetRole: role } : {}),
        signal: abort.signal,
      });
      if (current !== sequence.current) return;
      setResult({ action, originalText: text, rewrittenText: output.rewrittenText, warnings: output.warnings });
      setPhase('result');
    } catch (failure) {
      if (current !== sequence.current) return;
      const code = failure instanceof DeepSeekError
        ? failure.code
        : failure instanceof DOMException && failure.name === 'AbortError'
          ? 'AI_TIMEOUT'
          : 'AI_NETWORK';
      const message = failure instanceof DeepSeekError
        ? failure.message
        : code === 'AI_TIMEOUT'
          ? '请求超时。DeepSeek 可能仍在生成并计费，请勿连续重试。'
          : '网络异常，请稍后重试。';
      setErrorCode(code);
      setError(message);
      setPhase('error');
    } finally {
      window.clearTimeout(timer);
      if (controller.current === abort) controller.current = null;
    }
  }

  function close() {
    sequence.current += 1;
    controller.current?.abort();
    controller.current = null;
    setPhase('idle');
    setResult(null);
    setConfirmOverwrite(false);
    setError('');
    setErrorCode('');
  }

  function retry() {
    void send();
  }

  function adopt() {
    if (!result) return;
    if (currentText().trim() !== text.trim()) {
      setConfirmOverwrite(true);
      return;
    }
    apply();
  }

  function apply() {
    if (!result) return;
    onApply(result.rewrittenText);
    close();
  }

  return (
    <div className="rich-ai" ref={panelRef}>
      {settings.enabled ? (
        <div className="rich-ai-actions" role="group" aria-label="AI 改写">
          {ACTIONS.map((item) => (
            <button
              key={item.action}
              type="button"
              disabled={phase === 'loading'}
              title={`${item.label}：${item.action === 'polish' ? '改写表达，保留事实' : '压缩表达，保留要点'}`}
              onClick={() => start(item.action)}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            className="ai-settings-link"
            title={`AI 设置（已配置 ${maskApiKey(settings.apiKey)}）`}
            onClick={() => openSettings('')}
          >
            AI 设置
          </button>
        </div>
      ) : (
        <div className="rich-ai-actions" role="group" aria-label="AI 改写">
          <button
            type="button"
            title="使用你自己的 DeepSeek API Key 开启 AI 改写"
            onClick={() => openSettings('')}
          >
            开启 AI 改写
          </button>
        </div>
      )}

      {phase === 'loading' && (
        <div className="ai-panel ai-loading" role="status">
          <span className="ai-spinner" aria-hidden="true" />
          <span>{selected.busy} 可继续编辑正文，完成后在这里查看建议。</span>
          <button type="button" onClick={close}>取消</button>
        </div>
      )}

      {phase === 'error' && (
        <div className="ai-panel ai-error" role="alert">
          <p>{error}</p>
          <footer>
            <button type="button" onClick={close}>关闭</button>
            {errorCode === 'AI_KEY_INVALID' && (
              <button type="button" onClick={() => openSettings('API Key 无效或已失效，请重新填写。')}>
                重新填写 Key
              </button>
            )}
            {!blocked && (
              <button type="button" className="primary" onClick={retry}>重试</button>
            )}
          </footer>
        </div>
      )}

      {phase === 'result' && result && (
        <section className="ai-panel ai-result" aria-label={`${selected.label}建议`}>
          <header>
            <strong>{selected.label}建议</strong>
            <span>{result.originalText.length} 字 → {result.rewrittenText.length} 字</span>
          </header>
          {result.warnings.length > 0 && (
            <ul className="ai-warnings">
              {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}
          <div className="ai-compare">
            <div>
              <h4>原文</h4>
              <pre>{result.originalText}</pre>
            </div>
            <div>
              <h4>建议</h4>
              <pre>{result.rewrittenText}</pre>
            </div>
          </div>
          {confirmOverwrite ? (
            <div className="ai-overwrite" role="alert">
              <p>正文在生成期间已修改。采用建议会覆盖当前正文，是否继续？</p>
              <footer>
                <button type="button" onClick={() => setConfirmOverwrite(false)}>取消覆盖</button>
                <button type="button" className="primary" onClick={apply}>确认覆盖</button>
              </footer>
            </div>
          ) : (
            <footer>
              <button type="button" onClick={close}>取消</button>
              <button type="button" onClick={() => void send()}>重新生成</button>
              <button type="button" className="primary" onClick={adopt}>采用建议</button>
            </footer>
          )}
        </section>
      )}

      {phase === 'consent' && (
        <Modal
          title={selected.label}
          subtitle="AI 建议可能存在事实偏差，采用前请核对公司、时间、技术名称和成果。"
          onClose={close}
        >
          <div className="ai-consent">
            <p>将把当前模块正文{role ? `和意向职位“${role}”` : ''}发送给 DeepSeek 处理。</p>
            <p className="note">
              本次使用你配置的 API Key（{maskApiKey(settings.apiKey)}），由浏览器直接发往 DeepSeek，
              不经过 Resume Do 服务器；费用计入你的 DeepSeek 账户。
            </p>
            <p className="note">不会发送姓名、电话、邮箱、照片、完整简历或 PDF；如正文中包含敏感信息，请先删除。</p>
            <pre className="ai-preview" aria-label="待发送正文">{text}</pre>
            <p className="note">共 {text.length} 字（上限 {AI_REWRITE_MAX_TEXT} 字）。</p>
            <label className="ai-consent-check">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>我同意将以上内容发送给 DeepSeek（使用我的 API Key）</span>
            </label>
          </div>
          <footer>
            <button type="button" onClick={close}>取消</button>
            <button type="button" className="primary" disabled={!consent} onClick={() => void send()}>
              {selected.label}
            </button>
          </footer>
        </Modal>
      )}

      {settingsOpen && (
        <AiSettingsDialog
          settings={settings}
          reason={settingsReason}
          onClose={closeSettings}
          onSaved={settingsSaved}
        />
      )}
    </div>
  );
}
