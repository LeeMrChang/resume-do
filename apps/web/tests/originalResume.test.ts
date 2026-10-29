import test from 'node:test';
import assert from 'node:assert/strict';
import { resumeViewKind, validateOriginalUpload, confirmResumeDelete, findEditableResume } from '../src/originalResume';
test('kind routes originals independently and legacy responses stay editable',()=>{
 assert.equal(resumeViewKind({kind:'original'}),'original');
 assert.equal(resumeViewKind({kind:'structured'}),'structured');
 assert.equal(resumeViewKind({}),'structured');
});
test('upload rejects Word, empty and oversized files before upload',()=>{
 assert.match(validateOriginalUpload({name:'a.docx',size:123})!,/原样导入目前仅支持 PDF/);
 assert.match(validateOriginalUpload({name:'a.pdf',size:0})!,/空/);
 assert.match(validateOriginalUpload({name:'a.pdf',size:20*1024*1024+1})!,/20MB/);
 assert.equal(validateOriginalUpload({name:'中文😀.PDF',size:20*1024*1024}),null);
});
test('delete only runs after explicit confirmation',async()=>{
 let calls=0;
 await confirmResumeDelete('测试',()=>false,async()=>{calls++;}); assert.equal(calls,0);
 await confirmResumeDelete('测试',()=>true,async()=>{calls++;}); assert.equal(calls,1);
});
test('Java original placeholder follows the schema empty contract',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {createDefaultDocument,createDefaultAppearance}=await import('@resume-do/schema');
 const json=JSON.parse(await readFile(new URL('../../api/src/main/resources/empty-resume.json',import.meta.url),'utf8'));
 const removeIds=(value:unknown):unknown=>JSON.parse(JSON.stringify(value, (key,v)=>key==='id'&& typeof v==='string'&& /^(item|body)-/.test(v)?'generated':v));
 assert.deepEqual(removeIds(json.document),removeIds(createDefaultDocument()));
 assert.deepEqual(json.appearance,createDefaultAppearance());
});

test('return to editor prefers last editable resume and never chooses an original',()=>{
 const list=[{id:'pdf',kind:'original'},{id:'newer',kind:'structured'},{id:'previous',kind:'structured'}];
 assert.equal(findEditableResume(list,'previous')?.id,'previous');
 assert.equal(findEditableResume(list,'pdf')?.id,'newer');
 assert.equal(findEditableResume(list,'deleted')?.id,'newer');
 assert.deepEqual(list.map(item=>item.id),['pdf','newer','previous']);
});
test('original-only and empty accounts have no editable target; legacy records remain editable',()=>{
 assert.equal(findEditableResume([{id:'pdf',kind:'original'}],'pdf'),undefined);
 assert.equal(findEditableResume([],null),undefined);
 assert.equal(findEditableResume([{id:'legacy'}],null)?.id,'legacy');
});
