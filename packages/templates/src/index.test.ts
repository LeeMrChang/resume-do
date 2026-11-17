import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_APPEARANCE, SAMPLE_DOCUMENT } from '@resume-do/schema';
import { buildBlocks } from './blocks';
import { getTemplateLayout, splitBlocks } from './layout';
import { paginateBlocks } from './pagination';
import { TEMPLATE_CATALOG, getTemplateSpec } from './catalog';
import { TEMPLATE_IDS, ALL_TEMPLATE_IDS, FONT_IDS } from '@resume-do/schema';
import { getPageMetrics, renderMeasureFragment, renderPagesFragment } from './render';
import { RESUME_CSS } from './styles';
import { sanitizeRichText, richBlocks } from './rich';
import type { ResumeBlock } from './types';

function block(id: string, keepWithNext = false): ResumeBlock {
  return { id, kind: 'paragraph', keepWithNext, html: `<p>${id}</p>`, plainText: id };
}

test('builds a header and skips hidden sections', () => {
  const blocks = buildBlocks({ document: SAMPLE_DOCUMENT, appearance: SAMPLE_APPEARANCE });
  assert.equal(blocks[0].kind, 'header');
  assert.ok(blocks.some((item) => item.kind === 'section'));
  assert.ok(!blocks.some((item) => item.plainText === '实习经验'));
});

test('contact icons use vector paths, omit empty fields and keep text free of font glyphs', () => {
  const document = structuredClone(SAMPLE_DOCUMENT);
  document.basic.phone = '13800000000';
  document.basic.email = '';
  document.basic.birthMonth = '1995-03';
  document.basic.nativePlace = '广东揭阳';
  document.basic.ethnicity = '汉族';
  document.basic.maritalStatus = '未婚';
  document.basic.politicalStatus = '群众';
  document.basic.height = '175cm';
  document.basic.weight = '70kg';
  document.basic.customFields = [{ label: '驾照', value: 'C1' }];
  const header = buildBlocks({ document, appearance: SAMPLE_APPEARANCE })[0];
  assert.match(header.html, /<svg[^>]*data-icon="phone"[^>]*aria-hidden="true"/);
  for (const icon of ['birthMonth', 'age', 'nativePlace', 'ethnicity', 'maritalStatus', 'politicalStatus', 'height', 'weight']) {
    assert.ok(header.html.includes(`data-icon="${icon}"`), `header is missing the ${icon} icon`);
  }
  assert.ok(!header.html.includes('data-icon="email"'));
  assert.match(header.html, /<em>民族<\/em>/);
  assert.match(header.html, /<span class="r-contact"><em>驾照<\/em>/);
  assert.ok(header.plainText.includes('13800000000'));
  assert.ok(!header.plainText.includes('<svg'));
  assert.ok(!/[\uE000-\uF8FF\uFFFD]/u.test(header.html));
});

test('saved field order drives the modern contact line, extras and intent line', () => {
  const document = structuredClone(SAMPLE_DOCUMENT);
  document.basic.gender = '女';
  document.basic.city = '深圳';
  document.basic.phone = '13800000000';
  document.basic.email = 'linxiao@example.com';
  document.basic.nativePlace = '广东揭阳';
  document.basic.height = '170cm';
  document.basic.weight = '55kg';
  document.basic.fieldOrder = ['email', 'phone', 'height', 'gender'];
  document.intent.fieldOrder = ['arrival', 'role'];
  const header = buildBlocks({ document, appearance: SAMPLE_APPEARANCE })[0];

  const iconOrder = [...header.html.matchAll(/data-icon="([^"]+)"/g)].map(match => match[1]);
  assert.ok(iconOrder.indexOf('email') < iconOrder.indexOf('phone'));
  assert.ok(iconOrder.indexOf('phone') < iconOrder.indexOf('gender'));
  assert.ok(iconOrder.indexOf('email') < iconOrder.indexOf('gender'));
  assert.ok(iconOrder.indexOf('height') < iconOrder.indexOf('weight'), 'unlisted fields keep their relative order');
  assert.match(header.html, /一个月内到岗 · Java 开发工程师/);
});

