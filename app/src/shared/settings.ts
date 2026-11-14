import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

export type Settings = { horizontal: boolean; fingerDrawing: boolean; newTabs: boolean; eraserAutoReturn: boolean };
const defaults: Settings = { horizontal: false, fingerDrawing: false, newTabs: true, eraserAutoReturn: false };
const listeners = new Set<() => void>();
let current: Settings | undefined;
export function readSettings(): Settings {
  if (!current) {
    const file = new File(Paths.document, 'settings.json');
    current = file.exists ? { ...defaults, ...JSON.parse(file.textSync()) } : defaults;
  }
  return current!;
}
export function saveSettings(settings: Settings) {
  const temporary = new File(Paths.document, 'settings.json.tmp');
  temporary.write(JSON.stringify(settings));
  temporary.move(new File(Paths.document, 'settings.json'), { overwrite: true });
  current = settings;
  listeners.forEach(listener => listener());
}
export function useSettings() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, readSettings);
}
