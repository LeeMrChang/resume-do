import { useRef, useState } from 'react';
import { api, type ResumeResponse } from './api';
import { validateEditableUpload } from './originalResume';

export default function OriginalImportButton({ beforeUpload, onCreated }: {
  beforeUpload: () => Promise<boolean>; onCreated: (resume: ResumeResponse) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="original-import">
    <button type="button" disabled={busy} onClick={() => { setError(''); input.current?.click(); }}>{busy ? '正在本地解析并导入…' : '导入简历'}</button>
    <input ref={input} type="file" accept=".pdf,application/pdf,.docx" hidden aria-label="选择 PDF 或 DOCX 简历" onChange={event => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file) return;
      const problem = validateEditableUpload(file);
      if (problem) { setError(problem); return; }
      setBusy(true); setError('');
      void (async () => {
        if (!await beforeUpload()) throw new Error('当前简历尚未保存，请先处理保存问题');
        const created = await api.importEditable(file);
        await onCreated(created);
      })().catch(e => setError(e instanceof Error ? e.message : '上传失败，请重试')).finally(() => setBusy(false));
    }} />
    <small className="note">本地解析 PDF / DOCX，直接进入编辑器；保留原件，不发送第三方。</small>
    {error && <span className="original-action-error" role="alert">{error}</span>}
  </div>;
}
