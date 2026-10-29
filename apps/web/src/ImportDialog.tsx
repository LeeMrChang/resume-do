import { useEffect, useRef, useState } from 'react';
import { emptyRecordItem, type ResumeRecordItem } from '@resume-do/schema';
import { importApi, type ImportDraft, type ImportJob, type ResumeResponse } from './api';
import { Modal } from './Dialogs';
import RichEditor from './RichEditor';
import { moveImportItem, validateImportDraft } from './importDraft';

export default function ImportDialog({ userId, onClose, onConfirmed }: {
  userId: number; onClose: () => void; onConfirmed: (resume: ResumeResponse) => void;
}) {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [draft, setDraft] = useState<ImportDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('');
  const [change, setChange] = useState(0);
  const activeRef = useRef<ImportJob | null>(null);
  const draftRef = useRef<ImportDraft | null>(null);
  const counter = useRef(0), savedCounter = useRef(0);
  const pending = useRef<Promise<ImportJob | null> | null>(null);
  const mounted = useRef(true);
  const key = `resume-do:import:${userId}`;
  const message = (err: unknown) => err instanceof Error ? err.message : '操作失败，请重试';

  function activate(next: ImportJob) {
    activeRef.current = next; draftRef.current = next.draft ?? null;
    counter.current = 0; savedCounter.current = 0;
    setJob(next); setDraft(next.draft ?? null); setError(''); setSaveState('草稿已保存');
    localStorage.setItem(key, next.id);
  }
  useEffect(() => {
    mounted.current = true;
    void importApi.list().then(list => {
      if (!mounted.current) return;
      setJobs(list);
      const remembered = localStorage.getItem(key);
      const found = list.find(item => item.id === remembered) ?? list[0];
      if (found) activate(found);
    }).catch(err => { if (mounted.current) setError(message(err)); }).finally(() => { if (mounted.current) setLoading(false); });
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (job?.status !== 'processing') return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await importApi.get(job!.id);
        if (!alive) return;
        activate(next);
        if (next.status === 'processing') timer = setTimeout(poll, 1000);
      } catch (err) { if (alive) setError(message(err)); }
    }
    timer = setTimeout(poll, 1000);
    return () => { alive = false; clearTimeout(timer); };
  }, [job?.id, job?.status]);

  function edit(mutator: (next: ImportDraft) => void) {
    if (!draftRef.current || busy) return;
    const next = structuredClone(draftRef.current); mutator(next);
    draftRef.current = next; counter.current++;
    setDraft(next); setChange(counter.current); setSaveState('尚未保存');
  }
  async function persist(): Promise<ImportJob | null> {
    if (pending.current) await pending.current;
    if (counter.current === savedCounter.current) return activeRef.current;
    const current = activeRef.current, snapshot = draftRef.current;
    if (!current || !snapshot) return current;
    const version = counter.current;
    setSaveState('正在保存草稿…');
    const promise = importApi.save(current.id, current.version, snapshot).then(next => {
      activeRef.current = next; savedCounter.current = version;
      if (mounted.current) { setJob(next); setSaveState(counter.current === version ? '草稿已保存' : '尚未保存'); }
      return next;
    }).catch(err => {
      if (mounted.current) { setSaveState('草稿保存失败，请重试'); setError(message(err)); }
      throw err;
    }).finally(() => { pending.current = null; });
    pending.current = promise;
    return promise;
  }
  useEffect(() => {
    if (counter.current === savedCounter.current || job?.status === 'processing') return;
    const timer = setTimeout(() => { void persist().catch(() => {}); }, 700);
    return () => clearTimeout(timer);
  }, [change, job?.version]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!/\.(pdf|docx)$/i.test(file.name)) { setError('仅支持 PDF / DOCX；.doc 请另存为 .docx'); return; }
    if (file.size === 0 || file.size > 20 * 1024 * 1024) { setError('请选择非空且不超过 20MB 的文件'); return; }
    await run(async () => {
      await persist();
      const next = await importApi.upload(file);
      setJobs(list => [next, ...list]); activate(next);
    });
  }
  function itemField(section: number, index: number, field: keyof ResumeRecordItem, value: string | boolean) {
    edit(next => { Object.assign(next.document.sections[section].items[index], { [field]: value }); });
  }
  const readonly = busy || job?.status === 'processing' || job?.status === 'confirmed';
  return <Modal title="导入已有简历" subtitle="PDF / DOCX · 最多 20MB · 本地解析，不调用外部 AI · 需校对确认后新建" wide onClose={() => {
    if (busy) return;
    void run(async () => { await persist(); onClose(); });
  }}>
    <p className="note">仅提取文字，不复刻原版式；扫描 PDF 暂不支持。未确认草稿与临时文件最多保留 24 小时；确认后原件关联到正式简历，删除简历时一并删除；放弃时清理临时原文件。关闭窗口不会创建简历。</p>
    <div className="import-upload" onDragOver={event => event.preventDefault()} onDrop={event => {
      event.preventDefault(); if (!busy && !loading) void upload(event.dataTransfer.files[0]);
    }}>
      <label>点击选择或拖入简历文件<input type="file" accept=".pdf,.docx" disabled={busy || loading} onChange={event => {
        void upload(event.target.files?.[0]); event.target.value = '';
      }} /></label>
      {busy && <p role="status">正在处理，请稍候…</p>}
    </div>
    {jobs.length > 0 && <label>恢复导入草稿<select value={job?.id ?? ''} disabled={busy} onChange={event => {
      const id = event.target.value;
      void run(async () => { await persist(); activate(await importApi.get(id)); });
    }}>{jobs.map(item => <option key={item.id} value={item.id}>{item.filename}</option>)}</select></label>}
    {error && <p className="error" role="alert">{error}</p>}
    {job && <>
      <p role="status">{job.status === 'processing' ? '正在解析文字与章节…' : job.status === 'failed' ? `解析未完成：${job.message ?? '可重试或手动整理'}` : job.message} · {saveState}</p>
      <div className="import-columns">
        <section className="import-source"><h3>原文对照</h3>
          <a href={`/api/imports/${job.id}/file`} download>下载原文件核对</a>
          <pre>{job.sourceText || '尚无可读取原文。可下载原文件核对，在右侧手动填写，或重试解析。'}</pre>
          <button disabled={busy || job.status === 'processing'} onClick={() => void run(async () => {
            await persist(); activate(await importApi.retry(job.id));
          })}>重试解析（保留手动修改）</button>
        </section>
        <section className="import-fields" aria-label="导入校对字段"><h3>校对后创建新简历</h3>
          {draft && <fieldset disabled={readonly} inert={readonly}>
            <label>简历标题<input value={draft.title} maxLength={100} onChange={event => edit(next => { next.title = event.target.value; })} /></label>
            <h4>基本信息</h4><div className="import-grid">
              {([['name', '姓名'], ['gender', '性别'], ['city', '城市'], ['phone', '电话'], ['email', '邮箱'], ['experienceYears', '工作年限']] as const).map(([field, label]) =>
                <label key={field}>{label}<input value={draft.document.basic[field]} onChange={event => edit(next => { next.document.basic[field] = event.target.value; })} /></label>)}
            </div>
            <h4>求职意向</h4><div className="import-grid">
              {([['role', '意向职位'], ['city', '意向城市'], ['salary', '期望薪资'], ['arrival', '到岗时间']] as const).map(([field, label]) =>
                <label key={field}>{label}<input value={draft.document.intent[field]} onChange={event => edit(next => { next.document.intent[field] = event.target.value; })} /></label>)}
            </div>
            {draft.document.sections.map((section, si) => <section className="import-section" key={section.id}>
              <label>模块名称<input value={section.title} maxLength={20} onChange={event => edit(next => { next.document.sections[si].title = event.target.value; })} /></label>
              <label className="import-visible"><input type="checkbox" checked={section.visible} onChange={event => edit(next => { next.document.sections[si].visible = event.target.checked; })} />确认后显示此模块</label>
              {section.items.map((item, ii) => <article className="import-item" key={item.id}>
                <label>模块归属<select value={si} onChange={event => {
                  try { const moved = moveImportItem(draftRef.current!, si, ii, Number(event.target.value)); edit(next => { next.document = moved.document; }); }
                  catch (err) { setError(message(err)); }
                }}>{draft.document.sections.map((target, index) => <option key={target.id} value={index}>{target.title}</option>)}</select></label>
                {section.type === 'records' && <div className="import-grid">
                  <label>单位／学校／项目<input value={item.title} maxLength={100} onChange={event => itemField(si, ii, 'title', event.target.value)} /></label>
                  <label>职位／专业／角色<input value={item.role} maxLength={100} onChange={event => itemField(si, ii, 'role', event.target.value)} /></label>
                  <label>开始年月<input type="month" value={item.startMonth} onChange={event => itemField(si, ii, 'startMonth', event.target.value)} /></label>
                  <label>结束年月<input type="month" disabled={item.ongoing} value={item.endMonth} onChange={event => itemField(si, ii, 'endMonth', event.target.value)} /></label>
                  <label className="import-visible"><input type="checkbox" checked={item.ongoing} onChange={event => itemField(si, ii, 'ongoing', event.target.checked)} />至今</label>
                </div>}
                <RichEditor label={`${section.title}条目${ii + 1}正文`} value={item.body} onChange={value => { if (!readonly) itemField(si, ii, 'body', value); }} />
                {section.type === 'records' && <button onClick={() => edit(next => { next.document.sections[si].items.splice(ii, 1); })}>删除此条目</button>}
              </article>)}
              {section.type === 'records' && <button disabled={section.items.length >= 30} onClick={() => edit(next => { next.document.sections[si].items.push(emptyRecordItem()); })}>新增条目</button>}
            </section>)}
          </fieldset>}
        </section>
      </div>
      <footer>
        <button disabled={busy} onClick={() => void run(async () => { await persist(); onClose(); })}>保存草稿并关闭</button>
        <button disabled={busy} onClick={() => void run(async () => {
          if (pending.current) await pending.current;
          await importApi.cancel(job.id); localStorage.removeItem(key); onClose();
        })}>放弃导入并删除临时文件</button>
        <button className="primary" disabled={readonly || !draft} onClick={() => void run(async () => {
          validateImportDraft(draftRef.current!);
          const latest = await persist();
          if (!latest) return;
          const resume = await importApi.confirm(latest.id, latest.version);
          localStorage.removeItem(key); onConfirmed(resume);
        })}>确认导入为新简历</button>
      </footer>
    </>}
  </Modal>;
}
