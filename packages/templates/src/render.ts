import { SAMPLE_DOCUMENT, type ResumeAppearance } from '@resume-do/schema';
import { buildBlocks } from './blocks';
import { getTemplateSpec } from './catalog';
import { SIDEBAR_PADDING_PX, getTemplateLayout, splitBlocks } from './layout';
import { RESUME_CSS } from './styles';
import type { PageMetrics, RenderInput, ResumeBlock } from './types';

export const RENDERER_VERSION = '2';
export const TEMPLATE_VERSION = 2;
export const PAGE_WIDTH_PX = (210 * 96) / 25.4;
export const PAGE_HEIGHT_PX = (297 * 96) / 25.4;
export const FOOTER_RESERVE_PX = 26;

export function getPageMetrics(appearance: ResumeAppearance): PageMetrics {
  const marginPx = appearance.pageMargin;
  const layout = getTemplateLayout(appearance.templateId);
  const hasAside = layout.hasAside;
  const footerReservePx = getTemplateSpec(appearance.templateId).showFooter === false ? 0 : FOOTER_RESERVE_PX;
  return {
    pageWidthPx: PAGE_WIDTH_PX,
    pageHeightPx: PAGE_HEIGHT_PX,
    contentWidthPx: hasAside
      ? PAGE_WIDTH_PX - layout.sidebarWidthPx - layout.mainGapPx - marginPx
      : PAGE_WIDTH_PX - marginPx * 2,
    contentHeightPx: PAGE_HEIGHT_PX - (hasAside ? marginPx : marginPx * 2) - footerReservePx,
    marginPx,
    footerReservePx,
    asideWidthPx: layout.sidebarWidthPx,
    asideContentWidthPx: Math.max(0, layout.sidebarWidthPx - SIDEBAR_PADDING_PX * 2 - (layout.kind === 'split' ? 1 : 0)),
    asideContentHeightPx: hasAside ? PAGE_HEIGHT_PX - marginPx * 2 : 0,
    mainGapPx: layout.mainGapPx,
    hasAside,
  };
}

function sideTheme(input: RenderInput): Record<string, string> {
  const { appearance } = input;
  const spec = getTemplateSpec(appearance.templateId);
  const layout = getTemplateLayout(appearance.templateId);
  const dark = layout.hasAside && layout.asideTone === 'dark';
  return {
    '--r-sidebar-bg': spec.sidebarBg ?? (dark ? spec.accent : spec.tint),
    '--r-sidebar-ink': spec.sidebarInk ?? (dark ? '#f2f7fa' : spec.ink),
    '--r-side-heading': spec.sidebarInk ?? (dark ? '#f2f7fa' : spec.ink),
    '--r-side-muted': dark ? 'rgba(255,255,255,0.72)' : '#5f6b75',
    '--r-side-line': dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.12)',
    '--r-side-accent': dark ? '#ffffff' : appearance.themeColor,
  };
}

