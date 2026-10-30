import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_REWRITE_MAX_TEXT, plainTextFromHtml, plainTextToRichHtml } from '../src/aiRewrite';

test('plainTextFromHtml keeps paragraph and line breaks without markup', () => {
  assert.equal(
    plainTextFromHtml('<p>第一行</p><div>第二行<div>第三行</div></div><ul><li>要点一</li><li>要点二</li></ul>'),
    '第一行\n第二行\n第三行\n要点一\n要点二',
  );
  assert.equal(plainTextFromHtml('<p>A &amp; B</p><p>&lt;C&gt;</p>'), 'A & B\n<C>');
  assert.equal(plainTextFromHtml('<p>第一行</p><div><br></div><div>第二行</div>'), '第一行\n第二行');
  assert.equal(plainTextFromHtml('<p>&nbsp; </p>'), '');
  assert.equal(AI_REWRITE_MAX_TEXT, 6000);
});

test('plainTextToRichHtml escapes model output and keeps one paragraph per line', () => {
  assert.equal(
    plainTextToRichHtml('负责订单模块开发与慢 SQL 优化。\n\n* 将接口耗时降低 30%'),
    '<p>负责订单模块开发与慢 SQL 优化。</p><p>* 将接口耗时降低 30%</p>',
  );
  assert.equal(
    plainTextToRichHtml('<script>alert(1)</script>'),
    '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
  );
  assert.equal(plainTextToRichHtml('  \n '), '');
});
