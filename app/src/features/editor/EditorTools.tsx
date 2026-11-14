import { Button, Capsule, Circle, ColorPicker, Divider, Host, HStack, Image, Popover, RNHostView, RoundedRectangle, ScrollView, Slider, Spacer, Text, Toggle, VStack, ZStack } from '@expo/ui/swift-ui';
import { accessibilityLabel, background, buttonStyle, contentShape, disabled, font, foregroundStyle, frame, glassEffect, multilineTextAlignment, offset, padding, shapes, strokeBorder } from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'expo-symbols';
import { forwardRef, Fragment, memo, useImperativeHandle, useState, type ReactElement } from 'react';
import { NotesCanvas, type CanvasTool, type PenOptions, type ShapeKind } from '../../../modules/notes-canvas';

export type WritingGroup = 'pen' | 'pencil' | 'marker' | 'tape' | 'drawShape';
export type EditorToolState = {
  tool: CanvasTool; color: string; width: number; eraserMode: 'bitmap' | 'vector';
  colors?: string[]; colorIndex?: number; thicknessIndex?: number; eraserType?: 'precise' | 'standard' | 'stroke';
  shapeKind?: ShapeKind; laserMode?: 'dot' | 'line'; penOptions?: PenOptions;
};
const writingTools: CanvasTool[] = ['pen', 'monoline', 'fountain', 'pencil', 'marker', 'tape', 'drawShape'];
export const writingTool = (tool: CanvasTool) => writingTools.includes(tool);
export const writingGroup = (tool: CanvasTool): WritingGroup => tool === 'pencil' || tool === 'marker' || tool === 'tape' || tool === 'drawShape' ? tool : 'pen';
/** Ключ сохранённого пресета: все виды ручки делят пресет «pen». */
export const presetKey = (tool: CanvasTool) => writingTool(tool) ? writingGroup(tool) : tool;
export const thicknesses: Record<WritingGroup | 'shape', number[]> = {
  pen: [0.2, 0.4, 0.6], pencil: [0.3, 0.9, 1.5], marker: [2.3, 4.6, 6.9], tape: [3.5, 6.3, 9.9], drawShape: [0.2, 0.4, 0.8], shape: [0.3, 0.6, 1.2],
};
export const mmToPoints = (mm: number) => mm * 72 / 25.4;
const penColors = ['#000000', '#5E6463', '#1F5FBF', '#0B8A6A', '#D47500', '#D10000', '#8E3FC4', '#FF9696'];
const defaultPen: PenOptions = { pressure: 1, stabilization: 0, holdToSnap: true };
export const stickyColors = ['#FFB8B0', '#FFD5A6', '#FFEE9A', '#CDEEB2', '#B6E8E0', '#BCD9FF', '#D8CFFF', '#FFC9E6', '#DCDFE0', '#FFFFFF'];
export const defaultPresets: Record<string, EditorToolState> = {
  pen: { tool: 'fountain', color: '#000000', width: mmToPoints(0.4), eraserMode: 'bitmap', thicknessIndex: 1, colorIndex: 0, colors: penColors, penOptions: defaultPen },
  pencil: { tool: 'pencil', color: '#000000', width: mmToPoints(0.3), eraserMode: 'bitmap', thicknessIndex: 0, colorIndex: 0, colors: ['#000000', '#636363', '#9C9C9C', '#1F5FBF'], penOptions: defaultPen },
  marker: { tool: 'marker', color: '#FFEE58', width: mmToPoints(4.6), eraserMode: 'bitmap', thicknessIndex: 1, colorIndex: 0, colors: ['#FFEE58', '#FFB8E6', '#8FF0F5', '#B6F09C', '#FFC078', '#C9B8FF'], penOptions: defaultPen },
  tape: { tool: 'tape', color: '#2B2B2B', width: mmToPoints(6.3), eraserMode: 'bitmap', thicknessIndex: 1, colorIndex: 0, colors: ['#2B2B2B', 'stars', '#F5A142', '#7BC67E'] },
  drawShape: { tool: 'drawShape', color: '#000000', width: mmToPoints(0.4), eraserMode: 'bitmap', thicknessIndex: 1, colorIndex: 0, colors: penColors, penOptions: defaultPen },
  shape: { tool: 'shape', color: '#000000', width: mmToPoints(0.6), eraserMode: 'bitmap', thicknessIndex: 1, colorIndex: 0, colors: penColors, shapeKind: 'freeform' },
  sticky: { tool: 'sticky', color: stickyColors[2], width: 1, eraserMode: 'bitmap', colorIndex: 2 },
  laser: { tool: 'laser', color: '#FF3B30', width: 1, eraserMode: 'bitmap', laserMode: 'line' },
  eraser: { tool: 'eraser', color: '#000000', width: 20, eraserMode: 'bitmap', eraserType: 'precise', thicknessIndex: 1 },
};
const presetColors = [
  '#000000', '#3A3F3E', '#5E6463', '#8E9493', '#B9BEBD', '#DADDDF', '#F1F2F2', '#FFFFFF',
  '#7A1D1D', '#D10000', '#FF5A4E', '#FF9696', '#D47500', '#FFA338', '#FFD43B', '#FCFF85',
  '#0B5E3A', '#0B8A6A', '#47C27A', '#1F5FBF', '#3D8BFF', '#7FC4FF', '#5B2A86', '#8E3FC4',
];
const ink = '#2E3433';
const tint = { selected: '#E8EEF8', thickness: '#E9ECEC' };

