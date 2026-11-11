/// <reference types="vite/client" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExportDialog } from '../src/Dialogs';

test('export dialog offers only the current edited PDF with a download confirmation', () => {
  const html = renderToStaticMarkup(createElement(ExportDialog, {
    resumeId: 'test', defaultFilename: '简历.pdf', pageCount: 2,
    ensureSaved: async () => 1, onClose: () => {},
  }));
  assert.match(html, /当前编辑版/);
  assert.match(html, /下载 PDF/);
  assert.match(html, /共 2 页/);
  assert.doesNotMatch(html, /type="radio"|原件版|选择导出版本/);
});
