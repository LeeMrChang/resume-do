#!/usr/bin/env python3
"""Copy legacy local MySQL data into resume_do; never delete the source database."""
import argparse
import datetime
import getpass
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile


def identifier(value):
    if not re.fullmatch(r'[A-Za-z0-9_]+', value):
        raise argparse.ArgumentTypeError('Database name must contain only letters, digits, underscore')
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=identifier, default='resume_dev')
    parser.add_argument('--socket', default='/tmp/mysql.sock')
    parser.add_argument('--admin', default='root')
    parser.add_argument('--ask-admin-password', action='store_true')
    parser.add_argument('--services-stopped', action='store_true', help='Confirm API and all PDF workers are stopped')
    args = parser.parse_args()
    if not args.services_stopped:
        parser.error('Stop API and ALL PDF workers, then pass --services-stopped')
    if args.source == 'resume_do':
        parser.error('Source and destination must differ')
    mysql = shutil.which('mysql')
    dump = shutil.which('mysqldump')
    if not mysql or not dump:
        parser.error('mysql and mysqldump must be installed and in PATH')
    admin_password = getpass.getpass('MySQL admin password: ') if args.ask_admin_password else ''
    app_password = getpass.getpass('New resume_do application password (blank = local demo change_me): ') or 'change_me'
    # A limited alphabet makes both MySQL account SQL and option-file handling unambiguous.
    if not re.fullmatch(r'[A-Za-z0-9_!@#%+=.,:-]{8,128}', app_password):
        parser.error('Use 8-128 characters: letters, digits, _!@#%+=.,:-')
    root = Path(__file__).resolve().parents[1]
    backup_dir = root / 'data' / 'backups'
    with tempfile.TemporaryDirectory(prefix='resume-do-mysql-') as tmp:
        options = Path(tmp) / 'client.cnf'
        def option(value):
            return '"' + value.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\r', '\\r') + '"'
        options.write_text('[client]\nuser=' + option(args.admin) + '\npassword=' + option(admin_password) + '\nsocket=' + option(args.socket) + '\nprotocol=SOCKET\n')
        options.chmod(0o600)
        client = [mysql, '--defaults-extra-file=' + str(options), '--batch', '--skip-column-names']
        def query(sql):
            # SQL on stdin, including passwords: never put credentials in process arguments.
            result = subprocess.run(client, input=sql, text=True, capture_output=True)
            if result.returncode:
                raise RuntimeError('MySQL operation failed; source is preserved. Check local access, privileges and server logs.')
            return result.stdout.strip()
        def tables(db):
            return query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='" + db + "' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;").splitlines()
        def quoted(name):
            return '`' + name.replace('`', '``') + '`'
        def counts(db, names):
            return {name: int(query('SELECT COUNT(*) FROM ' + quoted(db) + '.' + quoted(name) + ';')) for name in names}
        source_tables = tables(args.source)
        if not {'users', 'resumes', 'export_jobs', 'flyway_schema_history'}.issubset(source_tables):
            raise RuntimeError('Source is missing required application/Flyway tables; no changes made.')
        if query("SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='resume_do';") != '0':
            raise RuntimeError('Destination resume_do already exists; refusing to overwrite it.')
        if query("SELECT COUNT(*) FROM mysql.user WHERE User='resume_do';") != '0':
            raise RuntimeError('Account resume_do already exists; refusing to change existing credentials.')
        before = counts(args.source, source_tables)
        backup_dir.mkdir(parents=True, exist_ok=True)
        backup = backup_dir / ('mysql-' + args.source + '-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.sql')
        with backup.open('xb') as output:
            backup.chmod(0o600)
            result = subprocess.run([dump, '--defaults-extra-file=' + str(options), '--single-transaction', '--no-tablespaces', '--set-gtid-purged=OFF', '--hex-blob', '--routines', '--events', '--triggers', args.source], stdout=output, stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError('Backup failed; no database changes made. Partial backup: ' + str(backup))
        print('Backup created:', backup, flush=True)
        query('CREATE DATABASE resume_do CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;')
        with backup.open('rb') as source:
            result = subprocess.run(client + ['resume_do'], stdin=source, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError('Import failed; destination may be partial. Source and backup are preserved. Do not restart services.')
        if tables('resume_do') != source_tables or counts('resume_do', source_tables) != before or counts(args.source, source_tables) != before:
            raise RuntimeError('Table/row-count verification failed; do not restart services. Both databases and backup preserved.')
        # Password alphabet validated above; no quotes or backslashes can occur.
        for host in ('localhost', '127.0.0.1'):
            query("CREATE USER 'resume_do'@'" + host + "' IDENTIFIED BY '" + app_password + "'; GRANT ALL PRIVILEGES ON resume_do.* TO 'resume_do'@'" + host + "';")
        print('Migration complete: resume_do database and accounts created; table names and row counts matched.')
        print('Old database/account retained. Set RESUME_DO_DB_PASSWORD in .env and IDEA to your chosen password.')
        print('Existing data/exports files remain in place. Restart API and worker together, then verify login, resumes and PDF download.')


if __name__ == '__main__':
    os.umask(0o077)
    try:
        main()
    except (RuntimeError, OSError) as error:
        print('STOP:', error, file=sys.stderr)
        sys.exit(1)
