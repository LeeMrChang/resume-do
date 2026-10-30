import { useEffect, useRef } from 'react';
import { sanitizeRichText } from '@resume-do/templates';
import AiRewritePanel from './AiRewritePanel';
import { plainTextFromHtml, plainTextToRichHtml } from './aiRewrite';

interface RichEditorProps {
  value: string;
  onChange: (html: string) => void;
  label: string;
  minHeight?: number;
  aiSection?: string;
  aiTargetRole?: string;
}

const TOOLBAR: { command: string; label: string; title: string; value?: string }[] = [
  { command: 'bold', label: 'B', title: '加粗' },
  { command: 'italic', label: 'I', title: '斜体' },
  { command: 'underline', label: 'U', title: '下划线' },
  { command: 'insertUnorderedList', label: '• 列表', title: '无序列表' },
  { command: 'insertOrderedList', label: '1. 列表', title: '有序列表' },
  { command: 'removeFormat', label: '清除格式', title: '清除格式' },
  { command: 'undo', label: '↶', title: '撤销' },
  { command: 'redo', label: '↷', title: '恢复' },
];

export default function RichEditor({ value, onChange, label, minHeight, aiSection, aiTargetRole }: RichEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastValue = useRef(value);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (document.activeElement === element) return;
    if (element.innerHTML !== value) element.innerHTML = value;
    lastValue.current = value;
  }, [value]);

  function emit() {
    const element = ref.current;
    if (!element) return;
    const clean = sanitizeRichText(element.innerHTML);
    lastValue.current = clean;
    onChange(clean);
  }

  function run(command: string) {
    const element = ref.current;
    if (!element) return;
    element.focus();
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
    <div>
      <div className="rich-tools" role="toolbar" aria-label={`${label}格式工具`}>
        {TOOLBAR.map((tool) => (
          <button
            key={tool.command}
            type="button"
            title={tool.title}
            aria-label={tool.title}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(tool.command)}
          >
            {tool.label}
          </button>
        ))}
        <button
          type="button"
          title="插入链接"
          aria-label="插入链接"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run('createLink')}
        >
          链接
        </button>
      </div>
      <div
        ref={ref}
        className="rich"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        style={minHeight ? { minHeight } : undefined}
        onInput={emit}
        onBlur={emit}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
        }}
      />
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
