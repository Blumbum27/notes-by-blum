import { Button, HStack, Picker, Popover, RNHostView, ScrollView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { buttonStyle, font, foregroundStyle, frame, labelStyle, lineLimit, padding, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { memo, useState } from 'react';
import { View } from 'react-native';
import type { Paper } from '../../shared/documents/types';

export const paperNames: Record<Paper, string> = {
  blank: 'Пустая страница', ruled: 'Линованная узкая', grid: 'В клетку', dots: 'В точку',
};

/** Small illustrative preview, not an interactive paper control. */
export const PaperPreview = memo(function PaperPreview({ pattern, color = 'white' }: { pattern: Paper; color?: 'white' | 'yellow' }) {
  return <View style={{ width: 99, height: 128, backgroundColor: color === 'yellow' ? '#FFF6D5' : 'white', borderRadius: 5, boxShadow: '0px 3px 7px #00000014' }}>
    {(pattern === 'ruled' || pattern === 'grid') && Array.from({ length: 18 }, (_, i) => <View key={`h${i}`} style={{ position: 'absolute', top: 6 + i * 7, width: 99, height: 0.5, backgroundColor: '#DBE0DF' }} />)}
    {pattern === 'grid' && Array.from({ length: 15 }, (_, i) => <View key={`v${i}`} style={{ position: 'absolute', left: i * 7, height: 128, width: 0.5, backgroundColor: '#DBE0DF' }} />)}
    {pattern === 'dots' && Array.from({ length: 13 * 18 }, (_, i) => <View key={i} style={{ position: 'absolute', left: 6 + (i % 13) * 7, top: 5 + Math.floor(i / 13) * 7, width: 1, height: 1, borderRadius: 0.5, backgroundColor: '#AEB6B4' }} />)}
  </View>;
});

export function AddPagePopover({ onAdd, currentPattern, paperColor = 'white' }: {
  currentPattern: Paper;
  paperColor?: 'white' | 'yellow';
  onAdd: (position: 'before' | 'after' | 'last', pattern?: Paper) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<'before' | 'after' | 'last'>('after');
  return <Popover isPresented={open} onIsPresentedChange={setOpen}>
    <Popover.Trigger><Button label="Добавить страницу" systemImage="doc.badge.plus" modifiers={[labelStyle('iconOnly'), frame({ width: 36, height: 36 })]} onPress={() => setOpen(true)} /></Popover.Trigger>
    <Popover.Content><VStack alignment="leading" spacing={16} modifiers={[padding({ vertical: 12 }), frame({ width: 420 })]}>
      <HStack modifiers={[frame({ height: 38 })]}><Spacer /><Text modifiers={[font({ size: 17, weight: 'semibold' })]}>Добавить страницу</Text><Spacer /></HStack>
      <Picker selection={position} onSelectionChange={value => setPosition(value as typeof position)} modifiers={[pickerStyle('segmented')]}>
        <Text modifiers={[tag('before')]}>Перед</Text><Text modifiers={[tag('after')]}>После</Text><Text modifiers={[tag('last')]}>Последняя страница</Text>
      </Picker>
      <Text modifiers={[font({ textStyle: 'headline' }), padding({ horizontal: 12 })]}>Недавние шаблоны</Text>
      <Text modifiers={[font({ textStyle: 'footnote' }), foregroundStyle({ type: 'hierarchical', style: 'secondary' }), padding({ horizontal: 12 })]}>Показанные здесь шаблоны по возможности наследуют свойства текущей страницы.</Text>
      <ScrollView axes="horizontal" showsIndicators={false} modifiers={[frame({ height: 187 }), padding({ horizontal: 12 })]}>
        <HStack alignment="top" spacing={16} modifiers={[padding({ top: 5, horizontal: 2 })]}>{([undefined, 'blank', 'ruled', 'grid', 'dots'] as const).map(pattern => <Button key={pattern ?? 'current'} modifiers={[buttonStyle('plain')]} onPress={() => { setOpen(false); onAdd(position, pattern); }}>
          <VStack spacing={12} modifiers={[frame({ width: 107 })]}>
            <RNHostView matchContents><PaperPreview pattern={pattern ?? currentPattern} color={paperColor} /></RNHostView>
            <Text modifiers={[font({ size: 11 }), lineLimit(1)]}>{pattern === undefined ? 'Текущий шаблон' : paperNames[pattern]}</Text>
          </VStack>
        </Button>)}</HStack>
      </ScrollView>
    </VStack></Popover.Content>
  </Popover>;
}
