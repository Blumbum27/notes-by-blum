"""Select a locally installed stable Xcode with SDK >= 26 (macOS only)."""
from pathlib import Path
import os
import re
import subprocess


def main():
    candidates = []
    for app in Path('/Applications').glob('Xcode*.app'):
        if 'beta' in app.name.lower():
            continue
        directory = str(app / 'Contents/Developer')
        environment = dict(os.environ, DEVELOPER_DIR=directory)
        version = subprocess.run(['xcodebuild', '-version'], env=environment, capture_output=True, text=True)
        match = re.search(r'Xcode (\d+)(?:\.(\d+))?', version.stdout)
        if match:
            candidates.append(((int(match[1]), int(match[2] or 0)), directory))
    if not candidates:
        raise SystemExit('No stable Xcode installed under /Applications.')
    version, directory = max(candidates)
    environment = dict(os.environ, DEVELOPER_DIR=directory)
    sdk = subprocess.check_output(['xcrun', '--sdk', 'iphoneos', '--show-sdk-version'], env=environment, text=True).strip()
    if version[0] < 26 or int(sdk.split('.')[0]) < 26:
        raise SystemExit('App Store upload requires Xcode 26+ and iOS SDK 26+.')
    if os.environ.get('GITHUB_ENV'):
        with open(os.environ['GITHUB_ENV'], 'a') as output:
            output.write(f'DEVELOPER_DIR={directory}\n')
    print(f'Selected Xcode {version[0]}.{version[1]}, iOS SDK {sdk}: {directory}')


if __name__ == '__main__':
    main()
