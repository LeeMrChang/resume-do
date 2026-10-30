import { stripTags } from '@resume-do/schema';
import { escapeHtml, sanitizeRichText } from '@resume-do/templates';

export const AI_REWRITE_MAX_TEXT = 6000;

/** Converts editor HTML to the plain text sent to the model, keeping block line breaks. */
export function plainTextFromHtml(html: string): string {
  const withBlocks = html
    .replace(/<(div|blockquote|li|p|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<\/(div|blockquote|li|p|h[1-6])>/gi, '\n');
  return stripTags(withBlocks)
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n+/g, '\n')
    .trim();
}

/** Turns model output into escaped paragraphs; never trusts it as HTML. */
export function plainTextToRichHtml(text: string): string {
  return sanitizeRichText(
    text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join(''),
  );
}
