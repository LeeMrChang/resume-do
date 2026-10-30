"""Cloud deployment boundaries; never connects to Docker, MySQL, SSH or GitHub."""
import importlib.util
import gzip
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class CloudDeploymentTests(unittest.TestCase):
    def test_source_bundle_is_small_and_excludes_private_files(self):
        import tarfile
        with tempfile.TemporaryDirectory() as scratch:
            base = Path(scratch)
            for name in ['package.json', 'apps/api/pom.xml', 'apps/api/src/main/App.java',
                         'apps/web/src/App.tsx', 'apps/api/.resume-do-local.yml',
                         '.env', 'data/private.pdf', 'apps/web/node_modules/private.js']:
                target = base / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text('test')
            output = base / 'source.tar.gz'
            self.packager().source_archive(base, output)
            with tarfile.open(output) as archive:
                names = set(archive.getnames())
            self.assertEqual(names, {'package.json', 'apps/api/pom.xml',
                                   'apps/api/src/main/App.java', 'apps/web/src/App.tsx'})

    def test_locked_packages_are_downloadable_without_company_network(self):
        from urllib.parse import urlparse
        packages = json.loads((ROOT / 'package-lock.json').read_text())['packages']
        for name, package in packages.items():
            resolved = package.get('resolved', '')
            if resolved.startswith(('https://', 'http://')):
                self.assertEqual(urlparse(resolved).netloc, 'registry.npmjs.org', name)

    def packager(self):
        spec = importlib.util.spec_from_file_location('package_release', ROOT / 'scripts/package-release.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_cloud_port_and_volumes_are_isolated_from_cost(self):
        text = (ROOT / 'deploy/compose.cloud.yaml').read_text()
        self.assertIn('127.0.0.1:8081:80', text)
        self.assertNotIn('8080:8080', text)
        self.assertIn('resume_do_cloud_mysql_data', text)
        self.assertIn('resume_do_cloud_files', text)
        self.assertNotIn('cost-cloud', text)

    def test_invalid_release_is_rejected_before_packaging(self):
        with self.assertRaises(ValueError):
            self.packager().validate_release('../escape')

    def test_bundle_does_not_include_secrets_or_development_data(self):
        import tarfile
        module = self.packager()
        with tempfile.TemporaryDirectory() as scratch:
            base = Path(scratch)
            for name in module.PAYLOAD:
                target = base / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text('safe')
            (base / '.env').write_text('SECRET=never-ship')
            (base / 'apps').mkdir()
            (base / 'apps/.resume-do-local.yml').write_text('private')
            images = base / 'images.tar.gz'
            images.write_bytes(b'fake-images')
            output = base / 'release.tar'
            module.package(base, images, 'a' * 40 + '-1-1', output)
            with tarfile.open(output) as archive:
                names = set(archive.getnames())
                self.assertEqual(names, set(module.PAYLOAD) | {'images.tar.gz', 'release.json'})
                self.assertFalse(any('.env' in name or 'local.yml' in name for name in names))

    def test_release_validation_rejects_path_traversal(self):
        result = subprocess.run(['bash', str(ROOT / 'scripts/deploy-cloud.sh'), '../escape', '/tmp/resume-do-test'],
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Invalid release', result.stderr)

    def test_cloud_helpers_have_valid_shell_syntax(self):
        for name in ['deploy-cloud.sh', 'bootstrap-cloud.sh', 'backup-cloud.sh', 'setup-cicd.sh', 'build-cloud.sh']:
            result = subprocess.run(['bash', '-n', str(ROOT / 'scripts' / name)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    def deployment(self, fail_stage, source_mode=False):
        """Run the real release state machine against isolated executable substitutes."""
        import textwrap
        scratch = tempfile.TemporaryDirectory()
        self.addCleanup(scratch.cleanup)
        base = Path(scratch.name)
        root = base / 'resume-do'
        for directory in ['deploy', 'incoming', 'releases', 'backups']:
            (root / directory).mkdir(parents=True, exist_ok=True)
        (root / 'deploy/.env').write_text('RESUME_DO_DB_PASSWORD=test-only\n')
        binary = base / 'bin'
        binary.mkdir()
        docker = binary / 'docker'
        docker.write_text(textwrap.dedent('''\
            #!/usr/bin/env python3
            import io,json,os,pathlib,sys,tarfile
            args=sys.argv[1:]
            with open(os.environ['FAKE_LOG'],'a') as log: log.write(json.dumps(args)+'\\n')
            if args[0]=='load': sys.stdin.buffer.read()
            if args[0]=='compose':
                command=args[args.index('-f')+2:]
                if command[0]=='ps':
                    print('db-id' if 'resume-db' in command else 'old-api\\nold-worker\\nold-web')
                if command[0]=='exec' and 'mysqldump' in command[-1]:
                    if os.environ['FAIL_STAGE']=='backup': sys.exit(1)
                    print('-- simulated database backup')
                if command[0]=='up' and 'resume-api' in command and os.environ['FAIL_STAGE']=='api': sys.exit(1)
            if args[0]=='run':
                destination=next(a[:-8] for a in args if a.endswith(':/backup'))
                with tarfile.open(pathlib.Path(destination)/'files.tar.gz','w:gz') as archive:
                    item=tarfile.TarInfo('synthetic.txt');item.size=4;archive.addfile(item,io.BytesIO(b'test'))
            '''))
        docker.chmod(0o755)
        for name in ['flock', 'curl']:
            target = binary / name
            target.write_text('#!/bin/sh\nexit 0\n')
            target.chmod(0o755)
        checksum = binary / 'sha256sum'
        checksum.write_text('#!/usr/bin/env python3\nimport hashlib,sys\nfor f in sys.argv[1:]: print(hashlib.sha256(open(f,"rb").read()).hexdigest(),f)\n')
        checksum.chmod(0o755)
        images = base / 'images.tar.gz'
        images.write_bytes(gzip.compress(b'fake-image-load-stream'))
        release = 'a' * 40 + '-1-1'
        module = self.packager()
        if source_mode:
            payload_root = base / 'payload'
            for name in module.PAYLOAD:
                target = payload_root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((ROOT / name).read_bytes())
            (payload_root / 'scripts/build-cloud.sh').write_text(
                '#!/bin/bash\necho "Simulated build failure" >&2\nexit 1\n')
            source = base / 'source.tar.gz'
            source.write_bytes(gzip.compress(b'fake-source'))
            module.package(payload_root, None, release, root / 'incoming' / (release + '.tar'), source=source)
        else:
            module.package(ROOT, images, release, root / 'incoming' / (release + '.tar'))
        env = {**os.environ, 'PATH': str(binary) + os.pathsep + os.environ['PATH'],
               'FAKE_LOG': str(base / 'commands.jsonl'), 'FAIL_STAGE': fail_stage}
        result = subprocess.run(['bash', str(ROOT / 'scripts/deploy-cloud.sh'), release, str(root)],
                                capture_output=True, text=True, env=env)
        log = base / 'commands.jsonl'
        commands = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
        return result, commands, root

    def test_source_build_failure_does_not_stop_services_or_touch_database(self):
        result, commands, root = self.deployment('none', source_mode=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Simulated build failure', result.stderr)
        self.assertFalse(any('stop' in c or 'up' in c or 'exec' in c for c in commands))
        self.assertFalse((root / 'current').exists())

    def test_memory_capability_check_uses_the_selected_classic_builder(self):
        with tempfile.TemporaryDirectory() as scratch:
            base = Path(scratch)
            binary = base / 'bin'
            binary.mkdir()
            # Isolate archive/resource preflight; exercise the actual shell command selection.
            (binary / 'python3').write_text('#!/bin/sh\ncat >/dev/null\n')
            (binary / 'docker').write_text('''#!/bin/sh
if [ "$1" = info ]; then exit 0; fi
if [ "$1" = build ] && [ "$2" = --help ]; then
  [ "$DOCKER_BUILDKIT" = 0 ] || exit 1
  echo '  --memory Memory limit'
  exit 0
fi
[ "$DOCKER_BUILDKIT" = 0 ] || exit 2
echo "$*" >> "$BUILD_LOG"
''')
            for tool in binary.iterdir(): tool.chmod(0o755)
            log = base / 'build.log'
            env = {**os.environ, 'PATH': str(binary) + os.pathsep + os.environ['PATH'],
                   'BUILD_LOG': str(log)}
            result = subprocess.run(['bash', str(ROOT / 'scripts/build-cloud.sh'), str(base),
                                     'ci-' + 'a' * 40 + '-1-1'], env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            commands = log.read_text().splitlines()
            self.assertEqual(len(commands), 3)
            self.assertTrue(all('--memory=1g' in c and '--cpu-quota=100000' in c for c in commands))

    def test_backup_failure_restarts_old_application_and_does_not_migrate(self):
        result, commands, _ = self.deployment('backup')
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(any(c[:2] == ['start', 'old-api'] for c in commands))
        self.assertFalse(any('up' in c and 'resume-api' in c for c in commands))

    def test_api_start_failure_keeps_writers_stopped_and_preserves_backup(self):
        result, commands, root = self.deployment('api')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(c[:2] == ['start', 'old-api'] for c in commands))
        self.assertTrue(any('stop' in c and 'resume-api' in c for c in commands))
        self.assertTrue(list((root / 'backups').glob('*/COMPLETE')))
        self.assertFalse((root / 'current').exists())

    def test_success_switches_current_only_after_health(self):
        result, commands, root = self.deployment('none')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((root / 'current/SUCCESS').exists())
        self.assertTrue(all('cost-cloud' not in ' '.join(c) for c in commands))


if __name__ == '__main__':
    unittest.main()
