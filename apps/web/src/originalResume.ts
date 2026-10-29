export function resumeViewKind(resume: { kind?: string }): 'original' | 'structured' {
  return resume.kind === 'original' ? 'original' : 'structured';
}
export function findEditableResume<T extends { id: string; kind?: string }>(resumes: T[], preferred: string | null): T | undefined {
  const editable = resumes.filter(resume => resumeViewKind(resume) === 'structured');
  return editable.find(resume => resume.id === preferred) ?? editable[0];
}
export function validateOriginalUpload(file: { name: string; size: number }): string | null {
  if (!file.size) return '文件不能为空';
  if (file.size > 20 * 1024 * 1024) return '文件不能超过 20MB';
  if (!/\.pdf$/i.test(file.name)) return '原样导入目前仅支持 PDF，Word 请等待可编辑导入';
  return null;
}
export async function confirmResumeDelete(title: string, confirm: (message: string) => boolean, remove: () => Promise<void>): Promise<boolean> {
  if (!confirm(`确定删除“${title}”吗？关联的原件与可编辑内容会一起删除，两个视图将同时消失，此操作无法撤销。`)) return false;
  await remove(); return true;
}

export function validateEditableUpload(file: { name: string; size: number }): string | null {
  if (!file.size) return '文件不能为空';
  if (file.size > 20 * 1024 * 1024) return '文件不能超过 20MB';
  if (!/\.(pdf|docx)$/i.test(file.name)) return '仅支持 PDF 和 DOCX 简历';
  return null;
}
