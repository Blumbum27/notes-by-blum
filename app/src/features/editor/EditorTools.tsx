import { Button, Circle, ColorPicker, Divider, Host, HStack, Image, Popover, Rectangle, RNHostView, ScrollView, Text, Toggle, VStack, ZStack } from '@expo/ui/swift-ui';
import { accessibilityLabel, background, buttonStyle, disabled, font, foregroundStyle, frame, glassEffect, labelStyle, multilineTextAlignment, padding, strokeBorder } from '@expo/ui/swift-ui/modifiers';
import { forwardRef, memo, useImperativeHandle, useState, type ReactElement } from 'react';
import { NotesCanvas, type CanvasTool } from '../../../modules/notes-canvas';

export type EditorToolState = {
  tool: CanvasTool; color: string; width: number; eraserMode: 'bitmap' | 'vector';
  colors?: string[]; colorIndex?: number; thicknessIndex?: number; eraserType?: 'precise' | 'standard' | 'stroke';
};
export const writingTool = (tool: CanvasTool) => ['pen', 'monoline', 'fountain', 'pencil', 'marker'].includes(tool);
export const writingGroup = (tool: CanvasTool) => tool === 'pencil' || tool === 'marker' ? tool : 'pen';
export const thicknesses = { pen: [0.2, 0.2, 0.6], pencil: [0.3, 0.9, 1.5], marker: [2.3, 4.6, 6.9] };
export const mmToPoints = (mm: number) => mm * 72 / 25.4;
export const defaultPresets: Record<string, EditorToolState> = {
  pen: { tool: 'fountain', color: '#000000', width: mmToPoints(0.6), eraserMode: 'bitmap', thicknessIndex: 2, colorIndex: 0, colors: ['#000000', '#FFFFFF', '#005E75', '#D47500', '#D10000', '#FCFF85', '#FF9696', '#FCFCFC', '#000000', '#752E00', '#47002B', '#750000'] },
  pencil: { tool: 'pencil', color: '#000000', width: mmToPoints(0.3), eraserMode: 'bitmap', thicknessIndex: 0, colorIndex: 0, colors: ['#000000', '#636363', '#9C9C9C'] },
  marker: { tool: 'marker', color: '#FFB8E6', width: mmToPoints(6.9), eraserMode: 'bitmap', thicknessIndex: 2, colorIndex: 1, colors: ['#FFFF00', '#FFB8E6', '#00FFFF', '#000000', '#FFFFFF', '#FFA338'] },
  eraser: { tool: 'eraser', color: '#000000', width: 20, eraserMode: 'bitmap', eraserType: 'precise', thicknessIndex: 1 },
};
type Props = { state: EditorToolState; onChange: (state: EditorToolState) => void };
const iconModifiers = [labelStyle('iconOnly'), font({ size: 24 }), frame({ width: 46, height: 44 })];

function ToolTile({ label, symbol, selected, onPress }: {
  label: string; symbol: 'pencil.tip' | 'pencil' | 'paintbrush.pointed' | 'eraser' | 'eraser.line.dashed';
  selected: boolean; onPress: () => void;
}) {
  return <Button onPress={onPress} modifiers={[buttonStyle('plain'), accessibilityLabel(label)]}>
    <VStack spacing={8} modifiers={[frame({ width: 116, height: 104 }), ...(selected ? [background('#FFFFFF', { shape: 'roundedRectangle' as const, cornerRadius: 16 })] : [])]}>
      <Image systemName={symbol} size={30} modifiers={[frame({ width: 100, height: 42 })]} />
      <Text modifiers={[font({ size: 13 }), multilineTextAlignment('center'), frame({ width: 110, height: 36, alignment: 'top' })]}>{label}</Text>
    </VStack>
  </Button>;
}

