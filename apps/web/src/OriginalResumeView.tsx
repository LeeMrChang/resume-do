import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type PDFPageProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ResumeResponse } from './api';

GlobalWorkerOptions.workerSrc = workerUrl;

function OriginalPage({ pdf, index }: { pdf: PDFDocumentProxy; index: number }) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const previousRender = useRef<RenderTask | null>(null);
  useEffect(() => {
    let alive = true;
    void pdf.getPage(index).then(p => { if (alive) setPage(p); }).catch(() => { if (alive) setError(`第 ${index} 页读取失败`); });
    return () => { alive = false; };
  }, [pdf, index]);
  useEffect(() => {
    const node = host.current; if (!node) return;
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(node); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!page || !width || !canvas.current) return;
    let alive = true;
    setReady(false); setError('');
    const previous = previousRender.current;
    void (async () => {
      if (previous) { previous.cancel(); await previous.promise.catch(() => {}); }
      if (!alive || !canvas.current) return;
      const natural = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / natural.width });
      const dpr = window.devicePixelRatio || 1;
      const surface = canvas.current;
      surface.width = Math.ceil(viewport.width * dpr); surface.height = Math.ceil(viewport.height * dpr);
      surface.style.width = `${viewport.width}px`; surface.style.height = `${viewport.height}px`;
      const render = page.render({ canvas: surface, viewport, transform: [dpr, 0, 0, dpr, 0, 0] });
      previousRender.current = render;
      await render.promise;
      if (alive) setReady(true);
    })().catch(e => { if (alive && e.name !== 'RenderingCancelledException') setError(`第 ${index} 页渲染失败，请重试`); });
    return () => { alive = false; previousRender.current?.cancel(); };
  }, [page, width]);
  return <section className="original-page" aria-label={`原件第 ${index} 页`}>
    <div className="original-page-label">第 {index} / {pdf.numPages} 页</div>
    <div ref={host} className="original-canvas-host">
      <canvas ref={canvas} aria-label={`原件第 ${index} 页画布`} />
      {!ready && !error && <p role="status">正在渲染第 {index} 页…</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  </section>;
}

export default function OriginalResumeView({ resume }: { resume: ResumeResponse }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (resume.source?.mime !== 'application/pdf') return;
    const abort = new AbortController(); let alive = true;
    let task: ReturnType<typeof getDocument> | undefined;
    setPdf(null); setError('');
    void (async () => {
      const response = await fetch(`/api/resumes/${resume.id}/source`, { credentials: 'include', signal: abort.signal });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.message || '原文件读取失败'); }
      const data = await response.arrayBuffer();
      if (!alive) return;
      task = getDocument({ data, isEvalSupported: false, cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/', useSystemFonts: false });
      const loaded = await task.promise;
      if (resume.source?.pages && loaded.numPages !== resume.source.pages) { await loaded.destroy(); throw new Error('原件页数与记录不一致，请重新加载或重新导入'); }
      if (alive) setPdf(loaded);
    })().catch(e => { if (alive && e.name !== 'AbortError') setError(e instanceof Error ? e.message : '原文件加载失败'); });
    return () => { alive = false; abort.abort(); if (task) void task.destroy(); };
  }, [resume.id, resume.source?.pages, attempt]);
  if (resume.source?.mime !== 'application/pdf') return <main className="original-view">
    <h2>Word 原件</h2><p>保留了上传文件，当前浏览器不直接预览 Word。可返回编辑器修改，或下载原始 DOCX。</p>
    <a href={`/api/resumes/${resume.id}/source?download=1`}>下载 Word 原件</a>
  </main>;
  return <main className="original-view">
    <div className="original-info">
      <strong>原件预览 · {pdf ? `共 ${pdf.numPages} 页` : '正在加载'}</strong>
      <p>当前为只读原件。点击顶部“返回编辑器”继续修改关联的可编辑内容；修改不会改变原件。</p>
      <p>按原文件每页尺寸和方向显示，不重排。原文件长期保存在你部署的服务器数据目录，数据库记录文件信息；删除简历时一并删除，不上传第三方。</p>
    </div>
    {error ? <div role="alert">{error}<button onClick={() => setAttempt(n => n + 1)}>重试</button></div> : !pdf ? <p role="status">正在加载原 PDF…</p> : Array.from({ length: pdf.numPages }, (_, i) => <OriginalPage key={`${attempt}-${i}`} pdf={pdf} index={i + 1} />)}
    {pdf && <button type="button" onClick={() => setAttempt(n => n + 1)}>重新加载原件</button>}
  </main>;
}