test('classic header follows a saved field order and keeps its default grid otherwise', () => {
  const document = structuredClone(SAMPLE_DOCUMENT);
  document.basic.birthMonth = '1990-01';
  document.basic.age = '35';
  document.basic.nativePlace = '广东揭阳';
  const appearance = { ...SAMPLE_APPEARANCE, templateId: 'imported' as const };

  const plain = buildBlocks({ document, appearance })[0].html.replace(/\u3000/g, '');
  assert.ok(plain.indexOf('年龄') < plain.indexOf('性别'));
  assert.ok(plain.indexOf('性别') < plain.indexOf('籍贯'));

  document.basic.fieldOrder = ['phone', 'email'];
  const ordered = buildBlocks({ document, appearance })[0].html.replace(/\u3000/g, '');
  assert.ok(ordered.indexOf('求职意向') < ordered.indexOf('电话'));
  assert.ok(ordered.indexOf('电话') < ordered.indexOf('邮箱'));
  assert.ok(ordered.indexOf('邮箱') < ordered.indexOf('年龄'));
  assert.match(ordered, /<em>求职意向<\/em><span>Java 开发工程师｜深圳｜面议｜一个月内到岗<\/span>/);
  // The source prints the intent on its own row, above the two-column detail grid.
  assert.match(ordered, /class="r-contact r-intent-row"/);
  assert.match(RESUME_CSS, /\.tpl-imported \.r-meta-grid \.r-intent-row \{[^}]*grid-column: 1 \/ -1/);
});

test('imported template follows a centred, label-free source header', () => {
  const document = structuredClone(SAMPLE_DOCUMENT);
  document.basic.name = '测试甲';
  document.basic.gender = '男';
  document.basic.city = '';
  document.basic.experienceYears = '7年经验';
  document.basic.phone = '13800000000';
  document.basic.email = 'person01@example.invalid';
  document.basic.showPhoto = false;
  document.intent = {
    role: '资深Java工程师/技术负责人',
    city: '深圳',
    salary: '面议',
    arrival: '随时到岗',
    fieldOrder: ['city', 'salary', 'arrival', 'role'],
  };
  document.importStyle = { headerAlign: 'center', metaStyle: 'inline' };
  const appearance = { ...SAMPLE_APPEARANCE, templateId: 'imported' as const };

  const header = buildBlocks({ document, appearance })[0];
  assert.ok(header.html.includes('r-intro-center'));
  assert.ok(!header.html.includes('r-intro-photo'));
  assert.ok(!header.html.includes('r-meta-grid'));
  assert.ok(!header.html.includes('<em>'));
  assert.ok(!header.html.includes('data-icon'));
  assert.ok(header.html.includes('深圳 · 面议 · 随时到岗 · 资深Java工程师/技术负责人'));
  assert.ok(!header.html.includes('求职意向'));
  assert.ok(header.html.includes('男 · 7年经验 · 13800000000 · person01@example.invalid'));
});

test('imported labelled headers keep their cells and print no invented icons or avatar', () => {
  const document = structuredClone(SAMPLE_DOCUMENT);
  document.basic.phone = '13800000000';
  document.basic.birthMonth = '1993-04';
  document.importStyle = { headerAlign: 'left', metaStyle: 'labelled' };
  const appearance = { ...SAMPLE_APPEARANCE, templateId: 'imported' as const };

  const header = buildBlocks({ document, appearance })[0];
  assert.ok(header.html.includes('r-meta-grid'));
  assert.match(header.html, /<em>电\u3000\u3000话<\/em>/);
  assert.ok(!header.html.includes('data-icon'));
  assert.ok(!header.html.includes('r-intro-photo'));
  assert.ok(!header.html.includes('r-intro-center'));
  assert.ok(header.html.includes('出生年月'), 'a printed field stays');
  assert.ok(!header.html.includes('年龄'), 'the skin must not invent a derived field');
});

