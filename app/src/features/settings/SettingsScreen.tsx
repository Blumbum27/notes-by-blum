import { Button, Form, Host, Picker, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { tag } from '@expo/ui/swift-ui/modifiers';
import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { File, Paths } from 'expo-file-system';

export type Settings = { horizontal: boolean; fingerDrawing: boolean; newTabs: boolean };
const file = () => new File(Paths.document, 'settings.json');
export function readSettings(): Settings {
  const source = file();
  return source.exists ? JSON.parse(source.textSync()) : { horizontal: false, fingerDrawing: false, newTabs: true };
}
export default function SettingsScreen() {
  const [settings, setSettings] = useState(readSettings);
  useEffect(() => { file().write(JSON.stringify(settings)); }, [settings]);
  return <Host style={{ flex: 1 }}><Stack.Screen options={{ title: 'Настройки', presentation: 'formSheet' }} /><Form>
    <Section title="Редактирование документов"><Picker label="Направление прокрутки" selection={settings.horizontal ? 'horizontal' : 'vertical'} onSelectionChange={value => setSettings({ ...settings, horizontal: value === 'horizontal' })}><Text modifiers={[tag('vertical')]}>Вертикально</Text><Text modifiers={[tag('horizontal')]}>Горизонтально</Text></Picker>
      <Toggle label="Рисовать пальцем" isOn={settings.fingerDrawing} onIsOnChange={value => setSettings({ ...settings, fingerDrawing: value })} />
    </Section><Button label="Готово" onPress={() => router.back()} />
  </Form></Host>;
}
