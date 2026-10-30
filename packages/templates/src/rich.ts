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

  const pushBullet = (inner: string, mark: string) => {
    blocks.push(
      makeBlock(
        `${prefix}-li${index++}`,
        'bullet',
        `<div class="r-bullet"><span class="r-mark">${escapeHtml(mark)}</span>${inner}</div>`,
      ),
    );
  };

  const pushParagraph = (inner: string) => {
    if (!textOfHtml(inner)) return;
    blocks.push(
      makeBlock(`${prefix}-p${index++}`, 'paragraph', `<p class="r-paragraph">${inner}</p>`),
    );
  };

  // Imported documents keep list markers as text; render them as hanging bullets.
  const BULLET_PREFIX = /^(?:([·•▪◦●○])\s*|([-*])\s+|(\d{1,2})[.、)）]\s*)/;
  const pushElement = (node: Element) => {
    const leading = node.children.find(child => child.type === 'text');
    if (leading && leading.type === 'text') {
      const match = leading.data.match(BULLET_PREFIX);
      if (match) {
        // PDF text layers often expose the bullet as a middle dot; render the filled bullet the original shows.
        const mark = match[3] ? `${match[3]}.` : match[1] ? '•' : match[2];
        leading.data = leading.data.slice(match[0].length);
        if (textOfHtml(DomUtils.getInnerHTML(node))) {
          pushBullet(DomUtils.getInnerHTML(node), mark);
          return;
        }
      }
    }
    pushParagraph(DomUtils.getInnerHTML(node));
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
      pushElement(node);
    } else if (node.name === 'ul' || node.name === 'ol') {
      pushList(node, node.name === 'ol');
    } else {
      pushElement(node);
    }
  }

  return blocks;
}
