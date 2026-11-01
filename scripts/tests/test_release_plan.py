"""Exercise actual Git histories: additions, deletions and accumulated failed releases."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('planner', Path(__file__).resolve().parents[1] / 'plan-release.py')
planner = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(planner)


class ReleasePlanTests(unittest.TestCase):
    def test_deploy_condition_allows_intentionally_skipped_ancestors(self):
        # GitHub otherwise injects success(), which propagates the skipped integration
        # ancestor even though the always() aggregate check itself succeeds.
        workflow = (Path(__file__).resolve().parents[2] / '.github/workflows/ci-cd.yml').read_text()
        condition = workflow.split('  deploy:', 1)[1].split('    runs-on:', 1)[0]
        self.assertIn('!cancelled()', condition)
        self.assertIn("needs.checks.result == 'success'", condition)
        self.assertIn("needs.plan.outputs.any == 'true'", condition)

    def test_service_boundaries(self):
        for path, services in {
            'apps/web/src/App.tsx': {'web'},
            'apps/api/src/main/App.java': {'api'},
            'apps/pdf-worker/src/db.ts': {'worker'},
            'packages/templates/src/index.ts': {'web', 'worker'},
            'packages/schema/src/index.ts': set(planner.SERVICES),
            'package-lock.json': set(planner.SERVICES),
            'deploy/compose.cloud.yaml': set(planner.SERVICES),
            'README.md': set(),
        }.items():
            self.assertEqual(planner.affected(path), services, path)

    def test_accumulated_changes_deletion_and_migrations(self):
        with tempfile.TemporaryDirectory() as scratch, patch.dict(os.environ, {
            'GIT_AUTHOR_NAME': 'Test', 'GIT_AUTHOR_EMAIL': 'test@example.invalid',
            'GIT_COMMITTER_NAME': 'Test', 'GIT_COMMITTER_EMAIL': 'test@example.invalid',
        }):
            cwd = os.getcwd()
            os.chdir(scratch)
            try:
                def git(*args):
                    return subprocess.check_output(['git', *args], text=True).strip()
                git('init', '-q')
                def commit(path, value):
                    target = Path(path)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_text(value)
                    git('add', '.')
                    git('commit', '-qm', 'test')
                    return git('rev-parse', 'HEAD')
                first = commit('apps/api/App.java', 'first')
                second = commit('apps/web/App.tsx', 'web')
                third = commit('apps/pdf-worker/db.ts', 'worker')
                self.assertEqual(planner.plan(first, third)['services'], ['worker', 'web'])
                self.assertEqual(planner.plan(second, third)['services'], ['worker'])
                git('rm', 'apps/web/App.tsx')
                git('commit', '-qm', 'delete')
                self.assertEqual(planner.plan(third, 'HEAD')['services'], ['web'])
                before = git('rev-parse', 'HEAD')
                commit('apps/api/src/main/resources/db/migration/V9.sql', 'ALTER TABLE x ADD y INT;')
                self.assertEqual(set(planner.plan(before, 'HEAD')['services']), set(planner.SERVICES))
                self.assertTrue(planner.plan(before, 'HEAD')['migrations'])
                self.assertEqual(set(planner.plan(before, 'HEAD', full=True)['services']), set(planner.SERVICES))
            finally:
                os.chdir(cwd)
