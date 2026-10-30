#!/usr/bin/env python3
"""Package only production Compose, operation helpers and pre-built Docker images."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile
import tempfile

PAYLOAD = ('deploy/compose.cloud.yaml', 'scripts/backup-cloud.sh')
SOURCE_FILES = ('package.json', 'package-lock.json', 'tsconfig.base.json', '.dockerignore',
                'apps/api/pom.xml', 'apps/web/package.json', 'apps/web/index.html',
                'apps/web/tsconfig.json', 'apps/web/vite.config.ts', 'apps/pdf-worker/package.json',
                'scripts/copy-pdf-assets.mjs', 'deploy/api.Dockerfile', 'deploy/web.Dockerfile',
                'deploy/worker.Dockerfile', 'deploy/nginx.conf', 'deploy/worker-health.mjs')
SOURCE_DIRS = ('apps/api/src/main', 'apps/web/src', 'apps/web/public',
               'apps/pdf-worker/src', 'packages/schema', 'packages/templates')


def source_archive(root, output):
    root = root.resolve()
    paths = {root / name for name in SOURCE_FILES if (root / name).exists()}
    for name in SOURCE_DIRS:
        paths.update((root / name).rglob('*'))
    with tarfile.open(output, 'w:gz') as archive:
        for path in sorted(paths):
            relative = path.relative_to(root)
            if any(part in {'node_modules', 'dist', 'target', '.git'} for part in relative.parts):
                continue
            if path.name.startswith('.env') or path.name == '.resume-do-local.yml':
                continue
            if path.is_symlink() or any(parent.is_symlink() for parent in path.parents if root in parent.parents):
                raise ValueError('Symlinked source input')
            if path.is_file(): archive.add(path, arcname=str(relative), recursive=False)


def validate_release(value):
    if not re.fullmatch(r'[a-f0-9]{40}-[0-9]+-[0-9]+', value):
        raise ValueError('Invalid release ID')
    return value


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def package(root, images, release, output, source=None):
    validate_release(release)
    inputs = {name: root / name for name in PAYLOAD}
    if source is not None:
        inputs['source.tar.gz'] = source
        inputs['scripts/build-cloud.sh'] = root / 'scripts/build-cloud.sh'
    else:
        inputs['images.tar.gz'] = images
    for path in inputs.values():
        if path.is_symlink() or not path.is_file():
            raise ValueError('Missing or symlinked release input')
    manifest = json.dumps({'release': release, 'sha256': {name: digest(path) for name, path in inputs.items()}}, sort_keys=True).encode()
    with output.open('xb') as stream, tarfile.open(fileobj=stream, mode='w') as archive:
        for name, path in inputs.items():
            archive.add(path, arcname=name, recursive=False)
        info = tarfile.TarInfo('release.json')
        info.size = len(manifest)
        info.mode = 0o600
        archive.addfile(info, io.BytesIO(manifest))
    output.chmod(0o600)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--images', type=Path)
    mode.add_argument('--source', action='store_true')
    parser.add_argument('--release', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    if args.source:
        with tempfile.TemporaryDirectory() as scratch:
            source = Path(scratch) / 'source.tar.gz'
            source_archive(root, source)
            package(root, None, args.release, args.output, source=source)
    else:
        package(root, args.images, args.release, args.output)
    print(f'Release bundle: {args.output.stat().st_size:,} bytes')