export const EditorTools = memo(function EditorTools({ state, onChange, onRepeatEraser, onWriting }: Props & { onRepeatEraser?: () => void; onWriting?: () => void }) {
  const choose = (tool: CanvasTool) => { if (tool === 'eraser' && state.tool === tool) onRepeatEraser?.(); else onChange({ ...state, tool }); };
  const icon = (label: string, symbol: 'lasso' | 'pencil.tip' | 'eraser' | 'photo' | 'textformat', selected: boolean, onPress: () => void) => <Button onPress={onPress} modifiers={[buttonStyle('plain'), frame({ width: 46, height: 44 }), accessibilityLabel(label)]}><Image systemName={symbol} size={24} color="#202525" modifiers={[frame({ width: 36, height: 36 }), ...(selected ? [background('#FFFFFF', { shape: 'roundedRectangle' as const, cornerRadius: 11 })] : [])]} /></Button>;
  return <Host style={{ height: 44, width: 260 }}><HStack spacing={4}>
    {icon('Лассо', 'lasso', state.tool === 'lasso', () => choose('lasso'))}
    <Divider modifiers={[frame({ height: 24 })]} />
    {icon('Письмо', 'pencil.tip', writingTool(state.tool), () => onWriting ? onWriting() : choose('pen'))}
    {icon('Ластик', 'eraser', state.tool === 'eraser', () => choose('eraser'))}
    {icon('Изображение', 'photo', state.tool === 'image', () => choose('image'))}
    {icon('Текст', 'textformat', state.tool === 'text', () => choose('text'))}
  </HStack></Host>;
});

