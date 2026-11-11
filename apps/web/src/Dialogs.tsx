import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createDefaultAppearance, type ResumeAppearance, type ResumeDocument } from '@resume-do/schema';
import { TEMPLATE_CATALOG, TEMPLATE_GROUPS, normalizeTemplateId, renderThumbnailFragment, type TemplateSpec } from '@resume-do/templates';
import { api, ApiError, type ExportJob } from './api';
import { waitForExport } from './exportPolling';
import { FONT_OPTIONS, loadFont } from './fonts';
import Preview from './Preview';

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide,
  preview,
  disableEscape,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  preview?: boolean;
  disableEscape?: boolean;
}) {
  const titleId = useId();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !disableEscape) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, disableEscape]);

  return (
    <div
      className={preview ? 'modal show modal-preview' : 'modal show'}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={preview ? 'dialog dialog-preview' : wide ? 'dialog dialog-wide' : 'dialog'}
        style={wide && !preview ? { width: 1040 } : undefined}
      >
        <button type="button" className="close" onClick={onClose} aria-label="关闭">
          ×
        </button>
        <h2 id={titleId}>{title}</h2>
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

function TemplatePreviewDialog({
  spec,
  document,
  appearance,
  onUse,
  onClose,
}: {
  spec: TemplateSpec;
  document: ResumeDocument;
  appearance: ResumeAppearance;
  onUse: () => void;
  onClose: () => void;
}) {
  const [pageCount, setPageCount] = useState(1);
  const previewAppearance = useMemo(
    () => ({ ...appearance, templateId: spec.id, themeColor: spec.accent }),
    [appearance, spec],
  );
  const zoom = useMemo(() => {
    const dialogWidth = Math.min(690, window.innerWidth * 0.94);
    return Math.max(0.3, Math.min(0.75, (dialogWidth - 54) / 794));
  }, []);

  return createPortal(
    <Modal
      title={`模板预览 · ${spec.name}`}
      subtitle={`${spec.id} · ${spec.group} · 使用当前简历内容试穿，点击“使用此模板”后还需应用才会保存。`}
      onClose={onClose}
      preview
    >
      <div className="template-preview-stage">
        <Preview
          document={document}
          appearance={previewAppearance}
          zoom={zoom}
          onPageCount={(count) => setPageCount(count)}
        />
      </div>
      <div className="status-line">
        <span>页面</span>
        <span>A4 · 210 × 297mm · 共 {pageCount} 页</span>
      </div>
      <footer>
        <button type="button" onClick={onClose}>返回列表</button>
        <button type="button" className="primary" onClick={onUse}>使用此模板</button>
      </footer>
    </Modal>,
    globalThis.document.body,
  );
}

export function AppearanceDialog({
  kind,
  document,
  appearance,
  onChange,
  onApply,
  onCancel,
}: {
  kind: AppearanceDialogKind;
  document: ResumeDocument;
  appearance: ResumeAppearance;
  onChange: (appearance: ResumeAppearance) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const text = DIALOG_TEXT[kind];
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('全部');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const thumbnails = useMemo(() => kind === 'template'
    ? new Map(TEMPLATE_CATALOG.map(spec => [spec.id, renderThumbnailFragment(createDefaultAppearance(), spec.id)]))
    : new Map<string, string>(), [kind]);
  const filtered = TEMPLATE_CATALOG.filter(spec =>
    (group === '全部' || spec.group === group) &&
    `${spec.id} ${spec.name} ${spec.group}`.includes(query.trim()),
  );
  const previewSpec = kind === 'template'
    ? TEMPLATE_CATALOG.find(spec => spec.id === previewId)
    : undefined;

  return (
    <Modal
      title={text.title}
      subtitle={text.subtitle}
      onClose={onCancel}
      wide={kind === 'template'}
      disableEscape={Boolean(previewSpec)}
    >
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
            label="条目间距"
            value={appearance.recordGap}
            min={0}
            max={16}
            step={1}
            suffix="px"
            onChange={(value) => onChange({ ...appearance, recordGap: value })}
          />
          <RangeField
            label="行间距"
            value={appearance.lineHeight}
            min={1.05}
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
              onChange={(event) => {
                const fontId = event.target.value as ResumeAppearance['fontId'];
                void loadFont(fontId);
                onChange({ ...appearance, fontId });
              }}
            >
              {FONT_OPTIONS.map(option => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="range-list">
            <RangeField
              label="正文字号"
              value={appearance.fontSize}
              min={12}
              max={20}
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
          <label className="inline-color">
            <input
              type="checkbox"
              checked={appearance.sectionTitleTint}
              onChange={(event) => onChange({ ...appearance, sectionTitleTint: event.target.checked })}
            />
            小节标题底色
          </label>
          {appearance.sectionTitleTint && (
            <label className="inline-color">
              标题底色
              <input
                type="color"
                value={appearance.sectionTitleTintColor}
                onChange={(event) => onChange({ ...appearance, sectionTitleTintColor: event.target.value })}
              />
              <code>{appearance.sectionTitleTintColor}</code>
            </label>
          )}
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
            <p className="note" role="status">共 {TEMPLATE_CATALOG.length} 套模板，当前显示 {filtered.length} 套。点击卡片选中，点“预览”用当前简历查看整页效果，应用后保存。</p>
          </div>
          <div className="template-grid">
            {filtered.map(spec => (
              <div className="template-card-wrap" key={spec.id}>
                <button type="button"
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
                <button type="button" className="template-preview-btn"
                  aria-label={`预览模板 ${spec.id} ${spec.name}`}
                  onClick={() => setPreviewId(spec.id)}>
                  预览
                </button>
              </div>
            ))}
          </div>
          {filtered.length === 0 && <p className="note">没有匹配的模板，请换个关键词。</p>}
        </>
      )}

      {previewSpec && (
        <TemplatePreviewDialog
          spec={previewSpec}
          document={document}
          appearance={appearance}
          onClose={() => setPreviewId(null)}
          onUse={() => {
            onChange({ ...appearance, templateId: previewSpec.id, themeColor: previewSpec.accent });
            setPreviewId(null);
          }}
        />
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

type ExportPhase = 'idle' | 'preparing' | 'working' | 'ready' | 'failed';

export function ExportDialog({
  resumeId,
  defaultFilename,
  pageCount,
  ensureSaved,
  onClose,
}: {
  resumeId: string;
  defaultFilename: string;
  pageCount: number;
  ensureSaved: () => Promise<number | null>;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<ExportPhase>('idle');
  const [job, setJob] = useState<ExportJob | null>(null);
  const [error, setError] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const keyRef = useRef<string>('');
  const startingRef = useRef(false);
  const downloadedRef = useRef(false);
  const downloadingRef = useRef(false);

  function messageOf(err: unknown): string {
    return err instanceof ApiError ? err.message : '网络异常，请稍后重试';
  }

  async function downloadFile(target: ExportJob) {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    setDownloading(true);
    setDownloadError('');
    try {
      await api.downloadExport(target.id, target.filename);
      downloadedRef.current = true;
      setDownloaded(true);
    } catch (err) {
      setDownloadError(messageOf(err));
    } finally {
      downloadingRef.current = false;
      setDownloading(false);
    }
  }

  async function start() {
    if (startingRef.current) return;
    startingRef.current = true;
    setPhase('preparing');
    setError('');
    setDownloadError('');
    downloadedRef.current = false;
    setDownloaded(false);
    setJob(null);

    try {
      const revision = await ensureSaved();
      if (revision == null) {
        setPhase('failed');
        setError('最新修改尚未保存成功。请先解决保存失败或版本冲突，再导出，避免生成旧内容。');
        return;
      }
      if (!keyRef.current) keyRef.current = crypto.randomUUID();
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
    } finally {
      startingRef.current = false;
    }
  }

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
    void start();
  }

  const busy = phase === 'preparing' || phase === 'working';
  const filename = job?.filename || defaultFilename;
  const checking = job?.status === 'queued' || job?.status === 'rendering';

  return (
    <Modal
      title="导出 PDF"
      subtitle="将当前编辑的内容与排版保存为 PDF。"
      onClose={onClose}
    >
      <div className="export-content">
        <div className="export-summary">
          <div className="export-file-icon" aria-hidden="true">
            <svg viewBox="0 0 32 36" fill="none">
              <path d="M7 2h12l7 7v23a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="2" />
              <path d="M19 2v8h7M10 18h11M10 24h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span>PDF</span>
          </div>
          <div className="export-file-info">
            <span className="export-edition">当前编辑版</span>
            <p className="export-filename">{filename}</p>
            <p className="export-caption">包含最新修改，使用当前模板与样式</p>
          </div>
        </div>
        <dl className="export-details">
          <div><dt>纸张尺寸</dt><dd>A4 <span>210 × 297 mm</span></dd></div>
          <div><dt>预览页数</dt><dd>共 {pageCount} 页</dd></div>
        </dl>

        {phase === 'idle' && <p className="export-hint">点击下载后会先保存最新修改，生成完成后自动下载。</p>}
        {busy && (
          <div className="export-status" role="status" aria-live="polite">
            <b>{phase === 'preparing' ? '正在保存最新修改' : job?.status === 'queued' ? '正在等待生成' : '正在生成 PDF'}</b>
            <div className="progress" aria-hidden="true"><span /></div>
            <p>完成后会自动下载，请稍候。</p>
          </div>
        )}
        {phase === 'ready' && (
          <div className="export-status success" role="status" aria-live="polite">
            <b>{downloaded ? '文件已开始下载' : 'PDF 已生成'}</b>
            <p>文件包含本次导出的内容与排版。下载链接 10 分钟内有效，可再次下载。</p>
            {downloadError && <p className="error" role="alert">{downloadError}</p>}
          </div>
        )}
        {phase === 'failed' && (
          <div className="export-status">
            <div className="error" role="alert">{error || '导出失败，请重试。'}</div>
            <p>当前简历内容已保留，可返回编辑或重试。</p>
          </div>
        )}
        <footer>
          <button type="button" onClick={onClose}>{phase === 'idle' ? '取消' : phase === 'ready' ? '关闭' : '返回编辑'}</button>
          {phase === 'idle' && <button type="button" className="primary" onClick={() => void start()}>下载 PDF</button>}
          {busy && <button type="button" className="primary" disabled>正在生成…</button>}
          {phase === 'ready' && (
            <button type="button" className="primary" disabled={downloading} onClick={() => { if (job) void downloadFile(job); }}>
              {downloading ? '正在下载…' : '再次下载'}
            </button>
          )}
          {phase === 'failed' && <button type="button" className="primary" onClick={retry}>{checking ? '检查进度' : '重新生成'}</button>}
        </footer>
      </div>
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
