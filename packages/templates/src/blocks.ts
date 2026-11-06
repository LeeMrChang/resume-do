import type {
  BasicFieldKey,
  ResumeBasic,
  ResumeDocument,
  ResumeRecordItem,
  ResumeSection,
} from '@resume-do/schema';
import { stripTags, ageFromBirthMonth, basicFieldOrder, intentFieldOrder } from '@resume-do/schema';
import { getTemplateSpec } from './catalog';
import { escapeHtml, richBlocks } from './rich';
import type { RenderInput, ResumeBlock } from './types';
import { contactIcon, type ContactIcon } from './icons';

const BASIC_LABELS: Record<BasicFieldKey, string> = {
  gender: '性别',
  city: '城市',
  experienceYears: '工作年限',
  phone: '电话',
  email: '邮箱',
  birthMonth: '出生年月',
  age: '年龄',
  nativePlace: '籍贯',
  ethnicity: '民族',
  maritalStatus: '婚姻状况',
  politicalStatus: '政治面貌',
  height: '身高',
  weight: '体重',
};

/** The compact top line used by every non-classic header. */
const MODERN_META_KEYS: ReadonlySet<BasicFieldKey> = new Set([
  'gender',
  'city',
  'experienceYears',
  'phone',
  'email',
]);

/** Classic grid order when the user has not customised it. */
const CLASSIC_ROW_KEYS: readonly BasicFieldKey[] = [
  'age',
  'gender',
  'nativePlace',
  'experienceYears',
  'phone',
  'email',
  'city',
  'birthMonth',
  'ethnicity',
  'maritalStatus',
  'politicalStatus',
  'height',
  'weight',
];

function basicValue(basic: ResumeBasic, key: BasicFieldKey, deriveAge = true): string {
  if (key === 'age') {
    if (deriveAge && basic.birthMonth) return ageFromBirthMonth(basic.birthMonth);
    return basic.age ?? '';
  }
  return basic[key] ?? '';
}

function basicEntry(basic: ResumeBasic, key: BasicFieldKey, deriveAge = true) {
  return { icon: key as ContactIcon, label: BASIC_LABELS[key], value: basicValue(basic, key, deriveAge) };
}

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

function formatRange(item: ResumeRecordItem, style: 'iso' | 'dotted'): string {
  if (style === 'iso') {
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
  const importStyle = spec.id === 'imported' ? document.importStyle : undefined;
  const inlineMeta = importStyle?.metaStyle === 'inline';
  const centeredHeader = importStyle?.headerAlign === 'center';
  const showIcons = spec.id !== 'imported';
  const intentValues = intentFieldOrder(intent).map(key => intent[key]).filter(Boolean);
  const intentLine = classic && !inlineMeta ? '' : intentValues.join(' · ');
  const basicKeys = basicFieldOrder(basic);
  const metaItems = basicKeys
    .filter(key => MODERN_META_KEYS.has(key))
    .flatMap(key => {
      const value = basic[key];
      return value ? [{ key, value }] : [];
    });
  // The imported skin never invents an avatar: a source without a photo has no photo slot.
  const showPhoto =
    spec.photo !== false && basic.showPhoto !== false && (Boolean(basic.photo) || spec.id !== 'imported');
  const name = basic.name || '你的姓名';
  const initial = Array.from(name)[0] ?? '简';
  const photo = basic.photo
    ? `<img src="${escapeHtml(basic.photo)}" alt="${escapeHtml(name)}" />`
    : `<span class="r-initial">${escapeHtml(initial)}</span>`;

  if (classic) {
    const rowKeys = Array.isArray(basic.fieldOrder) && basic.fieldOrder.length ? basicKeys : CLASSIC_ROW_KEYS;
    // Labelled sources print 求职意向 as one of their label/value cells.
    const intentRow = !inlineMeta && intentValues.length
      ? [{ label: '求职意向', value: intentValues.join('｜') }]
      : [];
    const rows = ([
      // The source prints 求职意向 above the personal details.
      ...(spec.id === 'imported' ? intentRow : []),
      ...rowKeys.map(key => basicEntry(basic, key, spec.id !== 'imported')),
      ...(basic.customFields ?? []),
      ...(spec.id === 'imported' ? [] : intentRow),
    ] as { icon?: ContactIcon; label: string; value?: string }[]).filter(
      (row): row is { icon?: ContactIcon; label: string; value: string } => Boolean(row.value),
    );
    const grid = rows.length
      ? `<div class="r-meta r-meta-grid">${rows
          .map(
            ({ icon, label, value }) =>
              `<span class="r-contact${spec.id === 'imported' && label === '求职意向' ? ' r-intent-row' : ''}">${icon && showIcons ? contactIcon(icon) : ''}<em>${escapeHtml(spacedLabel(label))}</em><span>${escapeHtml(value)}</span></span>`,
          )
          .join('')}</div>`
      : '';
    const meta =
      inlineMeta && rows.length
        ? `<div class="r-meta r-meta-inline"><span>${escapeHtml(rows.map(row => row.value).join(' · '))}</span></div>`
        : grid;
    const introClass = centeredHeader ? 'r-intro r-intro-center' : 'r-intro';
    const html = [
      `<div class="${introClass}">`,
      showPhoto ? `<div class="r-intro-photo">${photo}</div>` : '',
      '<div class="r-intro-main">',
      `<h1>${escapeHtml(name)}</h1>`,
      intentLine ? `<p class="r-intent">${escapeHtml(intentLine)}</p>` : '',
      meta,
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
    ...basicKeys.filter(key => !MODERN_META_KEYS.has(key)).map(key => basicEntry(basic, key)),
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

function sectionBlocks(
  section: ResumeSection,
  sectionIndex: number,
  spec: ReturnType<typeof getTemplateSpec>,
  importStyle: ResumeDocument['importStyle'],
): ResumeBlock[] {
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
    const range = formatRange(
      item,
      spec.isoDates && importStyle?.dateStyle !== 'dot' ? 'iso' : 'dotted',
    );
    const bodyBlocks = richBlocks(item.body, `${prefix}-r${recordIndex}`);
    const hasFollowing = Boolean(item.role.trim() || bodyBlocks.length);
    const dateFirst = importStyle?.recordHead === 'date-first';
    const title = item.title.trim()
      ? `<span class="r-record-title">${escapeHtml(item.title)}</span>`
      : '';
    const role = item.role.trim() ? `<span class="r-record-role">${escapeHtml(item.role)}</span>` : '';
    const date = range ? `<span class="r-record-date">${escapeHtml(range)}</span>` : '';

    // A body-only entry has no heading in the source, so the template must not invent one.
    if (title || role || date) {
      blocks.push({
        id: `${prefix}-r${recordIndex}-head`,
        kind: 'record-head',
        keepWithNext: hasFollowing,
        html: spec.recordInline
          ? dateFirst
            ? `<div class="r-record r-record-inline r-record-date-first">${date}${title}${role}</div>`
            : `<div class="r-record r-record-inline">${title}${role}${date}</div>`
          : spec.inlineRole
            ? `<div class="r-record r-record-combo">${title}${role ? `<span class="r-record-role">· ${escapeHtml(item.role)}</span>` : ''}${date}</div>`
            : `<div class="r-record">${title}${date}</div>`,
        plainText: `${item.title} ${item.role} ${range}`.trim(),
      });
    }

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
  const importStyle = spec.id === 'imported' ? input.document.importStyle : undefined;
  const blocks: ResumeBlock[] = [headerBlock(input)];
  input.document.sections.forEach((section, index) => {
    blocks.push(...sectionBlocks(section, index, spec, importStyle));
  });
  return blocks;
}