type Props = { state: EditorToolState; onChange: (state: EditorToolState) => void };
const plain = buttonStyle('plain');
// Нажатие засчитывается по всей рамке кнопки, а не только по видимому значку.
const hit = contentShape(shapes.rectangle());
// Шесть цветов и «+» — ширина участка цветов во всех панелях с палитрой.
const colorSlot = 36 * 7;
const lightColors = new Set(['#FFFFFF', '#FCFCFC', '#F1F2F2', '#FCFF85', '#FFFF00']);
const glyph = (symbol: SFSymbol, size: number, color = ink, weight: 'regular' | 'medium' | 'semibold' = 'regular') =>
  <Image systemName={symbol} size={size} color={color} modifiers={[font({ size, weight })]} />;

function ToolTile({ label, symbol, selected, onPress }: { label: string; symbol: SFSymbol; selected: boolean; onPress: () => void }) {
  return <Button onPress={onPress} modifiers={[plain, accessibilityLabel(label)]}>
    <VStack spacing={8} modifiers={[frame({ width: 96, height: 92 }), background(selected ? tint.selected : '#F4F5F5', { shape: 'roundedRectangle' as const, cornerRadius: 14 }), ...(selected ? [strokeBorder({ shape: 'roundedRectangle', cornerRadius: 14, color: '#3D8BFF', style: { lineWidth: 1.5 } })] : [])]}>
      {glyph(symbol, 24, selected ? '#1F6FE5' : ink)}
      <Text modifiers={[font({ size: 12, weight: selected ? 'semibold' : 'regular' }), multilineTextAlignment('center'), foregroundStyle(selected ? '#1F6FE5' : ink), frame({ width: 88 })]}>{label}</Text>
    </VStack>
  </Button>;
}

/** Инструменты верхней панели: цвет значка — постоянная «личность» инструмента, выбранный получает подложку того же тона. */
const toolbarItems: { key: string; label: string; symbol: SFSymbol; accent: string; wash: string }[] = [
  { key: 'lasso', label: 'Лассо', symbol: 'lasso', accent: '#5E5CE6', wash: '#ECEBFD' },
  { key: 'writing', label: 'Письмо', symbol: 'pencil.tip', accent: '#1F6FE5', wash: '#E6EFFD' },
  { key: 'eraser', label: 'Ластик', symbol: 'eraser', accent: '#E5396B', wash: '#FDE8EE' },
  { key: 'shape', label: 'Фигуры', symbol: 'square.on.circle', accent: '#EF7D00', wash: '#FEF0DF' },
  { key: 'sticky', label: 'Клейкая заметка', symbol: 'note.text', accent: '#C99400', wash: '#FDF4D4' },
  { key: 'image', label: 'Изображение', symbol: 'photo', accent: '#22A04B', wash: '#E3F5E8' },
  { key: 'text', label: 'Текст', symbol: 'textformat', accent: '#0F8FA8', wash: '#DFF3F6' },
  { key: 'laser', label: 'Лазерная указка', symbol: 'cursorarrow.rays', accent: '#E8352B', wash: '#FDE6E4' },
];
const selectedKey = (tool: CanvasTool) => writingTool(tool) ? 'writing' : tool;
export const toolbarWidth = 8 * 42 + 2 * 13 + 42;

