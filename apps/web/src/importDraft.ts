import { emptyRecordItem, resumeDocumentSchema, appearanceSchema } from '@resume-do/schema';
import type { ImportDraft } from './api';

function html(text: string): string {
  return text ? `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>` : '';
}

export function moveImportItem(draft: ImportDraft, from: number, itemIndex: number, to: number): ImportDraft {
  if (from === to) return draft;
  const next = structuredClone(draft);
  const source = next.document.sections[from];
  const target = next.document.sections[to];
  const item = source.items[itemIndex];
  if (!item) throw new Error('条目不存在');
  if (target.type === 'rich') {
    const content = [item.title, item.role, [item.startMonth, item.ongoing ? '至今' : item.endMonth].filter(Boolean).join(' — ')]
      .filter(Boolean).map(html).join('') + item.body;
    target.items[0] ??= emptyRecordItem();
    if (target.items[0].body.length + content.length > 20_000) throw new Error('目标模块正文超过 20000 字符，请拆分后移动');
    target.items[0].body += content;
  } else {
    if (target.items.length >= 30) throw new Error('目标模块最多 30 条经历');
    target.items.push(item);
  }
  source.items.splice(itemIndex, 1);
  if (source.type === 'rich' && source.items.length === 0) source.items.push(emptyRecordItem());
  target.visible = true;
  return next;
}


export function validateImportDraft(draft: ImportDraft): void {
  if (!draft.title.trim() || draft.title.length > 100) throw new Error('简历标题不能为空，且不能超过 100 字符');
  const result = resumeDocumentSchema.safeParse(draft.document);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path;
    const section = path[0] === 'sections' && typeof path[1] === 'number' ? draft.document.sections[path[1]] : undefined;
    const entry = path[2] === 'items' && typeof path[3] === 'number' ? ` 第 ${path[3] + 1} 条` : '';
    const fields: Record<string, string> = { name: '姓名', phone: '电话', email: '邮箱', startMonth: '开始年月', endMonth: '结束年月', body: '正文', title: '名称', role: '职位／角色' };
    const field = fields[String(path.at(-1))] || String(path.at(-1) ?? '内容');
    throw new Error(`${section?.title || '简历'}${entry} · ${field}：${issue.message}`);
  }
  const appearance = appearanceSchema.safeParse(draft.appearance);
  if (!appearance.success) throw new Error(`版式配置：${appearance.error.issues[0].message}`);
}
