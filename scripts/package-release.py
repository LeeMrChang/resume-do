#!/usr/bin/env python3
"""Package only production Compose, operation helpers and pre-built Docker images."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile

PAYLOAD = ('deploy/compose.cloud.yaml', 'scripts/backup-cloud.sh')


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


def package(root, images, release, output):
    validate_release(release)
    inputs = {name: root / name for name in PAYLOAD}
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
    parser.add_argument('--images', type=Path, required=True)
    parser.add_argument('--release', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    package(Path(__file__).resolve().parents[1], args.images, args.release, args.output)
