import { useLocalSearchParams, usePreventZoomTransitionDismissal } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { Alert, useWindowDimensions, View } from 'react-native';
import { Button, ColorPicker, Host, HStack, Image, Popover, Slider, Stepper, Text, VStack } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonStyle, font, frame, glassEffect, labelsHidden, labelStyle, padding } from '@expo/ui/swift-ui/modifiers';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { clearCanvasPage, saveAllCanvases, type CanvasCommand, type TextFormat } from '../../../modules/notes-canvas';
import { renderThumbnails } from '../../../modules/notes-canvas/rendering';
import * as repository from '../../shared/documents/repository';
import type { NotebookManifest, PageObject } from '../../shared/documents/types';
import { saveSettings, useSettings } from '../../shared/settings';
import { defaultPresets, EditorHistory, EditorToolPanel, EditorTools, writingGroup, writingTool, type EditorToolState, type HistoryHandle } from './EditorTools';
import { EditorPageRibbon } from './EditorPageRibbon';

const thumbnailWarnings = new Set<string>();

export type EditorFrameProps = {
  notebook: NotebookManifest; onNotebookChange: (value: NotebookManifest) => void;
  thumbnailRevision: number;
  onBeforeAction: () => Promise<void>; activePage: number; readOnly: boolean;
  onReadOnlyChange: (value: boolean) => void; onSelectPage: (index: number) => void;
  onClearPage: () => void; onClearPageAt?: (index: number) => void; toolbar: React.ReactNode; children: React.ReactNode;
};

export default function NotebookScreen({ frame }: { frame: ComponentType<EditorFrameProps> }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Закрытие жестом конфликтует с рисованием: выход из блокнота — кнопкой «Домой».
  usePreventZoomTransitionDismissal();
  const [notebook, setNotebook] = useState<NotebookManifest>();
  useEffect(() => {
    let current = true;
    repository.readNotebook(id).then(value => { if (current) setNotebook(value); }).catch(() => { if (current) Alert.alert('Не удалось открыть блокнот', 'Вернитесь в библиотеку и попробуйте снова.'); });
    return () => { current = false; };
  }, [id]);
  // При переключении вкладки прежний редактор остаётся на экране, пока читается следующий блокнот.
  return notebook ? <NotebookEditor key={notebook.id} initial={notebook} frame={frame} /> : null;
}

