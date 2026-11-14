import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'notes by Blum',
  slug: 'notes-by-blum',
  version: '0.1.0',
  scheme: 'notesbyblum',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.alexakalin.notesbyblum',
    supportsTablet: true,
    infoPlist: { ITSAppUsesNonExemptEncryption: false, UIFileSharingEnabled: true, LSSupportsOpeningDocumentsInPlace: true },
  },
  android: { package: 'com.alexakalin.notesbyblum' },
  plugins: [
    'expo-router',
    './plugins/withIPadOnly',
    ['expo-build-properties', { ios: { deploymentTarget: '26.0', enableSceneSupport: true, usePrecompiledModules: false } }],
    ['expo-localization', { supportedLocales: { ios: ['ru', 'en'], android: ['ru', 'en'] } }],
    ['expo-image-picker', { photosPermission: 'Выберите изображение для страницы блокнота.', cameraPermission: false, microphonePermission: false }],
  ],
  experiments: { typedRoutes: true },
};

export default config;
