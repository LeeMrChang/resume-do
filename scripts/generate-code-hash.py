#!/usr/bin/env python3
"""Print a BCrypt hash for the fixed smoke-test verification code (CI only, disposable database)."""
import subprocess
import sys


def load_bcrypt():
    try:
        import bcrypt
        return bcrypt
    except ImportError:
        pass
    for flags in (['--quiet', '--disable-pip-version-check'],
                  ['--quiet', '--disable-pip-version-check', '--break-system-packages']):
        if subprocess.run([sys.executable, '-m', 'pip', 'install', *flags, 'bcrypt'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            break
    try:
        import bcrypt
        return bcrypt
    except ImportError:
        raise SystemExit('Install the bcrypt module (pip install bcrypt) and retry.') from None


bcrypt = load_bcrypt()
print(bcrypt.hashpw(b'123456', bcrypt.gensalt(10)).decode())