function NotebookEditor({ initial, frame: EditorShell }: { initial: NotebookManifest; frame: ComponentType<EditorFrameProps> }) {
  const [notebook, setNotebook] = useState(initial);
  const [thumbnailRevision, setThumbnailRevision] = useState(0);
  const [tools, setTools] = useState<EditorToolState>(defaultPresets.pen);
  const [eraserPanel, setEraserPanel] = useState(true);
  const [editingText, setEditingText] = useState(false);
  const [textHint, setTextHint] = useState(true);
  const [active, setActive] = useState(0);
  const [readOnly, setReadOnly] = useState(false);
  const [width, setWidth] = useState(650);
  const history = useRef<HistoryHandle>(null);
  const [command, setCommand] = useState<CanvasCommand>();
  const [textFormat, setTextFormat] = useState<TextFormat>({ color: '#151515', fontSize: 24, fontFamily: 'System', bold: false, italic: false, alignment: 'left' });
  const settings = useSettings();
  const pendingSave = useRef<Promise<unknown>>(Promise.resolve());
  const presets = useRef<Record<string, EditorToolState>>({ ...defaultPresets });
  const presetsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previousWriting = useRef<EditorToolState>(defaultPresets.pen);
  const lastWriting = useRef('pen');
  const toolsRef = useRef(tools);
  const visibleCenterRequest = useRef<((center: { x: number; y: number }) => void) | undefined>(undefined);
  const currentNotebook = useRef<NotebookManifest | undefined>(initial);
  const thumbnailSignatures = useRef(new Map<string, string>());
  const thumbnailQueue = useRef<Promise<void>>(Promise.resolve());
  const pageSignatures = (document: NotebookManifest) => document.pages.map((page, index) => {
    const drawing = new File(repository.drawingPath(document.id, page.id));
    return [page.id, JSON.stringify([page.paper, page.background, page.rotation, page.objects, index === 0, drawing.exists ? drawing.modificationTime : null])] as const;
  });
  const saveCanvases = useCallback((clearPageId?: string) => {
    const operation = thumbnailQueue.current.catch(() => undefined).then(async () => {
      if (!await saveAllCanvases()) throw new Error('Не удалось сохранить страницы');
      await pendingSave.current;
      const document = currentNotebook.current;
      if (!document) return;
      if (clearPageId) {
        if (!await clearCanvasPage(repository.drawingPath(document.id, clearPageId))) throw new Error('clear');
        thumbnailSignatures.current.delete(clearPageId);
      }
      const signatures = pageSignatures(document);
      const ids = new Set(signatures.map(([pageId]) => pageId));
      for (const pageId of thumbnailSignatures.current.keys()) if (!ids.has(pageId)) thumbnailSignatures.current.delete(pageId);
      for (const [pageId, signature] of signatures) {
        if (thumbnailSignatures.current.get(pageId) === signature) continue;
        try {
          await renderThumbnails(repository.packageDirectory(document.id).uri, document, [pageId]);
          setThumbnailRevision(value => value + 1);
        } catch {
          if (!thumbnailWarnings.has(document.id)) {
            thumbnailWarnings.add(document.id);
            Alert.alert('Не удалось обновить миниатюру', 'Одна из страниц не открывается. Остальные страницы сохранены. Вы можете вернуться в библиотеку.');
          }
        }
        // Не повторяем сбой до изменения самой страницы; drawing не подменяется.
        thumbnailSignatures.current.set(pageId, signature);
      }
    });
    thumbnailQueue.current = operation;
    return operation;
  }, []);
  useEffect(() => { currentNotebook.current = notebook; }, [notebook]);
  const writePresets = useCallback(() => {
    try {
      const temporary = new File(Paths.document, 'editor-presets-v2.json.tmp');
      temporary.write(JSON.stringify({ presets: presets.current, lastWriting: lastWriting.current }));
      temporary.move(new File(Paths.document, 'editor-presets-v2.json'), { overwrite: true });
    }
    catch { Alert.alert('Не удалось сохранить настройки инструмента'); }
  }, []);
  useEffect(() => {
    let current = true;
    const file = new File(Paths.document, 'editor-presets-v2.json');
    if (file.exists) void file.text().then(text => {
      if (!current) return;
      const saved = JSON.parse(text);
      presets.current = { ...defaultPresets, ...saved.presets };
      lastWriting.current = saved.lastWriting ?? 'pen';
      toolsRef.current = presets.current[lastWriting.current];
      setTools(toolsRef.current);
    }).catch(() => Alert.alert('Не удалось открыть настройки инструментов'));
    return () => { current = false; if (presetsTimer.current) { clearTimeout(presetsTimer.current); writePresets(); } };
  }, [writePresets]);
  useEffect(() => {
    thumbnailSignatures.current = new Map(pageSignatures(initial).filter(([pageId]) => new File(repository.packageDirectory(initial.id), 'thumbnails', `${pageId}.png`).exists));
    return () => { currentNotebook.current = undefined; };
  }, [initial]);
  const send = (action: CanvasCommand['action']) => setCommand({ id: Date.now(), action });
  const saveObjects = useCallback((pageId: string, objects: PageObject[]) => {
    const document = currentNotebook.current;
    if (!document) return;
    const next = { ...document, pages: document.pages.map(page => page.id === pageId ? { ...page, objects } : page) };
    currentNotebook.current = next;
    setNotebook(next);
    pendingSave.current = pendingSave.current.catch(() => undefined).then(() => repository.saveNotebook(next));
    void pendingSave.current.catch(() => Alert.alert('Не удалось сохранить объекты', 'Не закрывайте документ и попробуйте снова.'));
    void saveCanvases().catch(() => Alert.alert('Не удалось сохранить страницу'));
  }, [saveCanvases]);
  const changeTools = (next: EditorToolState) => {
    const previous = toolsRef.current;
    if (next.tool === 'eraser' && previous.tool !== 'eraser') { previousWriting.current = previous; setEraserPanel(true); }
    if (next.tool !== previous.tool) {
      const key = writingTool(next.tool) ? writingGroup(next.tool) : next.tool;
      if (!(writingTool(previous.tool) && writingTool(next.tool) && writingGroup(previous.tool) === 'pen' && writingGroup(next.tool) === 'pen')) next = presets.current[key] ?? next;
    }
    toolsRef.current = next;
    setTools(next);
    const key = writingTool(next.tool) ? writingGroup(next.tool) : next.tool;
    if (writingTool(next.tool)) lastWriting.current = key;
    presets.current[key] = next;
    clearTimeout(presetsTimer.current);
    presetsTimer.current = setTimeout(writePresets, 600);
    if (next.tool === 'image' && notebook) void (async () => {
      const pageId = notebook.pages[active].id;
      try {
        const center = await new Promise<{ x: number; y: number }>(resolve => { visibleCenterRequest.current = resolve; send('viewport'); });
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
        if (result.canceled || currentNotebook.current?.id !== notebook.id) return;
        const asset = result.assets[0]; const name = `${repository.newId()}.${asset.uri.split('.').pop() ?? 'jpg'}`;
        const destination = new File(repository.packageDirectory(notebook.id), 'assets', name);
        new File(asset.uri).copy(destination);
        const page = currentNotebook.current.pages.find(page => page.id === pageId);
        if (!page) return;
        const short = page.paper.size === 'Letter' ? 612 : 595;
        const ratio = page.paper.size === 'Letter' ? 11 / 8.5 : Math.SQRT2;
        const pageWidth = page.paper.orientation === 'portrait' ? short : short * ratio;
        const pageHeight = page.paper.orientation === 'portrait' ? short * ratio : short;
        const imageWidth = Math.min(260, pageWidth * 0.6, pageHeight * 0.6 * asset.width / asset.height);
        const imageHeight = imageWidth * asset.height / asset.width;
        saveObjects(page.id, [...page.objects, { id: repository.newId(), kind: 'image', asset: `assets/${name}`, x: Math.max(0, Math.min(pageWidth - imageWidth, center.x - imageWidth / 2)), y: Math.max(0, Math.min(pageHeight - imageHeight, center.y - imageHeight / 2)), width: imageWidth, height: imageHeight, rotation: 0 }]);
      } catch { Alert.alert('Не удалось вставить изображение', 'Выберите изображение ещё раз.'); }
      finally { if (currentNotebook.current?.id === notebook.id) { toolsRef.current = previous; setTools(previous); } }
    })();
  };
  const selectPage = (index: number) => {
    if (index === active) return;
    void saveCanvases().then(() => setActive(index)).catch(() => Alert.alert('Не удалось сохранить страницу'));
  };
  const clearPageAt = (index: number) => {
    const document = currentNotebook.current;
    const pageId = document?.pages[index]?.id;
    if (!document || !pageId) return;
    void saveCanvases(pageId).catch(() => Alert.alert('Не удалось очистить страницу', 'Повторите попытку.'));
  };
  return <EditorShell notebook={notebook} thumbnailRevision={thumbnailRevision} onNotebookChange={value => { currentNotebook.current = value; setNotebook(value); void saveCanvases().catch(() => Alert.alert('Не удалось сохранить страницу')); }} onBeforeAction={saveCanvases} activePage={active} readOnly={readOnly} onReadOnlyChange={setReadOnly} onSelectPage={selectPage} onClearPage={() => clearPageAt(active)} onClearPageAt={clearPageAt} toolbar={<EditorTools state={tools} onChange={changeTools} onWriting={() => changeTools(presets.current[lastWriting.current])} onRepeatEraser={() => setEraserPanel(value => !value)} />}><View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ flex: 1, backgroundColor: '#F4F6F5' }}>
    <EditorPageRibbon notebook={notebook} tools={tools} readOnly={readOnly} fingerDrawing={settings.fingerDrawing} horizontal={settings.horizontal} width={width} activePage={active} command={command} onVisibleCenter={center => { visibleCenterRequest.current?.(center); visibleCenterRequest.current = undefined; }} onActivePageChange={selectPage} onHistoryChange={value => history.current?.update(value)} textFormat={textFormat} onObjectsChange={saveObjects} onTextEditingChange={value => { setEditingText(value); if (value && toolsRef.current.tool === 'text') { const next = { ...toolsRef.current, tool: 'lasso' as const }; toolsRef.current = next; setTools(next); } }} onToolEnd={() => { void saveCanvases().catch(() => Alert.alert('Не удалось сохранить страницу')); if (toolsRef.current.tool === 'eraser' && settings.eraserAutoReturn) changeTools(previousWriting.current); }} />
    {!readOnly && <>
      <View style={{ position: 'absolute', top: 8, left: 8 }}><EditorHistory ref={history} onUndo={() => send('undo')} onRedo={() => send('redo')} /></View>
      {(tools.tool !== 'eraser' || eraserPanel) && <View pointerEvents="box-none" style={{ position: 'absolute', top: width < 760 ? 61 : 8, left: width < 760 ? 12 : Math.max(104, (width - Math.min(tools.tool === 'eraser' ? 394 : 620, width - 116)) / 2) }}><EditorToolPanel state={tools} onChange={changeTools} eraserAutoReturn={settings.eraserAutoReturn} onEraserAutoReturnChange={eraserAutoReturn => saveSettings({ ...settings, eraserAutoReturn })} availableWidth={width < 760 ? width - 24 : width - 116} onClear={() => Alert.alert('Очистить страницу?', 'Все рукописные штрихи на странице будут удалены.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Очистить', style: 'destructive', onPress: () => clearPageAt(active) }])} /></View>}
      {(tools.tool === 'text' || editingText) && <View style={{ position: 'absolute', top: width < 760 ? 61 : 8, alignSelf: 'center' }}><EditorTextFormat textFormat={textFormat} setTextFormat={setTextFormat} /></View>}
      {tools.tool === 'text' && textHint && <View style={{ position: 'absolute', bottom: 24, alignSelf: 'center' }}><Host style={{ height: 45, width: 340 }}><HStack spacing={8} modifiers={[padding({ horizontal: 14 }), frame({ height: 45 }), glassEffect({ shape: 'capsule' })]}><Image systemName="info.circle" size={20} /><Text>Добавьте текстовое поле касанием.</Text><Button label="Скрыть подсказку" systemImage="xmark" onPress={() => setTextHint(false)} modifiers={[labelStyle('iconOnly'), buttonStyle('plain')]} /></HStack></Host></View>}
    </>}
  </View></EditorShell>;
}

