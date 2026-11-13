"""Portable package checks. These do NOT compile Swift or replace Xcode tests."""
from pathlib import Path
import json
import plistlib
import re
import struct
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]


def main():
    info = plistlib.loads((ROOT / "Blumbum/Resources/Info.plist").read_bytes())
    assert info["CFBundleDisplayName"] == "notes by Blum"
    assert info["UTExportedTypeDeclarations"][0]["UTTypeIdentifier"] == "app.blumbum.notebook"
    assert info["CFBundleVersion"] == "$(CURRENT_PROJECT_VERSION)"
    privacy = plistlib.loads((ROOT / "Blumbum/Resources/PrivacyInfo.xcprivacy").read_bytes())
    assert privacy["NSPrivacyTracking"] is False
    for path in ROOT.rglob("*.json"):
        json.loads(path.read_text(encoding="utf-8"))
    scheme = ET.parse(ROOT / "NotesByBlum.xcodeproj/xcshareddata/xcschemes/NotesByBlum.xcscheme")
    project = (ROOT / "NotesByBlum.xcodeproj/project.pbxproj").read_text(encoding="utf-8")
    definitions = re.findall(r"^([A-F0-9]{24}) = ", project, flags=re.M)
    assert len(set(definitions)) == len(definitions), "Duplicate PBX identifier"
    references = set(re.findall(r"\b[A-F0-9]{24}\b", project))
    assert references == set(definitions), "Unresolved PBX object reference"
    for path in list((ROOT / "Blumbum").rglob("*.swift")) + list((ROOT / "BlumbumTests").rglob("*.swift")) + list((ROOT / "BlumbumUITests").rglob("*.swift")):
        relative = path.relative_to(ROOT).as_posix()
        assert relative in project, f"Missing source in Xcode project: {relative}"
        assert path.read_text(encoding="utf-8").strip(), f"Empty source: {relative}"
    for buildable in scheme.findall(".//BuildableReference"):
        assert buildable.attrib["BlueprintIdentifier"] in definitions
    assert len(scheme.findall(".//TestableReference")) == 2
    assert 'MARKETING_VERSION = "1.0.0"' in project
    for path in (ROOT / "scripts").glob("*.sh"):
        assert b"\r\n" not in path.read_bytes(), f"Shell script needs LF endings: {path.name}"
    icon = ROOT / "Blumbum/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png"
    data = icon.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    assert struct.unpack(">II", data[16:24]) == (1024, 1024)
    assert data[25] == 2, "App icon must be RGB without alpha"
    subscription = (ROOT / "Blumbum/Services/SubscriptionStore.swift").read_text(encoding="utf-8")
    assert all(product in subscription for product in ("app.blumbum.plus.monthly", "app.blumbum.plus.yearly"))
    print(f"PASS: plists, JSON, scheme, {len(definitions)} PBX objects, source membership, RGB icon, product identifiers.")
    print("NOT RUN: Swift compilation, XCTest, simulator, PencilKit hardware, StoreKit Sandbox.")


if __name__ == "__main__":
    main()
