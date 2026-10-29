import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAMPLE_DOCUMENT,
  ALL_TEMPLATE_IDS,
  createDefaultAppearance,
  createDefaultDocument,
  safeParseAppearance,
  safeParseDocument,
} from './index';

test('default document and sample are valid', () => {
  assert.equal(safeParseDocument(createDefaultDocument()).success, true);
  assert.equal(safeParseDocument(SAMPLE_DOCUMENT).success, true);
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
