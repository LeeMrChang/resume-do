import { escapeHtml } from '@resume-do/templates';

const BOLD_STAR = /\*\*(?=\S)([^*\n]*?\S)\*\*/g;
const BOLD_UNDER = /(?<![A-Za-z0-9_])__(?=\S)([^_\n]*?\S)__(?![A-Za-z0-9_])/g;
const ITALIC_STAR = /(^|[^*])\*(?=\S)([^*\n]*?\S)\*(?!\*)/g;
const ITALIC_UNDER = /(^|[^A-Za-z0-9_])_(?=\S)([^_\n]*?\S)_(?![A-Za-z0-9_])/g;
const LINK = /\[([^\]\n]{1,120})\]\((https?:\/\/[^\s)]{1,500}|mailto:[^\s)]{1,500})\)/g;

const BULLET_LINE = /^[-*+]\s+(.+)$/;
const NUMBER_LINE = /^\d{1,2}[.)]\s+(.+)$/;

export interface InlineConversion {
  /** Offset in the source text where the converted markdown starts. */
  start: number;
  html: string;
}

function linkHtml(label: string, href: string): string {
  return `<a href="${href}" rel="noopener noreferrer">${label}</a>`;
}

function inlineHtml(escaped: string): string {
  return escaped
    .replace(BOLD_STAR, '<strong>$1</strong>')
    .replace(BOLD_UNDER, '<strong>$1</strong>')
    .replace(ITALIC_STAR, (_match, lead: string, text: string) => `${lead}<em>${text}</em>`)
    .replace(ITALIC_UNDER, (_match, lead: string, text: string) => `${lead}<em>${text}</em>`)
    .replace(LINK, (_match, label: string, href: string) => linkHtml(label, href));
}

/** Converts inline markdown in a plain-text fragment; all other text stays escaped. */
export function inlineMarkdownToHtml(text: string): string {
  return inlineHtml(escapeHtml(text));
}

const END_RULES: { re: RegExp; lead: (match: RegExpExecArray) => number; render: (match: RegExpExecArray) => string }[] = [
  {
    re: /\*\*(?=\S)([^*\n]*?\S)\*\*$/,
    lead: () => 0,
    render: (match) => `<strong>${match[1]}</strong>`,
  },
  {
    re: /(?<![A-Za-z0-9_])__(?=\S)([^_\n]*?\S)__$/,
    lead: () => 0,
    render: (match) => `<strong>${match[1]}</strong>`,
  },
  {
    re: /\[([^\]\n]{1,120})\]\((https?:\/\/[^\s)]{1,500}|mailto:[^\s)]{1,500})\)$/,
    lead: () => 0,
    render: (match) => linkHtml(match[1], match[2]),
  },
  {
    re: /(^|[^*])\*(?=\S)([^*\n]*?\S)\*$/,
    lead: (match) => match[1]?.length ?? 0,
    render: (match) => `<em>${match[2]}</em>`,
  },
  {
    re: /(^|[^A-Za-z0-9_])_(?=\S)([^_\n]*?\S)_$/,
    lead: (match) => match[1]?.length ?? 0,
    render: (match) => `<em>${match[2]}</em>`,
  },
];

/** Detects a complete inline markdown pair that ends exactly at the caret. */
export function inlineMarkdownAtEnd(text: string): InlineConversion | null {
  for (const rule of END_RULES) {
    rule.re.lastIndex = 0;
    const match = rule.re.exec(text);
    if (!match) continue;
    return { start: match.index + rule.lead(match), html: rule.render(match) };
  }
  return null;
}

/** Detects a list marker typed at the start of the block (`- `, `* `, `1. `). */
export function listMarkerAtEnd(text: string): { ordered: boolean; length: number } | null {
  const unordered = /^\s*[-*+]\s+$/.exec(text);
  if (unordered) return { ordered: false, length: unordered[0].length };
  const ordered = /^\s*\d{1,2}[.)]\s+$/.exec(text);
  if (ordered) return { ordered: true, length: ordered[0].length };
  return null;
}

/** Converts pasted or stored markdown text into whitelist-safe HTML. */
export function markdownToHtml(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!list) return;
    const tag = list.ordered ? 'ol' : 'ul';
    out.push(`<${tag}>${list.items.map((item) => `<li>${inlineMarkdownToHtml(item)}</li>`).join('')}</${tag}>`);
    list = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      continue;
    }
    const bullet = BULLET_LINE.exec(trimmed);
    if (bullet) {
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }
    const numbered = NUMBER_LINE.exec(trimmed);
    if (numbered) {
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[1]);
      continue;
    }
    flushList();
    out.push(`<p>${inlineMarkdownToHtml(trimmed)}</p>`);
  }
  flushList();
  return out.join('');
}

export function looksLikeMarkdown(text: string): boolean {
  return /\*\*(?=\S)[^*\n]*?\S\*\*|(?<![A-Za-z0-9_])__(?=\S)[^_\n]*?\S__|\[[^\]\n]+\]\([^)\s]+\)|^\s*(?:[-*+]|\d{1,2}[.)])\s+\S/m.test(text);
}

/** Rewrites one text node when it contains complete inline markdown; returns null otherwise. */
export function convertInlineText(text: string): string | null {
  if (!/(\*\*|__|\[[^\]]*\]\(|\*[^\s*]|_[^\s_])/.test(text)) return null;
  const html = inlineMarkdownToHtml(text);
  return html === escapeHtml(text) ? null : html;
}
