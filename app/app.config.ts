import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Inkbloom',
  slug: 'notes-by-blum',
  version: '0.1.0',
  icon: './assets/icon.png',
  scheme: 'notesbyblum',
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.alexakalin.notesbyblum',
    supportsTablet: true,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
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
