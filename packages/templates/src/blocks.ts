import type { ResumeDocument, ResumeRecordItem, ResumeSection } from '@resume-do/schema';
import { stripTags, ageFromBirthMonth } from '@resume-do/schema';
import { getTemplateSpec } from './catalog';
import { escapeHtml, richBlocks } from './rich';
import type { RenderInput, ResumeBlock } from './types';
import { contactIcon, type ContactIcon } from './icons';

function hasText(html: string): boolean {
  return stripTags(html).trim().length > 0;
}

function formatMonth(month: string): string {
  return month ? month.replace('-', '.') : '';
}

// The original resumes space out two-character labels (年　　龄) to line up with four-character ones.
function spacedLabel(label: string): string {
  return label.length === 2 ? `${label[0]}\u3000\u3000${label[1]}` : label;
}

function formatRange(item: ResumeRecordItem, iso: boolean): string {
  if (iso) {
    const start = item.startMonth;
    const end = item.ongoing ? '至今' : item.endMonth;
    if (start && end) return `${start} ~ ${end}`;
    return start || end;
  }
  const start = formatMonth(item.startMonth);
  const end = item.ongoing ? '至今' : formatMonth(item.endMonth);
  if (start && end) return `${start} — ${end}`;
  return start || end;
}

function headerBlock(input: RenderInput): ResumeBlock {
  const { document, appearance } = input;
  const basic = document.basic;
  const intent = document.intent;
  const spec = getTemplateSpec(appearance.templateId);
  const classic = spec.header === 'classic';
  const intentLine = classic
    ? intent.role || intent.city
      ? `求职意向：${[intent.role, intent.city, intent.salary, intent.arrival].filter(Boolean).join('｜')}`
      : ''
    : [intent.role, intent.city, intent.salary, intent.arrival].filter(Boolean).join(' · ');
  const metaKeys: ContactIcon[] = ['gender', 'city', 'experienceYears', 'phone', 'email'];
  const metaItems = metaKeys.flatMap(key => {
    const value = basic[key];
    return value ? [{ key, value }] : [];
  });
  const showPhoto = spec.photo !== false && basic.showPhoto !== false;
  const name = basic.name || '你的姓名';
  const initial = Array.from(name)[0] ?? '简';
  const photo = basic.photo
    ? `<img src="${escapeHtml(basic.photo)}" alt="${escapeHtml(name)}" />`
    : `<span class="r-initial">${escapeHtml(initial)}</span>`;

  if (classic) {
    const rows = ([
      { icon: 'age', label: '年龄', value: basic.birthMonth ? ageFromBirthMonth(basic.birthMonth) : basic.age },
      { icon: 'gender', label: '性别', value: basic.gender },
      { icon: 'nativePlace', label: '籍贯', value: basic.nativePlace },
      { icon: 'experienceYears', label: '工作年限', value: basic.experienceYears },
      { icon: 'phone', label: '电话', value: basic.phone },
      { icon: 'email', label: '邮箱', value: basic.email },
      { icon: 'city', label: '城市', value: basic.city },
      { icon: 'birthMonth', label: '出生年月', value: basic.birthMonth },
      { icon: 'ethnicity', label: '民族', value: basic.ethnicity },
      { icon: 'maritalStatus', label: '婚姻状况', value: basic.maritalStatus },
      { icon: 'politicalStatus', label: '政治面貌', value: basic.politicalStatus },
      { icon: 'height', label: '身高', value: basic.height },
      { icon: 'weight', label: '体重', value: basic.weight },
      ...(basic.customFields ?? []),
    ] as { icon?: ContactIcon; label: string; value?: string }[]).filter(
      (row): row is { icon?: ContactIcon; label: string; value: string } => Boolean(row.value),
    );
    const grid = rows.length
      ? `<div class="r-meta r-meta-grid">${rows
          .map(
            ({ icon, label, value }) =>
              `<span class="r-contact">${icon ? contactIcon(icon) : ''}<em>${escapeHtml(spacedLabel(label))}</em><span>${escapeHtml(value)}</span></span>`,
          )
          .join('')}</div>`
      : '';
    const html = [
      '<div class="r-intro">',
      showPhoto ? `<div class="r-intro-photo">${photo}</div>` : '',
      '<div class="r-intro-main">',
      `<h1>${escapeHtml(name)}</h1>`,
      intentLine ? `<p class="r-intent">${escapeHtml(intentLine)}</p>` : '',
      grid,
      '</div>',
      '</div>',
    ].join('');
    return {
      id: 'header',
      kind: 'header',
      keepWithNext: false,
      html,
      plainText: [name, intentLine, ...rows.map(row => `${row.label}${row.value}`)].filter(Boolean).join(' '),
    };
  }

  const extras: { icon?: ContactIcon; label: string; value?: string }[] = [
    { icon: 'birthMonth', label: '出生年月', value: basic.birthMonth },
    { icon: 'age', label: '年龄', value: basic.birthMonth ? ageFromBirthMonth(basic.birthMonth) : basic.age },
    { icon: 'nativePlace', label: '籍贯', value: basic.nativePlace },
    { icon: 'ethnicity', label: '民族', value: basic.ethnicity },
    { icon: 'maritalStatus', label: '婚姻状况', value: basic.maritalStatus },
    { icon: 'politicalStatus', label: '政治面貌', value: basic.politicalStatus },
    { icon: 'height', label: '身高', value: basic.height },
    { icon: 'weight', label: '体重', value: basic.weight },
    ...(basic.customFields ?? []).map(pair => ({ label: pair.label, value: pair.value })),
  ];
  const extraLine = extras.filter(({ value }) => value).map(({ icon, label, value }) =>
    `<span class="r-contact">${icon ? contactIcon(icon) : ''}<em>${escapeHtml(label)}</em><span>${escapeHtml(value ?? '')}</span></span>`,
  ).join('');
  const html = [
    '<div class="r-intro">',
    showPhoto ? `<div class="r-intro-photo">${photo}</div>` : '',
    '<div class="r-intro-main">',
    `<h1>${escapeHtml(name)}</h1>`,
    intentLine ? `<p class="r-intent">${escapeHtml(intentLine)}</p>` : '',
    metaItems.length
      ? `<div class="r-meta">${metaItems.map(({ key, value }) => `<span class="r-contact">${contactIcon(key)}<span>${escapeHtml(value)}</span></span>`).join('')}</div>`
      : '',
    extraLine ? `<div class="r-meta">${extraLine}</div>` : '',
    '</div>',
    '</div>',
  ].join('');

  return {
    id: 'header',
    kind: 'header',
    keepWithNext: false,
    html,
    plainText: [name, intentLine, ...metaItems.map(item => item.value), ...extras.map(({ value }) => value)].filter(Boolean).join(' '),
  };
}

