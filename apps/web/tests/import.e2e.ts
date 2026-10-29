import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createDefaultAppearance, createDefaultDocument } from '@resume-do/schema';

// v2.2 creates an editable resume with an associated original. API is isolated; no personal files or real DB.
test('v2.2 import enters editor, returns from native original pages, downloads bytes and deletes both views', { timeout: 90_000 }, async () => {
 const base='http://resume-do.test';
 const dist=fileURLToPath(new URL('../dist/',import.meta.url));
 const fixture=await readFile(new URL('./fixtures/original-mixed.pdf',import.meta.url));
 const browser=await chromium.launch({channel:process.env.RESUME_DO_BROWSER_CHANNEL||'chrome',headless:true});
 try {
  const page=await browser.newPage();
  let record: Record<string,unknown>|null=null;
  let deleted=0, exports=0;
  await page.route(`${base}/**`,async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.startsWith('/api/')) return route.fallback();
   const file=path.resolve(dist,url.pathname==='/'?'index.html':url.pathname.slice(1));
   if(!file.startsWith(dist+path.sep)) throw Error('Invalid asset path');
   const types:Record<string,string>={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm'};
   await route.fulfill({body:await readFile(file),contentType:types[path.extname(file)]||'application/octet-stream'});
  });
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url()), method=route.request().method();
   if(url.pathname==='/api/auth/me') return route.fulfill({json:{id:99,email:'original-test@example.invalid',displayName:'L1 test'}});
   if(url.pathname.endsWith('/exports')) { exports++; throw Error('Original must not export'); }
   if(url.pathname==='/api/imports/direct') {
    assert.equal(method,'POST');
    const document=createDefaultDocument(); document.basic.name='导入测试';
    record={id:'original-test',kind:'structured',title:'mixed',revision:0,document,appearance:createDefaultAppearance(),source:{filename:'mixed.pdf',mime:'application/pdf',bytes:fixture.length,pages:3},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    return route.fulfill({status:201,json:record});
   }
   if(url.pathname==='/api/resumes') return route.fulfill({json:record?[record]:[]});
   if(url.pathname==='/api/resumes/original-test/source') return route.fulfill({body:fixture,contentType:'application/pdf',headers:url.searchParams.has('download')?{'Content-Disposition':'attachment; filename="mixed.pdf"'}:{}});
   if(url.pathname==='/api/resumes/original-test' && method==='DELETE') {deleted++;record=null;return route.fulfill({status:204});}
   if(url.pathname==='/api/resumes/original-test') return route.fulfill({json:record});
   throw Error(`Unexpected request ${method} ${url.pathname}`);
  });
  await page.goto(base);
  await page.getByLabel('选择 PDF 或 DOCX 简历').setInputFiles({name:'mixed.pdf',mimeType:'application/pdf',buffer:fixture});
  await page.getByLabel('姓名',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('姓名',{exact:true}).inputValue(),'导入测试');
  await page.getByRole('button',{name:'查看原件',exact:true}).click();
  await page.getByText('原件预览 · 共 3 页',{exact:false}).waitFor();
  await page.getByLabel('原件第 3 页画布').waitFor();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.original-page canvas')).every(c=>(c as HTMLCanvasElement).height>0));
  assert.equal(await page.getByRole('textbox').count(),0,'No correction/edit form');
  const ratios=await page.locator('.original-page canvas').evaluateAll(nodes=>nodes.map(n=>{const c=n as HTMLCanvasElement;return c.width/c.height;}));
  for(const [i,ratio] of [612/792,792/612,700/400].entries()) assert.ok(Math.abs(ratios[i]-ratio)<0.01);
  await page.getByRole('button',{name:'返回编辑器',exact:true}).click();
  assert.equal(await page.getByLabel('姓名',{exact:true}).inputValue(),'导入测试');
  await page.getByRole('button',{name:'查看原件',exact:true}).click();
  await page.reload(); await page.getByLabel('原件第 3 页画布').waitFor();
  await page.getByRole('button',{name:'下载 PDF',exact:true}).click();
  assert.equal(await page.getByRole('radio',{name:/原件版/}).isChecked(),true);
  const download=page.waitForEvent('download'); await page.getByRole('button',{name:'下载原件版',exact:true}).click();
  const downloaded=await download; const file=await downloaded.path(); assert.ok(file); assert.deepEqual(await readFile(file),fixture); assert.equal(exports,0);
  await page.getByRole('button',{name:'关闭',exact:true}).last().click();
  page.once('dialog',dialog=>dialog.dismiss()); await page.getByRole('button',{name:'删除简历',exact:true}).click(); assert.equal(deleted,0);
  page.once('dialog',dialog=>dialog.accept()); await page.getByRole('button',{name:'删除简历',exact:true}).click();
  await page.getByText('还没有简历',{exact:true}).waitFor(); assert.equal(deleted,1);
  await page.reload(); await page.getByText('还没有简历',{exact:true}).waitFor();
 } finally { await browser.close(); }
});
