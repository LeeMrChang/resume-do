import { useEffect, useRef, useState } from 'react';
import { sanitizeRichText } from '@resume-do/templates';
import AiRewritePanel from './AiRewritePanel';
import { plainTextFromHtml, plainTextToRichHtml } from './aiRewrite';
import {
  convertInlineText,
  inlineMarkdownAtEnd,
  listMarkerAtEnd,
  looksLikeMarkdown,
  markdownToHtml,
} from './markdown';

interface RichEditorProps {
  value: string;
  onChange: (html: string) => void;
  label: string;
  minHeight?: number;
  aiSection?: string;
  aiTargetRole?: string;
}

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20, 22, 24];
const TEXT_COLORS = ['#1f2328', '#64748b', '#e5484d', '#f5a524', '#30a46c', '#3b82f6', '#8b5cf6', '#ffffff'];
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_DATA = 800_000;
const ALIGNS: { command: string; label: string; title: string }[] = [
  { command: 'justifyLeft', label: '⇤', title: '左对齐' },
  { command: 'justifyCenter', label: '↔', title: '居中' },
  { command: 'justifyRight', label: '⇥', title: '右对齐' },
  { command: 'justifyFull', label: '≡', title: '两端对齐' },
];

function closestBlock(element: HTMLElement, node: Node): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== element) {
    if (current instanceof HTMLElement && /^(P|DIV)$/.test(current.tagName)) return current;
    current = current.parentNode;
  }
  return null;
}

function textBefore(block: HTMLElement, range: Range): string {
  const prefix = document.createRange();
  prefix.setStart(block, 0);
  prefix.setEnd(range.startContainer, range.startOffset);
  return prefix.toString();
}

function removeLeadingText(block: HTMLElement, length: number) {
  let remaining = length;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node && remaining > 0) {
    const text = node as Text;
    const take = Math.min(remaining, text.data.length);
    text.deleteData(0, take);
    remaining -= take;
    node = walker.nextNode();
  }
}

async function compressImage(file: File): Promise<{ src: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * scale));
    let height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    let src = '';
    for (let attempt = 0; attempt < 6; attempt += 1) {
      canvas.width = width;
      canvas.height = height;
      context?.clearRect(0, 0, width, height);
      context?.drawImage(bitmap, 0, 0, width, height);
      const quality = Math.max(0.5, 0.85 - attempt * 0.07);
      src = canvas.toDataURL('image/webp', quality);
      if (!src.startsWith('data:image/webp')) src = canvas.toDataURL('image/jpeg', quality);
      if (src.length <= MAX_IMAGE_DATA) break;
      if (attempt >= 2) {
        width = Math.max(1, Math.round(width * 0.8));
        height = Math.max(1, Math.round(height * 0.8));
      }
    }
    return { src, width, height };
  } finally {
    bitmap.close();
  }
}