function recordHasContent(item: ResumeRecordItem): boolean {
  return Boolean(item.title.trim() || item.role.trim() || hasText(item.body));
}

function stampSection(blocks: ResumeBlock[], sectionId: string): ResumeBlock[] {
  for (const block of blocks) block.sectionId = sectionId;
  return blocks;
}

function sectionBlocks(section: ResumeSection, sectionIndex: number, spec: ReturnType<typeof getTemplateSpec>): ResumeBlock[] {
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
      html: `<h2 class="r-section-title" data-section="${escapeHtml(section.id)}"><span class="r-title-text">${escapeHtml(
        section.title,
      )}</span></h2>`,
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
    html: `<h2 class="r-section-title" data-section="${escapeHtml(section.id)}"><span class="r-title-text">${escapeHtml(
      section.title,
    )}</span></h2>`,
    plainText: section.title,
  });

  records.forEach((item, recordIndex) => {
    const range = formatRange(item, Boolean(spec.isoDates));
    const bodyBlocks = richBlocks(item.body, `${prefix}-r${recordIndex}`);
    const hasFollowing = Boolean(item.role.trim() || bodyBlocks.length);

    blocks.push({
      id: `${prefix}-r${recordIndex}-head`,
      kind: 'record-head',
      keepWithNext: hasFollowing,
      html: spec.recordInline
        ? [
            '<div class="r-record r-record-inline">',
            range ? `<span class="r-record-date">${escapeHtml(range)}</span>` : '<span></span>',
            `<span class="r-record-title">${escapeHtml(item.title || '未命名经历')}</span>`,
            item.role.trim() ? `<span class="r-record-role">${escapeHtml(item.role)}</span>` : '<span></span>',
            '</div>',
          ].join('')
        : spec.inlineRole
          ? [
              '<div class="r-record r-record-combo">',
              `<span class="r-record-title">${escapeHtml(item.title || '未命名经历')}</span>`,
              item.role.trim() ? `<span class="r-record-role">· ${escapeHtml(item.role)}</span>` : '',
              range ? `<span class="r-record-date">${escapeHtml(range)}</span>` : '',
              '</div>',
            ].join('')
          : [
              '<div class="r-record">',
              `<span class="r-record-title">${escapeHtml(item.title || '未命名经历')}</span>`,
              range ? `<span class="r-record-date">${escapeHtml(range)}</span>` : '',
              '</div>',
            ].join(''),
      plainText: `${item.title} ${item.role} ${range}`.trim(),
    });

    if (!spec.recordInline && !spec.inlineRole && item.role.trim()) {
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
  const spec = getTemplateSpec(input.appearance.templateId);
  const blocks: ResumeBlock[] = [headerBlock(input)];
  input.document.sections.forEach((section, index) => {
    blocks.push(...sectionBlocks(section, index, spec));
  });
  return blocks;
}
