"""Generate a deterministic Xcode project using Python's standard library only."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]


def uid(name):
    return hashlib.sha256(name.encode()).hexdigest()[:24].upper()


def quote(value):
    return json.dumps(str(value), ensure_ascii=False)


def generate():
    objects = {}

    def put(name, text):
        objects[uid(name)] = text
        return uid(name)

    def ids(items):
        return "(" + ", ".join(items) + ",)" if items else "()"

    sources = sorted((ROOT / "Blumbum").rglob("*.swift"))
    tests = sorted((ROOT / "BlumbumTests").rglob("*.swift"))
    ui_tests = sorted((ROOT / "BlumbumUITests").rglob("*.swift"))
    resources = [ROOT / "Blumbum/Resources/Assets.xcassets", ROOT / "Blumbum/Resources/PrivacyInfo.xcprivacy", ROOT / "Blumbum/Resources/AppConfiguration.json", ROOT / "Blumbum/Resources/PaperTemplates.json"]
    refs, source_builds, test_builds, ui_builds, resource_builds = [], [], [], [], []
    for file in sources + tests + ui_tests + resources:
        path = file.relative_to(ROOT).as_posix()
        kind = "sourcecode.swift" if file.suffix == ".swift" else "folder.assetcatalog" if file.suffix == ".xcassets" else "text.json" if file.suffix == ".json" else "text.xml"
        ref = put("ref:" + path, f"{{isa = PBXFileReference; lastKnownFileType = {kind}; path = {quote(path)}; sourceTree = SOURCE_ROOT; }}")
        refs.append(ref)
        build = put("build:" + path, f"{{isa = PBXBuildFile; fileRef = {ref}; }}")
        (source_builds if file in sources else test_builds if file in tests else ui_builds if file in ui_tests else resource_builds).append(build)

    app_product = put("app-product", '{isa = PBXFileReference; explicitFileType = wrapper.application; path = Blumbum.app; sourceTree = BUILT_PRODUCTS_DIR; }')
    test_product = put("test-product", '{isa = PBXFileReference; explicitFileType = wrapper.cfbundle; path = BlumbumTests.xctest; sourceTree = BUILT_PRODUCTS_DIR; }')
    ui_product = put("ui-product", '{isa = PBXFileReference; explicitFileType = wrapper.cfbundle; path = BlumbumUITests.xctest; sourceTree = BUILT_PRODUCTS_DIR; }')
    products = put("products", f"{{isa = PBXGroup; children = {ids([app_product, test_product, ui_product])}; name = Products; sourceTree = \"<group>\"; }}")
    main = put("main", f"{{isa = PBXGroup; children = {ids(refs + [products])}; sourceTree = \"<group>\"; }}")

    def phase(name, kind, files):
        return put(name, f"{{isa = {kind}; buildActionMask = 2147483647; files = {ids(files)}; runOnlyForDeploymentPostprocessing = 0; }}")

    app_phases = [phase("app-sources", "PBXSourcesBuildPhase", source_builds), phase("app-frameworks", "PBXFrameworksBuildPhase", []), phase("app-resources", "PBXResourcesBuildPhase", resource_builds)]
    test_phases = [phase("test-sources", "PBXSourcesBuildPhase", test_builds), phase("test-frameworks", "PBXFrameworksBuildPhase", []), phase("test-resources", "PBXResourcesBuildPhase", [])]
    ui_phases = [phase("ui-sources", "PBXSourcesBuildPhase", ui_builds), phase("ui-frameworks", "PBXFrameworksBuildPhase", []), phase("ui-resources", "PBXResourcesBuildPhase", [])]

    def config_list(name, base):
        configs = []
        for mode in ["Debug", "Release"]:
            settings = base.copy()
            if name == "app":
                settings.update({"MARKETING_VERSION": "1.0.0", "CURRENT_PROJECT_VERSION": "1"})
            if name == "project":
                settings.update({"SWIFT_OPTIMIZATION_LEVEL": "-Onone" if mode == "Debug" else "-O", "DEBUG_INFORMATION_FORMAT": "dwarf" if mode == "Debug" else "dwarf-with-dsym"})
                if mode == "Debug":
                    settings["ENABLE_TESTABILITY"] = "YES"
                    settings["SWIFT_ACTIVE_COMPILATION_CONDITIONS"] = "$(inherited) DEBUG"
            body = " ".join(f"{key} = {quote(value)};" for key, value in settings.items())
            configs.append(put(f"config:{name}:{mode}", f"{{isa = XCBuildConfiguration; buildSettings = {{ {body} }}; name = {mode}; }}"))
        return put("configs:" + name, f"{{isa = XCConfigurationList; buildConfigurations = {ids(configs)}; defaultConfigurationIsVisible = 0; defaultConfigurationName = Release; }}")

    project_configs = config_list("project", {"IPHONEOS_DEPLOYMENT_TARGET": "17.0", "SDKROOT": "iphoneos", "SWIFT_VERSION": "5.0", "CLANG_ENABLE_MODULES": "YES", "SWIFT_EMIT_LOC_STRINGS": "YES", "ENABLE_USER_SCRIPT_SANDBOXING": "YES"})
    app_configs = config_list("app", {"PRODUCT_BUNDLE_IDENTIFIER": "app.blumbum.ios", "PRODUCT_NAME": "$(TARGET_NAME)", "TARGETED_DEVICE_FAMILY": "1,2", "CODE_SIGN_STYLE": "Automatic", "INFOPLIST_FILE": "Blumbum/Resources/Info.plist", "ASSETCATALOG_COMPILER_APPICON_NAME": "AppIcon", "SUPPORTED_PLATFORMS": "iphoneos iphonesimulator", "SUPPORTS_MACCATALYST": "NO", "LD_RUNPATH_SEARCH_PATHS": "$(inherited) @executable_path/Frameworks"})
    test_configs = config_list("test", {"PRODUCT_BUNDLE_IDENTIFIER": "app.blumbum.ios.tests", "PRODUCT_NAME": "$(TARGET_NAME)", "TARGETED_DEVICE_FAMILY": "1,2", "CODE_SIGN_STYLE": "Automatic", "GENERATE_INFOPLIST_FILE": "YES", "TEST_HOST": "$(BUILT_PRODUCTS_DIR)/Blumbum.app/Blumbum", "BUNDLE_LOADER": "$(TEST_HOST)", "LD_RUNPATH_SEARCH_PATHS": "$(inherited) @executable_path/Frameworks @loader_path/Frameworks"})
    ui_configs = config_list("ui", {"PRODUCT_BUNDLE_IDENTIFIER": "app.blumbum.ios.uitests", "PRODUCT_NAME": "$(TARGET_NAME)", "TARGETED_DEVICE_FAMILY": "1,2", "CODE_SIGN_STYLE": "Automatic", "GENERATE_INFOPLIST_FILE": "YES", "TEST_TARGET_NAME": "Blumbum"})

    app = put("app", f"{{isa = PBXNativeTarget; buildConfigurationList = {app_configs}; buildPhases = {ids(app_phases)}; buildRules = (); dependencies = (); name = Blumbum; productName = Blumbum; productReference = {app_product}; productType = \"com.apple.product-type.application\"; }}")
    proxy = put("proxy", f"{{isa = PBXContainerItemProxy; containerPortal = {uid('project')}; proxyType = 1; remoteGlobalIDString = {app}; remoteInfo = Blumbum; }}")
    dependency = put("dependency", f"{{isa = PBXTargetDependency; target = {app}; targetProxy = {proxy}; }}")
    test = put("test", f"{{isa = PBXNativeTarget; buildConfigurationList = {test_configs}; buildPhases = {ids(test_phases)}; buildRules = (); dependencies = {ids([dependency])}; name = BlumbumTests; productName = BlumbumTests; productReference = {test_product}; productType = \"com.apple.product-type.bundle.unit-test\"; }}")
    ui = put("ui", f"{{isa = PBXNativeTarget; buildConfigurationList = {ui_configs}; buildPhases = {ids(ui_phases)}; buildRules = (); dependencies = {ids([dependency])}; name = BlumbumUITests; productName = BlumbumUITests; productReference = {ui_product}; productType = \"com.apple.product-type.bundle.ui-testing\"; }}")
    project = put("project", f"{{isa = PBXProject; attributes = {{ BuildIndependentTargetsInParallel = YES; LastUpgradeCheck = 1600; TargetAttributes = {{ {app} = {{ CreatedOnToolsVersion = 16.0; }}; {test} = {{ CreatedOnToolsVersion = 16.0; TestTargetID = {app}; }}; {ui} = {{ CreatedOnToolsVersion = 16.0; TestTargetID = {app}; }}; }}; }}; buildConfigurationList = {project_configs}; compatibilityVersion = \"Xcode 14.0\"; developmentRegion = ru; hasScannedForEncodings = 0; knownRegions = (ru, en, Base); mainGroup = {main}; productRefGroup = {products}; projectDirPath = \"\"; projectRoot = \"\"; targets = {ids([app, test, ui])}; }}")
    directory = ROOT / "NotesByBlum.xcodeproj"
    directory.mkdir(exist_ok=True)
    pbx = "// !$*UTF8*$!\n{archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n"
    pbx += "\n".join(f"{key} = {body};" for key, body in sorted(objects.items()))
    pbx += f"\n}}; rootObject = {project}; }}\n"
    (directory / "project.pbxproj").write_text(pbx, encoding="utf-8")
    schemes = directory / "xcshareddata/xcschemes"
    schemes.mkdir(parents=True, exist_ok=True)

    def buildable(target, name):
        return f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{target}" BuildableName="{name}" BlueprintName="{name.split(".")[0]}" ReferencedContainer="container:NotesByBlum.xcodeproj"/>'

    app_ref = buildable(app, "Blumbum.app")
    test_ref = buildable(test, "BlumbumTests.xctest")
    ui_ref = buildable(ui, "BlumbumUITests.xctest")
    scheme = f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1600" version="1.3">
<BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries>
<BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{app_ref}</BuildActionEntry>
</BuildActionEntries></BuildAction>
<TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO">{test_ref}</TestableReference><TestableReference skipped="NO">{ui_ref}</TestableReference></Testables></TestAction>
<LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugServiceExtension="internal" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">{app_ref}</BuildableProductRunnable></LaunchAction>
<ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">{app_ref}</BuildableProductRunnable></ProfileAction>
<AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>'''
    (schemes / "NotesByBlum.xcscheme").write_text(scheme, encoding="utf-8")
    print(f"Generated project: {len(sources)} app sources, {len(tests)} test sources, {len(ui_tests)} UI-test sources.")


if __name__ == "__main__":
    generate()
