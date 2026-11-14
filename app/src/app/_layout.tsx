import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack screenOptions={{ headerLargeTitle: true }}>
    <Stack.Screen name="(library)" options={{ headerShown: false }} />
    <Stack.Screen name="notebook/[id]" options={{ headerShown: false }} />
    <Stack.Screen name="trash" options={{ title: 'Корзина', presentation: 'pageSheet' }} />
    <Stack.Screen name="settings" options={{ title: 'Настройки', presentation: 'formSheet', headerLargeTitle: false, headerBackTitle: 'Назад' }} />
  </Stack>;
}
