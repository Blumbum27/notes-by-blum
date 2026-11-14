import { Button, Divider, HStack, Image as Symbol, Menu, Popover, Spacer, Text, TextField, Toggle, VStack, useNativeState } from '@expo/ui/swift-ui';
import { accessibilityLabel, aspectRatio, background, border, buttonStyle, clipShape, disabled, font, foregroundStyle, frame, keyboardType, lineLimit, onSubmit, padding, resizable, shapes, textFieldStyle } from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'expo-symbols';
import { useState } from 'react';
import { paperColorNames, paperNames, paperOrder, type NotebookPage, type Paper, type PaperColor } from '../../shared/documents/types';
import { ToolbarButton } from './ToolbarButton';

export type ElementKind = 'pen' | 'pencil' | 'marker' | 'text' | 'image' | 'sticky' | 'tape';
const elementNames: [ElementKind, string, SFSymbol][] = [
  ['pen', 'Ручка', 'pencil.tip'], ['pencil', 'Карандаш', 'pencil'], ['marker', 'Маркер', 'highlighter'],
  ['text', 'Текст', 'textformat'], ['image', 'Изображения', 'photo'], ['sticky', 'Клейкие заметки', 'note.text'], ['tape', 'Лента', 'bandage'],
];

function PageRow({ title, icon, submenu = false, destructive = false, trailing }: {
  title: string; icon: SFSymbol; submenu?: boolean; destructive?: boolean; trailing?: string;
}) {
  return <HStack spacing={12} modifiers={[frame({ minHeight: 46, maxWidth: Infinity }), foregroundStyle(destructive ? '#E5352B' : '#151716')]}>
    <Symbol systemName={icon} size={17} color={destructive ? '#E5352B' : '#1F6FE5'} modifiers={[frame({ width: 24 })]} />
    <Text modifiers={[font({ size: 16 }), lineLimit(1)]}>{title}</Text><Spacer />
    {trailing && <Text modifiers={[font({ size: 15 }), foregroundStyle('#8A908E')]}>{trailing}</Text>}
    {submenu && <Symbol systemName="chevron.right" size={12} color="#B9BEBC" />}
  </HStack>;
}

export function RotationMenu({ onRotate, inset = false }: { onRotate: (degrees: number) => void; inset?: boolean }) {
  return <Menu label={inset ? <PageRow title="Повернуть страницу" icon="rotate.right" submenu /> : 'Повернуть страницу'} systemImage={inset ? undefined : 'rotate.right'} modifiers={inset ? [buttonStyle('plain')] : []}>
    <Button label="На 90° по часовой стрелке" systemImage="rotate.right" onPress={() => onRotate(90)} />
    <Button label="На 90° против часовой стрелки" systemImage="rotate.left" onPress={() => onRotate(270)} />
    <Button label="На 180°" systemImage="arrow.trianglehead.2.clockwise" onPress={() => onRotate(180)} />
  </Menu>;
}