export const EditorTools = memo(function EditorTools({ state, onChange, onRepeatEraser, onWriting, ruler, onRulerChange }: Props & {
  onRepeatEraser?: () => void; onWriting?: () => void; ruler: boolean; onRulerChange: (value: boolean) => void;
}) {
  const current = selectedKey(state.tool);
  const choose = (key: string) => {
    if (key === 'writing') { if (onWriting) onWriting(); else onChange({ ...state, tool: 'pen' }); return; }
    if (key === 'eraser' && current === 'eraser') { onRepeatEraser?.(); return; }
    onChange({ ...state, tool: key as CanvasTool });
  };
  const button = (item: typeof toolbarItems[number]) => {
    const selected = current === item.key;
    return <Button key={item.key} onPress={() => choose(item.key)} modifiers={[plain, frame({ width: 42, height: 44 }), hit, accessibilityLabel(selected ? `${item.label}, выбрано` : item.label)]}>
      <ZStack modifiers={[frame({ width: 36, height: 34 }), ...(selected ? [background(item.wash, { shape: 'roundedRectangle' as const, cornerRadius: 10 })] : [])]}>
        {glyph(item.symbol, 18, item.accent, selected ? 'semibold' : 'regular')}
        {item.key === 'writing' && selected && <Circle modifiers={[foregroundStyle(state.color === 'stars' ? '#1E2A4A' : state.color), frame({ width: 7, height: 7 }), strokeBorder({ shape: 'circle', color: '#FFFFFF', style: { lineWidth: 1 } }), offset({ x: 10, y: 9 })]} />}
      </ZStack>
    </Button>;
  };
  return <Host style={{ height: 44, width: toolbarWidth }}><HStack spacing={0}>
    {button(toolbarItems[0])}
    <Divider modifiers={[frame({ height: 20 }), padding({ horizontal: 6 })]} />
    {toolbarItems.slice(1).map(button)}
    <Divider modifiers={[frame({ height: 20 }), padding({ horizontal: 6 })]} />
    <Button onPress={() => onRulerChange(!ruler)} modifiers={[plain, frame({ width: 42, height: 44 }), hit, accessibilityLabel(ruler ? 'Линейка, показана' : 'Линейка')]}>
      <ZStack modifiers={[frame({ width: 36, height: 34 }), ...(ruler ? [background('#ECEDEF', { shape: 'roundedRectangle' as const, cornerRadius: 10 })] : [])]}>{glyph('ruler', 18, '#5E6463', ruler ? 'semibold' : 'regular')}</ZStack>
    </Button>
  </HStack></Host>;
});