function pageStyle(input: RenderInput): string {
  const { appearance } = input;
  const metrics = getPageMetrics(appearance);
  const spec = getTemplateSpec(appearance.templateId);
  const layout = getTemplateLayout(appearance.templateId);
  const side = sideTheme(input);
  const vars: Record<string, string> = {
    '--r-accent': appearance.themeColor,
    '--r-accent-2': spec.accent2,
    '--r-tint': spec.tint,
    '--r-ink': spec.ink,
    '--r-gap': `${appearance.sectionGap}px`,
    '--r-record-gap': `${appearance.recordGap}px`,
    '--r-title-tint': appearance.sectionTitleTintColor,
    '--r-margin': `${metrics.marginPx}px`,
    '--r-font-size': `${appearance.fontSize}px`,
    '--r-line-height': `${appearance.lineHeight}`,
    '--r-content-height': `${metrics.contentHeightPx}px`,
    '--r-sidebar-width': `${layout.sidebarWidthPx}px`,
    '--r-main-gap': `${layout.mainGapPx}px`,
    '--r-side-pad': `${SIDEBAR_PADDING_PX}px`,
    '--r-aside-content-width': `${metrics.asideContentWidthPx}px`,
    '--r-card': spec.cardBg ?? spec.tint,
    '--r-page-bg': spec.pageBg ?? '#ffffff',
    ...side,
  };
  if (spec.id === 'imported') {
    const style = input.document.importStyle;
    if (style?.pageBackground) vars['--r-page-bg'] = style.pageBackground;
    if (style?.nameColor) vars['--r-import-name'] = style.nameColor;
    if (style?.intentColor) vars['--r-import-intent'] = style.intentColor;
    if (style?.metaColor) vars['--r-import-meta'] = style.metaColor;
    if (style?.sectionTitleColor) vars['--r-import-title'] = style.sectionTitleColor;
    if (style?.titleRule) vars['--r-import-title-rule'] = `1px solid ${style.titleRule}`;
    if (style?.headerRule) vars['--r-import-header-rule'] = `2px solid ${style.headerRule}`;
    if (style?.leftRule) vars['--r-import-left-rule'] = `1px ${style.leftRuleStyle ?? 'dashed'} ${style.leftRule}`;
    if (style?.nameSize) vars['--r-import-name-size'] = `${style.nameSize}pt`;
    if (style?.intentSize) vars['--r-import-intent-size'] = `${style.intentSize}pt`;
    if (style?.metaSize) vars['--r-import-meta-size'] = `${style.metaSize}pt`;
    if (style?.titleSize) vars['--r-import-title-size'] = `${style.titleSize}em`;
    if (style?.bulletGap) vars['--r-import-bullet-gap'] = `${style.bulletGap}px`;
    if (style?.bulletMark) vars['--r-import-bullet-mark'] = `${style.bulletMark}px`;
    if (style?.bulletIndent) vars['--r-import-bullet-indent'] = `${style.bulletIndent}px`;
    if (style?.recordIndent) vars['--r-import-record-indent'] = `${style.recordIndent}px`;
    if (style?.bodyIndent) vars['--r-import-body-indent'] = `${style.bodyIndent}px`;
    if (style?.bodyTextIndent) vars['--r-import-body-text-indent'] = `${style.bodyTextIndent}px`;
    if (style?.paragraphGap) vars['--r-import-paragraph-gap'] = `${style.paragraphGap}px`;
    if (style?.fontSizePx && appearance.fontSize === Math.min(20, Math.max(12, Math.round(style.fontSizePx)))) {
      vars['--r-font-size'] = `${style.fontSizePx}px`;
    }
    if (style?.headerIndent) vars['--r-import-header-indent'] = `${style.headerIndent}px`;
    if (style?.recordMark) vars['--r-import-record-mark'] = style.recordMark;
  }
  return Object.entries(vars)
    .map(([key, value]) => `${key}:${value}`)
    .join(';');
}

function styleClass(appearance: ResumeAppearance): string {
  const spec = getTemplateSpec(appearance.templateId);
  const layout = getTemplateLayout(appearance.templateId);
  const tone = layout.hasAside ? `side-${layout.asideTone}` : 'side-none';
  return [
    `tpl-${spec.id}`,
    `layout-${spec.layout}`,
    layout.hasAside ? `aside-${layout.asideSide}` : '',
    `hdr-${spec.header}`,
    `sec-${spec.section}`,
    spec.cards ? 'has-cards' : '',
    spec.plainContacts ? 'plain-contacts' : '',
    spec.photoRight ? 'photo-order-right' : '',
    spec.artBold ? 'art-bold' : '',
    spec.squareNodes ? 'tl-square' : '',
    tone,
    `font-${spec.font ?? appearance.fontId}`,
    appearance.sectionTitleTint ? 'title-tint' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function renderBlockHtml(block: ResumeBlock): string {
  const section = block.sectionId ? ` data-section="${block.sectionId}"` : '';
  return `<div class="r-block r-${block.kind}" data-block="${block.id}"${section}>${block.html}</div>`;
}

export function renderMeasureFragment(input: RenderInput, blocks: ResumeBlock[]): string {
  const metrics = getPageMetrics(input.appearance);
  const style = [
    pageStyle(input),
    `width:${metrics.contentWidthPx}px`,
    // Imported pages can carry a fractional font size; measuring at the rounded
    // value would over-wrap and break the page count.
    'font-size:var(--r-font-size)',
    'line-height:var(--r-line-height)',
  ].join(';');
  return `<div class="r-measure ${styleClass(input.appearance)}" style="${style}">${blocks
    .map(renderBlockHtml)
    .join('')}</div>`;
}

export function renderAsideMeasureFragment(input: RenderInput, blocks: ResumeBlock[]): string {
  const metrics = getPageMetrics(input.appearance);
  const style = [
    pageStyle(input),
    `--r-aside-content-width:${metrics.asideContentWidthPx}px`,
    'font-size:var(--r-font-size)',
    'line-height:var(--r-line-height)',
  ].join(';');
  return `<div class="r-measure-aside r-sidebar ${styleClass(input.appearance)}" style="${style}">${blocks
    .map(renderBlockHtml)
    .join('')}</div>`;
}

/** Card skins wrap each section body in one tinted panel; the wrapper adds no vertical space. */
function renderCardBlocks(blocks: ResumeBlock[]): string {
  const out: string[] = [];
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index];
    const sectionId = block.sectionId;
    if (block.kind === 'section' || !sectionId) {
      out.push(renderBlockHtml(block));
      index += 1;
      continue;
    }
    const group: ResumeBlock[] = [];
    while (index < blocks.length && blocks[index].kind !== 'section' && blocks[index].sectionId === sectionId) {
      group.push(blocks[index]);
      index += 1;
    }
    out.push(`<div class="r-card-group">${group.map(renderBlockHtml).join('')}</div>`);
  }
  return out.join('');
}

