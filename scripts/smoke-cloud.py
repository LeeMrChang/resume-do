#!/usr/bin/env python3
"""Explicit smoke test: creates its own account/resume, never loads personal resume files."""
import argparse
import http.cookiejar
import json
import os
from pathlib import Path
import secrets
import time
import urllib.request
import uuid


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:8081')
    parser.add_argument('--email', default=os.environ.get('RESUME_DO_SMOKE_ACCOUNT', ''))
    parser.add_argument('--code', default=os.environ.get('RESUME_DO_SMOKE_CODE', ''))
    args = parser.parse_args()
    if not args.base.startswith(('http://127.0.0.1:', 'http://localhost:')):
        raise SystemExit('Use localhost or an SSH tunnel for this test')
    if not args.email or not args.code:
        raise SystemExit(
            'Registration needs a captcha and a mailed code now: seed a verification_codes row '
            'for a fresh address and pass --email/--code (see README smoke test section).')
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def request(path, body=None, method=None):
        payload = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(args.base.rstrip('/') + path, data=payload, method=method,
                                     headers={'Content-Type': 'application/json'} if payload else {})
        with opener.open(req, timeout=20) as response:
            value = response.read()
            return json.loads(value) if 'application/json' in response.headers.get('Content-Type', '') else value

    password = secrets.token_hex(20)
    request('/api/health')
    request('/api/auth/register', {
        'channel': 'email',
        'target': args.email,
        'code': args.code,
        'password': password,
        'displayName': 'Deployment verification',
    })
    request('/api/auth/logout', {}, 'POST')
    request('/api/auth/login', {'account': args.email, 'password': password})
    sample = json.loads((Path(__file__).resolve().parents[1] / 'apps/api/src/main/resources/empty-resume.json').read_text())
    sample['document']['basic']['name'] = '部署验证'
    sample['title'] = '部署验证'
    resume = request('/api/resumes', sample)
    updated = request('/api/resumes/' + resume['id'], {
        'baseRevision': resume['revision'], 'clientMutationId': uuid.uuid4().hex,
        'title': '部署验证已保存', 'document': sample['document'], 'appearance': sample['appearance'],
    }, 'PATCH')
    assert request('/api/resumes/' + resume['id'])['title'] == '部署验证已保存'
    job = request('/api/resumes/' + resume['id'] + '/exports', {
        'revision': updated['revision'], 'idempotencyKey': uuid.uuid4().hex, 'filename': '部署验证.pdf',
    })
    for _ in range(60):
        job = request('/api/exports/' + job['id'])
        if job['status'] == 'ready': break
        if job['status'] in ('failed', 'expired'): raise SystemExit('PDF export failed: ' + str(job.get('errorCode')))
        time.sleep(1)
    else:
        raise SystemExit('PDF export did not complete in 60 seconds')
    pdf = request('/api/exports/' + job['id'] + '/file')
    assert pdf.startswith(b'%PDF-') and len(pdf) > 1000
    request('/api/resumes/' + resume['id'], method='DELETE')
    print('PASS: register/login, create/save/reload, queued PDF generation/download, delete; only a new test account was used.')


if __name__ == '__main__': main()