type PanelProps = Props & { onClear: () => void; availableWidth: number; eraserAutoReturn: boolean; onEraserAutoReturnChange: (value: boolean) => void };
/** Подпанель выбранного инструмента. Возвращает null для инструментов без настроек (лассо, изображение, текст). */
export function EditorToolPanel({ state, onChange, onClear, availableWidth, eraserAutoReturn, onEraserAutoReturnChange }: PanelProps) {
  const [open, setOpen] = useState<string>();
  const [draftColor, setDraftColor] = useState('#3D8BFF');
  const update = (patch: Partial<EditorToolState>) => onChange({ ...state, ...patch });
  const popup = (key: string, trigger: ReactElement, content: ReactElement) => <Popover key={key} isPresented={open === key} onIsPresentedChange={value => setOpen(value ? key : undefined)} attachmentAnchor="bottom" arrowEdge="top"><Popover.Trigger>{trigger}</Popover.Trigger><Popover.Content>{content}</Popover.Content></Popover>;
  const title = (text: string) => <Text modifiers={[font({ size: 17, weight: 'semibold' })]}>{text}</Text>;
  const note = (text: string) => <Text modifiers={[font({ size: 13 }), foregroundStyle('#6B7170'), multilineTextAlignment('center')]}>{text}</Text>;
  const divider = <Divider modifiers={[frame({ height: 22 }), padding({ horizontal: 6 })]} />;
  const capsule = (width: number, content: ReactElement) => {
    const panelWidth = Math.min(width, availableWidth);
    return <Host style={{ height: 46, width: panelWidth }}><ZStack alignment="leading">
      <RoundedRectangle cornerRadius={23} modifiers={[foregroundStyle('#FFFFFF00'), frame({ width: panelWidth, height: 46 }), glassEffect({ shape: 'capsule' })]} />
      <HStack spacing={0} modifiers={[padding({ horizontal: 8 }), frame({ width: panelWidth, height: 46, alignment: 'leading' })]}>{content}</HStack>
    </ZStack></Host>;
  };

  const thicknessRow = (group: WritingGroup | 'shape') => thicknesses[group].map((mm, index) => {
    const selected = state.thicknessIndex === index;
    const markColor = selected ? '#151A19' : '#3A403F';
    const shape = group === 'marker'
      ? <Circle modifiers={[foregroundStyle(markColor), frame({ width: [8, 13, 18][index], height: [8, 13, 18][index] })]} />
      : group === 'tape' ? <RoundedRectangle cornerRadius={2} modifiers={[foregroundStyle(markColor), frame({ width: 20, height: [4, 7, 11][index] })]} />
        : <Capsule modifiers={[foregroundStyle(markColor), frame({ width: 20, height: [2, 3, 4.5][index] })]} />;
    return <Button key={index} onPress={() => update({ width: mmToPoints(mm), thicknessIndex: index })} modifiers={[plain, frame({ width: 40, height: 34 }), ...(selected ? [background(tint.thickness, { shape: 'roundedRectangle' as const, cornerRadius: 10 })] : []), frame({ height: 46 }), hit, accessibilityLabel(`Толщина ${mm.toLocaleString('ru')} мм${selected ? ', выбрана' : ''}`)]}>{shape}</Button>;
  });

  const palette = (onPick: (color: string) => void, selectedColor?: string) => <VStack spacing={6}>
    {[0, 1, 2].map(row => <HStack key={row} spacing={6}>{presetColors.slice(row * 8, row * 8 + 8).map(color => <Button key={color} onPress={() => onPick(color)} modifiers={[plain, accessibilityLabel(color)]}>
      <ZStack><Circle modifiers={[foregroundStyle(color), frame({ width: 30, height: 30 }), strokeBorder({ shape: 'circle', color: '#C9CDCC', style: { lineWidth: color === '#FFFFFF' || color === '#F1F2F2' ? 1 : 0.5 } })]} />{selectedColor?.toUpperCase() === color && glyph('checkmark', 12, ['#FFFFFF', '#F1F2F2', '#FCFF85', '#FFD43B', '#DADDDF', '#B9BEBD', '#7FC4FF'].includes(color) ? '#2E3433' : '#FFFFFF', 'semibold')}</ZStack>
    </Button>)}</HStack>)}
  </VStack>;

  // colorSlot — постоянная ширина участка цветов, чтобы панель не меняла размер при смене инструмента; fixed — остальная часть капсулы.
  // При нехватке места ряд цветов прокручивается внутри участка, а не обрезается краем.
  const colorRow = (colors: string[], editable: boolean, fixed: number) => <ScrollView axes="horizontal" showsIndicators={false} modifiers={[frame({ width: Math.max(108, Math.min(colorSlot, availableWidth - fixed)), height: 46, alignment: 'leading' })]}><HStack spacing={0}>
    {colors.map((color, index) => {
      const selected = state.colorIndex === index;
      const swatch = <Button onPress={() => selected && editable ? setOpen(`color-${index}`) : update({ color, colorIndex: index })} modifiers={[plain, frame({ width: 36, height: 46 }), hit, accessibilityLabel(`${color === 'stars' ? 'Лента со звёздами' : `Цвет ${index + 1}`}${selected ? ', выбран' : ''}`)]}>
        <ZStack modifiers={[frame({ width: 32, height: 32 }), ...(selected ? [strokeBorder({ shape: 'circle', color: color === 'stars' ? '#1E2A4A' : lightColors.has(color.toUpperCase()) ? '#8E9493' : color, style: { lineWidth: 2 } })] : [])]}>
          <Circle modifiers={[foregroundStyle(color === 'stars' ? '#1E2A4A' : color), frame({ width: selected ? 22 : 26, height: selected ? 22 : 26 }), ...(lightColors.has(color.toUpperCase()) ? [strokeBorder({ shape: 'circle', color: '#B8BEBD', style: { lineWidth: 1 } })] : [])]} />
          {color === 'stars' && glyph('star.fill', 9, '#FFD43B')}
        </ZStack>
      </Button>;
      if (!editable) return <Fragment key={index}>{swatch}</Fragment>;
      return popup(`color-${index}`, swatch, <VStack spacing={16} modifiers={[padding({ all: 18 }), frame({ width: 330 })]}>
        {title('Цвет')}
        {palette(value => { const next = [...colors]; next[index] = value; update({ colors: next, color: value }); }, color)}
        <Divider />
        <HStack><ColorPicker label="Свой цвет" selection={color} supportsOpacity={false} onSelectionChange={value => { const next = [...colors]; next[index] = value; update({ colors: next, color: value }); }} /></HStack>
        {colors.length > 1 && <Button label="Удалить цвет" role="destructive" onPress={() => { const next = colors.filter((_, i) => i !== index); const nextIndex = Math.min(index, next.length - 1); setOpen(undefined); update({ colors: next, colorIndex: nextIndex, color: next[nextIndex] }); }} />}
      </VStack>);
    })}
    {editable && popup('add-color', <Button onPress={() => setOpen('add-color')} modifiers={[plain, frame({ width: 36, height: 46 }), hit, accessibilityLabel('Добавить цвет')]}>{glyph('plus.circle', 22, '#8E9493')}</Button>,
      <VStack spacing={16} modifiers={[padding({ all: 18 }), frame({ width: 330 })]}>
        {title('Новый цвет')}
        {palette(value => { const next = [...colors, value]; setOpen(undefined); update({ colors: next, color: value, colorIndex: next.length - 1 }); })}
        <Divider />
        <HStack spacing={12}><ColorPicker label="Свой цвет" selection={draftColor} supportsOpacity={false} onSelectionChange={setDraftColor} /><Button label="Добавить" onPress={() => { const next = [...colors, draftColor]; setOpen(undefined); update({ colors: next, color: draftColor, colorIndex: next.length - 1 }); }} /></HStack>
      </VStack>)}
  </HStack></ScrollView>;

  const options = state.penOptions ?? defaultPen;
  const sliders = (pressure: boolean) => <VStack spacing={14} alignment="leading">
    {pressure && <VStack spacing={4} alignment="leading"><HStack><Text modifiers={[font({ size: 15 })]}>Чувствительность к нажиму</Text><Spacer /><Text modifiers={[font({ size: 15 }), foregroundStyle('#6B7170')]}>{`${Math.round(options.pressure * 100)}%`}</Text></HStack><Slider value={options.pressure} min={0} max={1} onValueChange={value => update({ penOptions: { ...options, pressure: value } })} /></VStack>}
    <VStack spacing={4} alignment="leading"><HStack><Text modifiers={[font({ size: 15 })]}>Стабилизация штриха</Text><Spacer /><Text modifiers={[font({ size: 15 }), foregroundStyle('#6B7170')]}>{`${Math.round(options.stabilization * 100)}%`}</Text></HStack><Slider value={options.stabilization} min={0} max={1} onValueChange={value => update({ penOptions: { ...options, stabilization: value } })} /></VStack>
  </VStack>;
  const preview = <RNHostView matchContents><NotesCanvas preview filePath="" pageWidth={300} pageHeight={96} tool={state.tool} color={state.color} strokeWidth={state.width} eraserMode="bitmap" pattern="blank" paperColor="#FFFFFF" readOnly fingerDrawing={false} style={{ width: 300, height: 96, borderRadius: 12, overflow: 'hidden' }} /></RNHostView>;

  if (writingTool(state.tool)) {
    const group = writingGroup(state.tool);
    const penName = state.tool === 'monoline' ? 'Шариковая ручка' : state.tool === 'pen' ? 'Ручка-кисть' : 'Перьевая ручка';
    const types: { group: WritingGroup; label: string; symbol: SFSymbol }[] = [
      { group: 'pen', label: 'Ручка', symbol: 'pencil.tip' }, { group: 'pencil', label: 'Карандаш', symbol: 'pencil' },
      { group: 'marker', label: 'Маркер', symbol: 'highlighter' }, { group: 'tape', label: 'Лента', symbol: 'bandage' },
      { group: 'drawShape', label: 'Ручка для фигур', symbol: 'pencil.and.outline' },
    ];
    const settings = (type: WritingGroup) => <VStack spacing={18} modifiers={[padding({ all: 18 }), frame({ width: 340 })]}>
      {type === 'pen' && <>{title(penName)}{preview}<HStack spacing={8}>{(['fountain', 'monoline', 'pen'] as const).map((tool, index) => <ToolTile key={tool} onPress={() => update({ tool })} selected={state.tool === tool} symbol={(['pencil.tip', 'pencil', 'paintbrush.pointed'] as const)[index]} label={['Перьевая ручка', 'Шариковая ручка', 'Ручка-кисть'][index]} />)}</HStack>{sliders(true)}</>}
      {type === 'pencil' && <>{title('Стандартный карандаш')}{preview}{sliders(false)}</>}
      {type === 'marker' && <>{title('Маркер')}{preview}{note('Маркер рисует под рукописным текстом и не перекрывает его.')}{sliders(false)}</>}
      {type === 'tape' && <>{title('Лента')}{note('Проведите лентой поверх записей, чтобы скрыть их. Коснитесь ленты, чтобы показать текст под ней, и коснитесь ещё раз, чтобы скрыть.')}</>}
      {type === 'drawShape' && <>{title('Ручка для фигур')}{note('Нарисуйте линию, круг или многоугольник — ручка выровняет фигуру.')}<Toggle label="Требуется «Держать для привязки»" isOn={options.holdToSnap} onIsOnChange={holdToSnap => update({ penOptions: { ...options, holdToSnap } })} />{note(options.holdToSnap ? 'Задержите перо в конце штриха, чтобы выровнять фигуру.' : 'Фигура выравнивается сразу после штриха.')}</>}
    </VStack>;
    const colors = state.colors ?? defaultPresets[group].colors!;
    const fixed = 5 * 44 + 12 + 3 * 40 + 12 + 16;
    return capsule(fixed + colorSlot, <>
      {types.map(type => {
        const selected = group === type.group;
        return popup(type.group, <Button onPress={() => selected ? setOpen(type.group) : update({ tool: type.group === 'pen' ? 'fountain' : type.group })} modifiers={[plain, frame({ width: 44, height: 34 }), ...(selected ? [background(tint.selected, { shape: 'roundedRectangle' as const, cornerRadius: 10 })] : []), frame({ height: 46 }), hit, accessibilityLabel(selected ? `${type.label}, выбрано. Настройки` : type.label)]}>
          <HStack spacing={1}>{glyph(type.symbol, 17, selected ? '#1F6FE5' : ink, selected ? 'medium' : 'regular')}{selected && glyph('chevron.down', 8, '#1F6FE5', 'semibold')}</HStack>
        </Button>, settings(type.group));
      })}
      {divider}{thicknessRow(group)}{divider}{colorRow(colors, group !== 'tape', fixed)}
    </>);
  }

  if (state.tool === 'shape') {
    const kinds: { kind: ShapeKind; label: string; symbol: SFSymbol }[] = [
      { kind: 'freeform', label: 'Фигура от руки', symbol: 'scribble.variable' }, { kind: 'elbow', label: 'Ломаный соединитель', symbol: 'arrow.turn.down.right' }, { kind: 'curve', label: 'Изогнутый соединитель', symbol: 'point.topleft.down.to.point.bottomright.curvepath' },
      { kind: 'rectangle', label: 'Квадрат', symbol: 'square' }, { kind: 'ellipse', label: 'Круг', symbol: 'circle' }, { kind: 'triangle', label: 'Треугольник', symbol: 'triangle' },
      { kind: 'diamond', label: 'Ромб', symbol: 'diamond' }, { kind: 'rounded', label: 'Скруглённый прямоугольник', symbol: 'app' },
    ];
    const kindButton = (item: typeof kinds[number]) => {
      const selected = (state.shapeKind ?? 'freeform') === item.kind;
      return <Button key={item.kind} onPress={() => update({ shapeKind: item.kind })} modifiers={[plain, frame({ width: 40, height: 34 }), ...(selected ? [background('#FEF0DF', { shape: 'roundedRectangle' as const, cornerRadius: 10 })] : []), frame({ height: 46 }), hit, accessibilityLabel(selected ? `${item.label}, выбрано` : item.label)]}>{glyph(item.symbol, 17, selected ? '#D96F00' : ink, selected ? 'medium' : 'regular')}</Button>;
    };
    const colors = state.colors ?? defaultPresets.shape.colors!;
    const fixed = 8 * 40 + 24 + 3 * 40 + 12 + 16;
    return capsule(fixed + colorSlot, <>
      {kinds.slice(0, 3).map(kindButton)}{divider}{kinds.slice(3).map(kindButton)}{divider}{thicknessRow('shape')}{divider}{colorRow(colors, true, fixed)}
    </>);
  }

  if (state.tool === 'sticky') return capsule(stickyColors.length * 40 + 16, <>{stickyColors.map((color, index) => {
    const selected = state.colorIndex === index;
    return <Button key={color} onPress={() => update({ color, colorIndex: index })} modifiers={[plain, frame({ width: 40, height: 46 }), hit, accessibilityLabel(`Цвет заметки ${index + 1}${selected ? ', выбран' : ''}`)]}>
      <ZStack modifiers={[frame({ width: 30, height: 30 }), ...(selected ? [strokeBorder({ shape: 'roundedRectangle', cornerRadius: 9, color: '#9AA09F', style: { lineWidth: 1.5 } })] : [])]}><RoundedRectangle cornerRadius={5} modifiers={[foregroundStyle(color), frame({ width: 22, height: 22 }), strokeBorder({ shape: 'roundedRectangle', cornerRadius: 5, color: '#C9CDCC', style: { lineWidth: color === '#FFFFFF' ? 1 : 0.5 } })]} /></ZStack>
    </Button>;
  })}</>);

  if (state.tool === 'laser') return capsule(2 * 104 + 16, <>{(['dot', 'line'] as const).map(mode => {
    const selected = (state.laserMode ?? 'line') === mode;
    return <Button key={mode} onPress={() => update({ laserMode: mode })} modifiers={[plain, frame({ width: 104, height: 34 }), ...(selected ? [background('#FDE6E4', { shape: 'roundedRectangle' as const, cornerRadius: 10 })] : []), frame({ height: 46 }), hit, accessibilityLabel(mode === 'dot' ? 'Точка' : 'Линия')]}>
      <HStack spacing={6}>{glyph(mode === 'dot' ? 'circle.fill' : 'scribble', mode === 'dot' ? 10 : 16, selected ? '#E8352B' : ink)}<Text modifiers={[font({ size: 15, weight: selected ? 'medium' : 'regular' }), foregroundStyle(selected ? '#E8352B' : ink)]}>{mode === 'dot' ? 'Точка' : 'Линия'}</Text></HStack>
    </Button>;
  })}</>);

  if (state.tool !== 'eraser') return null;
  const eraserWidths = state.eraserType === 'standard' ? [20, 40, 80] : [5, 20, 40];
  const eraserNames = { precise: 'Точный', standard: 'Стандартный', stroke: 'Для штрихов' };
  return capsule(150 + 12 + 40 + 12 + 3 * 46 + 16, <>
    {popup('eraser', <Button onPress={() => setOpen('eraser')} modifiers={[plain, frame({ width: 150, height: 34 }), background('#EEF0F0', { shape: 'roundedRectangle', cornerRadius: 10 }), frame({ height: 46 }), hit, accessibilityLabel('Тип ластика')]}><HStack spacing={6}>{glyph('eraser', 16, '#E5396B')}<Text modifiers={[font({ size: 15 }), foregroundStyle(ink)]}>{eraserNames[state.eraserType ?? 'precise']}</Text>{glyph('chevron.down', 9, '#6B7170', 'semibold')}</HStack></Button>,
      <VStack spacing={16} modifiers={[padding({ all: 18 }), frame({ width: 340 })]}>{title('Тип ластика')}<HStack spacing={8}>{(['precise', 'standard', 'stroke'] as const).map((type, i) => <ToolTile key={type} onPress={() => { update({ eraserType: type, eraserMode: type === 'stroke' ? 'vector' : 'bitmap', width: (type === 'standard' ? [20, 40, 80] : [5, 20, 40])[state.thicknessIndex ?? 1] }); setOpen(undefined); }} selected={(state.eraserType ?? 'precise') === type} symbol={i === 2 ? 'eraser.line.dashed' : 'eraser'} label={['Точный ластик', 'Стандартный ластик', 'Ластик для штрихов'][i]} />)}</HStack>{note(state.eraserType === 'stroke' ? 'Удаляет штрих целиком одним касанием.' : state.eraserType === 'standard' ? 'Стирает широкой областью.' : 'Точно стирает мелкие детали.')}</VStack>)}
    {divider}
    {popup('settings', <Button onPress={() => setOpen('settings')} modifiers={[plain, frame({ width: 40, height: 34 }), frame({ height: 46 }), hit, accessibilityLabel('Параметры ластика')]}>{glyph('slider.horizontal.3', 17)}</Button>,
      <VStack spacing={18} alignment="leading" modifiers={[padding({ all: 18 }), frame({ width: 340 })]}>{title('Дополнительные настройки')}<Toggle label="Автоперекл. на предыд. инструмент" isOn={eraserAutoReturn} onIsOnChange={onEraserAutoReturnChange} /><Divider /><Button label="Очистить страницу" systemImage="trash" role="destructive" onPress={() => { setOpen(undefined); onClear(); }} /></VStack>)}
    {divider}
    {eraserWidths.map((width, index) => {
      const selected = state.thicknessIndex === index;
      return <Button key={index} onPress={() => update({ width, thicknessIndex: index })} modifiers={[plain, frame({ width: 46, height: 46 }), hit, accessibilityLabel(`${['Маленький', 'Средний', 'Большой'][index]} ластик${selected ? ', выбран' : ''}`)]}><Circle modifiers={[foregroundStyle('#F7F8F8'), frame({ width: [10, 18, 26][index], height: [10, 18, 26][index] }), strokeBorder({ shape: 'circle', color: selected ? '#1F6FE5' : '#A5AAA9', style: { lineWidth: selected ? 2 : 1 } })]} /></Button>;
    })}
  </>);
}

export type HistoryHandle = { update: (history: { canUndo: boolean; canRedo: boolean }) => void };
export const EditorHistory = forwardRef<HistoryHandle, { onUndo: () => void; onRedo: () => void }>(function EditorHistory({ onUndo, onRedo }, ref) {
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  useImperativeHandle(ref, () => ({ update: next => setHistory(current => current.canUndo === next.canUndo && current.canRedo === next.canRedo ? current : next) }), []);
  const item = (label: string, symbol: SFSymbol, enabled: boolean, onPress: () => void) => <Button onPress={onPress} modifiers={[plain, frame({ width: 38, height: 38 }), hit, disabled(!enabled), accessibilityLabel(label)]}>{glyph(symbol, 16, enabled ? ink : '#B5BAB9', 'medium')}</Button>;
  return <Host style={{ width: 88, height: 46 }}><HStack spacing={0} modifiers={[padding({ horizontal: 6 }), frame({ height: 46 }), glassEffect({ shape: 'capsule' })]}>
    {item('Отменить', 'arrow.uturn.backward', history.canUndo, onUndo)}{item('Повторить', 'arrow.uturn.forward', history.canRedo, onRedo)}
  </HStack></Host>;
});
