#!/usr/bin/env bash
# Build before stopping any application. Never compiles on the host outside Docker.
set -Eeuo pipefail
release=${1:?release directory required}
tag=${2:?immutable image tag required}
[[ "$tag" =~ ^ci-[a-f0-9]{40}-[0-9]+-[0-9]+$ ]] || exit 1
python3 - "$release" <<'PY'
import pathlib, shutil, sys, tarfile
root = pathlib.Path(sys.argv[1])
available = dict(line.split(':', 1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())
if int(available['MemAvailable'].split()[0]) < 1536 * 1024 or shutil.disk_usage(root).free < 8 * 1024**3:
    raise SystemExit('Build requires 1536 MiB available RAM and 8 GiB free disk; existing services unchanged.')
target = root / 'source'
target.mkdir(mode=0o700)
with tarfile.open(root / 'source.tar.gz', 'r:gz') as archive:
    members = archive.getmembers()
    if len(members) > 10000 or sum(m.size for m in members) > 100 * 1024**2:
        raise SystemExit('Source archive too large')
    names = set()
    for member in members:
        path = pathlib.PurePosixPath(member.name)
        if (not member.isfile() or path.is_absolute() or '..' in path.parts or member.name in names
            or any(p in {'node_modules', 'dist', 'target', '.git', 'data'} for p in path.parts)
            or path.name.startswith('.env') or path.name == '.resume-do-local.yml'):
            raise SystemExit('Unsafe source archive')
        names.add(member.name)
    for member in members:
        path = target / member.name
        path.parent.mkdir(parents=True, exist_ok=True)
        with archive.extractfile(member) as source, path.open('xb') as dest:
            shutil.copyfileobj(source, dest)
PY
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker); fi
for service in api worker web; do
  echo "Building $service on server (one CPU, 1 GiB memory limit)"
  # Classic builder enforces per-build resource limits without creating a shared BuildKit service.
  "${DOCKER[@]}" build --help | grep -q -- '--memory' || { echo 'Docker build memory limits unavailable'; exit 1; }
  if [[ "${DOCKER[0]}" == sudo ]]; then
    builder=(sudo -n env DOCKER_BUILDKIT=0 docker)
  else
    builder=(env DOCKER_BUILDKIT=0 docker)
  fi
  "${builder[@]}" build --memory=1g --memory-swap=1g --cpu-period=100000 --cpu-quota=100000 \
    --build-arg MAVEN_IMAGE=mirror.ccs.tencentyun.com/library/maven:3.9-eclipse-temurin-21 \
    --build-arg JAVA_IMAGE=mirror.ccs.tencentyun.com/library/eclipse-temurin:21-jre \
    --build-arg NODE_IMAGE=mirror.ccs.tencentyun.com/library/node:22-bookworm-slim \
    --build-arg NGINX_IMAGE=mirror.ccs.tencentyun.com/library/nginx:1.27-alpine \
    -f "$release/source/deploy/$service.Dockerfile" -t "resume-$service:$tag" "$release/source"
done
