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
            for name in ['package.json', 'apps/api/pom.xml', 'deploy/maven-settings.xml', 'apps/api/src/main/App.java',
                         'apps/web/src/App.tsx', 'apps/api/.resume-do-local.yml',
                         '.env', 'data/private.pdf', 'apps/web/node_modules/private.js']:
                target = base / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text('test')
            output = base / 'source.tar.gz'
            self.packager().source_archive(base, output)
            with tarfile.open(output) as archive:
                names = set(archive.getnames())
            self.assertEqual(names, {'package.json', 'apps/api/pom.xml', 'deploy/maven-settings.xml',
                                   'apps/api/src/main/App.java', 'apps/web/src/App.tsx'})

    def test_maven_build_settings_cover_dependencies_and_plugins_without_host_changes(self):
        import xml.etree.ElementTree as ET
        ns = {'m': 'http://maven.apache.org/SETTINGS/1.2.0'}
        settings = ET.parse(ROOT / 'deploy/maven-settings.xml').getroot()
        mirror = settings.find('m:mirrors/m:mirror', ns)
        self.assertEqual(mirror.find('m:mirrorOf', ns).text, '*')
        self.assertEqual(mirror.find('m:url', ns).text, '${env.MAVEN_MIRROR_URL}')
        dockerfile = (ROOT / 'deploy/api.Dockerfile').read_text()
        commands = [line for line in dockerfile.splitlines() if line.startswith('RUN mvn ')]
        self.assertEqual(len(commands), 2)
        self.assertTrue(all('-s /build/maven-settings.xml' in command and '-q' not in command for command in commands))
        build = (ROOT / 'scripts/build-cloud.sh').read_text()
        self.assertIn('--build-arg MAVEN_MIRROR_URL=https://mirrors.cloud.tencent.com/nexus/repository/maven-public/', build)

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

    def deployment(self, fail_stage, source_mode=False, registry_mode=False, selected=None, baseline_mismatch=False, migration=False, legacy_baseline=False):
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
            if args[:1]==['--config']: args=args[2:]
            with open(os.environ['FAKE_LOG'],'a') as log: log.write(json.dumps(args)+'\\n')
            if args[0]=='load': sys.stdin.buffer.read()
            if args[0]=='login': sys.stdin.read()
            if args[0] in ('pull', 'push') and os.environ['FAIL_STAGE']==args[0]: sys.exit(1)
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
        planned = None
        if selected is not None:
            old = root / 'releases' / ('b' * 40 + '-1-1')
            (old / 'deploy').mkdir(parents=True)
            (old / 'deploy/compose.cloud.yaml').write_bytes((ROOT / 'deploy/compose.cloud.yaml').read_bytes())
            (old / 'image.env').write_text('RESUME_DO_IMAGE_TAG=ci-' + old.name + '\n')
            (old / 'SUCCESS').touch()
            (root / 'current').symlink_to(old)
            fp = {k: 'c' * 64 for k in ('api', 'worker', 'web', 'migrations')}
            (old / 'plan.json').write_text(json.dumps({'fingerprints': fp}))
            if legacy_baseline: (old / 'plan.json').unlink()
            next_fp = {**fp}
            for service in selected: next_fp[service] = 'd' * 64
            if baseline_mismatch: next_fp['api'] = 'e' * 64
            if migration: next_fp['migrations'] = 'f' * 64
            planned = base / 'plan.json'
            planned.write_text(json.dumps({'services': selected, 'fingerprints': next_fp,
                                          'migrations': migration, 'commit': 'a' * 40}))
        if registry_mode:
            refs = base / 'images.json'
            refs.write_text(json.dumps({s: 'ccr.ccs.tencentyun.com/test/resume-' + s + '@sha256:' + 'a' * 64 for s in ('api', 'worker', 'web')}))
            module.package(ROOT, None, release, root / 'incoming' / (release + '.tar'), registry_refs=refs)
        elif source_mode:
            payload_root = base / 'payload'
            for name in module.PAYLOAD:
                target = payload_root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((ROOT / name).read_bytes())
            (payload_root / 'scripts/build-cloud.sh').write_text(
                '#!/bin/bash\nexit 0\n' if fail_stage == 'push' else
                '#!/bin/bash\necho "Simulated build failure" >&2\nexit 1\n')
            source = base / 'source.tar.gz'
            source.write_bytes(gzip.compress(b'fake-source'))
            module.package(payload_root, None, release, root / 'incoming' / (release + '.tar'), source=source)
        else:
            module.package(ROOT, images, release, root / 'incoming' / (release + '.tar'), plan=planned)
        env = {**os.environ, 'PATH': str(binary) + os.pathsep + os.environ['PATH'],
               'FAKE_LOG': str(base / 'commands.jsonl'), 'FAIL_STAGE': fail_stage,
               'RESUME_DO_REGISTRY_PASSWORD': 'test-only-password'}
        result = subprocess.run(['bash', str(ROOT / 'scripts/deploy-cloud.sh'), release, str(root)],
                                capture_output=True, text=True, env=env)
        log = base / 'commands.jsonl'
        commands = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
        return result, commands, root

    def test_web_only_release_never_restarts_api_worker_or_backs_up_database(self):
        result, commands, root = self.deployment('none', selected=['web'])
        self.assertEqual(result.returncode, 0, result.stderr)
        updates = [c for c in commands if 'up' in c]
        self.assertEqual(len(updates), 1)
        self.assertEqual(updates[0][-1], 'resume-web')
        self.assertFalse(any('stop' in c or 'mysqldump' in ' '.join(c) for c in commands))
        env = (root / 'current/image.env').read_text()
        self.assertIn('RESUME_DO_API_IMAGE=resume-api:ci-' + 'b' * 40, env)
        self.assertIn('RESUME_DO_WEB_IMAGE=resume-web:ci-' + 'a' * 40, env)

    def test_worker_only_release_updates_worker(self):
        result, commands, _ = self.deployment('none', selected=['worker'])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([c[-1] for c in commands if 'up' in c], ['resume-worker'])

    def test_api_only_release_reloads_nginx_without_recreating_web(self):
        result, commands, _ = self.deployment('none', selected=['api'])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([c[-1] for c in commands if 'up' in c], ['resume-api'])
        self.assertTrue(any(c[-3:] == ['nginx', '-s', 'reload'] for c in commands))

    def test_partial_failure_rolls_back_only_selected_service(self):
        result, commands, root = self.deployment('api', selected=['api'])
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual([c[-1] for c in commands if 'up' in c], ['resume-api', 'resume-api'])
        self.assertEqual((root / 'current').resolve().name, 'b' * 40 + '-1-1')
        self.assertFalse(any('stop' in c for c in commands))

    def test_baseline_mismatch_fails_before_application_changes(self):
        result, commands, _ = self.deployment('none', selected=['web'], baseline_mismatch=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('baseline changed', result.stderr)
        self.assertFalse(any('up' in c or 'stop' in c or 'load' in c for c in commands))

    def test_migration_rejects_partial_release(self):
        result, commands, _ = self.deployment('none', selected=['api'], migration=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('coordinated full release', result.stderr)
        self.assertFalse(any('up' in c or 'stop' in c for c in commands))

    def test_first_independent_release_preserves_full_migration_safety(self):
        result, commands, root = self.deployment('none', selected=['api', 'worker', 'web'], legacy_baseline=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(any('stop' in c and 'resume-api' in c for c in commands))
        self.assertTrue(list((root / 'backups').glob('*/COMPLETE')))
        self.assertEqual((root / 'current').resolve().name, 'a' * 40 + '-1-1')
        self.assertTrue((root / 'current/plan.json').exists())

    def test_isolated_verification_cannot_use_production_data_or_credentials(self):
        import copy
        spec = importlib.util.spec_from_file_location('isolation', ROOT / 'scripts/isolate-compose.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        config = {
            'name': 'resume-do-cloud',
            'volumes': {'files': {'name': 'production-files', 'external': True},
                        'mysql': {'name': 'production-db'}},
            'networks': {'default': {'name': 'production-network', 'external': True}},
            'services': {
                'resume-db': {'environment': {'MYSQL_PASSWORD': 'secret', 'MYSQL_ROOT_PASSWORD': 'root-secret'}},
                'resume-api': {'environment': {'RESUME_DO_MAIL_PASSWORD': 'mail-secret', 'RESUME_DO_AI_API_KEY': 'ai-secret'}},
                'resume-worker': {'environment': {'RESUME_DO_DB_PASSWORD': 'secret'}},
                'resume-web': {'ports': [{'published': '8081'}]},
            },
        }
        result = module.isolate(copy.deepcopy(config), 'verify-test')
        self.assertTrue(all(v['name'].startswith('verify-test-') and 'external' not in v
                            for group in ('volumes', 'networks') for v in result[group].values()))
        self.assertNotIn('secret', json.dumps(result))
        self.assertEqual(result['services']['resume-web']['ports'][0]['published'], '0')
        self.assertEqual(result['services']['resume-api']['environment']['RESUME_DO_MAIL_ENABLED'], 'false')

    def test_registry_pull_failure_does_not_stop_application_and_removes_credentials(self):
        result, commands, root = self.deployment('pull', registry_mode=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(any(c[0] == 'pull' for c in commands))
        self.assertFalse(any('stop' in c or 'up' in c for c in commands))
        self.assertFalse(list(root.glob('registry-auth.*')))

    def test_registry_release_pulls_digests_and_deploys_after_health(self):
        result, commands, root = self.deployment('none', registry_mode=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        pulls = [c[1] for c in commands if c[0] == 'pull']
        self.assertEqual(len(pulls), 3)
        self.assertTrue(all('@sha256:' in c for c in pulls))
        self.assertTrue((root / 'current/SUCCESS').exists())
        self.assertFalse(list(root.glob('registry-auth.*')))

    def test_registry_refs_reject_mutable_tags_and_other_hosts(self):
        with tempfile.TemporaryDirectory() as scratch:
            path = Path(scratch) / 'images.json'
            for ref in ['ccr.ccs.tencentyun.com/test/resume-api:latest',
                        'example.com/test/resume-api@sha256:' + 'a' * 64]:
                refs = {s: 'ccr.ccs.tencentyun.com/test/resume-' + s + '@sha256:' + 'a' * 64 for s in ('api', 'worker', 'web')}
                refs['api'] = ref
                path.write_text(json.dumps(refs))
                with self.assertRaises(ValueError): self.packager().validate_image_refs(path)

    def test_domestic_publish_failure_preserves_current_application_and_cleans_credentials(self):
        result, commands, root = self.deployment('push', source_mode=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(any(c[0] == 'push' for c in commands))
        self.assertFalse(any('stop' in c or 'up' in c for c in commands))
        self.assertFalse(list(root.glob('registry-auth.*')))

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
            self.assertTrue(all('--build-arg PLAYWRIGHT_DOWNLOAD_HOST=https://cdn.npmmirror.com/binaries/playwright' in c for c in commands))
            self.assertTrue(all('--memory=1g' in c and '--cpu-quota=100000' in c for c in commands))
            self.assertTrue(all('--build-arg DEBIAN_MIRROR=mirrors.cloud.tencent.com' in c for c in commands))

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