test('imported dates follow the separator printed in the source', () => {
  const document = structuredClone(SAMPLE_DOCUMENT);
  const appearance = { ...SAMPLE_APPEARANCE, templateId: 'imported' as const };

  const iso = buildBlocks({ document, appearance }).map(item => item.plainText).join('|');
  assert.match(iso, /2016-09 ~ 2020-06/);

  document.importStyle = { dateStyle: 'dot' };
  const dotted = buildBlocks({ document, appearance }).map(item => item.plainText).join('|');
  assert.match(dotted, /2016\.09 — 2020\.06/);
});

test('imported record heads can lead with the date column', () => {
  const document = structuredClone(SAMPLE_DOCUMENT);
  const appearance = { ...SAMPLE_APPEARANCE, templateId: 'imported' as const };

  const tail = buildBlocks({ document, appearance }).find(item => item.kind === 'record-head');
  assert.ok(tail);
  assert.ok(tail.html.indexOf('r-record-title') < tail.html.indexOf('r-record-date'));

  document.importStyle = { recordHead: 'date-first' };
  const first = buildBlocks({ document, appearance }).find(item => item.kind === 'record-head');
  assert.ok(first);
  assert.ok(first.html.includes('r-record-date-first'));
  assert.ok(first.html.indexOf('r-record-date') < first.html.indexOf('r-record-title'));
});

test('a body-only record keeps its body and gets no invented heading', () => {
  const document = structuredClone(SAMPLE_DOCUMENT);
  document.sections = [{
    id: 'notes',
    type: 'records',
    title: '项目经历',
    visible: true,
    items: [{
      id: 'notes-1',
      title: '',
      role: '',
      startMonth: '',
      endMonth: '',
      ongoing: false,
      body: '<p>负责核心链路的稳定性建设。</p>',
    }],
  }];
  const appearance = { ...SAMPLE_APPEARANCE, templateId: 'imported' as const };

  const blocks = buildBlocks({ document, appearance });
  assert.ok(!blocks.some(item => item.kind === 'record-head'));
  assert.ok(!blocks.some(item => item.plainText.includes('未命名经历')));
  assert.ok(blocks.some(item => item.plainText === '负责核心链路的稳定性建设。'));
});

