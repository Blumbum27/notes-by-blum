import { Button, ColorPicker, Host, HStack, Menu, Popover, VStack, Text } from '@expo/ui/swift-ui';
import { useWindowDimensions } from 'react-native';
import { useState } from 'react';
import { buttonStyle, disabled, padding, glassEffect, labelsHidden, labelStyle } from '@expo/ui/swift-ui/modifiers';
import type { CanvasTool } from '../../../modules/notes-canvas';

export type EditorToolState = {
  tool: CanvasTool; color: string; width: number; eraserMode: 'bitmap' | 'vector'; eraserAutoReturn?: boolean;
};
type Props = { state: EditorToolState; onChange: (state: EditorToolState) => void };

/** Центральная группа: оболочка размещает этот компонент между своими группами. */
export function EditorTools({ state, onChange }: Props) {
  const choose = (tool: CanvasTool) => onChange({ ...state, tool });
  return <Host style={{ height: 52 }}><HStack spacing={12} modifiers={[padding({ all: 6 }), labelStyle('iconOnly')]}>
    <Button label="Лассо" systemImage="lasso" onPress={() => choose('lasso')} modifiers={[buttonStyle(state.tool === 'lasso' ? 'borderedProminent' : 'bordered')]} />
    <Button label="Письмо" systemImage="pencil.tip" onPress={() => choose('pen')} modifiers={[buttonStyle(['pen', 'monoline', 'fountain', 'pencil', 'marker'].includes(state.tool) ? 'borderedProminent' : 'bordered')]} />
    <Button label="Ластик" systemImage="eraser" onPress={() => choose('eraser')} modifiers={[buttonStyle(state.tool === 'eraser' ? 'borderedProminent' : 'bordered')]} />
    <Button label="Изображение" systemImage="photo" onPress={() => choose('image')} />
    <Button label="Текст" systemImage="textformat" onPress={() => choose('text')} modifiers={[buttonStyle(state.tool === 'text' ? 'borderedProminent' : 'bordered')]} />
  </HStack></Host>;
}

export function EditorToolPanel({ state, onChange, onClear }: Props & { onClear: () => void }) {
  const { width: windowWidth } = useWindowDimensions();
  const [penOpen, setPenOpen] = useState(false);
  const update = (patch: Partial<EditorToolState>) => onChange({ ...state, ...patch });
  const choosePen = (tool: CanvasTool) => { update({ tool }); setPenOpen(false); };
  if (state.tool === 'lasso') return <Host style={{ height: 52, width: 260, alignSelf: 'center' }}><Menu label="Лассо"><Text>Произвольное выделение штрихов</Text></Menu></Host>;
  if (state.tool === 'image' || state.tool === 'text') return null;
  return <Host style={{ height: 58, width: Math.min(state.tool === 'eraser' ? 380 : 760, windowWidth - 24), alignSelf: 'center' }}><HStack spacing={8} modifiers={[padding({ all: 8 }), glassEffect()]}>
    {state.tool === 'eraser' ? <Menu label={state.eraserMode === 'vector' ? 'Для штрихов' : state.width < 10 ? 'Точный' : 'Стандартный'}>
      <Button label="Точный" onPress={() => update({ eraserMode: 'bitmap', width: 5 })} />
      <Button label="Стандартный" onPress={() => update({ eraserMode: 'bitmap', width: 20 })} />
      <Button label="Для штрихов" onPress={() => update({ eraserMode: 'vector' })} />
      <Button label={state.eraserAutoReturn ? 'Автовозврат: вкл.' : 'Автовозврат: выкл.'} onPress={() => update({ eraserAutoReturn: !state.eraserAutoReturn })} />
      <Button label="Очистить страницу" role="destructive" onPress={onClear} />
    </Menu> : <>
      <Popover isPresented={penOpen} onIsPresentedChange={setPenOpen} attachmentAnchor="bottom" arrowEdge="top"><Popover.Trigger><Button label="Ручка" systemImage="pencil.tip" onPress={() => setPenOpen(true)} /></Popover.Trigger><Popover.Content><VStack spacing={16} modifiers={[padding({ all: 20 })]}><Text>Тип ручки</Text><Button label="Перьевая ручка" onPress={() => choosePen('fountain')} /><Button label="Шариковая ручка" onPress={() => choosePen('monoline')} /><Button label="Ручка-кисть" onPress={() => choosePen('pen')} /></VStack></Popover.Content></Popover>
      <Button label="Карандаш" systemImage="pencil" onPress={() => update({ tool: 'pencil' })} />
      <Button label="Маркер" systemImage="highlighter" onPress={() => update({ tool: 'marker', width: 12 })} />
    </>}
    {(state.tool === 'eraser' ? [5, 20, 40] : state.tool === 'marker' ? [8, 12, 20] : [1, 3, 6]).map(width => <Button key={width} label={`${width}`} onPress={() => update({ width })} modifiers={[buttonStyle(state.width === width ? 'borderedProminent' : 'bordered')]} />)}
    {state.tool !== 'eraser' && <><Menu label="Цвета">{['#151515', '#FFFFFF', '#006F83', '#D57A00', '#E00000', '#FFEE00'].map(color => <Button key={color} label={color === '#151515' ? 'Чёрный' : color === '#FFFFFF' ? 'Белый' : color === '#006F83' ? 'Синий' : color === '#D57A00' ? 'Оранжевый' : color === '#E00000' ? 'Красный' : 'Жёлтый'} onPress={() => update({ color })} />)}</Menu><ColorPicker label="Цвет" modifiers={[labelsHidden()]} selection={state.color} onSelectionChange={color => update({ color })} /></>}
  </HStack></Host>;
}

export function EditorHistory({ canUndo, canRedo, onUndo, onRedo }: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void }) {
  return <Host style={{ width: 280, height: 48 }}><HStack spacing={8} modifiers={[padding({ all: 6 }), glassEffect()]}><Button label="Отмена" systemImage="arrow.uturn.backward" modifiers={[disabled(!canUndo)]} onPress={onUndo} /><Button label="Повторить" systemImage="arrow.uturn.forward" modifiers={[disabled(!canRedo)]} onPress={onRedo} /></HStack></Host>;
}
