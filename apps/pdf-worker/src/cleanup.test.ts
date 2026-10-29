import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { removeExpiredFile } from './cleanup';

test('removes only the selected generated PDF, retries missing files, rejects unsafe keys and symlinks', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'resume-cleanup-'));
  const key = `exports/${'a'.repeat(32)}.pdf`;
  try {
    await mkdir(path.join(root, 'exports'));
    await writeFile(path.join(root, key), 'expired');
    await writeFile(path.join(root, 'exports/keep.pdf'), 'keep');
    await removeExpiredFile(root, key);
    await assert.rejects(readFile(path.join(root, key)), { code: 'ENOENT' });
    await removeExpiredFile(root, key);
    assert.equal(await readFile(path.join(root, 'exports/keep.pdf'), 'utf8'), 'keep');
    await assert.rejects(removeExpiredFile(root, '../keep.pdf'));
    await symlink(path.join(root, 'exports/keep.pdf'), path.join(root, key));
    await assert.rejects(removeExpiredFile(root, key));
    assert.equal(await readFile(path.join(root, 'exports/keep.pdf'), 'utf8'), 'keep');
    await rm(path.join(root, 'exports'), { recursive: true });
    await mkdir(path.join(root, 'outside'));
    await symlink(path.join(root, 'outside'), path.join(root, 'exports'));
    await assert.rejects(removeExpiredFile(root, key));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
