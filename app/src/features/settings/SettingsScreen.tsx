import { Button, Form, Host, Picker, Section, Text, Toggle } from '@expo/ui/swift-ui';
import { tag } from '@expo/ui/swift-ui/modifiers';
import { Stack, router } from 'expo-router';
import { Alert } from 'react-native';
import { saveSettings, useSettings, type Settings } from '../../shared/settings';
export { readSettings } from '../../shared/settings';
export default function SettingsScreen() {
  const settings = useSettings();
  const setSettings = (value: Settings) => { try { saveSettings(value); } catch { Alert.alert('Не удалось сохранить настройки', 'Попробуйте ещё раз.'); } };
  return <Host style={{ flex: 1 }}><Stack.Screen options={{ title: 'Настройки', presentation: 'formSheet' }} /><Form>
    <Section title="Редактирование документов"><Picker label="Направление прокрутки" selection={settings.horizontal ? 'horizontal' : 'vertical'} onSelectionChange={value => setSettings({ ...settings, horizontal: value === 'horizontal' })}><Text modifiers={[tag('vertical')]}>Вертикально</Text><Text modifiers={[tag('horizontal')]}>Горизонтально</Text></Picker>
      <Toggle label="Рисовать пальцем" isOn={settings.fingerDrawing} onIsOnChange={value => setSettings({ ...settings, fingerDrawing: value })} />
      <Toggle label="Возвращать ручку после ластика" isOn={settings.eraserAutoReturn} onIsOnChange={value => setSettings({ ...settings, eraserAutoReturn: value })} />
      <Toggle label="Открывать в новых вкладках" isOn={settings.newTabs} onIsOnChange={value => setSettings({ ...settings, newTabs: value })} />
    </Section><Button label="Готово" onPress={() => router.back()} />
  </Form></Host>;
}
