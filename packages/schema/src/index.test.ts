import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASIC_FIELD_KEYS,
  CANONICAL_SECTION_IDS,
  FONT_IDS,
  INTENT_FIELD_KEYS,
  SAMPLE_DOCUMENT,
  ALL_TEMPLATE_IDS,
  basicFieldOrder,
  createDefaultAppearance,
  createDefaultDocument,
  createSampleDocument,
  ensureCanonicalSections,
  intentFieldOrder,
  isBlankDocument,
  orderFields,
  safeParseAppearance,
  safeParseDocument,
  totalTextLength,
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

test('blank documents can be seeded with a detached sample copy', () => {
  assert.equal(isBlankDocument(createDefaultDocument()), true);
  assert.equal(isBlankDocument(SAMPLE_DOCUMENT), false);

  const seeded = createSampleDocument();
  assert.equal(safeParseDocument(seeded).success, true);
  assert.equal(seeded.sections[0].id, 'application', 'missing canonical modules are filled in');
  assert.ok(seeded.sections.some((section) => section.id === 'education'));

  seeded.basic.name = '张三';
  seeded.sections[1].items[0].title = '我的学校';
  assert.equal(SAMPLE_DOCUMENT.basic.name, '林晓', 'sample constant must stay untouched');
  assert.notEqual(SAMPLE_DOCUMENT.sections[1].items[0].title, '我的学校');
});

test('documents with typed content are not blank', () => {
  const withName = createDefaultDocument();
  withName.basic.name = '张三';
  assert.equal(isBlankDocument(withName), false);

  const withIntent = createDefaultDocument();
  withIntent.intent.role = '后端工程师';
  assert.equal(isBlankDocument(withIntent), false);

  const withBody = createDefaultDocument();
  withBody.sections[1].items[0].body = '<p>做过一个小项目。</p>';
  assert.equal(isBlankDocument(withBody), false);
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
  assert.ok(appearance.recordGap >= 0 && appearance.recordGap <= 16);
  assert.ok(appearance.pageMargin >= 24 && appearance.pageMargin <= 60);
  assert.equal(appearance.sectionTitleTint, false);
  assert.match(appearance.sectionTitleTintColor, /^#[0-9a-fA-F]{6}$/);
  const tinted = safeParseAppearance({ ...appearance, sectionTitleTint: true, sectionTitleTintColor: '#e5f1e5' });
  assert.equal(tinted.success, true);
  assert.equal(safeParseAppearance({ ...appearance, sectionTitleTintColor: 'green' }).success, false);
});

test('accepts the expanded template set', () => {
  const base = createDefaultAppearance();
  for (const templateId of ALL_TEMPLATE_IDS) {
    assert.equal(safeParseAppearance({ ...base, templateId }).success, true);
  }
  assert.equal(safeParseAppearance({ ...base, templateId: 'fancy' }).success, false);
});

test('accepts system and bundled typefaces', () => {
  const base = createDefaultAppearance();
  for (const fontId of FONT_IDS) {
    assert.equal(safeParseAppearance({ ...base, fontId }).success, true);
  }
  assert.equal(safeParseAppearance({ ...base, fontId: 'comic' }).success, false);
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

test('field order keeps every field once and preserves canonical positions for unknowns', () => {
  assert.deepEqual(orderFields(['a', 'b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(orderFields(['a', 'b', 'c'], ['c', 'a']), ['c', 'a', 'b']);
  assert.deepEqual(orderFields(['a', 'b', 'c'], ['c', 'a', 'c']), ['c', 'a', 'b'], 'duplicates do not break the sort');
  assert.deepEqual(orderFields(['a', 'b', 'c'], ['x', 'b']), ['b', 'a', 'c'], 'unknown keys are ignored');
  assert.deepEqual(basicFieldOrder({}), [...BASIC_FIELD_KEYS]);
  assert.deepEqual(intentFieldOrder({}), [...INTENT_FIELD_KEYS]);
  assert.deepEqual(
    basicFieldOrder({ fieldOrder: ['phone', 'gender'] }),
    ['phone', 'gender', ...BASIC_FIELD_KEYS.filter((key) => key !== 'phone' && key !== 'gender')],
  );
});

test('field order round-trips through the document schema without changing the text budget', () => {
  const doc = createDefaultDocument();
  doc.basic.fieldOrder = ['email', 'phone', 'gender'];
  doc.basic.email = 'a@b.co';
  doc.intent.fieldOrder = ['salary', 'role'];
  doc.intent.salary = '面议';
  const parsed = safeParseDocument(doc);
  assert.equal(parsed.success, true);
  assert.deepEqual(parsed.success && parsed.data.basic.fieldOrder, ['email', 'phone', 'gender']);
  assert.deepEqual(parsed.success && parsed.data.intent.fieldOrder, ['salary', 'role']);
  const withoutOrder = createDefaultDocument();
  withoutOrder.basic.email = 'a@b.co';
  withoutOrder.intent.salary = '面议';
  assert.equal(totalTextLength(doc), totalTextLength(withoutOrder), 'order keys must not count as resume text');
  assert.equal(
    safeParseDocument({ ...doc, basic: { ...doc.basic, fieldOrder: ['nope'] } }).success,
    false,
  );
  assert.equal(
    safeParseDocument({ ...doc, intent: { ...doc.intent, fieldOrder: ['role', 'role'] } }).success,
    false,
  );
});
