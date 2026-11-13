"""Fail closed before a distribution build; never a substitute for device QA."""
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import argparse
import json
import plistlib
import re

ROOT = Path(__file__).resolve().parents[1]


def problems(config):
    issues = []
    if not str(config.get('developerName', '')).strip():
        issues.append('developerName: enter the real publisher name.')
    if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', config.get('supportEmail', '')):
        issues.append('supportEmail: enter a working public support email.')
    for key in ['privacyPolicyURL', 'supportURL']:
        url = urlparse(config.get(key, ''))
        if url.scheme != 'https' or not url.hostname or '.' not in url.hostname or url.username or url.password or url.hostname.endswith(('.example', '.invalid', '.local', '.test')) or url.hostname in ('example.com', 'example.org', 'example.net') or all(part.isdigit() for part in url.hostname.split('.')):
            issues.append(f'{key}: supply the actual public HTTPS page, not a placeholder.')
    return issues


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check-urls', action='store_true')
    options = parser.parse_args()
    config = json.loads((ROOT / 'Blumbum/Resources/AppConfiguration.json').read_text(encoding='utf-8'))
    issues = problems(config)
    if not issues and options.check_urls:
        display_name = plistlib.loads((ROOT / 'Blumbum/Resources/Info.plist').read_bytes())['CFBundleDisplayName']
        for key in ['privacyPolicyURL', 'supportURL']:
            try:
                with urlopen(Request(config[key], headers={'User-Agent': 'notes by Blum release check'}), timeout=20) as response:
                    final = urlparse(response.geturl())
                    content = response.read(2_000_000).decode('utf-8', errors='replace')
                    if response.status != 200 or final.scheme != 'https' or display_name.casefold() not in content.casefold() or 'text/html' not in response.headers.get('Content-Type', ''):
                        issues.append(f'{key}: page must be public HTML for notes by Blum over HTTPS.')
            except Exception as error:
                issues.append(f'{key}: page unavailable ({type(error).__name__}).')
    if issues:
        print('Distribution blocked:')
        for issue in issues:
            print('- ' + issue)
        raise SystemExit(1)
    print('PASS: publisher contacts and policy/support URLs configured. Device, StoreKit and App Review checks remain separate.')


if __name__ == '__main__':
    main()
