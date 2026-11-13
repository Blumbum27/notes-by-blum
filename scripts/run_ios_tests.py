"""Run native unit/UI tests on an installed iPhone and iPad simulator."""
from pathlib import Path
import json
import os
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def main():
    os.chdir(ROOT)
    inventory = json.loads(subprocess.check_output(['xcrun', 'simctl', 'list', 'devices', 'available', '--json'], text=True))
    runtimes = sorted((key for key in inventory['devices'] if 'iOS' in key), key=lambda key: tuple(map(int, re.findall(r'\d+', key))), reverse=True)
    destinations = []
    for family in ['iPhone', 'iPad']:
        found = next((device for runtime in runtimes for device in inventory['devices'][runtime]
                      if device.get('isAvailable') and family in device['name']), None)
        if found is None:
            raise SystemExit(f'No available {family} simulator. Install an iOS runtime and create the device in Xcode.')
        destinations += ['-destination', f'platform=iOS Simulator,id={found["udid"]}']
        print(f'Testing {found["name"]}', flush=True)
    results = ROOT / 'build/TestResults.xcresult'
    index = 1
    while results.exists():
        index += 1
        results = ROOT / f'build/TestResults-{index}.xcresult'
    results.parent.mkdir(exist_ok=True)
    subprocess.run(['xcodebuild', '-project', 'NotesByBlum.xcodeproj', '-scheme', 'NotesByBlum',
                    *destinations, '-parallel-testing-enabled', 'NO', '-resultBundlePath', str(results),
                    'CODE_SIGNING_ALLOWED=NO', 'test'], check=True)


if __name__ == '__main__':
    main()
