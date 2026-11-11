/// <reference types="vite/client" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDefaultAppearance, createDefaultDocument } from '@resume-do/schema';
import { AppearanceDialog } from '../src/Dialogs';

test('template chooser offers a favorites filter and a separate accessible star for each card', () => {
  const html = renderToStaticMarkup(createElement(AppearanceDialog, {
    kind: 'template', document: createDefaultDocument(), appearance: createDefaultAppearance(),
    onChange: () => {}, onApply: () => {}, onCancel: () => {},
  }));
  assert.match(html, /我的收藏/);
  assert.match(html, /aria-label="收藏模板 1045 极简蓝线"/);
  assert.match(html, /class="template-favorite-btn/);
  assert.match(html, /aria-label="预览模板 1045 极简蓝线"/);
});
