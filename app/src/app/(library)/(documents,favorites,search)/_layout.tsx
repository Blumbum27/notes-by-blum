import { Stack } from 'expo-router';

export const unstable_settings = { initialRouteName: 'index' };

const modes = { '(documents)': 'documents', '(favorites)': 'favorites', '(search)': 'search' } as const;

export default function LibraryStackLayout({ segment }: { segment: keyof typeof modes }) {
  return <Stack screenOptions={{ headerLargeTitle: true, headerBackButtonDisplayMode: 'minimal' }}>
    <Stack.Screen name="index" initialParams={{ mode: modes[segment] }} />
    <Stack.Screen name="folder/[id]" options={{ headerLargeTitle: false, headerShadowVisible: false }} />
  </Stack>;
}
