import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function LibraryLayout() {
  return <NativeTabs sidebarAdaptable>
    <NativeTabs.Trigger name="(documents)">
      <NativeTabs.Trigger.Icon sf={{ default: 'folder', selected: 'folder.fill' }} />
      <NativeTabs.Trigger.Label>Документы</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="(favorites)">
      <NativeTabs.Trigger.Icon sf={{ default: 'star', selected: 'star.fill' }} />
      <NativeTabs.Trigger.Label>Избранное</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
    <NativeTabs.Trigger name="(search)" role="search">
      <NativeTabs.Trigger.Label>Поиск</NativeTabs.Trigger.Label>
    </NativeTabs.Trigger>
  </NativeTabs>;
}