export function EditorToolPanel({ state, onChange, onClear, availableWidth = 620, eraserAutoReturn, onEraserAutoReturnChange }: Props & { onClear: () => void; availableWidth?: number; eraserAutoReturn: boolean; onEraserAutoReturnChange: (value: boolean) => void }) {
  const [open, setOpen] = useState<string>();
  const [draftColor, setDraftColor] = useState('#0089FF');
  const update = (patch: Partial<EditorToolState>) => onChange({ ...state, ...patch });
  if (!writingTool(state.tool) && state.tool !== 'eraser') return null;
  const group = writingGroup(state.tool);
  const widths = state.tool === 'eraser' ? (state.eraserType === 'standard' ? [20, 40, 80] : [5, 20, 40]) : thicknesses[group].map(mmToPoints);
  const penName = state.tool === 'monoline' ? 'Шариковая ручка' : state.tool === 'pen' ? 'Ручка-кисть' : 'Перьевая ручка';
  const popup = (key: string, trigger: ReactElement, content: ReactElement) => <Popover key={key} isPresented={open === key} onIsPresentedChange={value => setOpen(value ? key : undefined)} attachmentAnchor="bottom" arrowEdge="top"><Popover.Trigger>{trigger}</Popover.Trigger><Popover.Content>{content}</Popover.Content></Popover>;
  const panelWidth = Math.max(300, Math.min(state.tool === 'eraser' ? 394 : 620, availableWidth));
  return <Host style={{ height: 45, width: panelWidth }}><HStack spacing={0} modifiers={[frame({ width: panelWidth, height: 45 }), glassEffect({ shape: 'capsule' })]}>
    {state.tool === 'eraser' ? <>
      {popup('eraser', <Button onPress={() => setOpen('eraser')} modifiers={[buttonStyle('plain'), frame({ width: 146, height: 37 }), background('#E4E7E6', { shape: 'roundedRectangle', cornerRadius: 12 }), accessibilityLabel('Тип ластика')]}><HStack spacing={6}><Image systemName="eraser" size={24} /><Text>{state.eraserType === 'stroke' ? 'Штрих' : state.eraserType === 'standard' ? 'Стандартный' : 'Точный'}</Text><Image systemName="chevron.down" size={10} /></HStack></Button>, <VStack spacing={20} modifiers={[padding({ all: 16 }), frame({ width: 393 })]}><Text modifiers={[font({ size: 17, weight: 'semibold' })]}>Тип ластика</Text><HStack spacing={4}>{(['precise', 'standard', 'stroke'] as const).map((type, i) => <ToolTile key={type} onPress={() => { update({ eraserType: type, eraserMode: type === 'stroke' ? 'vector' : 'bitmap', width: type === 'standard' ? [20, 40, 80][state.thicknessIndex ?? 1] : [5, 20, 40][state.thicknessIndex ?? 1] }); setOpen(undefined); }} selected={state.eraserType === type} symbol={i === 2 ? 'eraser.line.dashed' : 'eraser'} label={['Точный ластик', 'Стандартный ластик', 'Ластик для штрихов'][i]} />)}</HStack><Text modifiers={[font({ size: 14 }), foregroundStyle('#777777')]}>{state.eraserType === 'stroke' ? 'Удаляет штрих целиком' : state.eraserType === 'standard' ? 'Стирает широкой областью' : 'Возможность точно стереть мелкие детали'}</Text></VStack>)}
      <Divider modifiers={[frame({ height: 28 })]} />
      {popup('settings', <Button label="Параметры инструмента" systemImage="slider.horizontal.3" onPress={() => setOpen('settings')} modifiers={[...iconModifiers, buttonStyle('plain')]} />, <VStack spacing={24} modifiers={[padding({ all: 20 }), frame({ width: 393 })]}><Text modifiers={[font({ size: 17, weight: 'semibold' })]}>Дополнительные настройки</Text><Button label="Очистить страницу" role="destructive" onPress={() => { setOpen(undefined); onClear(); }} /><Toggle label="Автоперекл. на предыд. инструмент" isOn={eraserAutoReturn} onIsOnChange={onEraserAutoReturnChange} /></VStack>)}
    </> : <>
      {(['pen', 'pencil', 'marker'] as const).map((type, i) => {
        const selected = group === type;
        const title = type === 'pen' ? penName : type === 'pencil' ? 'Стандартный карандаш' : 'Маркер';
        return <Popover key={type} isPresented={open === type} onIsPresentedChange={value => setOpen(value ? type : undefined)} attachmentAnchor="bottom" arrowEdge="top"><Popover.Trigger><Button onPress={() => selected ? setOpen(type) : update({ tool: type })} modifiers={[buttonStyle('plain'), foregroundStyle('#202525'), frame({ width: 46, height: 37 }), ...(selected ? [background('#A8DFE8', { shape: 'roundedRectangle' as const, cornerRadius: 11 })] : []), accessibilityLabel(['Ручка', 'Карандаш', 'Маркер'][i])]}><HStack spacing={2}><Image systemName={type === 'pen' ? 'pencil.tip' : type === 'pencil' ? 'pencil' : 'highlighter'} size={24} />{selected && <Image systemName="chevron.down" size={9} />}</HStack></Button></Popover.Trigger><Popover.Content><VStack spacing={20} modifiers={[padding({ all: 16 }), frame({ width: 393 })]}><Text modifiers={[font({ size: 17, weight: 'semibold' })]}>{title}</Text><RNHostView matchContents><NotesCanvas preview filePath="" pageWidth={300} pageHeight={110} tool={state.tool} color={state.color} strokeWidth={state.width} eraserMode="bitmap" pattern="blank" paperColor="#FFFFFF" readOnly fingerDrawing={false} style={{ width: 300, height: 110 }} /></RNHostView>{type === 'pen' && <HStack spacing={4}>{(['fountain', 'monoline', 'pen'] as const).map((tool, index) => <ToolTile key={tool} onPress={() => update({ tool })} selected={state.tool === tool} symbol={index === 0 ? 'pencil.tip' : index === 1 ? 'pencil' : 'paintbrush.pointed'} label={['Перьевая ручка', 'Шариковая ручка', 'Ручка-кисть'][index]} />)}</HStack>}</VStack></Popover.Content></Popover>;
      })}<Divider modifiers={[frame({ height: 28 }), padding({ horizontal: 4 })]} />
    </>}
    {widths.map((width, index) => <Button key={index} onPress={() => update({ width, thicknessIndex: index })} modifiers={[buttonStyle('plain'), frame({ width: state.tool === 'eraser' ? 59 : 44, height: 37 }), ...(state.tool !== 'eraser' && state.thicknessIndex === index ? [background('#D9DCDE', { shape: 'roundedRectangle', cornerRadius: 12 })] : []), accessibilityLabel(state.tool === 'eraser' ? ['Маленький ластик', 'Средний ластик', 'Большой ластик'][index] : `${thicknesses[group][index]} мм`)]}>{state.tool === 'eraser' || group === 'marker' ? <Circle modifiers={[foregroundStyle(state.tool === 'eraser' ? '#F4F6F5' : '#4C5050'), frame({ width: [12, 22, 32][index], height: [12, 22, 32][index] }), ...(state.tool === 'eraser' ? [strokeBorder({ shape: 'circle', color: state.thicknessIndex === index ? '#0089FF' : '#A5AAA9', style: { lineWidth: 2 } })] : [])]} /> : <Rectangle modifiers={[foregroundStyle('#4C5050'), frame({ width: 19, height: [1, 2, 4][index] })]} />}</Button>)}
    {state.tool !== 'eraser' && <ScrollView axes="horizontal" showsIndicators={false} modifiers={[frame({ width: panelWidth - 282, height: 45 })]}><HStack spacing={0}>{(state.colors ?? defaultPresets[group].colors!).map((color, index) => popup(`color-${index}`, <Button onPress={() => state.colorIndex === index ? setOpen(`color-${index}`) : update({ color, colorIndex: index })} modifiers={[buttonStyle('plain'), frame({ width: 44, height: 45 }), accessibilityLabel(`Цвет ${index + 1}${state.colorIndex === index ? ', выбран' : ''}`)]}><ZStack><Circle modifiers={[foregroundStyle(color), frame({ width: 20, height: 20 }), strokeBorder({ shape: 'circle', color: '#A5AAA9', style: { lineWidth: color.toUpperCase() === '#FFFFFF' ? 1 : 0.3 } }), ...(state.colorIndex === index ? [padding({ all: 4 }), background('#D9DCDE', { shape: 'circle' })] : [])]} />{state.colorIndex === index && <Image systemName="chevron.down" size={9} color={color === '#000000' || color === '#005E75' ? '#FFFFFF' : '#555555'} />}</ZStack></Button>, <VStack modifiers={[padding({ all: 20 })]}><ColorPicker label="Цвет инструмента" selection={color} supportsOpacity={false} onSelectionChange={value => { const colors = [...(state.colors ?? defaultPresets[group].colors!)]; colors[index] = value; update({ colors, color: value, colorIndex: index }); }} /></VStack>))}{popup('add-color', <Button label="Добавить цвет" systemImage="plus.circle.dashed" onPress={() => setOpen('add-color')} modifiers={[...iconModifiers, buttonStyle('plain')]} />, <VStack spacing={16} modifiers={[padding({ all: 20 })]}><ColorPicker label="Новый цвет" selection={draftColor} supportsOpacity={false} onSelectionChange={setDraftColor} /><Button label="Добавить" onPress={() => { const colors = [...(state.colors ?? defaultPresets[group].colors!), draftColor]; update({ colors, color: draftColor, colorIndex: colors.length - 1 }); setOpen(undefined); }} /></VStack>)}</HStack></ScrollView>}
  </HStack></Host>;
}

export type HistoryHandle = { update: (history: { canUndo: boolean; canRedo: boolean }) => void };
export const EditorHistory = forwardRef<HistoryHandle, { onUndo: () => void; onRedo: () => void }>(function EditorHistory({ onUndo, onRedo }, ref) {
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  useImperativeHandle(ref, () => ({ update: next => setHistory(current => current.canUndo === next.canUndo && current.canRedo === next.canRedo ? current : next) }), []);
  return <Host style={{ width: 88, height: 45 }}><HStack spacing={8} modifiers={[padding({ all: 4 }), glassEffect({ shape: 'capsule' })]}><Button label="Отмена" systemImage="arrow.uturn.backward" modifiers={[labelStyle('iconOnly'), font({ size: 23 }), buttonStyle('plain'), frame({ width: 36, height: 37 }), disabled(!history.canUndo)]} onPress={onUndo} /><Button label="Повторить" systemImage="arrow.uturn.forward" modifiers={[labelStyle('iconOnly'), font({ size: 23 }), buttonStyle('plain'), frame({ width: 36, height: 37 }), disabled(!history.canRedo)]} onPress={onRedo} /></HStack></Host>;
});