export function EditorTextFormat({ textFormat, setTextFormat }: { textFormat: TextFormat; setTextFormat: (format: TextFormat) => void }) {
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState<string>();
  const update = (patch: TextFormat) => setTextFormat({ ...textFormat, ...patch });
  const families = [['Современный', 'System'], ['Классический', 'Georgia'], ['Технический', 'Menlo']];
  return <Host style={{ height: 45, width: Math.min(394, width - 24), alignSelf: 'center' }}><HStack spacing={0} modifiers={[padding({ horizontal: 8 }), frame({ height: 45 }), glassEffect({ shape: 'capsule' })]}>
    <ColorPicker label="Цвет текста" modifiers={[labelsHidden()]} selection={textFormat.color ?? '#151515'} onSelectionChange={color => setTextFormat({ ...textFormat, color })} />
    <Popover isPresented={open === 'size'} onIsPresentedChange={value => setOpen(value ? 'size' : undefined)}><Popover.Trigger><Button label={`${Math.round(textFormat.fontSize ?? 24)} ⌄`} onPress={() => setOpen('size')} modifiers={[buttonStyle('plain'), frame({ width: 61, height: 45 }), accessibilityLabel('Размер шрифта')]} /></Popover.Trigger><Popover.Content><HStack spacing={12} modifiers={[padding({ all: 16 }), frame({ width: 399 })]}><Text>{Math.round(textFormat.fontSize ?? 24)}</Text><Slider value={textFormat.fontSize ?? 24} min={8} max={96} step={1} onValueChange={fontSize => update({ fontSize })} modifiers={[frame({ width: 205 })]} /><Stepper label="Размер" value={textFormat.fontSize ?? 24} min={8} max={96} onValueChange={fontSize => update({ fontSize })} modifiers={[labelsHidden()]} /></HStack></Popover.Content></Popover>
    <Popover isPresented={open === 'font'} onIsPresentedChange={value => setOpen(value ? 'font' : undefined)}><Popover.Trigger><Button label={`${families.find(([, value]) => value === textFormat.fontFamily)?.[0] ?? 'Современный'} ⌄`} onPress={() => setOpen('font')} modifiers={[buttonStyle('plain'), frame({ width: 138, height: 45 })]} /></Popover.Trigger><Popover.Content><VStack spacing={0} modifiers={[padding({ all: 12 }), frame({ width: 245 })]}>{families.map(([label, fontFamily]) => <Button key={fontFamily} onPress={() => { update({ fontFamily }); setOpen(undefined); }} modifiers={[buttonStyle('plain')]}><Text modifiers={[font({ family: fontFamily === 'System' ? undefined : fontFamily, size: 17 }), frame({ width: 196, height: 53 })]}>{label}{textFormat.fontFamily === fontFamily ? ' ✓' : ''}</Text></Button>)}</VStack></Popover.Content></Popover>
    <Popover isPresented={open === 'style'} onIsPresentedChange={value => setOpen(value ? 'style' : undefined)}><Popover.Trigger><Button label="B / I" onPress={() => setOpen('style')} modifiers={[buttonStyle('plain'), frame({ width: 45, height: 45 }), accessibilityLabel('Стиль текста')]} /></Popover.Trigger><Popover.Content><HStack spacing={0} modifiers={[padding({ all: 4 })]}><Button label="Жирный" systemImage="bold" onPress={() => update({ bold: !textFormat.bold })} modifiers={[labelStyle('iconOnly'), buttonStyle(textFormat.bold ? 'bordered' : 'plain'), frame({ width: 45, height: 45 })]} /><Button label="Курсив" systemImage="italic" onPress={() => update({ italic: !textFormat.italic })} modifiers={[labelStyle('iconOnly'), buttonStyle(textFormat.italic ? 'bordered' : 'plain'), frame({ width: 45, height: 45 })]} /></HStack></Popover.Content></Popover>
    <Popover isPresented={open === 'alignment'} onIsPresentedChange={value => setOpen(value ? 'alignment' : undefined)}><Popover.Trigger><Button label="Выравнивание" systemImage={textFormat.alignment === 'center' ? 'text.aligncenter' : textFormat.alignment === 'right' ? 'text.alignright' : 'text.alignleft'} onPress={() => setOpen('alignment')} modifiers={[labelStyle('iconOnly'), buttonStyle('plain'), frame({ width: 45, height: 45 })]} /></Popover.Trigger><Popover.Content><HStack spacing={0} modifiers={[padding({ all: 4 })]}>{(['left', 'center', 'right'] as const).map((alignment, index) => <Button key={alignment} label={['По левому краю', 'По центру', 'По правому краю'][index]} systemImage={alignment === 'left' ? 'text.alignleft' : alignment === 'center' ? 'text.aligncenter' : 'text.alignright'} onPress={() => update({ alignment })} modifiers={[labelStyle('iconOnly'), buttonStyle(textFormat.alignment === alignment ? 'bordered' : 'plain'), frame({ width: 45, height: 45 })]} />)}</HStack></Popover.Content></Popover>
  </HStack></Host>;
}
