import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createDefaultAppearance, type ResumeAppearance } from '@resume-do/schema';
import { TEMPLATE_CATALOG, TEMPLATE_GROUPS, normalizeTemplateId, renderThumbnailFragment } from '@resume-do/templates';
import { api, ApiError, type ExportJob, type OriginalSource } from './api';
import { waitForExport } from './exportPolling';

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="modal show"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={wide ? "dialog dialog-wide" : "dialog"} style={wide ? { width: 1040 } : undefined}>
        <button type="button" className="close" onClick={onClose} aria-label="关闭">
          ×
        </button>
        <h2 id="dialog-title">{title}</h2>
        {subtitle && <p className="sub">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-field">
      <span>
        {label}
        <b>
          {value}
          {suffix}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export type AppearanceDialogKind = 'spacing' | 'font' | 'color' | 'template';

const DIALOG_TEXT: Record<AppearanceDialogKind, { title: string; subtitle: string }> = {
  spacing: { title: '间距设置', subtitle: '修改会即时反映在预览中，点击“应用”后保存。' },
  font: { title: '字体 / 语言', subtitle: '字号为正文尺寸，按 A4 实际尺寸渲染，不受预览缩放影响。' },
  color: { title: '皮肤设置', subtitle: '主题色用于标题与分隔线，不改动正文中的显式加粗等格式。' },
  template: { title: '更换模板', subtitle: '切换模板不会改变已有内容；空白简历会填入示例内容，方便直接修改。' },
};

const SWATCHES = ['#238b72', '#263f58', '#9a5b3f', '#5d5a8f', '#b03c4e', '#2f6f9f', '#44514a'];

export function AppearanceDialog({
  kind,
  appearance,
  onChange,
  onApply,
  onCancel,
}: {
  kind: AppearanceDialogKind;
  appearance: ResumeAppearance;
  onChange: (appearance: ResumeAppearance) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const text = DIALOG_TEXT[kind];
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('全部');
  const thumbnails = useMemo(() => kind === 'template'
    ? new Map(TEMPLATE_CATALOG.map(spec => [spec.id, renderThumbnailFragment(createDefaultAppearance(), spec.id)]))
    : new Map<string, string>(), [kind]);
  const filtered = TEMPLATE_CATALOG.filter(spec =>
    (group === '全部' || spec.group === group) &&
    `${spec.id} ${spec.name} ${spec.group}`.includes(query.trim()),
  );

  return (
    <Modal title={text.title} subtitle={text.subtitle} onClose={onCancel} wide={kind === 'template'}>
      {kind === 'spacing' && (
        <div className="range-list">
          <RangeField
            label="模块上下间距"
            value={appearance.sectionGap}
            min={5}
            max={50}
            step={1}
            suffix="px"
            onChange={(value) => onChange({ ...appearance, sectionGap: value })}
          />
          <RangeField
            label="行间距"
            value={appearance.lineHeight}
            min={1.2}
            max={2.2}
            step={0.05}
            onChange={(value) => onChange({ ...appearance, lineHeight: Number(value.toFixed(2)) })}
          />
          <RangeField
            label="页面边距"
            value={appearance.pageMargin}
            min={24}
            max={60}
            step={1}
            suffix="px"
            onChange={(value) => onChange({ ...appearance, pageMargin: value })}
          />
        </div>
      )}

      {kind === 'font' && (
        <>
          <label>
            字体
            <select
              value={appearance.fontId}
              onChange={(event) =>
                onChange({ ...appearance, fontId: event.target.value as ResumeAppearance['fontId'] })
              }
            >
              <option value="sans">系统黑体（PingFang / 微软雅黑）</option>
              <option value="serif">宋体</option>
              <option value="arial">Arial</option>
            </select>
          </label>
          <div className="range-list">
            <RangeField
              label="正文字号"
              value={appearance.fontSize}
              min={12}
              max={16}
              step={1}
              suffix="px"
              onChange={(value) => onChange({ ...appearance, fontSize: value })}
            />
          </div>
          <p className="note">P0 仅提供中文标签；简繁、英日等语言切换在 P1 规划中。</p>
        </>
      )}

      {kind === 'color' && (
        <>
          <div className="swatches">
            {SWATCHES.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`主题色 ${color}`}
                aria-pressed={appearance.themeColor.toLowerCase() === color}
                className={appearance.themeColor.toLowerCase() === color ? 'selected' : ''}
                style={{ background: color }}
                onClick={() => onChange({ ...appearance, themeColor: color })}
              />
            ))}
          </div>
          <label className="inline-color">
            自定义颜色
            <input
              type="color"
              value={appearance.themeColor}
              onChange={(event) => onChange({ ...appearance, themeColor: event.target.value })}
            />
            <code>{appearance.themeColor}</code>
          </label>
        </>
      )}

      {kind === 'template' && (
        <>
          <div className="template-controls">
            <label>搜索模板
              <input type="search" placeholder="输入名称或编号，例如 1045" value={query}
                onChange={event => setQuery(event.target.value)} />
            </label>
            <div className="template-groups" role="group" aria-label="模板风格">
              {['全部', ...TEMPLATE_GROUPS].map(item => (
                <button type="button" key={item} aria-pressed={group === item}
                  onClick={() => setGroup(item)}>{item}</button>
              ))}
            </div>
            <p className="note" role="status">共 60 套模板，当前显示 {filtered.length} 套。点击卡片预览，应用后保存。</p>
          </div>
          <div className="template-grid">
            {filtered.map(spec => (
              <button type="button" key={spec.id}
                aria-label={`${spec.id} ${spec.name}`}
                aria-pressed={normalizeTemplateId(appearance.templateId) === spec.id}
                className={`template-card ${normalizeTemplateId(appearance.templateId) === spec.id ? 'active' : ''}`}
                onClick={() => onChange({ ...appearance, templateId: spec.id, themeColor: spec.accent })}>
                <div className="template-thumbnail" aria-hidden="true">
                  <div className="template-thumbnail-pages" dangerouslySetInnerHTML={{ __html: thumbnails.get(spec.id) ?? '' }} />
                </div>
                <b>{spec.name} <span className="template-id">{spec.id}</span></b>
                <small>{spec.group}</small>
              </button>
            ))}
          </div>
          {filtered.length === 0 && <p className="note">没有匹配的模板，请换个关键词。</p>}
        </>
      )}

      <footer>
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button type="button" className="primary" onClick={onApply}>
          应用
        </button>
      </footer>
    </Modal>
  );
}

