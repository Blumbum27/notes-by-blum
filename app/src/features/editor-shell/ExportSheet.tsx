import { Button, Form, Host, Picker, Section, Text, TextField, Toggle } from '@expo/ui/swift-ui';
import { tag, pickerStyle } from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';
import { Modal } from 'react-native';

export function ExportSheet({ title, onCancel, onExport }: { title: string; onCancel: () => void; onExport: (name: string, format: 'pdf' | 'image', background: boolean, annotations: boolean) => void }) {
  const [name, setName] = useState(title);
  const [format, setFormat] = useState<'pdf' | 'image'>('pdf');
  const [background, setBackground] = useState(true);
  const [annotations, setAnnotations] = useState(true);
  const [visible, setVisible] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  return <Modal visible={visible} onDismiss={() => { if (submitted) onExport(name.trim() || title, format, background, annotations); else onCancel(); }} presentationStyle="formSheet" animationType="slide" onRequestClose={() => setVisible(false)}><Host style={{ flex: 1 }}><Form>
    <Section title="Экспорт выбранной"><Picker label="Формат" modifiers={[pickerStyle('segmented')]} selection={format} onSelectionChange={value => setFormat(value as typeof format)}><Text modifiers={[tag('pdf')]}>PDF</Text><Text modifiers={[tag('image')]}>Изображение</Text></Picker></Section>
    <Section title="Имя файла"><TextField placeholder={title} onTextChange={setName} /></Section>
    <Section title="Параметры"><Toggle label="Включить фон страницы" isOn={background} onIsOnChange={setBackground} /><Toggle label="Включить аннотации" isOn={annotations} onIsOnChange={setAnnotations} /></Section>
    <Button label="Экспортировать" systemImage="square.and.arrow.up" onPress={() => { setSubmitted(true); setVisible(false); }} /><Button label="Отменить" role="cancel" onPress={() => setVisible(false)} />
  </Form></Host></Modal>;
}
