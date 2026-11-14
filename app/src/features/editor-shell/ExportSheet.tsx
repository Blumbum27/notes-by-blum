import { Button, Form, Host, Section, TextField, Toggle } from '@expo/ui/swift-ui';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

export function ExportSheet({ title, onCancel, onExport }: { title: string; onCancel: () => void; onExport: (name: string, format: 'pdf' | 'image', background: boolean, annotations: boolean) => void }) {
  const [name, setName] = useState(title);
  const [format, setFormat] = useState<'pdf' | 'image'>('pdf');
  const [background, setBackground] = useState(true);
  const [annotations, setAnnotations] = useState(true);
  const [visible, setVisible] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  return <Modal visible={visible} onDismiss={() => { if (submitted) onExport(name.trim() || title, format, background, annotations); else onCancel(); }} presentationStyle="formSheet" animationType="slide" onRequestClose={() => setVisible(false)}><View style={{ flex: 1, backgroundColor: '#F2F2F7' }}><Text accessibilityRole="header" style={{ textAlign: 'center', fontSize: 20, fontWeight: '600', marginVertical: 24 }}>Экспорт выбранной</Text><View style={{ flexDirection: 'row', gap: 16, paddingHorizontal: 24 }}>{(['pdf', 'image'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value === 'pdf' ? 'PDF' : 'Изображение'} accessibilityState={{ selected: format === value }} onPress={() => setFormat(value)} style={{ flex: 1, minHeight: 110, padding: 16, borderRadius: 22, borderWidth: 1.5, borderColor: format === value ? '#E6492D' : '#C8C8CC', backgroundColor: format === value ? '#F6E3DC' : '#F7F8F8' }}><Text style={{ fontSize: 20, color: format === value ? '#C93820' : '#171717' }}>{value === 'pdf' ? 'PDF' : 'Изображение'}</Text><Text style={{ fontSize: 14, marginTop: 12, color: '#6C6C70' }}>{value === 'pdf' ? 'Один документ' : 'PNG для каждой страницы'}</Text></Pressable>)}</View><Host style={{ flex: 1 }}><Form>
    <Section title="Имя файла"><TextField placeholder={title} onTextChange={setName} /></Section>
    <Section title="Параметры"><Toggle label="Включить фон страницы" isOn={background} onIsOnChange={setBackground} /><Toggle label="Включить аннотации" isOn={annotations} onIsOnChange={setAnnotations} /></Section>
    <Button label="Экспортировать" systemImage="square.and.arrow.up" onPress={() => { setSubmitted(true); setVisible(false); }} /><Button label="Отменить" role="cancel" onPress={() => setVisible(false)} />
  </Form></Host></View></Modal>;
}