export function RenameDialog({
  title,
  onSave,
  onClose,
}: {
  title: string;
  onSave: (title: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(title);
  const trimmed = value.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 20;

  return (
    <Modal title="修改模块名称" subtitle="名称会展示在预览的模块标题中，不会改变已填写内容。" onClose={onClose}>
      <label>
        模块名称
        <input
          value={value}
          maxLength={20}
          autoFocus
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <p className="note">{trimmed.length}/20 个字符</p>
      <footer>
        <button type="button" onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          className="primary"
          disabled={!valid}
          onClick={() => onSave(trimmed)}
        >
          保存
        </button>
      </footer>
    </Modal>
  );
}

type ExportPhase = 'choosing' | 'preparing' | 'working' | 'ready' | 'failed';

export function ExportDialog({
  resumeId,
  source,
  defaultFilename,
  pageCount,
  ensureSaved,
  onClose,
}: {
  resumeId: string;
  source?: OriginalSource | null;
  defaultFilename: string;
  pageCount: number;
  ensureSaved: () => Promise<number | null>;
  onClose: () => void;
}) {
  const hasOriginalPdf = source?.mime === 'application/pdf';
  const [version, setVersion] = useState<'original' | 'edited'>(hasOriginalPdf ? 'original' : 'edited');
  const [phase, setPhase] = useState<ExportPhase>(hasOriginalPdf ? 'choosing' : 'preparing');
  const [job, setJob] = useState<ExportJob | null>(null);
  const [error, setError] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const keyRef = useRef<string>('');
  const startedRef = useRef(false);
  const downloadedRef = useRef(false);

  function messageOf(err: unknown): string {
    return err instanceof ApiError ? err.message : '网络异常，请稍后重试';
  }

  async function downloadFile(target: ExportJob) {
    try {
      await api.downloadExport(target.id, target.filename);
      downloadedRef.current = true;
      setDownloaded(true);
    } catch (err) {
      setDownloadError(messageOf(err));
    }
  }

  async function start() {
    if (version === 'original') {
      setPhase('preparing'); setError(''); setDownloadError('');
      try {
        if (await ensureSaved() == null) {
          throw new Error('最新名称尚未保存成功，请先解决保存问题后再下载');
        }
        await api.downloadSource(resumeId, defaultFilename);
        setDownloaded(true); setPhase('ready');
      } catch (err) { setError(messageOf(err)); setPhase('failed'); }
      return;
    }
    setPhase('preparing');
    setError('');
    setDownloadError('');
    downloadedRef.current = false;
    setDownloaded(false);
    setJob(null);

    const revision = await ensureSaved();
    if (revision == null) {
      setPhase('failed');
      setError('最新修改尚未保存成功。请先解决保存失败或版本冲突，再导出，避免生成旧内容。');
      return;
    }

    if (!keyRef.current) keyRef.current = crypto.randomUUID();
    try {
      const created = await api.createExport(resumeId, {
        revision,
        idempotencyKey: keyRef.current,
        filename: defaultFilename,
      });
      setJob(created);
      if (created.status === 'ready') {
        setPhase('ready');
        await downloadFile(created);
      } else if (created.status === 'failed' || created.status === 'expired') {
        setPhase('failed');
        setError(created.errorMessage || '导出失败，请重试。');
      } else {
        setPhase('working');
      }
    } catch (err) {
      setPhase('failed');
      setError(messageOf(err));
    }
  }

  useEffect(() => {
    if (startedRef.current || hasOriginalPdf) return;
    startedRef.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'working' || !job) return;
    let alive = true;
    const controller = new AbortController();
    void waitForExport(job, api.getExport, next => { if (alive) setJob(next); }, controller.signal)
      .then(next => {
        if (!alive) return;
        if (next.status === 'ready') {
          setPhase('ready');
          if (!downloadedRef.current) void downloadFile(next);
        } else {
          setPhase('failed');
          setError(next.errorMessage || (next.status === 'expired' ? '文件已过期，请重新导出。' : '导出失败，请重试。'));
        }
      })
      .catch(err => {
        if (!alive) return;
        setPhase('failed');
        setError(err instanceof Error ? err.message : messageOf(err));
      });
    return () => {
      alive = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, job?.id]);

  function retry() {
    if (job?.status === 'queued' || job?.status === 'rendering') {
      setError('');
      setPhase('working');
      return;
    }
    keyRef.current = '';
    setPhase('preparing');
    void start();
  }

  return (
    <Modal
      title="导出 PDF"
      subtitle={version === 'original' ? '原件版 · 原始文件字节与分页，保留全部内容' : '编辑版 · 按当前模板生成 PDF'}
      onClose={onClose}
    >
      {hasOriginalPdf && <fieldset disabled={phase !== 'choosing'}>
        <legend>选择导出版本</legend>
        <label><input type="radio" name="export-version" checked={version === 'original'} onChange={() => setVersion('original')} /> 原件版（默认）：原文件，不包含编辑修改</label>
        <label><input type="radio" name="export-version" checked={version === 'edited'} onChange={() => setVersion('edited')} /> 编辑版：当前内容与模板</label>
      </fieldset>}
      {source && !hasOriginalPdf && <p className="note">Word 原件暂不支持原件版下载，PDF 导出使用编辑版。</p>}
      <div className="status-line">
        <span>页面</span>
        <span>
          {version === 'original' ? `原文件尺寸 · 共 ${source?.pages ?? '未知'} 页` : `A4 · 210 × 297mm · 共 ${pageCount} 页`}
        </span>
      </div>
      <div className="status-line">
        <span>文件名</span>
        <span className="filename">{job?.filename || defaultFilename}</span>
      </div>

      {phase === 'choosing' && <footer>
        <button type="button" onClick={onClose}>取消</button>
        <button type="button" className="primary" onClick={() => void start()}>下载{version === 'original' ? '原件版' : '编辑版'}</button>
      </footer>}
      {phase === 'preparing' && (
        <>
          <div className="progress" aria-hidden="true">
            <span />
          </div>
          <p className="note">{version === 'original' ? '正在下载原文件…' : '正在保存最新修改并固定导出快照…'}</p>
        </>
      )}

      {phase === 'working' && (
        <>
          <div className="progress" aria-hidden="true">
            <span />
          </div>
          <p className="note">{job?.status === 'queued' ? '任务已排队，正在等待 PDF 服务接单…' : '正在生成 PDF，完成后会自动下载。'}</p>
        </>
      )}

      {phase === 'ready' && (
        <div className="success">
          <b>{downloaded ? '文件已开始下载。' : '文件已生成。'}</b>
          <p>
            {version === 'original' ? '下载的是上传原件，文件字节保持一致。编辑修改仅在编辑版体现。' : '下载链接 10 分钟内有效；如浏览器未自动保存，请点击“再次下载”。导出使用本次快照。'}
          </p>
          {downloadError && (
            <p className="error" role="alert">
              {downloadError}
            </p>
          )}
          <footer>
            <button type="button" onClick={onClose}>
              关闭
            </button>
            {hasOriginalPdf && <button type="button" onClick={() => { setPhase('choosing'); setJob(null); keyRef.current=''; }}>重新选择版本</button>}
            <button
              type="button"
              className="primary"
              onClick={() => {
                if (version === 'original') void start();
                else if (job) void downloadFile(job);
              }}
            >
              再次下载
            </button>
          </footer>
        </div>
      )}

      {phase === 'failed' && (
        <>
          <div className="error" role="alert">
            {error || '导出失败，请重试。'}
          </div>
          <p className="note">导出失败不会扣减次数，也不会改变简历内容。</p>
          <footer>
            {hasOriginalPdf && <button type="button" onClick={() => { setPhase('choosing'); setJob(null); keyRef.current=''; }}>重新选择版本</button>}
            <button type="button" onClick={onClose}>
              返回编辑
            </button>
            <button type="button" className="primary" onClick={retry}>
              {job?.status === 'queued' || job?.status === 'rendering' ? '检查进度' : '重试'}
            </button>
          </footer>
        </>
      )}
    </Modal>
  );
}

export function ConflictDialog({
  currentRevision,
  updatedAt,
  onReload,
  onCopyLocal,
  onClose,
}: {
  currentRevision: number;
  updatedAt: string;
  onReload: () => Promise<void>;
  onCopyLocal: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  return (
    <Modal
      title="存在版本冲突"
      subtitle="另一个窗口已经保存了这份简历的更新。为避免覆盖，请选择保留哪一份。"
      onClose={onClose}
    >
      <div className="status-line">
        <span>服务端当前版本</span>
        <span>
          revision {currentRevision}
          {updatedAt ? ` · ${new Date(updatedAt).toLocaleString('zh-CN', { hour12: false })}` : ''}
        </span>
      </div>
      <p className="note">
        重新加载会放弃本窗口尚未保存的修改；下载本地副本会保存当前编辑内容为 JSON 文件，便于稍后取回。
      </p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <footer>
        <button type="button" onClick={onCopyLocal}>
          下载本地副本
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await onReload();
            } catch (err) {
              setError(err instanceof ApiError ? err.message : '重新加载失败，请稍后重试');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? '加载中…' : '重新加载远端'}
        </button>
      </footer>
    </Modal>
  );
}
