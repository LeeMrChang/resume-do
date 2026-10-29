"""Exercise refusal/failure paths without connecting to a database."""
import contextlib
import importlib.util
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('migration', Path(__file__).with_name('migrate-local-database.py'))
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


class MigrationSafetyTest(unittest.TestCase):
    def scenario(self, *, destination=False, account=False, dump_fails=False, mismatch=False):
        statements = []
        names = ['export_jobs', 'flyway_schema_history', 'resumes', 'users']
        def run(command, **kwargs):
            sql = kwargs.get('input', '')
            if sql:
                statements.append(sql)
                if 'information_schema.SCHEMATA' in sql:
                    value = '1' if destination else '0'
                elif 'mysql.user' in sql:
                    value = '1' if account else '0'
                elif 'information_schema.TABLES' in sql:
                    value = '\n'.join(names)
                elif sql.startswith('SELECT COUNT(*)'):
                    value = '2' if mismatch and '`resume_do`' in sql else '1'
                else:
                    value = ''
                return subprocess.CompletedProcess(command, 0, value, '')
            if command[0] == '/fake/mysqldump':
                kwargs['stdout'].write(b'-- simulated backup\n')
                return subprocess.CompletedProcess(command, 1 if dump_fails else 0, b'', b'')
            return subprocess.CompletedProcess(command, 0, b'', b'')
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(migration, '__file__', str(Path(temp) / 'scripts/migration.py')), \
                 patch.object(sys, 'argv', ['migration', '--services-stopped']), \
                 patch.object(migration.shutil, 'which', side_effect=lambda name: '/fake/' + name), \
                 patch.object(migration.getpass, 'getpass', return_value=''), \
                 patch.object(migration.subprocess, 'run', side_effect=run), \
                 contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaises(RuntimeError):
                    migration.main()
            backups = list((Path(temp) / 'data/backups').glob('*.sql'))
            if mismatch:
                self.assertEqual(len(backups), 1)
                self.assertEqual(backups[0].stat().st_mode & 0o777, 0o600)
        return statements

    def test_existing_destination_is_never_overwritten(self):
        sql = self.scenario(destination=True)
        self.assertFalse(any(s.startswith('CREATE') for s in sql))

    def test_existing_account_password_is_never_changed(self):
        sql = self.scenario(account=True)
        self.assertFalse(any(s.startswith('CREATE') for s in sql))

    def test_failed_backup_prevents_any_database_writes(self):
        sql = self.scenario(dump_fails=True)
        self.assertFalse(any(s.startswith('CREATE') for s in sql))

    def test_row_count_mismatch_does_not_create_accounts_or_drop_data(self):
        sql = self.scenario(mismatch=True)
        self.assertTrue(any(s.startswith('CREATE DATABASE') for s in sql))
        self.assertFalse(any(s.startswith(('CREATE USER', 'DROP', 'ALTER')) for s in sql))


if __name__ == '__main__':
    unittest.main()
