import type { ResumeDocument, ResumeRecordItem, ResumeSection } from '@resume-do/schema';
import { stripTags } from '@resume-do/schema';
import { getTemplateSpec } from './catalog';
import { escapeHtml, richBlocks } from './rich';
import type { RenderInput, ResumeBlock } from './types';

function hasText(html: string): boolean {
  return stripTags(html).trim().length > 0;
}

function formatMonth(month: string): string {
  return month ? month.replace('-', '.') : '';
}

function formatRange(item: ResumeRecordItem): string {
  const start = formatMonth(item.startMonth);
  const end = item.ongoing ? '至今' : formatMonth(item.endMonth);
  if (start && end) return `${start} — ${end}`;
  return start || end;
}

function headerBlock(input: RenderInput): ResumeBlock {
  const { document, appearance } = input;
  const basic = document.basic;
  const intent = document.intent;
  const intentLine = [intent.role, intent.city, intent.salary, intent.arrival]
    .filter(Boolean)
    .join(' · ');
  const metaItems = [basic.gender, basic.city, basic.experienceYears, basic.phone, basic.email].filter(
    Boolean,
  );
  const spec = getTemplateSpec(appearance.templateId);
  const showPhoto = spec.photo !== false;
  const name = basic.name || '你的姓名';
  const initial = Array.from(name)[0] ?? '简';
  const photo = basic.photo
    ? `<img src="${escapeHtml(basic.photo)}" alt="${escapeHtml(name)}" />`
    : `<span class="r-initial">${escapeHtml(initial)}</span>`;

  const html = [
    '<div class="r-intro">',
    showPhoto ? `<div class="r-intro-photo">${photo}</div>` : '',
    '<div class="r-intro-main">',
    `<h1>${escapeHtml(name)}</h1>`,
    intentLine ? `<p class="r-intent">${escapeHtml(intentLine)}</p>` : '',
    metaItems.length
      ? `<div class="r-meta">${metaItems.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>`
      : '',
    '</div>',
    '</div>',
  ].join('');

  return {
    id: 'header',
    kind: 'header',
    keepWithNext: false,
    html,
    plainText: [name, intentLine, ...metaItems].filter(Boolean).join(' '),
  };
}

function recordHasContent(item: ResumeRecordItem): boolean {
  return Boolean(item.title.trim() || item.role.trim() || hasText(item.body));
}

function stampSection(blocks: ResumeBlock[], sectionId: string): ResumeBlock[] {
  for (const block of blocks) block.sectionId = sectionId;
  return blocks;
}

function sectionBlocks(section: ResumeSection, sectionIndex: number): ResumeBlock[] {
  if (!section.visible) return [];

  const prefix = `s${sectionIndex}`;
  const blocks: ResumeBlock[] = [];

  if (section.type === 'rich') {
    const body = section.items[0]?.body ?? '';
    if (!hasText(body)) return [];

    blocks.push({
      id: `${prefix}-title`,
      kind: 'section',
      keepWithNext: true,
      html: `<h2 class="r-section-title" data-section="${escapeHtml(section.id)}">${escapeHtml(
        section.title,
      )}</h2>`,
      plainText: section.title,
    });

    const bodyBlocks = richBlocks(body, `${prefix}-body`);
    for (const block of bodyBlocks) blocks.push(block);
    return stampSection(blocks, section.id);
  }

  const records = section.items.filter(recordHasContent);
  if (records.length === 0) return [];

  blocks.push({
    id: `${prefix}-title`,
    kind: 'section',
    keepWithNext: true,
    html: `<h2 class="r-section-title" data-section="${escapeHtml(section.id)}">${escapeHtml(
      section.title,
    )}</h2>`,
    plainText: section.title,
  });

  records.forEach((item, recordIndex) => {
    const range = formatRange(item);
    const bodyBlocks = richBlocks(item.body, `${prefix}-r${recordIndex}`);
    const hasFollowing = Boolean(item.role.trim() || bodyBlocks.length);

    blocks.push({
      id: `${prefix}-r${recordIndex}-head`,
      kind: 'record-head',
      keepWithNext: hasFollowing,
      html: [
        '<div class="r-record">',
        `<span class="r-record-title">${escapeHtml(item.title || '未命名经历')}</span>`,
        range ? `<span class="r-record-date">${escapeHtml(range)}</span>` : '',
        '</div>',
      ].join(''),
      plainText: `${item.title} ${range}`.trim(),
    });

    if (item.role.trim()) {
      blocks.push({
        id: `${prefix}-r${recordIndex}-role`,
        kind: 'role',
        keepWithNext: bodyBlocks.length > 0,
        html: `<p class="r-role">${escapeHtml(item.role)}</p>`,
        plainText: item.role,
      });
    }

    for (const block of bodyBlocks) blocks.push(block);
  });

  return stampSection(blocks, section.id);
}

export function buildBlocks(input: RenderInput): ResumeBlock[] {
  const blocks: ResumeBlock[] = [headerBlock(input)];
  input.document.sections.forEach((section, index) => {
    blocks.push(...sectionBlocks(section, index));
  });
  return blocks;
}
