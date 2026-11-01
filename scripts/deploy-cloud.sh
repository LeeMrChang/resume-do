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
source_allowed = (allowed - {'images.tar.gz'}) | {'source.tar.gz', 'scripts/build-cloud.sh'}
with tarfile.open(source, 'r:') as archive:
    members = archive.getmembers()
    names = [member.name for member in members]
    registry_allowed = (allowed - {'images.tar.gz'}) | {'images.json'}
    payload_names = set(names) - {'plan.json'}
    if payload_names not in (allowed, source_allowed, registry_allowed) or len(names) != len(set(names)):
        raise SystemExit('Unexpected deployment archive files')
    allowed = set(names)
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
# New releases carry independent image references and a checked service selection.
services=(api worker web)
selective=0
has_migrations=1
if [[ -f "$release/plan.json" ]]; then
  python3 - "$root" "$release" <<'PYPLAN'
import json, pathlib, re, sys
root, release = map(pathlib.Path, sys.argv[1:])
plan = json.loads((release / 'plan.json').read_text())
services = plan.get('services')
all_services = {'api', 'worker', 'web'}
if not isinstance(services, list) or not services or len(set(services)) != len(services) or not set(services) <= all_services:
    raise SystemExit('Invalid service selection')
fp = plan.get('fingerprints', {})
if set(fp) != all_services | {'migrations'} or any(not isinstance(v, str) or not re.fullmatch('[a-f0-9]{64}', v) for v in fp.values()):
    raise SystemExit('Invalid release fingerprints')
if plan.get('commit') != release.name[:40] or not isinstance(plan.get('migrations'), bool):
    raise SystemExit('Invalid planned commit or migration flag')
previous = root / 'current'
old_plan = json.loads((previous / 'plan.json').read_text()) if (previous / 'plan.json').exists() else None
if old_plan:
    for service in all_services - set(services):
        if old_plan['fingerprints'][service] != fp[service]:
            raise SystemExit('Production baseline changed; run a full release instead of skipping ' + service)
else:
    if set(services) != all_services:
        raise SystemExit('First independent release must include all services; run workflow with full=true')
migrations = not old_plan or old_plan['fingerprints']['migrations'] != fp['migrations'] or plan['migrations']
if migrations and set(services) != all_services:
    raise SystemExit('Database migrations require a coordinated full release')
old_env = {}
if (previous / 'image.env').exists():
    for line in (previous / 'image.env').read_text().splitlines():
        key, sep, value = line.partition('=')
        if sep: old_env[key] = value
new_tag = 'ci-' + release.name
with (release / 'image.env').open('w') as out:
    print('RESUME_DO_IMAGE_TAG=' + new_tag, file=out)
    for service in sorted(all_services):
        key = 'RESUME_DO_' + service.upper() + '_IMAGE'
        value = ('resume-' + service + ':' + new_tag) if service in services else old_env.get(key, 'resume-' + service + ':' + old_env.get('RESUME_DO_IMAGE_TAG', ''))
        if not re.fullmatch('resume-' + service + r':ci-[a-f0-9]{40}-[0-9]+-[0-9]+', value):
            raise SystemExit('Invalid previous image reference')
        print(key + '=' + value, file=out)
(release / 'selection.env').write_text('selective=1\nhas_migrations=' + str(int(migrations)) + '\n')
(release / 'services.txt').write_text(' '.join(services) + '\n')
PYPLAN
  source "$release/selection.env"
  read -r -a services < "$release/services.txt"
fi
compose config --quiet
if [[ -f "$release/images.json" ]]; then
  # Validate all references before contacting the registry or stopping any service.
  python3 - "$release/images.json" > "$release/image-refs.tsv" <<'PYREFS'
import json, re, sys
refs = json.load(open(sys.argv[1]))
if set(refs) != {'api', 'worker', 'web'}: raise SystemExit('Unexpected registry services')
for service, ref in refs.items():
    if not isinstance(ref, str) or not re.fullmatch(r'ccr\.ccs\.tencentyun\.com/[a-z0-9][a-z0-9._-]*/resume-' + service + r'@sha256:[a-f0-9]{64}', ref):
        raise SystemExit('Invalid immutable registry reference')
for service, ref in refs.items(): print(service, ref, sep='\t')
PYREFS
  : "${RESUME_DO_REGISTRY_PASSWORD:?Missing registry password}"
  registry_auth=$(mktemp -d "$root/registry-auth.XXXXXX")
  trap 'rm -rf "$registry_auth"' EXIT
  DOCKER+=(--config "$registry_auth")
  printf '%s' "$RESUME_DO_REGISTRY_PASSWORD" | "${DOCKER[@]}" login ccr.ccs.tencentyun.com --username 100054079705 --password-stdin
  unset RESUME_DO_REGISTRY_PASSWORD
  while IFS=$'\t' read -r service reference; do
    "${DOCKER[@]}" pull "$reference"
    "${DOCKER[@]}" tag "$reference" "resume-$service:$RESUME_DO_IMAGE_TAG"
  done < "$release/image-refs.tsv"
  rm -rf "$registry_auth"
  trap - EXIT
elif [[ -f "$release/source.tar.gz" ]]; then
  bash "$release/scripts/build-cloud.sh" "$release" "$RESUME_DO_IMAGE_TAG"
  if [[ -n "${RESUME_DO_REGISTRY_PASSWORD:-}" ]]; then
    # Seed/cache production images inside China instead of uploading large layers from overseas.
    registry_auth=$(mktemp -d "$root/registry-auth.XXXXXX")
    trap 'rm -rf "$registry_auth"' EXIT
    DOCKER+=(--config "$registry_auth")
    printf '%s' "$RESUME_DO_REGISTRY_PASSWORD" | "${DOCKER[@]}" login ccr.ccs.tencentyun.com --username 100054079705 --password-stdin
    unset RESUME_DO_REGISTRY_PASSWORD
    for service in "${services[@]}"; do
      target="ccr.ccs.tencentyun.com/leemrchang-resume-do/resume-$service:$RESUME_DO_IMAGE_TAG"
      "${DOCKER[@]}" tag "resume-$service:$RESUME_DO_IMAGE_TAG" "$target"
      "${DOCKER[@]}" push "$target"
    done
    rm -rf "$registry_auth"
    trap - EXIT
  fi
