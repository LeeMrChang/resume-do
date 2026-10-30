import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_SECTION_IDS,
  SAMPLE_DOCUMENT,
  ALL_TEMPLATE_IDS,
  createDefaultAppearance,
  createDefaultDocument,
  ensureCanonicalSections,
  safeParseAppearance,
  safeParseDocument,
} from './index';

test('default document and sample are valid', () => {
  assert.equal(safeParseDocument(createDefaultDocument()).success, true);
  assert.equal(safeParseDocument(SAMPLE_DOCUMENT).success, true);
});

test('default document lists every canonical module in tab order', () => {
  const doc = createDefaultDocument();
  assert.deepEqual(doc.sections.map((section) => section.id), CANONICAL_SECTION_IDS);
  assert.equal(doc.moduleDefaultsApplied, true);
  assert.equal(safeParseDocument(doc).success, true);
});

test('ensureCanonicalSections adds missing modules once without reordering existing ones', () => {
  const legacy = createDefaultDocument();
  legacy.moduleDefaultsApplied = false;
  legacy.sections = legacy.sections.filter((section) => !['application', 'intern', 'honor'].includes(section.id));
  legacy.sections.push({ id: 'custom-2', type: 'rich', title: '自定义模块', visible: true, items: legacy.sections[0].items.slice(0, 1) });
  const merged = ensureCanonicalSections(legacy);
  assert.equal(safeParseDocument(merged).success, true);
  assert.equal(merged.moduleDefaultsApplied, true);
  const ids = merged.sections.map((section) => section.id);
  assert.deepEqual(ids.slice(0, 4), ['application', 'education', 'work', 'skills']);
  assert.ok(ids.includes('application'));
  assert.ok(ids.indexOf('application') < ids.indexOf('education'), 'missing canonical modules fill their canonical position');
  assert.ok(ids.indexOf('intern') < ids.indexOf('campus'));
  assert.equal(ids[ids.length - 1], 'custom-2', 'unknown modules keep their place');
  assert.equal(merged.sections.filter((section) => section.id === 'application')[0].visible, false);
  assert.deepEqual(ensureCanonicalSections(merged).sections.map((section) => section.id), ids, 'merge is idempotent');
});

test('deleted canonical modules stay deleted after defaults are applied', () => {
  const doc = createDefaultDocument();
  doc.sections = doc.sections.filter((section) => !['application', 'intern', 'campus', 'honor', 'hobby'].includes(section.id));
  const next = ensureCanonicalSections(doc);
  assert.deepEqual(next.sections.map((section) => section.id), doc.sections.map((section) => section.id));
  assert.equal(safeParseDocument(next).success, true);
});

test('rejects start month later than end month', () => {
  const doc = structuredClone(SAMPLE_DOCUMENT);
  doc.sections[0].items[0].startMonth = '2020-09';
  doc.sections[0].items[0].endMonth = '2019-06';
  const result = safeParseDocument(doc);
  assert.equal(result.success, false);
});

test('rejects duplicate section ids', () => {
  const doc = structuredClone(SAMPLE_DOCUMENT);
  doc.sections[1].id = doc.sections[0].id;
  const result = safeParseDocument(doc);
  assert.equal(result.success, false);
});

test('default appearance stays inside the agreed ranges', () => {
  const appearance = createDefaultAppearance();
  assert.ok(appearance.fontSize >= 12 && appearance.fontSize <= 16);
  assert.ok(appearance.pageMargin >= 24 && appearance.pageMargin <= 60);
});

test('accepts the expanded template set', () => {
  const base = createDefaultAppearance();
  for (const templateId of ALL_TEMPLATE_IDS) {
    assert.equal(safeParseAppearance({ ...base, templateId }).success, true);
  }
  assert.equal(safeParseAppearance({ ...base, templateId: 'fancy' }).success, false);
});


test('photos accept embedded images only, stay bounded and do not consume text budget', () => {
  const doc = createDefaultDocument();
  doc.basic.photo = 'data:image/png;base64,' + 'A'.repeat(200_000);
  assert.equal(safeParseDocument(doc).success, true);
  doc.basic.photo = 'https://example.com/photo.png';
  assert.equal(safeParseDocument(doc).success, false);
  doc.basic.photo = 'data:image/svg+xml;base64,AAAA';
  assert.equal(safeParseDocument(doc).success, false);
  doc.basic.photo = 'data:image/png;base64,' + 'A'.repeat(400_000);
  assert.equal(safeParseDocument(doc).success, false);
});
