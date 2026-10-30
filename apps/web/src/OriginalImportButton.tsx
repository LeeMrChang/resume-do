import { useRef, useState } from 'react';
import { api, type ResumeResponse } from './api';
import { validateEditableUpload } from './originalResume';
import { Modal } from './Dialogs';

export default function OriginalImportButton({ beforeUpload, onCreated, targetId }: {
  beforeUpload: () => Promise<boolean>;
  onCreated: (resume: ResumeResponse) => Promise<void>;
  targetId?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  function pick() {
    setError('');
    input.current?.click();
  }

  async function upload(file: File) {
    const problem = validateEditableUpload(file);
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try {
      if (!await beforeUpload()) throw new Error('当前简历尚未保存，请先处理保存问题');
      const resume = targetId ? await api.importEditableInto(targetId, file) : await api.importEditable(file);
      await onCreated(resume);
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败，请重试');
    } finally {
      setBusy(false);
    }
  }

  return <div className="original-import">
    <button type="button" disabled={busy} onClick={() => {
      if (targetId) { setError(''); setConfirming(true); } else pick();
    }}>{busy ? '正在本地解析并导入…' : '导入简历'}</button>
    <input ref={input} type="file" accept=".pdf,application/pdf,.docx" hidden aria-label="选择 PDF 或 DOCX 简历" onChange={event => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (file) void upload(file);
    }} />
    {error && <span className="original-action-error" role="alert">{error}</span>}
    {confirming && <Modal title="简历覆盖提示" onClose={() => setConfirming(false)}>
      <div className="import-warning">
        <p className="import-warning-title">导入简历后，当前简历内容将被覆盖！</p>
        <p className="note">建议先确认当前简历内容已备份，再继续操作。</p>
      </div>
      <footer>
        <button type="button" onClick={() => setConfirming(false)}>取消</button>
        <button type="button" className="primary" onClick={() => { setConfirming(false); pick(); }}>确认覆盖并导入</button>
      </footer>
    </Modal>}
  </div>;
}