test('imported page style mirrors the source colours, name size and rules', () => {
  const document = structuredClone(SAMPLE_DOCUMENT);
  document.importStyle = {
    nameColor: '#1b2733',
    intentColor: '#2e4a7a',
    metaColor: '#5f6b75',
    sectionTitleColor: '#1b2733',
    headerRule: '#2e4a7a',
    leftRule: '#d4dae4',
    leftRuleStyle: 'solid' as const,
    pageBackground: '#f3f5f9',
    nameSize: 29,
    intentSize: 10.5,
    metaSize: 9.3,
    titleSize: 1.14,
    bulletGap: 10,
    bulletMark: 24,
    bulletIndent: 62,
    recordIndent: 24,
    bodyIndent: 48,
    bodyTextIndent: 26,
    paragraphGap: 27,
    headerIndent: 24,
    recordMark: '#2e4a7a',
  };
  const appearance = { ...SAMPLE_APPEARANCE, templateId: 'imported' as const };
  const input = { document, appearance };

  const html = renderPagesFragment(input, [buildBlocks(input)]);
  assert.match(html, /--r-page-bg:#f3f5f9/);
  assert.match(html, /--r-import-name:#1b2733/);
  assert.match(html, /--r-import-intent:#2e4a7a/);
  assert.match(html, /--r-import-meta:#5f6b75/);
  assert.match(html, /--r-import-title:#1b2733/);
  assert.match(html, /--r-import-header-rule:2px solid #2e4a7a/);
  assert.match(html, /--r-import-left-rule:1px solid #d4dae4/);
  assert.match(html, /--r-import-name-size:29pt/);
  assert.match(html, /--r-import-intent-size:10\.5pt/);
  assert.match(html, /--r-import-meta-size:9\.3pt/);
  assert.match(html, /--r-import-title-size:1.14em/);
  assert.match(html, /--r-import-bullet-gap:10px/);
  assert.match(html, /--r-import-bullet-mark:24px/);
  assert.match(html, /--r-import-bullet-indent:62px/);
  assert.match(html, /--r-import-record-indent:24px/);
  assert.match(html, /--r-import-body-indent:48px/);
  assert.match(html, /--r-import-body-text-indent:26px/);
  assert.match(html, /--r-import-paragraph-gap:27px/);
  assert.match(RESUME_CSS, /\.tpl-imported \.r-block\.r-paragraph \+ \.r-block\.r-paragraph \{[^}]*padding-top:[^}]*paragraph-gap/);
  assert.match(RESUME_CSS, /\.tpl-imported \.r-block\.r-paragraph \+ \.r-block\.r-bullet \{[^}]*--r-import-bullet-gap/);
  assert.match(RESUME_CSS, /\.r-block\.r-record-head \+ \.r-block\.r-paragraph,[^{]*\{[^}]*padding-top: 8px/);
  assert.match(html, /--r-import-header-indent:24px/);
  assert.match(html, /--r-import-record-mark:#2e4a7a/);
  assert.match(RESUME_CSS, /\.r-page\.tpl-imported::before/);
  assert.match(RESUME_CSS, /\.tpl-imported \.r-block\.r-bullet \{\s*padding: 0;/);
  assert.match(RESUME_CSS, /\.tpl-imported \.r-block > \.r-bullet \{[^}]*--r-import-bullet-gap/);
  assert.match(RESUME_CSS, /\.tpl-imported \.r-block > \.r-bullet \.r-mark \{[^}]*--r-import-bullet-mark/);
  assert.match(RESUME_CSS, /\.tpl-imported \.r-block\.r-record-head,[^{]*\{[^}]*--r-import-record-indent/);
  assert.match(RESUME_CSS, /\.tpl-imported \.r-block\.r-paragraph \{[^}]*--r-import-body-indent/);
  assert.match(RESUME_CSS, /\.tpl-imported \.r-block\.r-paragraph \{[^}]*--r-import-body-text-indent/);
  assert.match(RESUME_CSS, /\.tpl-imported \.r-intro \{[^}]*--r-import-header-indent/);
  assert.match(RESUME_CSS, /\.tpl-imported \.r-block\.r-record-head::before \{[^}]*--r-import-record-mark/);
});

test('measures a scaled import with the same font the page prints', () => {
  const document = structuredClone(SAMPLE_DOCUMENT);
  document.importStyle = { fontSizePx: 14.52 };
  const appearance = { ...SAMPLE_APPEARANCE, templateId: 'imported' as const, fontSize: 15 };
  const input = { document, appearance };
  const blocks = buildBlocks(input);
  const { main } = splitBlocks(blocks, getTemplateLayout(appearance.templateId));

  const measure = renderMeasureFragment(input, main);
  assert.match(measure, /--r-font-size:14\.52px/);
  assert.match(measure, /font-size:var\(--r-font-size\)/);
  assert.doesNotMatch(measure, /font-size:15px/);
  assert.match(measure, /line-height:var\(--r-line-height\)/);
});

test('uses an edited body size instead of the imported fractional size', () => {
  const document = structuredClone(SAMPLE_DOCUMENT);
  document.importStyle = { fontSizePx: 14.52 };
  const appearance = { ...SAMPLE_APPEARANCE, templateId: 'imported' as const, fontSize: 18 };
  const input = { document, appearance };
  const blocks = buildBlocks(input);

  for (const html of [renderMeasureFragment(input, blocks), renderPagesFragment(input, [blocks])]) {
    assert.match(html, /--r-font-size:18px/);
    assert.doesNotMatch(html, /--r-font-size:14\.52px/);
  }
});

test('keeps source precision when its body size rounds outside the editor range', () => {
  const document = structuredClone(SAMPLE_DOCUMENT);
  for (const [fontSizePx, fontSize] of [[9.6, 12], [24, 20]]) {
    document.importStyle = { fontSizePx };
    const input = { document, appearance: { ...SAMPLE_APPEARANCE, templateId: 'imported' as const, fontSize } };
    assert.ok(renderMeasureFragment(input, buildBlocks(input)).includes(`--r-font-size:${fontSizePx}px`));
  }
});

test('sanitizes scripts, event handlers and unsafe links', () => {
  const clean = sanitizeRichText(
    '<p onclick="alert(1)">Hello<script>alert(1)</script><a href="javascript:alert(1)">x</a></p>',
  );
  assert.ok(!clean.includes('script'));
  assert.ok(!clean.includes('onclick'));
  assert.ok(!clean.includes('javascript:'));
  assert.ok(clean.includes('Hello'));
});

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('keeps whitelisted font size, color and alignment styles', () => {
  const clean = sanitizeRichText(
    '<p style="text-align: center"><span style="font-size: 18px; color: #1f6feb">标题</span></p>' +
      '<p style="text-align: right"><span style="font-size: 99px; color: red">红色</span></p>',
  );
  assert.match(clean, /text-align:\s*center/);
  assert.match(clean, /font-size:\s*18px/);
  assert.match(clean, /color:\s*#1f6feb/);
  assert.match(clean, /text-align:\s*right/);
  assert.doesNotMatch(clean, /99px/);
  assert.doesNotMatch(clean, /color: red/);
});

test('keeps inline image data and drops external or malformed sources', () => {
  const clean = sanitizeRichText(
    `<p><img src="${PNG}" width="320" height="180" alt="示意图"></p>` +
      '<p><img src="https://example.com/a.png" width="320" height="180"></p>' +
      '<p><img src="data:image/svg+xml;base64,PHN2Zz4=" onerror="alert(1)"></p>',
  );
  assert.match(clean, /<img[^>]*src="data:image\/png;base64,/);
  assert.match(clean, /width="320"/);
  assert.match(clean, /height="180"/);
  assert.doesNotMatch(clean, /example\.com/);
  assert.doesNotMatch(clean, /svg\+xml/);
  assert.doesNotMatch(clean, /onerror/);
});

test('renders alignment and image-only paragraphs in the resume body', () => {
  const blocks = richBlocks(
    `<p style="text-align: center">居中段落</p><p><img src="${PNG}" width="320" height="180"></p>`,
    'x',
  );
  assert.equal(blocks.length, 2);
  assert.match(blocks[0].html, /class="r-paragraph" style="text-align: center"/);
  assert.equal(blocks[0].plainText, '居中段落');
  assert.match(blocks[1].html, /<img[^>]*width="320"/);
});

test('turns lists into bullet blocks', () => {  const blocks = richBlocks('<ul><li>one</li><li>two</li></ul>', 'x');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].kind, 'bullet');
  assert.ok(blocks[0].html.includes('r-mark'));
});

test('turns text bullets from imported documents into bullet blocks', () => {
  const blocks = richBlocks('<p>· 负责模块A</p><p>普通段落</p>', 'x');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].kind, 'bullet');
  assert.ok(blocks[0].html.includes('r-mark'));
  assert.ok(blocks[0].html.includes('•'));
  assert.equal(blocks[1].kind, 'paragraph');
});

test('moves a keep-with-next heading off the page bottom', () => {
  const blocks = [block('header'), block('heading', true), block('first'), block('second')];
  const result = paginateBlocks(blocks, [100, 50, 20, 20], 120);
  assert.deepEqual(result.pages, [[0], [1, 2, 3]]);
  assert.deepEqual(result.overflow, []);
});

test('keeps a chained heading, role and first body line together', () => {
  const blocks = [
    block('header'),
    block('record-head', true),
    block('role', true),
    block('first-line'),
  ];
  const result = paginateBlocks(blocks, [80, 20, 10, 30], 100);
  assert.deepEqual(result.pages, [[0], [1, 2, 3]]);
});

test('flags a single block taller than the page', () => {
  const result = paginateBlocks([block('long')], [200], 100);
  assert.deepEqual(result.pages, [[0]]);
  assert.deepEqual(result.overflow, [0]);
});

test('sidebar layout moves the header into the aside column', () => {
  const blocks = buildBlocks({ document: SAMPLE_DOCUMENT, appearance: SAMPLE_APPEARANCE });
  const sidebar = splitBlocks(blocks, getTemplateLayout('sidebar'));
  assert.ok(sidebar.aside.some(item => item.id === 'header'));
  assert.ok(sidebar.aside.some(item => item.sectionId === 'skills'));
  assert.ok(sidebar.main.every(item => item.sectionId !== 'skills'));
  assert.equal(sidebar.aside.length + sidebar.main.length, blocks.length);
  assert.ok(sidebar.main.every((item) => item.kind !== 'header'));

  const single = splitBlocks(blocks, getTemplateLayout('clean'));
  assert.equal(single.aside.length, 0);
  assert.equal(single.main.length, blocks.length);
});

test('sidebar metrics reserve a narrower main column and taller content area', () => {
  const clean = getPageMetrics({ ...SAMPLE_APPEARANCE, templateId: 'clean' });
  const sidebar = getPageMetrics({ ...SAMPLE_APPEARANCE, templateId: 'sidebar' });
  assert.ok(sidebar.contentWidthPx < clean.contentWidthPx - 200);
  assert.ok(sidebar.contentWidthPx > 400);
  assert.ok(sidebar.contentHeightPx > clean.contentHeightPx);
});

test('sidebar pages render the aside once per page with footers', () => {
  const input = { document: SAMPLE_DOCUMENT, appearance: { ...SAMPLE_APPEARANCE, templateId: 'sidebar' as const } };
  const blocks = buildBlocks(input);
  const { aside, main } = splitBlocks(blocks, getTemplateLayout('sidebar'));
  const html = renderPagesFragment(input, [main], aside);
  assert.ok(html.includes('class="r-sidebar"'));
  assert.ok(html.includes('r-page tpl-1030 layout-sidebar'));
  assert.ok(html.includes('1 / 1'));

  const cleanHtml = renderPagesFragment({ ...input, appearance: SAMPLE_APPEARANCE }, [blocks]);
  assert.ok(!cleanHtml.includes('class="r-sidebar"'));
});


test('imported template mirrors source layout: labelled meta grid, inline record row, no footer', () => {
  const document = structuredClone(SAMPLE_DOCUMENT);
  document.basic.age = '31岁';
  document.basic.gender = '男';
  document.basic.nativePlace = '广东揭阳';
  document.basic.experienceYears = '7年经验';
  document.basic.phone = '13800000000';
  document.basic.email = 'person01@example.invalid';
  document.basic.showPhoto = false;
  const work = document.sections.find(section => section.id === 'work')!;
  work.items = [
    { id: 'w1', title: '某公司', role: 'Java工程师', startMonth: '2024-03', endMonth: '2026-03', ongoing: false, body: '<p>职责</p>' },
  ];
  const appearance = {
    ...SAMPLE_APPEARANCE,
    templateId: 'imported' as const,
    themeColor: '#67a886',
    fontSize: 14,
    lineHeight: 2,
    sectionGap: 20,
    pageMargin: 32,
  };
  const blocks = buildBlocks({ document, appearance });
  const header = blocks[0];
  assert.match(header.html, /r-meta-grid/);
  const flatHeader = header.html.replace(/\u3000/g, '');
  for (const label of ['年龄', '性别', '籍贯', '工作年限', '电话', '邮箱']) {
    assert.ok(flatHeader.includes(label), `meta grid missing ${label}`);
  }
  assert.ok(header.html.includes('广东揭阳'));
  const head = blocks.find(item => item.kind === 'record-head' && item.sectionId === 'work')!;
  assert.ok(head.html.includes('某公司'));
  assert.ok(head.html.includes('Java工程师'));
  assert.ok(head.html.includes('2024-03 ~ 2026-03'));
  assert.ok(head.html.indexOf('某公司') < head.html.indexOf('Java工程师'));
  assert.ok(head.html.indexOf('Java工程师') < head.html.indexOf('2024-03'));
  assert.ok(!blocks.some(item => item.kind === 'role' && item.sectionId === 'work'));

  const html = renderPagesFragment({ document, appearance }, [blocks]);
  assert.ok(html.includes('hdr-classic'));
  assert.ok(html.includes('sec-classic'));
  assert.ok(html.includes('tpl-imported'));
  assert.ok(!html.includes('class="r-footer"'));
  assert.equal(getPageMetrics(appearance).footerReservePx, 0);
});

test('catalog covers all 259 reference IDs plus the imported template, and legacy IDs resolve', () => {
  assert.equal(TEMPLATE_IDS.length, 259);
  assert.equal(TEMPLATE_CATALOG.length, 260);
  assert.equal(new Set(TEMPLATE_CATALOG.map(spec => spec.id)).size, 260);
  assert.deepEqual(
    [...TEMPLATE_CATALOG.map(spec => spec.id)].sort(),
    [...TEMPLATE_IDS, 'imported'].sort(),
  );
  for (const id of ALL_TEMPLATE_IDS) {
    const spec = getTemplateSpec(id);
    const input = { document: SAMPLE_DOCUMENT, appearance: { ...SAMPLE_APPEARANCE, templateId: id } };
    const blocks = buildBlocks(input);
    const { aside, main } = splitBlocks(blocks, getTemplateLayout(id));
    const html = renderPagesFragment(input, [main], aside);
    assert.ok(html.includes(`tpl-${spec.id}`));
    assert.ok(getPageMetrics(input.appearance).contentWidthPx > 350);
    assert.equal(aside.length + main.length, blocks.length);
  }
});

test('oversized heading chain is reported instead of exporting orphan pages', () => {
  const blocks = [block('header'), block('section', true), block('record', true), block('role', true), block('body')];
  const result = paginateBlocks(blocks, [50, 20, 20, 10, 80], 100);
  assert.deepEqual(result.pages, [[0], [1, 2, 3, 4]]);
  assert.deepEqual(result.overflow, [1]);
});

test('empty body and trailing keep flag do not add nonexistent indexes', () => {
  assert.deepEqual(paginateBlocks([block('title', true)], [20], 100), { pages: [[0]], overflow: [] });
});


test('all catalog skins have distinct visual configuration, not duplicate IDs only', () => {
  const styles = TEMPLATE_CATALOG.map(({ id, referenceId, name, group, ...style }) => JSON.stringify(style));
  assert.equal(new Set(styles).size, TEMPLATE_CATALOG.length);
});


test('preserves contentEditable paragraphs and inline whitespace after reload', () => {
  const clean = sanitizeRichText('第一行<div>第二行 <b>加粗</b> 结尾</div><div><br></div><div>第三行</div>');
  assert.equal(clean, '第一行<p>第二行 <b>加粗</b> 结尾</p><p><br /></p><p>第三行</p>');
  assert.equal(sanitizeRichText(clean), clean);
  assert.deepEqual(richBlocks(clean, 'reload').map(b => b.plainText), ['第一行', '第二行 加粗 结尾', '第三行']);
});

test('every typeface id has a font stack and reaches the page class', () => {
  for (const fontId of FONT_IDS) {
    assert.ok(RESUME_CSS.includes(`.font-${fontId}`), fontId);
  }
  const html = renderPagesFragment(
    { document: SAMPLE_DOCUMENT, appearance: { ...SAMPLE_APPEARANCE, fontId: 'lxgw-wenkai' } },
    [[]],
  );
  assert.ok(html.includes('font-lxgw-wenkai'));
});

test('record gap reaches the page style and the stylesheet', () => {
  const html = renderPagesFragment(
    { document: SAMPLE_DOCUMENT, appearance: { ...SAMPLE_APPEARANCE, recordGap: 9 } },
    [[]],
  );
  assert.ok(html.includes('--r-record-gap:9px'));
  assert.ok(RESUME_CSS.includes('padding-bottom: var(--r-record-gap'));
});

test('section title tint is opt-in per page', () => {
  const plain = renderPagesFragment({ document: SAMPLE_DOCUMENT, appearance: SAMPLE_APPEARANCE }, [[]]);
  assert.ok(!plain.includes(' title-tint'));
  const tinted = renderPagesFragment(
    {
      document: SAMPLE_DOCUMENT,
      appearance: { ...SAMPLE_APPEARANCE, sectionTitleTint: true, sectionTitleTintColor: '#e5f1e5' },
    },
    [[]],
  );
  assert.ok(tinted.includes(' title-tint'));
  assert.ok(tinted.includes('--r-title-tint:#e5f1e5'));
  assert.ok(RESUME_CSS.includes('background: var(--r-title-tint)'));
});
