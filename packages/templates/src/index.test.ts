import test from 'node:test';
import assert from 'node:assert/strict';
import { SAMPLE_APPEARANCE, SAMPLE_DOCUMENT } from '@resume-do/schema';
import { buildBlocks } from './blocks';
import { getTemplateLayout, splitBlocks } from './layout';
import { paginateBlocks } from './pagination';
import { TEMPLATE_CATALOG, getTemplateSpec } from './catalog';
import { TEMPLATE_IDS, ALL_TEMPLATE_IDS } from '@resume-do/schema';
import { getPageMetrics, renderPagesFragment } from './render';
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

test('sanitizes scripts, event handlers and unsafe links', () => {
  const clean = sanitizeRichText(
    '<p onclick="alert(1)">Hello<script>alert(1)</script><a href="javascript:alert(1)">x</a></p>',
  );
  assert.ok(!clean.includes('script'));
  assert.ok(!clean.includes('onclick'));
  assert.ok(!clean.includes('javascript:'));
  assert.ok(clean.includes('Hello'));
});

test('turns lists into bullet blocks', () => {
  const blocks = richBlocks('<ul><li>one</li><li>two</li></ul>', 'x');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].kind, 'bullet');
  assert.ok(blocks[0].html.includes('r-mark'));
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


test('catalog covers all 59 reference IDs and legacy IDs resolve', () => {
  assert.equal(TEMPLATE_CATALOG.length, 59);
  assert.equal(new Set(TEMPLATE_CATALOG.map(spec => spec.id)).size, 59);
  assert.deepEqual([...TEMPLATE_CATALOG.map(spec => spec.id)].sort(), [...TEMPLATE_IDS].sort());
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


test('all 59 skins have distinct visual configuration, not duplicate IDs only', () => {
  const styles = TEMPLATE_CATALOG.map(({ id, referenceId, name, group, ...style }) => JSON.stringify(style));
  assert.equal(new Set(styles).size, 59);
});
