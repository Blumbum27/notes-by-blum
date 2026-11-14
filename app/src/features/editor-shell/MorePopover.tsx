import { Button, Divider, HStack, Image as Symbol, Menu, Popover, Spacer, Text, TextField, VStack, useNativeState } from '@expo/ui/swift-ui';
import { aspectRatio, background, border, buttonStyle, clipShape, disabled, font, foregroundStyle, frame, keyboardType, labelStyle, lineLimit, onSubmit, padding, resizable, shapes, textFieldStyle } from '@expo/ui/swift-ui/modifiers';
import { useState, type ComponentProps } from 'react';
import type { NotebookPage, Paper } from '../../shared/documents/types';
import { paperNames } from './AddPagePopover';

function PageRow({ title, icon, submenu = false, destructive = false }: {
  title: string; icon: ComponentProps<typeof Symbol>['systemName']; submenu?: boolean; destructive?: boolean;
}) {
  return <HStack spacing={10} modifiers={[frame({ minHeight: 50, maxWidth: Infinity }), foregroundStyle(destructive ? '#FF3B30' : '#151716')]}>
    <Symbol systemName={icon} size={20} modifiers={[frame({ width: 24 })]} />
    <Text modifiers={[font({ size: 16 })]}>{title}</Text><Spacer />
    {submenu && <Symbol systemName="chevron.right" size={12} modifiers={[foregroundStyle('#B9BEBC')]} />}
  </HStack>;
}

export function RotationMenu({ onRotate, inset = false }: { onRotate: (degrees: number) => void; inset?: boolean }) {
  return <Menu label={inset ? <PageRow title="Повернуть страницу" icon="rotate.right" submenu /> : 'Повернуть страницу'} systemImage={inset ? undefined : 'rotate.right'} modifiers={inset ? [buttonStyle('plain')] : []}>
    <Button label="На 90° по часовой стрелке" onPress={() => onRotate(90)} />
    <Button label="На 90° против часовой стрелки" onPress={() => onRotate(270)} />
    <Button label="На 180°" onPress={() => onRotate(180)} />
  </Menu>;
}

export function MorePopover({ page, index, count, thumbnail, onBookmark, onRotate, onTemplate, onGo, onClear, onRemove }: {
  page: NotebookPage; index: number; count: number; thumbnail: string;
  onBookmark: () => void; onRotate: (degrees: number) => void;
  onTemplate: (pattern: Paper) => void; onGo: (index: number) => void;
  onClear?: () => void; onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const number = useNativeState('');
  const [invalid, setInvalid] = useState(false);
  const go = () => {
    const value = Number(number.get());
    if (!Number.isInteger(value) || value < 1 || value > count) { setInvalid(true); return; }
    setInvalid(false); setOpen(false); onGo(value - 1);
  };
  const card = [padding({ horizontal: 16 }), background('#FFFFFF', shapes.roundedRectangle({ cornerRadius: 22 }))];
  return <Popover isPresented={open} onIsPresentedChange={setOpen}>
    <Popover.Trigger><Button label="Ещё" systemImage="ellipsis.circle" modifiers={[labelStyle('iconOnly'), frame({ width: 36, height: 36 })]} onPress={() => { number.set(''); setInvalid(false); setOpen(true); }} /></Popover.Trigger>
    <Popover.Content><VStack alignment="leading" spacing={0} modifiers={[padding({ all: 16 }), frame({ width: 325 }), background('#F3F5F4')]}>
      <HStack modifiers={[frame({ height: 48 })]}><Spacer /><Text modifiers={[font({ size: 17, weight: 'semibold' })]}>Ещё</Text><Spacer /></HStack>
      <VStack alignment="leading" spacing={0} modifiers={card}>
        <HStack modifiers={[frame({ height: 68 })]}><Text modifiers={[font({ textStyle: 'headline' })]}>{`Страница ${index + 1}`}</Text><Spacer />
          <Symbol key={thumbnail} uiImage={thumbnail.split('?')[0]} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: 39, height: 50 }), background('#FFFFFF'), border({ content: '#AAB0AE', width: 0.7 }), clipShape('roundedRectangle', 4)]} />
        </HStack><Divider />
        <Button modifiers={[buttonStyle('plain')]} onPress={onBookmark}><PageRow title={page.favorite ? 'Удалить из избранного' : 'Добавить в избранное'} icon={page.favorite ? 'bookmark.fill' : 'bookmark'} /></Button><Divider />
        <RotationMenu inset onRotate={onRotate} /><Divider />
        <Menu label={<PageRow title="Изменить шаблон" icon="paintpalette" submenu />} modifiers={[buttonStyle('plain')]}>
          {(Object.keys(paperNames) as Paper[]).map(pattern => <Button key={pattern} label={paperNames[pattern]} onPress={() => { setOpen(false); onTemplate(pattern); }} />)}
        </Menu><Divider />
        <HStack spacing={10} modifiers={[frame({ minHeight: 53 }), foregroundStyle('#151716')]}>
          <Symbol systemName="arrow.right.square" size={20} modifiers={[frame({ width: 24 })]} />
          <Text modifiers={[font({ size: 15 }), lineLimit(1), frame({ width: 150, alignment: 'leading' })]}>Перейти к странице</Text><Spacer />
          <TextField text={number} placeholder={`(1 – ${count})`} onTextChange={() => setInvalid(false)} modifiers={[font({ size: 15 }), frame({ width: 53 }), keyboardType('numbers-and-punctuation'), textFieldStyle('plain'), onSubmit(go)]} />
        </HStack>
        {invalid && <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle('red'), padding({ bottom: 10 })]}>{`Введите номер от 1 до ${count}`}</Text>}
      </VStack>
      <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle('#858B88'), padding({ vertical: 18, horizontal: 12 })]}>Очистить или удалить страницу</Text>
      <VStack spacing={0} modifiers={card}>
        {onClear && <><Button role="destructive" modifiers={[buttonStyle('plain')]} onPress={() => { setOpen(false); onClear(); }}><PageRow title="Очистить страницу" icon="eraser" destructive /></Button><Divider /></>}
        <Button role="destructive" modifiers={[buttonStyle('plain'), disabled(count < 2)]} onPress={() => { setOpen(false); onRemove(); }}><PageRow title="Удалить страницу" icon="trash" destructive /></Button>
      </VStack>
    </VStack></Popover.Content>
  </Popover>;
}
