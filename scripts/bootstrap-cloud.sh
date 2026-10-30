#!/usr/bin/env bash
# Run on the Ubuntu server, or pipe over an already trusted SSH connection.
set -Eeuo pipefail
umask 077
root=${1:-/home/ubuntu/resume-do}
[[ "$root" =~ ^/[A-Za-z0-9_/-]+/resume-do$ ]] || { echo 'Invalid deployment root' >&2; exit 1; }
[[ "$(uname -m)" == x86_64 ]] || { echo 'This release targets linux/amd64.' >&2; exit 1; }
for tool in python3 flock curl gzip tar; do command -v "$tool" >/dev/null; done
if docker info >/dev/null 2>&1; then docker compose version; else sudo -n docker info >/dev/null; sudo -n docker compose version; fi
python3 - <<'PY'
import pathlib, shutil
values = dict(line.split(':', 1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())
available = int(values['MemAvailable'].split()[0]) // 1024
free_disk = shutil.disk_usage('/').free // (1024 ** 3)
print(f'Available memory: {available} MiB; free disk: {free_disk} GiB')
if available < 1536 or free_disk < 8:
    raise SystemExit('Insufficient headroom: require at least 1536 MiB available RAM and 8 GiB free disk; inspect capacity before deploying.')
PY
mkdir -p "$root/deploy" "$root/releases" "$root/incoming" "$root/backups"
chmod 700 "$root" "$root/deploy" "$root/backups"
python3 - "$root/deploy/.env" <<'PY'
import os, pathlib, secrets, sys
path = pathlib.Path(sys.argv[1])
if path.is_symlink(): raise SystemExit('Refusing a symlinked environment file')
if path.exists():
    print('Existing production environment retained.')
else:
    content = ('RESUME_DO_MYSQL_ROOT_PASSWORD=' + secrets.token_hex(32) + '\n'
               'RESUME_DO_DB_PASSWORD=' + secrets.token_hex(32) + '\n'
               'RESUME_DO_MYSQL_IMAGE=mirror.ccs.tencentyun.com/library/mysql:8.4\n'
               'RESUME_DO_AI_ENABLED=false\nRESUME_DO_AI_API_KEY=\nRESUME_DO_AI_MODEL=deepseek-flash\n')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream: stream.write(content)
    print('Production environment created with independent random DB passwords; AI disabled.')
path.chmod(0o600)
PY
python3 - "$root" <<'PY'
import shutil, subprocess, sys
root = sys.argv[1]
if shutil.which('crontab'):
    old = subprocess.run(['crontab', '-l'], capture_output=True, text=True)
    if old.returncode not in (0, 1): raise SystemExit('Cannot read existing user crontab')
    marker = '# resume-do-cloud-backup'
    lines = [line for line in old.stdout.splitlines() if not line.rstrip().endswith(marker)]
    lines.append(f'17 3 * * * /bin/bash {root}/current/scripts/backup-cloud.sh {root} >> {root}/backups/timer.log 2>&1 {marker}')
    subprocess.run(['crontab', '-'], input='\n'.join(lines) + '\n', text=True, check=True)
    print('Daily backup scheduled at 03:17 server time; other cron entries retained.')
else:
    print('WARNING: crontab missing; daily backup not scheduled. Install cron and rerun setup.')
PY
echo "Prepared $root. No existing service was stopped or modified."