export function renderPagesFragment(
  input: RenderInput,
  pages: ResumeBlock[][],
  asideBlocks: ResumeBlock[] = [],
): string {
  const style = pageStyle(input);
  const classes = `r-page ${styleClass(input.appearance)}`;
  const total = Math.max(1, pages.length);
  const metrics = getPageMetrics(input.appearance);
  const spec = getTemplateSpec(input.appearance.templateId);
  const showFooter = spec.showFooter !== false;
  return pages
    .map((blocks, index) => {
      const content = spec.cards ? renderCardBlocks(blocks) : blocks.map(renderBlockHtml).join('');
      const footer = showFooter ? `<div class="r-footer">${index + 1} / ${total}</div>` : '';
      if (metrics.hasAside) {
        const aside = asideBlocks.map(renderBlockHtml).join('');
        return [
          `<section class="${classes}" style="${style}">`,
          `<aside class="r-sidebar">${aside}</aside>`,
          `<div class="r-main"><div class="r-content">${content}</div></div>`,
          footer,
          '</section>',
        ].join('');
      }
      return [
        `<section class="${classes}" style="${style}">`,
        `<div class="r-content">${content}</div>`,
        footer,
        '</section>',
      ].join('');
    })
    .join('');
}

function htmlShell(body: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${RESUME_CSS}</style></head><body class="resume-export">${body}</body></html>`;
}

export function renderMeasureHtml(input: RenderInput, blocks: ResumeBlock[]): string {
  return htmlShell(renderMeasureFragment(input, blocks));
}

export function renderAsideMeasureHtml(input: RenderInput, blocks: ResumeBlock[]): string {
  return htmlShell(renderAsideMeasureFragment(input, blocks));
}

export function renderPagesHtml(
  input: RenderInput,
  pages: ResumeBlock[][],
  asideBlocks: ResumeBlock[] = [],
): string {
  return htmlShell(renderPagesFragment(input, pages, asideBlocks));
}

export function renderThumbnailFragment(
  baseAppearance: ResumeAppearance,
  templateId: string,
): string {
  const spec = getTemplateSpec(templateId);
  const appearance: ResumeAppearance = {
    ...baseAppearance,
    templateId: spec.id,
    themeColor: spec.accent,
  };
  const input: RenderInput = { document: SAMPLE_DOCUMENT, appearance };
  const blocks = buildBlocks(input);
  const layout = getTemplateLayout(spec.id);
  const { aside, main } = splitBlocks(blocks, layout);
  return renderPagesFragment(input, [main], aside);
}

export function exportFilename(input: RenderInput): string {
  const basicName = input.document.basic.name.trim() || '我的';
  const role = input.document.intent.role.trim();
  const raw = role ? `${basicName}_${role}` : `${basicName}_简历`;
  const safe = raw.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  return `${safe}.pdf`;
}