export default function RichEditor({ value, onChange, label, minHeight, aiSection, aiTargetRole }: RichEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const savedRange = useRef<Range | null>(null);
  const lastValue = useRef<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const [notice, setNotice] = useState('');
  const [colorOpen, setColorOpen] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (value === lastValue.current) return;
    if (document.activeElement === element) return;
    if (element.innerHTML !== value) element.innerHTML = value;
    lastValue.current = value;
  }, [value]);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  useEffect(() => {
    const handler = () => {
      const element = ref.current;
      const selection = window.getSelection();
      if (!element || !selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      if (element.contains(range.commonAncestorContainer)) savedRange.current = range.cloneRange();
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, []);

  function flash(message: string) {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 2200);
  }

  function emit() {
    const element = ref.current;
    if (!element) return;
    const clean = sanitizeRichText(element.innerHTML);
    lastValue.current = clean;
    onChange(clean);
  }

  function currentRange(): Range | null {
    const element = ref.current;
    if (!element) return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!element.contains(range.commonAncestorContainer)) return null;
    return range.cloneRange();
  }

  function rememberSelection() {
    const range = currentRange();
    if (range) savedRange.current = range;
  }

  function restoreSelection(): Range | null {
    const element = ref.current;
    if (!element) return null;
    element.focus();
    const range = savedRange.current;
    if (!range || !element.contains(range.commonAncestorContainer)) return null;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return range;
  }

  function placeCaretAfter(node: Node) {
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    savedRange.current = range.cloneRange();
  }

  function run(command: string) {
    const element = ref.current;
    if (!element) return;
    restoreSelection();
    if (command === 'createLink') {
      const url = window.prompt('链接地址（http/https/mailto）', 'https://');
      if (!url) return;
      if (!/^(https?:|mailto:)/i.test(url)) {
        window.alert('仅支持 http、https 或 mailto 链接。');
        return;
      }
      document.execCommand('createLink', false, url);
    } else {
      document.execCommand(command, false);
    }
    rememberSelection();
    emit();
  }

  function align(command: string) {
    const element = ref.current;
    if (!element) return;
    const range = restoreSelection();
    if (!range) {
      flash('请先选中要设置的文字');
      return;
    }
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false);
    document.execCommand('styleWithCSS', false, 'false');
    rememberSelection();
    emit();
  }

  function textNodesInRange(range: Range): Text[] {
    const root = range.commonAncestorContainer;
    const container = root.nodeType === Node.TEXT_NODE ? root.parentNode : root;
    if (!container) return [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let node = walker.nextNode();
    while (node) {
      const text = node as Text;
      if (text.data.length > 0 && range.intersectsNode(text)) nodes.push(text);
      node = walker.nextNode();
    }
    return nodes;
  }

  function applyInlineStyle(property: 'font-size' | 'color', value: string) {
    const element = ref.current;
    if (!element) return;
    const range = restoreSelection();
    if (!range || range.collapsed) {
      flash('请先选中要设置的文字');
      return;
    }
    const nodes = textNodesInRange(range);
    if (nodes.length === 0) {
      flash('请先选中要设置的文字');
      return;
    }
    const spans: HTMLElement[] = [];
    for (const node of nodes) {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.length;
      if (start >= end) continue;
      let target = node;
      if (start > 0) target = node.splitText(start);
      if (end - start < target.data.length) target.splitText(end - start);
      const span = document.createElement('span');
      span.setAttribute('style', `${property}: ${value}`);
      target.parentNode?.insertBefore(span, target);
      span.appendChild(target);
      spans.push(span);
    }
    if (spans.length === 0) return;
    const selection = window.getSelection();
    const next = document.createRange();
    next.setStartBefore(spans[0]);
    next.setEndAfter(spans[spans.length - 1]);
    selection?.removeAllRanges();
    selection?.addRange(next);
    savedRange.current = next.cloneRange();
    emit();
  }

  function convertToList(block: HTMLElement, ordered: boolean, length: number) {
    removeLeadingText(block, length);
    const list = document.createElement(ordered ? 'ol' : 'ul');
    const item = document.createElement('li');
    while (block.firstChild) item.appendChild(block.firstChild);
    list.appendChild(item);
    const previous = block.previousElementSibling;
    if (previous && previous.tagName === list.tagName) {
      previous.appendChild(item);
      block.remove();
    } else {
      block.replaceWith(list);
    }
    const selection = window.getSelection();
    const caret = document.createRange();
    caret.selectNodeContents(item);
    caret.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(caret);
    savedRange.current = caret.cloneRange();
  }

  function convertAtCaret() {
    const element = ref.current;
    if (!element) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!element.contains(range.startContainer)) return;

    let block = closestBlock(element, range.startContainer);
    if (!block && element.childNodes.length === 1 && range.startContainer.nodeType === Node.TEXT_NODE) {
      const prefix = (range.startContainer as Text).data.slice(0, range.startOffset);
      if (listMarkerAtEnd(prefix)) {
        const paragraph = document.createElement('p');
        element.appendChild(paragraph);
        paragraph.appendChild(range.startContainer);
        block = paragraph;
      }
    }
    if (block) {
      const marker = listMarkerAtEnd(textBefore(block, range));
      if (marker) {
        convertToList(block, marker.ordered, marker.length);
        return;
      }
    }

    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    const match = inlineMarkdownAtEnd((node as Text).data.slice(0, range.startOffset));
    if (!match) return;
    const target = document.createRange();
    target.setStart(node, match.start);
    target.setEnd(node, range.startOffset);
    target.deleteContents();
    const template = document.createElement('template');
    template.innerHTML = match.html;
    const last = template.content.lastChild;
    target.insertNode(template.content);
    if (last) placeCaretAfter(last);
  }

  function convertStoredMarkdown() {
    const element = ref.current;
    if (!element) return;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const node of nodes) {
      const html = convertInlineText(node.data);
      if (!html) continue;
      const template = document.createElement('template');
      template.innerHTML = html;
      node.replaceWith(template.content);
    }
  }

  async function insertImage(file: File) {
    if (!/^image\/(?:png|jpeg|webp)$/.test(file.type)) {
      flash('仅支持 PNG、JPEG、WebP 图片');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      flash('图片不能超过 12MB');
      return;
    }
    let image: { src: string; width: number; height: number };
    try {
      image = await compressImage(file);
    } catch {
      flash('图片读取失败，请换一张重试');
      return;
    }
    const element = ref.current;
    if (!element) return;
    const range = restoreSelection();
    if (!range) {
      const selection = window.getSelection();
      const end = document.createRange();
      end.selectNodeContents(element);
      end.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(end);
    }
    const html = `<img src="${image.src}" width="${image.width}" height="${image.height}" alt="">`;
    try {
      document.execCommand('insertHTML', false, html);
    } catch {
      flash('图片插入失败');
      return;
    }
    emit();
  }

  function applyAiText(text: string) {
    const element = ref.current;
    if (!element) return;
    const html = plainTextToRichHtml(text);
    element.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
    let replaced = false;
    try {
      replaced = document.execCommand('insertHTML', false, html);
    } catch {
      replaced = false;
    }
    if (!replaced || element.innerHTML === value) element.innerHTML = html;
    emit();
  }

  return (
    <div ref={wrapperRef}>
      <div className="rich-tools" role="toolbar" aria-label={`${label}格式工具`}>
        <button type="button" title="撤销" aria-label="撤销" onMouseDown={(event) => event.preventDefault()} onClick={() => run('undo')}>↶</button>
        <button type="button" title="恢复" aria-label="恢复" onMouseDown={(event) => event.preventDefault()} onClick={() => run('redo')}>↷</button>
        <span className="rich-sep" aria-hidden="true" />
        <select
          className="rich-size"
          aria-label="字号"
          title="字号"
          value=""
          onMouseDown={rememberSelection}
          onChange={(event) => {
            const size = event.currentTarget.value;
            if (size) applyInlineStyle('font-size', size);
          }}
        >
          <option value="">字号</option>
          {FONT_SIZES.map((size) => (
            <option key={size} value={`${size}px`}>{size}</option>
          ))}
        </select>
        <div className="rich-color">
          <button
            type="button"
            className="rich-color-button"
            title="文字颜色"
            aria-label="文字颜色"
            aria-expanded={colorOpen}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setColorOpen((open) => !open)}
          >
            <span aria-hidden="true">A</span>
          </button>
          {colorOpen && (
            <div className="rich-palette" role="group" aria-label="文字颜色选项">
              {TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="rich-swatch"
                  title={color}
                  aria-label={`颜色 ${color}`}
                  style={{ background: color }}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    applyInlineStyle('color', color);
                    setColorOpen(false);
                  }}
                />
              ))}
              <input
                type="color"
                aria-label="自定义颜色"
                defaultValue="#1f2328"
                onMouseDown={rememberSelection}
                onChange={(event) => {
                  applyInlineStyle('color', event.currentTarget.value);
                  setColorOpen(false);
                }}
              />
            </div>
          )}
        </div>
        <span className="rich-sep" aria-hidden="true" />
        <button type="button" title="加粗" aria-label="加粗" onMouseDown={(event) => event.preventDefault()} onClick={() => run('bold')}><strong>B</strong></button>
        <button type="button" title="斜体" aria-label="斜体" onMouseDown={(event) => event.preventDefault()} onClick={() => run('italic')}><em>I</em></button>
        <button type="button" title="下划线" aria-label="下划线" onMouseDown={(event) => event.preventDefault()} onClick={() => run('underline')}><u>U</u></button>
        <button type="button" title="插入链接" aria-label="插入链接" onMouseDown={(event) => event.preventDefault()} onClick={() => run('createLink')}>链接</button>
        <span className="rich-sep" aria-hidden="true" />
        <button type="button" title="有序列表" aria-label="有序列表" onMouseDown={(event) => event.preventDefault()} onClick={() => run('insertOrderedList')}>1.</button>
        <button type="button" title="无序列表" aria-label="无序列表" onMouseDown={(event) => event.preventDefault()} onClick={() => run('insertUnorderedList')}>•</button>
        {ALIGNS.map((alignItem) => (
          <button
            key={alignItem.command}
            type="button"
            title={alignItem.title}
            aria-label={alignItem.title}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => align(alignItem.command)}
          >
            {alignItem.label}
          </button>
        ))}
        <span className="rich-sep" aria-hidden="true" />
        <button
          type="button"
          title="插入图片"
          aria-label="插入图片"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            rememberSelection();
            fileRef.current?.click();
          }}
        >
          图片
        </button>
        <button type="button" title="清除格式" aria-label="清除格式" onMouseDown={(event) => event.preventDefault()} onClick={() => run('removeFormat')}>清除</button>
      </div>
      <div
        ref={ref}
        className="rich"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        style={minHeight ? { minHeight } : undefined}
        onInput={() => {
          convertAtCaret();
          emit();
        }}
        onKeyUp={rememberSelection}
        onMouseUp={rememberSelection}
        onBlur={(event) => {
          if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) {
            setColorOpen(false);
            convertStoredMarkdown();
          }
          emit();
        }}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData('text/plain');
          if (looksLikeMarkdown(text)) document.execCommand('insertHTML', false, markdownToHtml(text));
          else document.execCommand('insertText', false, text);
          emit();
        }}
      />
      <input
        ref={fileRef}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void insertImage(file);
        }}
      />
      <p className="rich-hint">先在正文中选中文字，再设置格式；输入 Markdown（**加粗**、*斜体*、- 列表）会自动转换。</p>
      {notice && <p className="rich-notice" role="status">{notice}</p>}
      {aiSection && (
        <AiRewritePanel
          section={aiSection}
          targetRole={aiTargetRole ?? ''}
          currentText={() => plainTextFromHtml(ref.current?.innerHTML ?? '')}
          onApply={applyAiText}
        />
      )}
    </div>
  );
}
