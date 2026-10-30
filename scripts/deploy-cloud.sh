#!/usr/bin/env bash
# Receives a release bundle produced by GitHub Actions. Never reads or changes cost resources.
set -Eeuo pipefail
umask 077
release_id=${1:?release ID required}
root=${2:-/home/ubuntu/resume-do}
[[ "$release_id" =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]] || { echo 'Invalid release ID' >&2; exit 1; }
[[ "$root" =~ ^/[A-Za-z0-9_/-]+/resume-do$ ]] || { echo 'Invalid deployment root' >&2; exit 1; }
test -f "$root/deploy/.env"
exec 9>"$root/deploy.lock"
flock -n 9 || { echo 'Another deployment/backup is running' >&2; exit 1; }
release="$root/releases/$release_id"
if [[ -f "$release/SUCCESS" ]]; then echo 'Release already deployed'; exit 0; fi
python3 - "$root/incoming/$release_id.tar" "$release" "$release_id" <<'PY'
import hashlib, json, pathlib, shutil, sys, tarfile
source, target, release_id = sys.argv[1:]
allowed = {'deploy/compose.cloud.yaml', 'scripts/backup-cloud.sh', 'images.tar.gz', 'release.json'}
with tarfile.open(source, 'r:') as archive:
    members = archive.getmembers()
    names = [member.name for member in members]
    if set(names) != allowed or len(names) != len(allowed): raise SystemExit('Unexpected deployment archive files')
    if any(not member.isfile() or member.size > 4 * 1024**3 or member.size < 0 for member in members):
        raise SystemExit('Unsafe deployment archive')
    if archive.getmember('release.json').size > 65536: raise SystemExit('Manifest too large')
    manifest = json.load(archive.extractfile('release.json'))
    if manifest.get('release') != release_id or set(manifest.get('sha256', {})) != allowed - {'release.json'}:
        raise SystemExit('Release manifest mismatch')
    base = pathlib.Path(target)
    base.mkdir(mode=0o700)  # Failed releases are immutable; rerun with a new attempt ID.
    for member in members:
        output = base / member.name
        output.parent.mkdir(exist_ok=True, parents=True)
        digest = hashlib.sha256()
        with archive.extractfile(member) as stream, output.open('xb') as dest:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(chunk); dest.write(chunk)
        if member.name != 'release.json' and digest.hexdigest() != manifest['sha256'][member.name]:
            raise SystemExit('Release checksum mismatch')
PY
export RESUME_DO_IMAGE_TAG="ci-$release_id"
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker); "${DOCKER[@]}" info >/dev/null; fi
compose() {
  # sudo drops shell exports: pass only this non-secret image tag explicitly.
  "${DOCKER[@]}" compose -p resume-do-cloud --env-file "$root/deploy/.env" \
    --env-file "$release/image.env" -f "$release/deploy/compose.cloud.yaml" "$@" < /dev/null
}
printf 'RESUME_DO_IMAGE_TAG=%s\n' "$RESUME_DO_IMAGE_TAG" > "$release/image.env"
compose config --quiet
gzip -dc "$release/images.tar.gz" | "${DOCKER[@]}" load >/dev/null
for image in resume-api resume-worker resume-web; do "${DOCKER[@]}" image inspect "$image:$RESUME_DO_IMAGE_TAG" >/dev/null; done

db=$(compose ps -aq resume-db)
old_ids=()
while IFS= read -r id; do [[ -z "$id" ]] || old_ids+=("$id"); done < <(compose ps -q resume-web resume-api resume-worker)
stopped=0
migration_started=0
finish() {
  local result=$?
  trap - EXIT
  if [[ "$result" != 0 && "$stopped" == 1 ]]; then
    if [[ "$migration_started" == 0 && ${#old_ids[@]} -gt 0 ]]; then
      "${DOCKER[@]}" start "${old_ids[@]}" >/dev/null || true
      echo 'Failed before migration; original application restart requested.' >&2
    else
      compose stop resume-web resume-api resume-worker >/dev/null || true
      echo "Release failed after API startup began. Writers stopped; inspect $release and backups before recovery." >&2
    fi
  fi
  exit "$result"
}
trap finish EXIT
trap 'exit 1' HUP INT TERM

if [[ -z "$db" ]]; then
  # Refuse to create a hidden duplicate database over an existing unmanaged data volume.
  if "${DOCKER[@]}" volume inspect resume_do_cloud_mysql_data >/dev/null 2>&1; then
    echo 'Existing DB volume without a managed container; inspect before proceeding.' >&2; exit 1
  fi
  compose up -d --wait --wait-timeout 240 resume-db
else
  # Existing DB image/config upgrades require separate maintenance, never implicit recreation.
  "${DOCKER[@]}" start "$db" >/dev/null
fi
db_ready=0
for ((attempt=0; attempt<60; attempt++)); do
  if compose exec -T resume-db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --protocol=tcp -h127.0.0.1 -uroot -e "SELECT 1"' >/dev/null 2>&1; then
    db_ready=1
    break
  fi
  sleep 2
done
[[ "$db_ready" == 1 ]] || { echo 'Database TCP preflight failed; application was not stopped.' >&2; exit 1; }
stopped=1
compose stop resume-web resume-worker resume-api
if [[ -n "$db" ]]; then
  source "$release/scripts/backup-cloud.sh"
  backup_data "$root/backups/pre-$release_id"
fi

# From here a Flyway DDL change may already have committed: never auto-start an old API.
migration_started=1
compose up -d --no-deps --wait --wait-timeout 240 resume-api
compose up -d --no-deps --wait --wait-timeout 120 resume-worker resume-web
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8081/api/health >/dev/null
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8081/ >/dev/null
python3 - "$root" "$release" <<'PY'
import os, sys
root, release = sys.argv[1:]
temporary = root + '/current.next'
if os.path.lexists(temporary): os.unlink(temporary)
os.symlink(release, temporary)
os.replace(temporary, root + '/current')
PY
touch "$release/SUCCESS"
echo "Deployed $release_id at 127.0.0.1:8081; no cost services were changed."
