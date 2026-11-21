import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultAppearance, createDefaultDocument, emptyRecordItem } from '@resume-do/schema';
import type { ResumeDocument } from '@resume-do/schema';
import type { ImportDraft } from '../src/api';
import { moveImportItem, validateImportDraft } from '../src/importDraft';

function sectionIndex(document: ResumeDocument, id: string): number {
  const index = document.sections.findIndex((section) => section.id === id);
  assert.ok(index >= 0, `missing section ${id}`);
  return index;
}

function draft(): ImportDraft {
  const document = createDefaultDocument();
  document.sections[sectionIndex(document, 'work')].items = [{ ...emptyRecordItem(), title: '甲公司', role: '工程师', startMonth: '2020-01', endMonth: '2022-02', body: '<p>原正文</p>' }];
  return { title: '导入', document, appearance: createDefaultAppearance() };
}

test('moving an experience to rich text preserves facts and does not mutate original draft', () => {
  const original = draft();
  const work = sectionIndex(original.document, 'work');
  const skills = sectionIndex(original.document, 'skills');
  const next = moveImportItem(original, work, 0, skills);
  assert.equal(original.document.sections[work].items.length, 1);
  assert.equal(next.document.sections[work].items.length, 0);
  assert.match(next.document.sections[skills].items[0].body, /甲公司/);
  assert.match(next.document.sections[skills].items[0].body, /工程师/);
  assert.match(next.document.sections[skills].items[0].body, /2020-01 — 2022-02/);
  assert.match(next.document.sections[skills].items[0].body, /原正文/);
});

test('moving between record modules retains identity, dates and original text', () => {
  const original = draft();
  const work = sectionIndex(original.document, 'work');
  const project = sectionIndex(original.document, 'project');
  const next = moveImportItem(original, work, 0, project);
  assert.deepEqual(next.document.sections[project].items.at(-1), original.document.sections[work].items[0]);
});

test('oversize merge fails without dropping or changing the source', () => {
  const original = draft();
  const work = sectionIndex(original.document, 'work');
  const skills = sectionIndex(original.document, 'skills');
  original.document.sections[skills].items[0].body = 'x'.repeat(20_000);
  assert.throws(() => moveImportItem(original, work, 0, skills), /20000/);
  assert.equal(original.document.sections[work].items[0].title, '甲公司');
});


test('confirmation reports the module and entry of an invalid date without changing the draft', () => {
  const original = draft();
  const work = sectionIndex(original.document, 'work');
  original.document.sections[work].items[0].endMonth = '2019-01';
  assert.throws(() => validateImportDraft(original), /工作经历 第 1 条/);
  assert.equal(original.document.sections[work].items[0].endMonth, '2019-01');
});
