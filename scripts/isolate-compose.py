#!/usr/bin/env python3
"""Make a resolved production Compose config safe for disposable container verification."""
import json
import sys


def isolate(config, project):
    if set(config['services']) != {'resume-db', 'resume-api', 'resume-worker', 'resume-web'}:
        raise ValueError('Unexpected services in verification config')
    for service in config['services'].values():
        if any(mount.get('type') != 'volume' for mount in service.get('volumes', [])):
            raise ValueError('Host bind mounts are forbidden in disposable verification')
    config['name'] = project
    for key, volume in config['volumes'].items():
        volume.clear()
        volume['name'] = project + '-' + key
    for key, network in config.get('networks', {}).items():
        network.clear()
        network['name'] = project + '-' + key
    for service in config['services'].values():
        service['restart'] = 'no'
        service.pop('container_name', None)
    db = config['services']['resume-db']
    db['environment']['MYSQL_ROOT_PASSWORD'] = 'verify-root-only'
    db['environment']['MYSQL_PASSWORD'] = 'verify-app-only'
    db['mem_limit'] = '512m'
    api = config['services']['resume-api']
    # Candidate containers must never send email/SMS, use AI, or inherit real credentials.
    api['environment'] = {
        'SPRING_PROFILES_ACTIVE': 'prod', 'RESUME_DO_DB_HOST': 'resume-db',
        'RESUME_DO_DB_NAME': 'resume_do', 'RESUME_DO_DB_USER': 'resume_do',
        'RESUME_DO_DB_PASSWORD': 'verify-app-only', 'RESUME_DO_STORAGE_DIR': '/data',
        'RESUME_DO_API_PORT': '8080', 'JAVA_TOOL_OPTIONS': '-XX:MaxRAMPercentage=65',
        'RESUME_DO_AI_ENABLED': 'false', 'RESUME_DO_MAIL_ENABLED': 'false',
        'RESUME_DO_SMS_ENABLED': 'false',
    }
    api['mem_limit'] = '512m'
    worker = config['services']['resume-worker']
    worker['environment']['RESUME_DO_DB_PASSWORD'] = 'verify-app-only'
    worker['mem_limit'] = '768m'
    web = config['services']['resume-web']
    web['mem_limit'] = '64m'
    web['ports'] = [{'target': 80, 'published': '0', 'host_ip': '127.0.0.1', 'protocol': 'tcp'}]
    return config


if __name__ == '__main__':
    print(json.dumps(isolate(json.load(sys.stdin), sys.argv[1])))