export function MorePopover({ page, index, count, thumbnail, inOutline, horizontal, onBookmark, onRotate, onTemplate, onGo, onOutline, onHorizontal, onErase, onClear, onRemove }: {
  page: NotebookPage; index: number; count: number; thumbnail: string; inOutline: boolean; horizontal: boolean;
  onBookmark: () => void; onRotate: (degrees: number) => void;
  onTemplate: (paper: { pattern?: Paper; color?: PaperColor }) => void; onGo: (index: number) => void;
  onOutline: () => void; onHorizontal: (value: boolean) => void;
  onErase?: (kinds: ElementKind[]) => void; onClear?: () => void; onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<'main' | 'erase'>('main');
  const [kinds, setKinds] = useState<ElementKind[]>([]);
  const number = useNativeState('');
  const [invalid, setInvalid] = useState(false);
  const go = () => {
    const value = Number(number.get());
    if (!Number.isInteger(value) || value < 1 || value > count) { setInvalid(true); return; }
    setInvalid(false); setOpen(false); onGo(value - 1);
  };
  const run = (action: () => void) => { setOpen(false); action(); };
  const card = [padding({ horizontal: 16 }), background('#FFFFFF', shapes.roundedRectangle({ cornerRadius: 14 }))];
  const caption = (title: string) => <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle('#858B88'), padding({ top: 18, bottom: 8, horizontal: 16 })]}>{title}</Text>;
  return <Popover isPresented={open} onIsPresentedChange={setOpen} attachmentAnchor="bottom" arrowEdge="top">
    <Popover.Trigger><ToolbarButton label="Ещё" symbol="ellipsis.circle" onPress={() => { number.set(''); setInvalid(false); setScreen('main'); setKinds([]); setOpen(true); }} /></Popover.Trigger>
    <Popover.Content>{screen === 'erase'
      ? <VStack alignment="leading" spacing={0} modifiers={[padding({ all: 16 }), frame({ width: 372 }), background('#F3F5F4')]}>
        <HStack modifiers={[frame({ height: 44 })]}>
          <Button label="Назад" systemImage="chevron.left" modifiers={[buttonStyle('plain'), font({ size: 16 })]} onPress={() => setScreen('main')} /><Spacer />
          <Text modifiers={[font({ size: 17, weight: 'semibold' })]}>Удалить элементы</Text><Spacer /><Spacer modifiers={[frame({ width: 60 })]} />
        </HStack>
        {caption('Что удалить с этой страницы')}
        <VStack spacing={0} modifiers={card}>{elementNames.map(([kind, title, icon], i) => <VStack key={kind} spacing={0}>
          {i > 0 && <Divider />}
          <HStack spacing={12} modifiers={[frame({ minHeight: 46 })]}>
            <Symbol systemName={icon} size={17} color="#1F6FE5" modifiers={[frame({ width: 24 })]} />
            <Toggle label={title} isOn={kinds.includes(kind)} onIsOnChange={value => setKinds(value ? [...kinds, kind] : kinds.filter(item => item !== kind))} />
          </HStack>
        </VStack>)}</VStack>
        <HStack modifiers={[padding({ top: 16 })]}>
          <Button label={kinds.length === elementNames.length ? 'Снять все' : 'Выбрать все'} onPress={() => setKinds(kinds.length === elementNames.length ? [] : elementNames.map(([kind]) => kind))} /><Spacer />
          <Button label="Удалить" role="destructive" modifiers={[buttonStyle('borderedProminent'), disabled(!kinds.length)]} onPress={() => run(() => onErase?.(kinds))} />
        </HStack>
      </VStack>
      : <VStack alignment="leading" spacing={0} modifiers={[padding({ all: 16 }), frame({ width: 372 }), background('#F3F5F4')]}>
        <VStack alignment="leading" spacing={0} modifiers={card}>
          <HStack modifiers={[frame({ height: 64 })]}>
            <VStack alignment="leading" spacing={2}>
              <Text modifiers={[font({ size: 17, weight: 'semibold' })]}>{`Страница ${index + 1}`}</Text>
              <Text modifiers={[font({ size: 13 }), foregroundStyle('#8A908E')]}>{`из ${count} · ${paperNames[page.paper.pattern]}`}</Text>
            </VStack><Spacer />
            <Symbol key={thumbnail} uiImage={thumbnail.split('?')[0]} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: 36, height: 48 }), background('#FFFFFF'), border({ content: '#D4D9D8', width: 0.5 }), clipShape('roundedRectangle', 3)]} />
          </HStack><Divider />
          <Button modifiers={[buttonStyle('plain')]} onPress={onBookmark}><PageRow title={page.favorite ? 'Удалить закладку' : 'Добавить закладку'} icon={page.favorite ? 'bookmark.fill' : 'bookmark'} /></Button><Divider />
          <RotationMenu inset onRotate={onRotate} /><Divider />
          <Button modifiers={[buttonStyle('plain'), disabled(inOutline)]} onPress={() => run(onOutline)}><PageRow title={inOutline ? 'Страница уже в структуре' : 'Добавить к структуре'} icon="list.bullet.indent" /></Button><Divider />
          <Menu label={<PageRow title="Изменить шаблон" icon="square.grid.3x3" submenu />} modifiers={[buttonStyle('plain')]}>
            <Menu label="Цвет бумаги" systemImage="paintpalette">
              {(Object.keys(paperColorNames) as PaperColor[]).map(color => <Button key={color} label={paperColorNames[color]} systemImage={page.paper.color === color ? 'checkmark' : undefined} onPress={() => run(() => onTemplate({ color }))} />)}
            </Menu>
            {paperOrder.map(pattern => <Button key={pattern} label={paperNames[pattern]} systemImage={page.paper.pattern === pattern ? 'checkmark' : undefined} onPress={() => run(() => onTemplate({ pattern }))} />)}
          </Menu><Divider />
          <HStack spacing={12} modifiers={[frame({ minHeight: 46 })]}>
            <Symbol systemName="arrow.right.doc.on.clipboard" size={17} color="#1F6FE5" modifiers={[frame({ width: 24 })]} />
            <Text modifiers={[font({ size: 16 }), lineLimit(1)]}>Перейти к странице</Text><Spacer />
            <TextField text={number} placeholder={`1–${count}`} onTextChange={() => setInvalid(false)} modifiers={[font({ size: 16 }), frame({ width: 64 }), keyboardType('ascii-capable-number-pad'), textFieldStyle('roundedBorder'), onSubmit(go), accessibilityLabel('Номер страницы')]} />
          </HStack>
          {invalid && <Text modifiers={[font({ size: 13 }), foregroundStyle('#E5352B'), padding({ bottom: 10 })]}>{`Введите номер от 1 до ${count}`}</Text>}
        </VStack>
        {caption('Очистить или удалить')}
        <VStack spacing={0} modifiers={card}>
          {onErase && <><Button modifiers={[buttonStyle('plain')]} onPress={() => setScreen('erase')}><PageRow title="Удалить элементы" icon="eraser.line.dashed" submenu /></Button><Divider /></>}
          {onClear && <><Button role="destructive" modifiers={[buttonStyle('plain')]} onPress={() => run(onClear)}><PageRow title="Очистить страницу" icon="eraser" destructive /></Button><Divider /></>}
          <Button role="destructive" modifiers={[buttonStyle('plain'), disabled(count < 2)]} onPress={() => run(onRemove)}><PageRow title="Удалить страницу" icon="trash" destructive /></Button>
        </VStack>
        {caption('Вид')}
        <VStack spacing={0} modifiers={card}>
          <Menu label={<PageRow title="Прокрутка" icon={horizontal ? 'arrow.left.and.right' : 'arrow.up.and.down'} trailing={horizontal ? 'Горизонтально' : 'Вертикально'} />} modifiers={[buttonStyle('plain')]}>
            <Button label="Вертикально" systemImage={!horizontal ? 'checkmark' : undefined} onPress={() => run(() => onHorizontal(false))} />
            <Button label="Горизонтально" systemImage={horizontal ? 'checkmark' : undefined} onPress={() => run(() => onHorizontal(true))} />
          </Menu>
        </VStack>
      </VStack>}
    </Popover.Content>
  </Popover>;
}
