import { Button, Form, Host, HStack, Picker, Section, Spacer, Text, TextField, Toggle, useNativeState } from '@expo/ui/swift-ui';
import { buttonStyle, font, frame, labelStyle, padding, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';
import { Modal, View } from 'react-native';

export function ExportSheet({ title, scope = 'selected', onCancel, onExport }: {
  title: string;
  scope?: 'page' | 'all' | 'selected';
  onCancel: () => void;
  onExport: (name: string, format: 'pdf' | 'image', background: boolean, annotations: boolean) => void;
}) {
  const name = useNativeState(title);
  const [format, setFormat] = useState<'pdf' | 'image'>('pdf');
  const [background, setBackground] = useState(true);
  const [annotations, setAnnotations] = useState(true);
  const [visible, setVisible] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const heading = scope === 'page' ? 'Экспорт страницы' : scope === 'all' ? 'Экспорт всех страниц' : 'Экспорт выбранных страниц';
  return <Modal visible={visible} onDismiss={() => {
    if (submitted) onExport(name.get().trim() || title, format, background, annotations);
    else onCancel();
  }} presentationStyle="formSheet" animationType="slide" onRequestClose={() => setVisible(false)}>
    <View style={{ flex: 1, backgroundColor: '#F2F2F7' }}>
      <Host style={{ height: 68 }}><HStack modifiers={[padding({ horizontal: 16, vertical: 12 })]}>
        <Button label="Отменить экспорт" systemImage="xmark" modifiers={[labelStyle('iconOnly'), buttonStyle('glass'), frame({ width: 36, height: 36 })]} onPress={() => setVisible(false)} />
        <Spacer /><Text modifiers={[font({ textStyle: 'headline' })]}>{heading}</Text><Spacer />
        <Button label="Экспортировать" systemImage="checkmark" modifiers={[labelStyle('iconOnly'), buttonStyle('glassProminent'), frame({ width: 36, height: 36 })]} onPress={() => { setSubmitted(true); setVisible(false); }} />
      </HStack></Host>
      <Host style={{ flex: 1 }}><Form>
        <Section title="Формат"><Picker selection={format} onSelectionChange={value => setFormat(value as typeof format)} modifiers={[pickerStyle('segmented')]}>
          <Text modifiers={[tag('pdf')]}>PDF</Text><Text modifiers={[tag('image')]}>Изображение</Text>
        </Picker><Text>{format === 'pdf' ? 'Один PDF-документ' : 'PNG для каждой страницы'}</Text></Section>
        <Section title="Имя файла"><TextField text={name} placeholder={title} /></Section>
        <Section title="Параметры"><Toggle label="Включить фон страницы" isOn={background} onIsOnChange={setBackground} /><Toggle label="Включить аннотации" isOn={annotations} onIsOnChange={setAnnotations} /></Section>
      </Form></Host>
    </View>
  </Modal>;
}
