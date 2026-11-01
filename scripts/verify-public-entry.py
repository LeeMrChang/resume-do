#!/usr/bin/env python3
"""Verify the public endpoints: unauthenticated boundary plus, with credentials, the session cookie."""
import http.cookiejar
import json
import os
import urllib.error
import urllib.request

base = 'https://resume.xiachen.xyz'
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def request(path, data=None):
    payload = None if data is None else json.dumps(data).encode()
    req = urllib.request.Request(base + path, data=payload,
                                 headers={'Content-Type': 'application/json'} if payload else {})
    with client.open(req, timeout=20) as response:
        content = response.read()
        return json.loads(content) if content else None


try:
    request('/api/resumes')
except urllib.error.HTTPError as error:
    assert error.code == 401, 'unauthenticated /api/resumes must answer 401, got %s' % error.code
else:
    raise SystemExit('Unauthenticated /api/resumes must not succeed')

account = os.environ.get('RESUME_DO_VERIFY_ACCOUNT', '').strip()
password = os.environ.get('RESUME_DO_VERIFY_PASSWORD', '')
if not account or not password:
    print('SKIP: 401 boundary verified; set RESUME_DO_VERIFY_ACCOUNT/RESUME_DO_VERIFY_PASSWORD for the session cookie check.')
    raise SystemExit(0)

request('/api/auth/login', {'account': account, 'password': password})
sessions = [cookie for cookie in jar if cookie.name == 'RESUME_DO_SESSION']
assert sessions, 'Session cookie missing'
assert all(cookie.secure and not cookie.domain_specified for cookie in sessions), 'Cookie must be Secure and host-only'
assert all(cookie.has_nonstandard_attr('HttpOnly') for cookie in sessions), 'Cookie must be HttpOnly'
assert request('/api/auth/me')['email'] == account
request('/api/auth/logout', {})
print('PASS: 401 boundary and host-only Secure HttpOnly session cookie; existing verification account only.')
