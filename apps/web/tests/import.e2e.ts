import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createDefaultAppearance, createDefaultDocument } from '@resume-do/schema';

// v2.2 overwrites the resume being edited in place. API is isolated; no personal files or real DB.
test('v2.2 import overwrites the current resume, exports original bytes and clears content after confirmation', { timeout: 90_000 }, async () => {
 const base='http://localhost:4199';
 const dist=path.resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
 const fixture=await readFile(new URL('./fixtures/original-mixed.pdf',import.meta.url));
 const browser=await chromium.launch({channel:process.env.RESUME_DO_BROWSER_CHANNEL||'chrome',headless:true});
 try {
  const page=await browser.newPage();
  page.on('dialog',dialog=>{ void dialog.accept(); });
  const initial=createDefaultDocument(); initial.basic.name='导入测试';
  let record: Record<string,unknown> = {
   id:'original-test',kind:'structured',title:'我的简历',revision:0,
   document:initial,appearance:createDefaultAppearance(),
   source:{filename:'mixed.pdf',mime:'application/pdf',bytes:fixture.length,pages:3},
   createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
  };
  let imports=0, patches=0, exports=0;
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
   if(url.pathname==='/api/auth/me') return route.fulfill({json:{id:99,email:'overwrite-test@example.invalid',displayName:'v2.2 test'}});
   if(url.pathname.endsWith('/exports')) { exports++; throw Error('Original must not export'); }
   if(url.pathname==='/api/imports/direct') throw Error('Editor must overwrite the current resume, not create one');
   if(url.pathname==='/api/imports/direct/original-test') {
    assert.equal(method,'POST'); imports++;
    const document=createDefaultDocument(); document.basic.name='覆盖测试';
    record={...record,revision:(record.revision as number)+1,document,
      source:{filename:'第二版.pdf',mime:'application/pdf',bytes:fixture.length,pages:3},updatedAt:new Date().toISOString()};
    return route.fulfill({json:record});
   }
   if(url.pathname==='/api/resumes' && method==='GET') return route.fulfill({json:[record]});
   if(url.pathname==='/api/resumes/original-test/source') return route.fulfill({body:fixture,contentType:'application/pdf',headers:{'Content-Disposition':'attachment; filename="mixed.pdf"'}});
   if(url.pathname==='/api/resumes/original-test' && method==='PATCH') {
    patches++;
    const body=route.request().postDataJSON();
    record={...record,revision:(record.revision as number)+1,title:body.title,document:body.document,appearance:body.appearance,updatedAt:new Date().toISOString()};
    return route.fulfill({json:record});
   }
   if(url.pathname==='/api/resumes/original-test') return route.fulfill({json:record});
   throw Error(`Unexpected request ${method} ${url.pathname}`);
  });
  await page.goto(base);
  await page.locator('.resume-card .card-open').first().click();
  await page.getByLabel('姓名',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('姓名',{exact:true}).inputValue(),'导入测试');
  assert.equal(await page.getByRole('button',{name:'查看原件',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'删除',exact:true}).count(),1);
  assert.equal(await page.getByLabel('切换简历').count(),0);
  const buttons=await page.locator('header.topbar button').allTextContents();
  assert.ok(buttons.some(text=>text.includes('清空内容')),'clear button stays in header');
  assert.ok(buttons.findIndex(text=>text.includes('下载 PDF'))<buttons.findIndex(text=>text.trim()==='退出'),'下载 PDF comes before 退出');

  await page.getByRole('button',{name:'导入简历',exact:true}).click();
  await page.getByText('导入简历后，当前简历内容将被覆盖！',{exact:true}).waitFor();
  await page.getByText('建议先确认当前简历内容已备份，再继续操作。',{exact:true}).waitFor();
  await page.getByRole('button',{name:'确认覆盖并导入',exact:true}).click();
  await page.getByLabel('选择 PDF 或 DOCX 简历').setInputFiles({name:'第二版.pdf',mimeType:'application/pdf',buffer:fixture});
  await page.waitForFunction(()=>{
   const field=Array.from(document.querySelectorAll('label')).find(label=>label.firstChild?.textContent?.trim()==='姓名')?.querySelector('input');
   return field?.value==='覆盖测试';
  });
  assert.equal(imports,1);

  const fab=page.getByRole('button',{name:'↓ 下载 / 导出简历',exact:true});
  assert.equal(await fab.evaluate(el=>getComputedStyle(el).position),'static','Download button follows the preview instead of sticking');
  const fabBox=await fab.boundingBox();
  const lastPageBottom=await page.locator('.pages .r-page').last().evaluate(el=>el.getBoundingClientRect().bottom);
  assert.ok(fabBox && fabBox.y>=lastPageBottom,'Download button sits below the last preview page');
  await fab.click();
  assert.equal(await page.getByRole('radio',{name:/原件版/}).isChecked(),true);
  const download=page.waitForEvent('download'); await page.getByRole('button',{name:'下载原件版',exact:true}).click();
  const downloaded=await download; const file=await downloaded.path(); assert.ok(file); assert.deepEqual(await readFile(file),fixture); assert.equal(exports,0);
  await page.getByRole('button',{name:'关闭',exact:true}).last().click();

  await page.getByRole('button',{name:'清空内容',exact:true}).click();
  await page.getByText('清空后，当前简历的全部内容将被移除！',{exact:true}).waitFor();
  await page.getByRole('button',{name:'确认清空',exact:true}).click();
  await page.getByText('已清空当前简历内容',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('姓名',{exact:true}).inputValue(),'');
  assert.equal(await page.getByLabel('简历名称').inputValue(),'我的简历');
  assert.equal(patches,1);

  await page.reload();
  await page.locator('.resume-card .card-open').first().click();
  await page.getByLabel('姓名',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('姓名',{exact:true}).inputValue(),'');
 } finally { await browser.close(); }
});
