import { Button, HStack, Picker, Popover, RNHostView, Text, VStack } from '@expo/ui/swift-ui';
import { View } from 'react-native';
import { frame, labelStyle, padding, tag, pickerStyle } from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';
import type { Paper } from '../../shared/documents/types';

export function AddPagePopover({ onAdd, currentPattern }: { currentPattern: Paper; onAdd: (position: 'before' | 'after' | 'last', pattern?: Paper) => void }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<'before' | 'after' | 'last'>('after');
  return <Popover isPresented={open} onIsPresentedChange={setOpen}>
    <Popover.Trigger><Button label="Добавить страницу" systemImage="doc.badge.plus" modifiers={[labelStyle('iconOnly')]} onPress={() => setOpen(true)} /></Popover.Trigger>
    <Popover.Content><VStack spacing={22} modifiers={[padding({ all: 24 }), frame({ width: 430 })]}>
      <Text>Добавить страницу</Text>
      <Picker selection={position} onSelectionChange={value => setPosition(value as typeof position)} modifiers={[pickerStyle('segmented')]}><Text modifiers={[tag('before')]}>Перед</Text><Text modifiers={[tag('after')]}>После</Text><Text modifiers={[tag('last')]}>В конце</Text></Picker>
      <Text>Недавние шаблоны</Text><Text>Новая страница наследует размер и цвет текущей страницы.</Text>
      <HStack spacing={12}>{([undefined, 'blank', 'ruled'] as const).map(pattern => <Button key={pattern ?? 'current'} onPress={() => { setOpen(false); onAdd(position, pattern); }}><VStack spacing={14}><RNHostView matchContents><View style={{ width: 104, height: 140, backgroundColor: 'white', borderWidth: 0.5, borderColor: '#DDD', overflow: 'hidden' }}>{(pattern ?? currentPattern) !== 'blank' && Array.from({ length: 17 }, (_, i) => <View key={i} style={{ position: 'absolute', top: i * 8, width: 104, height: 0.5, backgroundColor: '#DFE2E4' }} />)}{(pattern ?? currentPattern) === 'grid' && Array.from({ length: 13 }, (_, i) => <View key={i} style={{ position: 'absolute', left: i * 8, height: 140, width: 0.5, backgroundColor: '#DFE2E4' }} />)}</View></RNHostView><Text>{pattern === undefined ? 'Текущий' : pattern === 'blank' ? 'Пустая' : 'Линованная'}</Text></VStack></Button>)}</HStack>
      <HStack><Button label="В клетку" onPress={() => { setOpen(false); onAdd(position, 'grid'); }} /><Button label="В точку" onPress={() => { setOpen(false); onAdd(position, 'dots'); }} /></HStack>
    </VStack></Popover.Content>
  </Popover>;
}
