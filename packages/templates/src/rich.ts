import { parseDocument, DomUtils } from 'htmlparser2';
import type { AnyNode, Element } from 'domhandler';
import sanitizeHtml from 'sanitize-html';
import type { ResumeBlock } from './types';

const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'a'];

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard',
    transformTags: {
      div: 'p',
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          href: attribs.href ?? '',
          rel: 'noopener noreferrer',
        },
      }),
    },
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textOfHtml(html: string): string {
  return DomUtils.textContent(parseDocument(html)).replace(/\s+/g, ' ').trim();
}

function makeBlock(
  id: string,
  kind: ResumeBlock['kind'],
  html: string,
  options: { keepWithNext?: boolean; plainText?: string } = {},
): ResumeBlock {
  return {
    id,
    kind,
    keepWithNext: options.keepWithNext ?? false,
    html,
    plainText: options.plainText ?? textOfHtml(html),
  };
}

function isElement(node: AnyNode): node is Element {
  return node.type === 'tag';
}

export function richBlocks(html: string, prefix: string): ResumeBlock[] {
  const clean = sanitizeRichText(html);
  if (!clean.trim()) return [];

  const doc = parseDocument(clean);
  const blocks: ResumeBlock[] = [];
  let index = 0;

  const pushParagraph = (inner: string) => {
    if (!textOfHtml(inner)) return;
    blocks.push(
      makeBlock(`${prefix}-p${index++}`, 'paragraph', `<p class="r-paragraph">${inner}</p>`),
    );
  };

  const pushList = (node: Element, ordered: boolean) => {
    let itemIndex = 0;
    for (const child of node.children) {
      if (!isElement(child) || child.name !== 'li') continue;
      const inner = DomUtils.getInnerHTML(child);
      if (!textOfHtml(inner)) continue;
      itemIndex += 1;
      const mark = ordered ? `${itemIndex}.` : '•';
      blocks.push(
        makeBlock(
          `${prefix}-li${index++}`,
          'bullet',
          `<div class="r-bullet"><span class="r-mark">${mark}</span>${inner}</div>`,
        ),
      );
    }
  };

  for (const node of doc.children) {
    if (node.type === 'text') {
      const text = node.data.trim();
      if (text) pushParagraph(escapeHtml(text));
      continue;
    }
    if (!isElement(node)) continue;
    if (node.name === 'p') {
      pushParagraph(DomUtils.getInnerHTML(node));
    } else if (node.name === 'ul' || node.name === 'ol') {
      pushList(node, node.name === 'ol');
    } else {
      pushParagraph(DomUtils.getInnerHTML(node));
    }
  }

  return blocks;
}
