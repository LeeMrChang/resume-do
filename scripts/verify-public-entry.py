#!/usr/bin/env python3
"""Verify only the configured public endpoints using a fresh synthetic account."""
import http.cookiejar
import json
import secrets
import urllib.error
import urllib.request
import uuid

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


account = {'email': 'public-check-' + uuid.uuid4().hex + '@example.invalid',
           'password': secrets.token_hex(20), 'displayName': 'Public HTTPS verification'}
request('/api/auth/register', account)
sessions = [cookie for cookie in jar if cookie.name == 'RESUME_DO_SESSION']
assert sessions, 'Session cookie missing'
assert all(cookie.secure and not cookie.domain_specified for cookie in sessions), 'Cookie must be Secure and host-only'
assert all(cookie.has_nonstandard_attr('HttpOnly') for cookie in sessions), 'Cookie must be HttpOnly'
assert request('/api/auth/me')['email'] == account['email']
request('/api/auth/logout', {})
request('/api/auth/login', {key: account[key] for key in ('email', 'password')})
assert request('/api/auth/me')['email'] == account['email']
request('/api/auth/logout', {})
print('PASS: public registration/login/logout and host-only Secure HttpOnly session cookie; synthetic account only.')
