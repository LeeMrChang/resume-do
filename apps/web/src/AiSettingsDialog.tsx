import { useState } from 'react';
import { Modal } from './Dialogs';
import { DeepSeekError, testDeepSeekKey } from './deepseek';
import {
  AI_MODELS,
  DEEPSEEK_KEY_URL,
  apiKeyLooksValid,
  saveAiSettings,
  type AiModel,
  type AiSettings,
} from './aiSettings';

interface AiSettingsDialogProps {
  settings: AiSettings;
  reason?: string;
  onClose: () => void;
  onSaved: (settings: AiSettings) => void;
}

export default function AiSettingsDialog({ settings, reason, onClose, onSaved }: AiSettingsDialogProps) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState<AiModel>(settings.model);
  const [sessionOnly, setSessionOnly] = useState(settings.sessionOnly);
  const [reveal, setReveal] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState('');
  const [storageNote, setStorageNote] = useState('');

  const keyValid = apiKeyLooksValid(apiKey);

  async function test() {
    if (!keyValid) {
      setError('请先填写格式正确的 DeepSeek API Key');
      return;
    }
    setTesting(true);
    setTestResult(null);
    setError('');
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15_000);
    try {
      await testDeepSeekKey(apiKey, controller.signal);
      setTestResult({ ok: true, message: 'Key 可用，可以保存' });
    } catch (failure) {
      const message = failure instanceof DeepSeekError ? failure.message : '测试失败，请稍后重试';
      setTestResult({ ok: false, message });
    } finally {
      window.clearTimeout(timer);
      setTesting(false);
    }
  }

  function save() {
    if (enabled && !keyValid) {
      setError('启用 AI 改写前请先填写有效的 API Key');
      return;
    }
    const next: AiSettings = { enabled, apiKey: apiKey.trim(), model, sessionOnly };
    const stored = saveAiSettings(next);
    onSaved(next);
    if (!stored) {
      setStorageNote('浏览器禁止本地存储，设置只在本次打开页面期间有效。');
      return;
    }
    onClose();
  }

  return (
    <Modal
      title="AI 设置"
      subtitle="AI 润色与精炼使用你自己的 DeepSeek API Key，费用计入你的 DeepSeek 账户。"
      onClose={onClose}
    >
      <div className="ai-settings">
        <p className="note">
          Key 只保存在本机浏览器，调用由浏览器直接发往 DeepSeek，不经过 Resume Do 服务器。
        </p>
        {reason && <p className="ai-settings-reason" role="status">{reason}</p>}

        <label className="ai-settings-toggle">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          <span>启用 AI 改写</span>
        </label>

        <div className="ai-settings-field">
          <span>API Key</span>
          <div className="ai-key-row">
            <input
              type={reveal ? 'text' : 'password'}
              value={apiKey}
              aria-label="DeepSeek API Key"
              placeholder="sk-..."
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setApiKey(event.target.value);
                setTestResult(null);
                setError('');
                setStorageNote('');
              }}
            />
            <button type="button" onClick={() => setReveal((value) => !value)}>
              {reveal ? '隐藏' : '显示'}
            </button>
          </div>
          <p className="note">
            在{' '}
            <a href={DEEPSEEK_KEY_URL} target="_blank" rel="noreferrer noopener">DeepSeek 开放平台</a>
            {' '}创建，形如 sk-…；可随时在平台上吊销。
          </p>
        </div>

        <label>
          模型
          <select value={model} onChange={(event) => setModel(event.target.value as AiModel)}>
            {AI_MODELS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        <label className="ai-settings-toggle">
          <input
            type="checkbox"
            checked={sessionOnly}
            onChange={(event) => setSessionOnly(event.target.checked)}
          />
          <span>仅本次会话保存（关闭浏览器后需重新填写）</span>
        </label>

        {testResult && (
          <p className={testResult.ok ? 'ai-settings-test ok' : 'ai-settings-test error'} role="status">
            {testResult.message}
          </p>
        )}
        {error && <p className="ai-settings-test error" role="alert">{error}</p>}
        {storageNote && <p className="ai-settings-test error" role="status">{storageNote}</p>}
      </div>

      <footer>
        <button type="button" onClick={onClose}>取消</button>
        <button type="button" onClick={() => void test()} disabled={!keyValid || testing}>
          {testing ? '测试中…' : '测试连接'}
        </button>
        <button type="button" className="primary" onClick={save} disabled={enabled && !keyValid}>
          {enabled ? '保存并启用' : '保存'}
        </button>
      </footer>
    </Modal>
  );
}
