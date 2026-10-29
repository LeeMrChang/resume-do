import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { config } from './config';
import { appearanceSchema, resumeDocumentSchema } from '@resume-do/schema';
import {
  RENDERER_VERSION,
  TEMPLATE_VERSION,
  buildBlocks,
  getPageMetrics,
  getTemplateLayout,
  paginateBlocks,
  renderAsideMeasureHtml,
  renderMeasureHtml,
  renderPagesHtml,
  splitBlocks,
  type RenderInput,
} from '@resume-do/templates';

export class RenderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface JobSnapshot {
  schemaVersion: number;
  document: unknown;
  appearance: unknown;
  templateId: string;
  templateVersion: number;
  rendererVersion: string;
  filename: string;
}

export function parseSnapshot(raw: unknown): RenderInput {
  if (!raw || typeof raw !== 'object') {
    throw new RenderError('INVALID_SNAPSHOT', '导出快照格式不正确');
  }
  const snapshot = raw as JobSnapshot;
  if (snapshot.templateVersion !== TEMPLATE_VERSION) {
    throw new RenderError('TEMPLATE_VERSION_UNSUPPORTED', '该任务使用的模板版本已不受支持');
  }
  if (snapshot.rendererVersion !== RENDERER_VERSION) {
    throw new RenderError('RENDERER_VERSION_UNSUPPORTED', '该任务使用的渲染器版本已不受支持');
  }
  const document = resumeDocumentSchema.safeParse(snapshot.document);
  if (!document.success) {
    throw new RenderError('INVALID_SNAPSHOT', '简历内容未通过校验');
  }
  const appearance = appearanceSchema.safeParse(snapshot.appearance);
  if (!appearance.success) {
    throw new RenderError('INVALID_SNAPSHOT', '版式配置未通过校验');
  }
  if (snapshot.templateId !== appearance.data.templateId) {
    throw new RenderError('INVALID_SNAPSHOT', '模板版本信息不一致');
  }
  return { document: document.data, appearance: appearance.data };
}

export class PdfRenderer {
  private browser: Browser | null = null;

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    this.browser = await chromium.launch({
      args: ['--disable-dev-shm-usage'],
      channel: config.browserChannel || undefined,
    });
    return this.browser;
  }

  async render(input: RenderInput): Promise<Buffer> {
    const browser = await this.ensureBrowser();
    const context: BrowserContext = await browser.newContext({
      viewport: { width: 1200, height: 1600 },
      deviceScaleFactor: 1,
      javaScriptEnabled: true,
      colorScheme: 'light',
    });
    const page: Page = await context.newPage();
    try {
      await page.route('**/*', (route) => {
        const url = route.request().url();
        if (url.startsWith('data:') || url.startsWith('about:') || url.startsWith('blob:')) {
          return route.continue();
        }
        return route.abort();
      });

      const blocks = buildBlocks(input);
      const { aside, main } = splitBlocks(blocks, getTemplateLayout(input.appearance.templateId));
      const measureHtml = renderMeasureHtml(input, main);
      await page.setContent(measureHtml, { waitUntil: 'load' });
      await page.evaluate(async () => {
        await document.fonts.ready;
      });

      const heights = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('[data-block]')).map(
          (element) => element.getBoundingClientRect().height,
        ),
      );
      if (heights.length !== main.length) {
        throw new RenderError('MEASURE_FAILED', '分页测量结果不完整');
      }

      const metrics = getPageMetrics(input.appearance);
      if (metrics.hasAside && aside.length > 0) {
        await page.setContent(renderAsideMeasureHtml(input, aside), { waitUntil: 'load' });
        await page.evaluate(async () => {
          await document.fonts.ready;
        });
        const asideHeight = await page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLElement>('[data-block]')).reduce(
            (total, element) => total + element.getBoundingClientRect().height,
            0,
          ),
        );
        if (asideHeight > metrics.asideContentHeightPx + 1) {
          throw new RenderError(
            'CONTENT_OVERFLOW',
            '侧栏内容超过单页高度，请缩短技能或荣誉内容后重试',
          );
        }
      }

      const { pages, overflow } = paginateBlocks(main, heights, metrics.contentHeightPx);
      if (overflow.length > 0) {
        throw new RenderError('CONTENT_OVERFLOW', '标题与首段组合或正文超过单页高度，请拆分长段落或调小字号、行距后重试');
      }

      const pageBlocks = pages.map((pageIndexes) => pageIndexes.map((index) => main[index]));
      const pagesHtml = renderPagesHtml(input, pageBlocks, aside);
      await page.setContent(pagesHtml, { waitUntil: 'load' });
      await page.evaluate(async () => {
        await document.fonts.ready;
      });

      return await page.pdf({
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: false,
      });
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  async close(): Promise<void> {
    await this.browser?.close().catch(() => undefined);
    this.browser = null;
  }
}
