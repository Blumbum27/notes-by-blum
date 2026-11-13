#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${SIGNING_DIR:?Run prepare_signing.py first}"
: "${PROFILE_UUID:?Missing provisioning profile}"
: "${APPLE_TEAM_ID:?Missing Apple team}"
: "${APP_BUNDLE_ID:?Missing bundle ID}"
: "${ASC_KEY_ID:?Missing App Store Connect key ID}"
: "${ASC_ISSUER_ID:?Missing App Store Connect issuer ID}"
: "${GITHUB_RUN_NUMBER:?Missing CI build number}"
python3 scripts/release_preflight.py --check-urls
mkdir -p build/release
BUILD_NUMBER="$GITHUB_RUN_NUMBER.${GITHUB_RUN_ATTEMPT:-1}"
xcodebuild -project NotesByBlum.xcodeproj -scheme NotesByBlum -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/release/Blumbum.xcarchive \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" PRODUCT_BUNDLE_IDENTIFIER="$APP_BUNDLE_ID" \
  CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY='Apple Distribution' \
  PROVISIONING_PROFILE_SPECIFIER="$PROFILE_UUID" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" archive
xcodebuild -exportArchive -archivePath build/release/Blumbum.xcarchive \
  -exportPath build/release/ipa -exportOptionsPlist "$SIGNING_DIR/options-export.plist"
xcodebuild -exportArchive -archivePath build/release/Blumbum.xcarchive \
  -exportPath build/release/upload -exportOptionsPlist "$SIGNING_DIR/options-upload.plist" \
  -allowProvisioningUpdates -authenticationKeyPath "$SIGNING_DIR/AppStoreConnect.p8" \
  -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID"
echo 'Upload command completed. Check App Store Connect processing and TestFlight availability.'
