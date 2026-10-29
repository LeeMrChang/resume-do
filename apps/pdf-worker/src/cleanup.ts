import { lstat, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';

// Only remove generated PDFs inside the actual exports directory. Never follow
// a replaced directory or a symlink supplied through a corrupted file_key.
export async function removeExpiredFile(storageDir: string, fileKey: string): Promise<void> {
  if (!/^exports\/[a-f0-9]{32}\.pdf$/.test(fileKey)) {
    throw new Error('Invalid export file key');
  }
  const root = await realpath(storageDir);
  const directory = path.join(root, 'exports');
  try {
    if (await realpath(directory) !== directory) throw new Error('Export directory is a symlink');
    const target = path.join(root, fileKey);
    const stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Export is not a regular file');
    await unlink(target);
  } catch (error) {
    // A previous cleanup may have removed the file before its DB commit failed.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