else
  gzip -dc "$release/images.tar.gz" | "${DOCKER[@]}" load >/dev/null
fi
for service in "${services[@]}"; do "${DOCKER[@]}" image inspect "resume-$service:$RESUME_DO_IMAGE_TAG" >/dev/null; done

# Verify actual candidate images against a disposable DB/files/network before changing production.
# Web-only releases avoid starting Java/Chromium: validate Nginx against the existing network.
if [[ -f "$release/source.tar.gz" ]]; then
  if [[ "${services[*]}" == web ]]; then
    "${DOCKER[@]}" run --rm --network resume-do-cloud_default --entrypoint nginx "resume-web:$RESUME_DO_IMAGE_TAG" -t
  else
    python3 - <<'PYMEM'
from pathlib import Path
memory = dict(line.split(':', 1) for line in Path('/proc/meminfo').read_text().splitlines())
if int(memory['MemAvailable'].split()[0]) < 2 * 1024 * 1024:
    raise SystemExit('Container verification needs 2 GiB available RAM; production is unchanged.')
PYMEM
    verify_project="resume-do-verify-${release_id:0:12}-${release_id:41}"
    compose config --format json | python3 "$release/source/scripts/isolate-compose.py" "$verify_project" > "$release/verify-compose.json"
    verify_compose() {
      "${DOCKER[@]}" compose -p "$verify_project" -f "$release/verify-compose.json" "$@" < /dev/null
    }
    cleanup_verify() {
      result=$?
      trap - EXIT
      # Only this generated project and its explicitly renamed disposable volumes.
      verify_compose down -v >/dev/null 2>&1 || true
      rm -f "$release/verify-compose.json"
      exit "$result"
    }
    trap cleanup_verify EXIT
    trap 'exit 1' HUP INT TERM
    if ! verify_compose up -d --wait --wait-timeout 300; then
      verify_compose logs --tail 50
      exit 1
    fi
    # Publicly known verification code applies only to this isolated test database.
    printf '%s\n' "INSERT INTO verification_codes (channel, target, purpose, code_hash, expires_at, request_ip) VALUES ('email', 'release-check@example.invalid', 'register', '\$2b\$10\$u1Ovk01LakmUIoXeGaRApucCi2LykTUOrAjqdJYRFiijQG7s32a2i', NOW(3) + INTERVAL 15 MINUTE, '127.0.0.1');" | \
      "${DOCKER[@]}" compose -p "$verify_project" -f "$release/verify-compose.json" exec -T resume-db \
        sh -c 'MYSQL_PWD="$MYSQL_PASSWORD" mysql --protocol=tcp -h127.0.0.1 -uresume_do -Dresume_do'
    endpoint=$(verify_compose port resume-web 80)
    python3 "$release/source/scripts/smoke-cloud.py" --base "http://$endpoint" --email release-check@example.invalid --code 123456
    verify_compose down -v
    rm -f "$release/verify-compose.json"
    trap - EXIT
  fi
fi

# No DDL: update only selected containers. On failure restore the previous image/config
# for those services; unrelated services remain running throughout.
if [[ "$selective" == 1 && "$has_migrations" == 0 ]]; then
  targets=()
  for service in "${services[@]}"; do targets+=("resume-$service"); done
  test -f "$root/current/SUCCESS"
  previous=$(readlink -f "$root/current")
  previous_compose() {
    "${DOCKER[@]}" compose -p resume-do-cloud --env-file "$root/deploy/.env" \
      --env-file "$previous/image.env" -f "$previous/deploy/compose.cloud.yaml" "$@" < /dev/null
  }
  rollback() {
    result=$?
    trap - EXIT
    if [[ "$result" != 0 ]]; then
      echo 'Selected service update failed; restoring previous images.' >&2
      previous_compose up -d --no-deps --wait --wait-timeout 240 "${targets[@]}" || echo 'ROLLBACK FAILED: inspect selected services immediately' >&2
      if [[ " ${services[*]} " == *' api '* ]]; then
        previous_compose exec -T resume-web nginx -s reload || true
      fi
    fi
    exit "$result"
  }
  trap rollback EXIT
  trap 'exit 1' HUP INT TERM
  # Preserve order for combined releases. Nginx must re-resolve the API container IP.
  for service in "${services[@]}"; do
    compose up -d --no-deps --wait --wait-timeout 240 "resume-$service"
  done
  if [[ " ${services[*]} " == *' api '* ]]; then
    compose exec -T resume-web nginx -s reload
  fi
  curl --fail --silent --show-error --retry 5 --retry-delay 2 --retry-all-errors --max-time 10 http://127.0.0.1:8081/api/health >/dev/null
  curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8081/ >/dev/null
  touch "$release/SUCCESS"
  python3 - "$root" "$release" <<'PYSWITCH'
import os, sys
root, release = sys.argv[1:]
temporary = root + '/current.next'
if os.path.lexists(temporary): os.unlink(temporary)
os.symlink(release, temporary)
os.replace(temporary, root + '/current')
PYSWITCH
  trap - EXIT
  echo "Deployed services: ${services[*]}; other containers unchanged."
  exit 0
fi

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
