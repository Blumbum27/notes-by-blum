import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack screenOptions={{ headerLargeTitle: true }}><Stack.Screen name="settings" options={{ title: 'Настройки', presentation: 'formSheet', headerLargeTitle: false, headerBackTitle: 'Назад' }} /></Stack>;
}
