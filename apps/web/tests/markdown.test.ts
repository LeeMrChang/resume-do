import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertInlineText,
  inlineMarkdownAtEnd,
  inlineMarkdownToHtml,
  listMarkerAtEnd,
  looksLikeMarkdown,
  markdownToHtml,
} from '../src/markdown';

test('converts bold, italic and links', () => {
  assert.equal(inlineMarkdownToHtml('**项目背景**'), '<strong>项目背景</strong>');
  assert.equal(inlineMarkdownToHtml('__重点__'), '<strong>重点</strong>');
  assert.equal(inlineMarkdownToHtml('*斜体*'), '<em>斜体</em>');
  assert.equal(inlineMarkdownToHtml('_斜体_'), '<em>斜体</em>');
  assert.equal(
    inlineMarkdownToHtml('见[官网](https://example.com/a?b=1)'),
    '见<a href="https://example.com/a?b=1" rel="noopener noreferrer">官网</a>',
  );
});

test('escapes html and rejects non-http links', () => {
  assert.equal(inlineMarkdownToHtml('<b>x</b>'), '&lt;b&gt;x&lt;/b&gt;');
  assert.equal(
    inlineMarkdownToHtml('[x](javascript:alert(1))'),
    '[x](javascript:alert(1))',
  );
});

test('does not mistake identifiers or spaced asterisks for emphasis', () => {
  assert.equal(inlineMarkdownToHtml('snake_case_name'), 'snake_case_name');
  assert.equal(inlineMarkdownToHtml('a * b * c'), 'a * b * c');
  assert.equal(inlineMarkdownToHtml('** 空 **'), '** 空 **');
});

test('detects inline markdown ending at the caret', () => {
  assert.deepEqual(inlineMarkdownAtEnd('**加粗**'), { start: 0, html: '<strong>加粗</strong>' });
  assert.deepEqual(inlineMarkdownAtEnd('前缀 *斜体*'), { start: 3, html: '<em>斜体</em>' });
  assert.deepEqual(inlineMarkdownAtEnd('见[官网](https://a.cn)'), {
    start: 1,
    html: '<a href="https://a.cn" rel="noopener noreferrer">官网</a>',
  });
  assert.equal(inlineMarkdownAtEnd('**还没结束*'), null);
});

test('detects list markers typed at the start of a block', () => {
  assert.deepEqual(listMarkerAtEnd('- '), { ordered: false, length: 2 });
  assert.deepEqual(listMarkerAtEnd('  * '), { ordered: false, length: 4 });
  assert.deepEqual(listMarkerAtEnd('1. '), { ordered: true, length: 3 });
  assert.equal(listMarkerAtEnd('- 内容'), null);
});

test('converts pasted markdown into paragraphs and lists', () => {
  const html = markdownToHtml('**项目背景**\n\n- 负责模块 A\n- 负责模块 B\n\n1. 第一步\n2. 第二步');
  assert.equal(
    html,
    '<p><strong>项目背景</strong></p><ul><li>负责模块 A</li><li>负责模块 B</li></ul><ol><li>第一步</li><li>第二步</li></ol>',
  );
  assert.equal(looksLikeMarkdown('- 一项'), true);
  assert.equal(looksLikeMarkdown('普通的一行文字'), false);
});

test('converts stored literal markdown in a text node', () => {
  assert.equal(convertInlineText('**项目背景**'), '<strong>项目背景</strong>');
  assert.equal(convertInlineText('普通文字'), null);
  assert.equal(convertInlineText('a * b * c'), null);
});
