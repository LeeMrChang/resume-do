import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ALL_TEMPLATE_IDS, SAMPLE_APPEARANCE, SAMPLE_DOCUMENT } from '@resume-do/schema';
import { RENDERER_VERSION, TEMPLATE_VERSION, TEMPLATE_CATALOG } from '@resume-do/templates';
import { PdfRenderer, RenderError, parseSnapshot } from './renderer';

function snapshot(templateId = SAMPLE_APPEARANCE.templateId) {
  return {
    schemaVersion: 1,
    document: SAMPLE_DOCUMENT,
    appearance: { ...SAMPLE_APPEARANCE, templateId },
    templateId,
    templateVersion: TEMPLATE_VERSION,
    rendererVersion: RENDERER_VERSION,
  };
}

test('worker accepts all current and legacy IDs with version 2 snapshots', () => {
  for (const id of ALL_TEMPLATE_IDS) {
    assert.equal(parseSnapshot(snapshot(id)).appearance.templateId, id);
  }
});

test('worker rejects obsolete versions and mismatched template metadata', () => {
  assert.throws(() => parseSnapshot({ ...snapshot(), templateVersion: 1 }),
    error => error instanceof RenderError && error.code === 'TEMPLATE_VERSION_UNSUPPORTED');
  assert.throws(() => parseSnapshot({ ...snapshot(), rendererVersion: '1' }),
    error => error instanceof RenderError && error.code === 'RENDERER_VERSION_UNSUPPORTED');
  assert.throws(() => parseSnapshot({ ...snapshot(), templateId: '1015' }),
    error => error instanceof RenderError && error.code === 'INVALID_SNAPSHOT');
});

test('API default export versions match the worker', async () => {
  const config = await readFile(new URL('../../api/src/main/resources/application.yml', import.meta.url), 'utf8');
  assert.match(config, new RegExp(`template-version: ${TEMPLATE_VERSION}\\b`));
  assert.match(config, new RegExp(`renderer-version: "${RENDERER_VERSION}"`));
});

// Opt-in because this runs an actual installed Chromium/Chrome, independent of API/MySQL.
// RESUME_DO_RUN_PDF_TESTS=1 RESUME_DO_BROWSER_CHANNEL=chrome npm test -w @resume-do/pdf-worker
// RESUME_DO_PDF_TEST_OUTPUT_DIR=/absolute/path retains artifacts for pdfinfo/visual inspection.
test('actual PDFs: all 59 skins, multi-page content, photo and sidebar overflow', {
  skip: process.env.RESUME_DO_RUN_PDF_TESTS !== '1', timeout: 240_000,
}, async t => {
  const renderer = new PdfRenderer();
  const output = process.env.RESUME_DO_PDF_TEST_OUTPUT_DIR;
  if (output) await mkdir(output, { recursive: true });
  try {
    for (const spec of TEMPLATE_CATALOG) {
      await t.test(spec.id, async () => {
        const pdf = await renderer.render(parseSnapshot(snapshot(spec.id)));
        assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
        assert.ok(pdf.length > 1_000);
        if (output) await writeFile(path.join(output, `${spec.id}.pdf`), pdf);
      });
    }
    await t.test('multiple pages with a photo and a long email', async () => {
      const input = parseSnapshot(snapshot('1015'));
      input.document.basic.email = 'a.very.long.professional.contact.address@example.com';
      input.document.basic.photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jq1sAAAAASUVORK5CYII=';
      const work = input.document.sections.find(section => section.id === 'work')!;
      const item = work.items[0];
      work.items = Array.from({ length: 12 }, (_, index) => ({ ...item, id: `work-${index}`, title: `验证公司 ${index + 1}` }));
      const pdf = await renderer.render(input);
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
      if (output) await writeFile(path.join(output, 'multipage-photo.pdf'), pdf);
    });
    await t.test('bundled typefaces export without errors', async () => {
      for (const fontId of ['noto-sans', 'noto-serif', 'lxgw-wenkai'] as const) {
        const input = parseSnapshot(snapshot('1045'));
        input.appearance.fontId = fontId;
        const pdf = await renderer.render(input);
        assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
        assert.ok(pdf.length > 1_000);
        if (output) await writeFile(path.join(output, `font-${fontId}.pdf`), pdf);
      }
    });
    await t.test('oversized sidebar is rejected, not silently clipped', async () => {
      const input = parseSnapshot(snapshot('1015'));
      input.document.sections.find(section => section.id === 'skills')!.items[0].body =
        Array.from({ length: 100 }, () => '<p>侧栏超高验证内容</p>').join('');
      await assert.rejects(renderer.render(input),
        error => error instanceof RenderError && error.code === 'CONTENT_OVERFLOW');
    });
  } finally {
    await renderer.close();
  }
});
