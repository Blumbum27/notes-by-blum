import { Button, Divider, HStack, Image as Symbol, Picker, Popover, RNHostView, ScrollView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { accessibilityLabel, multilineTextAlignment, background, buttonStyle, font, foregroundStyle, frame, lineLimit, padding, pickerStyle, shapes, tag } from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'expo-symbols';
import { memo, useState } from 'react';
import { View } from 'react-native';
import { paperColorNames, paperFill, paperNames, paperOrder, type Paper, type PaperColor } from '../../shared/documents/types';
import { ToolbarButton } from './ToolbarButton';

export type AddPosition = 'before' | 'after' | 'last';

/** Иллюстрация шаблона в масштабе ~1:6, повторяет PaperView. */
export const PaperPreview = memo(function PaperPreview({ pattern, color = 'white', width = 88 }: { pattern: Paper; color?: PaperColor; width?: number }) {
  const height = Math.round(width * 1.414);
  const line = color === 'dark' ? '#565B5D' : '#D5DBDA';
  const step = width / 99;
  const rows = (from: number, every: number, left = 0) => Array.from({ length: Math.floor((height - from) / every) + 1 }, (_, i) => <View key={`r${from}-${i}`} style={{ position: 'absolute', top: from + i * every, left, right: 0, height: 0.5, backgroundColor: line }} />);
  return <View style={{ width, height, backgroundColor: paperFill[color], borderRadius: 4, overflow: 'hidden', borderWidth: color === 'white' ? 0.5 : 0, borderColor: '#D9DEDD' }}>
    {(pattern === 'ruled' || pattern === 'legal') && rows(10 * step, 4.7 * step)}
    {pattern === 'ruledWide' && rows(10 * step, 6 * step)}
    {pattern === 'grid' && <>{rows(3.4 * step, 3.4 * step)}{Array.from({ length: Math.floor(width / (3.4 * step)) }, (_, i) => <View key={`c${i}`} style={{ position: 'absolute', left: (i + 1) * 3.4 * step, top: 0, bottom: 0, width: 0.5, backgroundColor: line }} />)}</>}
    {pattern === 'dots' && Array.from({ length: Math.floor(width / (5 * step)) * Math.floor(height / (5 * step)) }, (_, i) => { const columns = Math.floor(width / (5 * step)); return <View key={i} style={{ position: 'absolute', left: (1 + (i % columns)) * 5 * step - 0.5, top: (1 + Math.floor(i / columns)) * 5 * step - 0.5, width: 1, height: 1, borderRadius: 0.5, backgroundColor: color === 'dark' ? '#7A8082' : '#AEB6B4' }} />; })}
    {pattern === 'legal' && <View style={{ position: 'absolute', left: 11 * step, top: 0, bottom: 0, width: 1.5 * step, borderLeftWidth: 0.5, borderRightWidth: 0.5, borderColor: '#F08C8C' }} />}
    {pattern === 'cornell' && <>{rows(14 * step, 4.7 * step, 0)}<View style={{ position: 'absolute', left: width * 0.28, top: 8 * step, height: height * 0.8 - 8 * step, width: 0.5, backgroundColor: line }} /><View style={{ position: 'absolute', top: height * 0.8, left: 0, right: 0, height: height * 0.2, backgroundColor: paperFill[color], borderTopWidth: 0.5, borderColor: line }} /></>}
    {pattern === 'music' && Array.from({ length: Math.floor(height / (12 * step)) }, (_, staff) => Array.from({ length: 5 }, (_, i) => <View key={`m${staff}-${i}`} style={{ position: 'absolute', top: (8 + staff * 12) * step + i * 1.35 * step, left: 6 * step, right: 6 * step, height: 0.5, backgroundColor: line }} />))}
  </View>;
});

const Row = ({ title, icon, onPress, label }: { title: string; icon: SFSymbol; onPress: () => void; label?: string }) =>
  <Button onPress={onPress} modifiers={[buttonStyle('plain'), accessibilityLabel(label ?? title)]}>
    <HStack spacing={12} modifiers={[frame({ minHeight: 46, maxWidth: Infinity }), padding({ horizontal: 16 })]}>
      <Symbol systemName={icon} size={17} color="#1F6FE5" modifiers={[frame({ width: 24 })]} />
      <Text modifiers={[font({ size: 16 }), foregroundStyle('#151716')]}>{title}</Text><Spacer />
    </HStack>
  </Button>;

export function AddPagePopover({ onAdd, onAddImage, onImport, currentPattern, paperColor = 'white' }: {
  currentPattern: Paper; paperColor?: PaperColor;
  onAdd: (position: AddPosition, paper: { pattern?: Paper; color?: PaperColor }) => void;
  onAddImage: (position: AddPosition) => void;
  onImport: (position: AddPosition) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<AddPosition>('after');
  const [color, setColor] = useState<PaperColor>(paperColor);
  const card = [background('#FFFFFF', shapes.roundedRectangle({ cornerRadius: 14 }))];
  const run = (action: () => void) => { setOpen(false); action(); };
  return <Popover isPresented={open} onIsPresentedChange={setOpen} attachmentAnchor="bottom" arrowEdge="top">
    <Popover.Trigger><ToolbarButton label="Добавить страницу" symbol="plus.square.on.square" onPress={() => { setColor(paperColor); setOpen(true); }} /></Popover.Trigger>
    <Popover.Content><VStack alignment="leading" spacing={14} modifiers={[padding({ all: 16 }), frame({ width: 440 }), background('#F3F5F4')]}>
      <HStack><Spacer /><Text modifiers={[font({ size: 17, weight: 'semibold' })]}>Добавить страницу</Text><Spacer /></HStack>
      <Picker selection={position} onSelectionChange={value => setPosition(value as AddPosition)} modifiers={[pickerStyle('segmented')]}>
        <Text modifiers={[tag('before')]}>Перед</Text><Text modifiers={[tag('after')]}>После</Text><Text modifiers={[tag('last')]}>В конец</Text>
      </Picker>
      <VStack alignment="leading" spacing={10} modifiers={[padding({ vertical: 12 }), ...card]}>
        <HStack modifiers={[padding({ horizontal: 16 })]}><Text modifiers={[font({ size: 15, weight: 'semibold' })]}>Шаблоны</Text><Spacer />
          <Picker selection={color} onSelectionChange={value => setColor(value as PaperColor)} modifiers={[pickerStyle('segmented'), frame({ width: 210 })]}>
            {(Object.keys(paperColorNames) as PaperColor[]).map(value => <Text key={value} modifiers={[tag(value)]}>{paperColorNames[value]}</Text>)}
          </Picker>
        </HStack>
        <ScrollView axes="horizontal" showsIndicators={false} modifiers={[frame({ height: 172 })]}>
          <HStack alignment="top" spacing={14} modifiers={[padding({ horizontal: 16, top: 4 })]}>{([undefined, ...paperOrder] as const).map(pattern => <Button key={pattern ?? 'current'} modifiers={[buttonStyle('plain'), accessibilityLabel(pattern ? `Шаблон ${paperNames[pattern]}` : 'Как текущая страница')]} onPress={() => run(() => onAdd(position, { pattern, color }))}>
            <VStack spacing={8} modifiers={[frame({ width: 92 })]}>
              <RNHostView matchContents><View style={{ shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }}><PaperPreview pattern={pattern ?? currentPattern} color={color} /></View></RNHostView>
              <Text modifiers={[font({ size: 11 }), lineLimit(2), multilineTextAlignment('center'), frame({ width: 88, height: 30, alignment: 'top' }), foregroundStyle('#3A3F3E')]}>{pattern === undefined ? 'Как текущая' : paperNames[pattern]}</Text>
            </VStack>
          </Button>)}</HStack>
        </ScrollView>
      </VStack>
      <VStack spacing={0} modifiers={card}>
        <Row title="Изображение" icon="photo.on.rectangle" onPress={() => run(() => onAddImage(position))} label="Добавить страницу с изображением" />
        <Divider modifiers={[padding({ leading: 52 })]} />
        <Row title="Импорт PDF или изображения" icon="square.and.arrow.down" onPress={() => run(() => onImport(position))} />
      </VStack>
    </VStack></Popover.Content>
  </Popover>;
}
