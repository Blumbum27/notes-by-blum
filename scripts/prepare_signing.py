"""Install explicitly supplied signing material on an ephemeral macOS CI runner."""
from pathlib import Path
import base64
from datetime import datetime, timezone
import os
import plistlib
import re
import secrets
import subprocess


def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    keys = ['IOS_DISTRIBUTION_P12_BASE64', 'IOS_DISTRIBUTION_P12_PASSWORD', 'IOS_PROFILE_BASE64',
            'ASC_PRIVATE_KEY', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'APPLE_TEAM_ID', 'APP_BUNDLE_ID', 'RUNNER_TEMP', 'GITHUB_ENV']
    missing = [key for key in keys if not os.environ.get(key)]
    if missing:
        raise SystemExit('Missing configuration: ' + ', '.join(missing))
    directory = Path(os.environ['RUNNER_TEMP']).resolve() / 'blumbum-signing'
    directory.mkdir(mode=0o700, exist_ok=False)
    p12 = directory / 'distribution.p12'
    p12.write_bytes(base64.b64decode(os.environ['IOS_DISTRIBUTION_P12_BASE64'], validate=True))
    profile = directory / 'profile.mobileprovision'
    profile.write_bytes(base64.b64decode(os.environ['IOS_PROFILE_BASE64'], validate=True))
    key = directory / 'AppStoreConnect.p8'
    key.write_text(os.environ['ASC_PRIVATE_KEY'])
    for file in [p12, profile, key]: file.chmod(0o600)
    decoded = subprocess.check_output(['security', 'cms', '-D', '-i', str(profile)], stderr=subprocess.DEVNULL)
    metadata = plistlib.loads(decoded)
    team = os.environ['APPLE_TEAM_ID']
    bundle = os.environ['APP_BUNDLE_ID']
    if metadata.get('TeamIdentifier') != [team] or metadata['Entitlements'].get('application-identifier') != f'{team}.{bundle}' or metadata['Entitlements'].get('get-task-allow', False) or 'ProvisionedDevices' in metadata or metadata.get('ProvisionsAllDevices', False):
        raise SystemExit('Profile must be an App Store distribution profile matching APPLE_TEAM_ID and APP_BUNDLE_ID.')
    expiry = metadata['ExpirationDate'].replace(tzinfo=timezone.utc)
    if expiry <= datetime.now(timezone.utc):
        raise SystemExit('Provisioning profile expired.')
    profile_uuid = metadata['UUID']
    if not re.fullmatch(r'[A-Fa-f0-9-]{36}', profile_uuid):
        raise SystemExit('Invalid provisioning profile UUID.')
    (directory / 'profile-uuid.txt').write_text(profile_uuid)
    profile_directories = [Path.home() / 'Library/MobileDevice/Provisioning Profiles', Path.home() / 'Library/Developer/Xcode/UserData/Provisioning Profiles']
    for destination in profile_directories:
        destination.mkdir(parents=True, exist_ok=True)
        (destination / f'{profile_uuid}.mobileprovision').write_bytes(profile.read_bytes())
    keychain = directory / 'signing.keychain-db'
    password = secrets.token_urlsafe(32)
    run('security', 'create-keychain', '-p', password, str(keychain))
    run('security', 'set-keychain-settings', '-lut', '21600', str(keychain))
    run('security', 'unlock-keychain', '-p', password, str(keychain))
    run('security', 'import', str(p12), '-P', os.environ['IOS_DISTRIBUTION_P12_PASSWORD'], '-A', '-t', 'cert', '-f', 'pkcs12', '-k', str(keychain))
    run('security', 'list-keychains', '-d', 'user', '-s', str(keychain), str(Path.home() / 'Library/Keychains/login.keychain-db'))
    run('security', 'set-key-partition-list', '-S', 'apple-tool:,apple:,codesign:', '-k', password, str(keychain))
    for destination in ['export', 'upload']:
        options = {'method': 'app-store-connect', 'destination': destination, 'signingStyle': 'manual',
                   'teamID': team, 'signingCertificate': 'Apple Distribution',
                   'provisioningProfiles': {bundle: profile_uuid}, 'manageAppVersionAndBuildNumber': False, 'uploadSymbols': True}
        (directory / f'options-{destination}.plist').write_bytes(plistlib.dumps(options))
    with open(os.environ['GITHUB_ENV'], 'a') as output:
        output.write(f'SIGNING_DIR={directory}\nPROFILE_UUID={profile_uuid}\n')
    print('Signing material validated and installed. No credentials were printed.')


if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError:
        raise SystemExit('macOS signing setup failed. Check certificate password, profile and distribution certificate validity.')
