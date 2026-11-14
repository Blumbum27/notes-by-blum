import { Button, ColorPicker, Host, HStack, Menu } from '@expo/ui/swift-ui';
import { buttonStyle, disabled, padding } from '@expo/ui/swift-ui/modifiers';
import type { CanvasTool } from '../../../modules/notes-canvas';

export type EditorToolState = {
  tool: CanvasTool; color: string; width: number; eraserMode: 'bitmap' | 'vector';
};
type Props = { state: EditorToolState; onChange: (state: EditorToolState) => void };

/** Центральная группа: оболочка размещает этот компонент между своими группами. */
export function EditorTools({ state, onChange }: Props) {
  const choose = (tool: CanvasTool) => onChange({ ...state, tool });
  return <Host style={{ height: 52, minWidth: 240 }}><HStack spacing={12} modifiers={[padding({ all: 6 })]}>
    <Button label="Лассо" systemImage="lasso" onPress={() => choose('lasso')} modifiers={[buttonStyle(state.tool === 'lasso' ? 'borderedProminent' : 'bordered')]} />
    <Button label="Письмо" systemImage="pencil.tip" onPress={() => choose('pen')} modifiers={[buttonStyle(['pen', 'monoline', 'fountain', 'pencil', 'marker'].includes(state.tool) ? 'borderedProminent' : 'bordered')]} />
    <Button label="Ластик" systemImage="eraser" onPress={() => choose('eraser')} modifiers={[buttonStyle(state.tool === 'eraser' ? 'borderedProminent' : 'bordered')]} />
    <Button label="Изображение" systemImage="photo" onPress={() => choose('image')} />
    <Button label="Текст" systemImage="textformat" onPress={() => choose('text')} modifiers={[buttonStyle(state.tool === 'text' ? 'borderedProminent' : 'bordered')]} />
  </HStack></Host>;
}

export function EditorToolPanel({ state, onChange, onClear }: Props & { onClear: () => void }) {
  const update = (patch: Partial<EditorToolState>) => onChange({ ...state, ...patch });
  if (state.tool === 'lasso') return null;
  if (state.tool === 'image' || state.tool === 'text') return null;
  return <Host style={{ height: 58, width: 760, alignSelf: 'center' }}><HStack spacing={10} modifiers={[padding({ all: 8 })]}>
    {state.tool === 'eraser' ? <Menu label={state.eraserMode === 'vector' ? 'Для штрихов' : state.width < 10 ? 'Точный' : 'Стандартный'}>
      <Button label="Точный" onPress={() => update({ eraserMode: 'bitmap', width: 5 })} />
      <Button label="Стандартный" onPress={() => update({ eraserMode: 'bitmap', width: 20 })} />
      <Button label="Для штрихов" onPress={() => update({ eraserMode: 'vector' })} />
      <Button label="Очистить страницу" role="destructive" onPress={onClear} />
    </Menu> : <>
      <Menu label="Ручка" systemImage="pencil.tip"><Button label="Перьевая ручка" onPress={() => update({ tool: 'fountain' })} /><Button label="Шариковая ручка" onPress={() => update({ tool: 'monoline' })} /><Button label="Ручка-кисть" onPress={() => update({ tool: 'pen' })} /></Menu>
      <Button label="Карандаш" systemImage="pencil" onPress={() => update({ tool: 'pencil' })} />
      <Button label="Маркер" systemImage="highlighter" onPress={() => update({ tool: 'marker', width: 12 })} />
    </>}
    {(state.tool === 'eraser' ? [5, 20, 40] : state.tool === 'marker' ? [8, 12, 20] : [1, 3, 6]).map(width => <Button key={width} label={`${width}`} onPress={() => update({ width })} modifiers={[buttonStyle(state.width === width ? 'borderedProminent' : 'bordered')]} />)}
    {state.tool !== 'eraser' && <ColorPicker label="Цвет" selection={state.color} onSelectionChange={color => update({ color })} />}
  </HStack></Host>;
}

export function EditorHistory({ canUndo, canRedo, onUndo, onRedo }: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void }) {
  return <Host style={{ width: 280, height: 48 }}><HStack spacing={8}><Button label="Отмена" systemImage="arrow.uturn.backward" modifiers={[disabled(!canUndo)]} onPress={onUndo} /><Button label="Повторить" systemImage="arrow.uturn.forward" modifiers={[disabled(!canRedo)]} onPress={onRedo} /></HStack></Host>;
}
