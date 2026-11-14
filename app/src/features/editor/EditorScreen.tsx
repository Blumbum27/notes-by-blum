import { useLocalSearchParams, usePreventZoomTransitionDismissal } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { Alert, View } from 'react-native';
import { Button, ColorPicker, Divider, Host, HStack, Image, Popover, Slider, Spacer, Stepper, Text, VStack } from '@expo/ui/swift-ui';
import { accessibilityLabel, background, buttonStyle, font, foregroundStyle, frame, glassEffect, labelsHidden, padding } from '@expo/ui/swift-ui/modifiers';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { clearCanvasPage, saveAllCanvases, type CanvasCommand, type InkGroup, type TextFormat } from '../../../modules/notes-canvas';
import { renderThumbnails } from '../../../modules/notes-canvas/rendering';
import * as repository from '../../shared/documents/repository';
import { pageSize, type NotebookManifest, type PageObject } from '../../shared/documents/types';
import { saveSettings, useSettings } from '../../shared/settings';
import { defaultPresets, EditorHistory, EditorToolPanel, EditorTools, presetKey, writingTool, type EditorToolState, type HistoryHandle } from './EditorTools';
import { EditorPageRibbon } from './EditorPageRibbon';

const thumbnailWarnings = new Set<string>();
/** Типы содержимого для «Удалить некоторые элементы»: рукописные штрихи по виду инструмента и объекты страницы. */
export type ElementKind = InkGroup | 'text' | 'image' | 'sticky' | 'tape';
type CommandPayload = CanvasCommand extends infer C ? C extends CanvasCommand ? Omit<C, 'id'> : never : never;

export type EditorFrameProps = {
  notebook: NotebookManifest; onNotebookChange: (value: NotebookManifest) => void;
  thumbnailRevision: number;
  onBeforeAction: () => Promise<void>; activePage: number; readOnly: boolean;
  onReadOnlyChange: (value: boolean) => void; onSelectPage: (index: number) => void;
  onClearPage: () => void; onClearPageAt?: (index: number) => void; onEraseElements: (kinds: ElementKind[]) => void;
  /** Меняется, когда пользователь потянул за последнюю страницу: рамка добавляет страницу в конец по её образцу. */
  appendPageRequest?: number;
  toolbar: React.ReactNode; children: React.ReactNode;
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
  const [scrollRequest, setScrollRequest] = useState<{ index: number; id: number }>();
  const [appendPageRequest, setAppendPageRequest] = useState<number>();
  const [ruler, setRuler] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [width, setWidth] = useState(0);
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
  const send = (payload: CommandPayload) => setCommand({ id: Date.now(), ...payload } as CanvasCommand);
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
      const key = presetKey(next.tool);
      if (presetKey(previous.tool) !== key) next = { ...next, ...defaultPresets[key], ...presets.current[key] };
    }
    toolsRef.current = next;
    setTools(next);
    const key = presetKey(next.tool);
    if (writingTool(next.tool)) lastWriting.current = key;
    presets.current[key] = next;
    clearTimeout(presetsTimer.current);
    presetsTimer.current = setTimeout(writePresets, 600);
    if (next.tool === 'image' && notebook) void (async () => {
      const pageId = notebook.pages[active].id;
      try {
        const center = await new Promise<{ x: number; y: number }>(resolve => { visibleCenterRequest.current = resolve; send({ action: 'viewport' }); });
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
        if (result.canceled || currentNotebook.current?.id !== notebook.id) return;
        const asset = result.assets[0]; const name = `${repository.newId()}.${asset.uri.split('.').pop() ?? 'jpg'}`;
        const destination = new File(repository.packageDirectory(notebook.id), 'assets', name);
        new File(asset.uri).copy(destination);
        const page = currentNotebook.current.pages.find(page => page.id === pageId);
        if (!page) return;
        const { width: pageWidth, height: pageHeight } = pageSize(page.paper);
        const imageWidth = Math.min(260, pageWidth * 0.6, pageHeight * 0.6 * asset.width / asset.height);
        const imageHeight = imageWidth * asset.height / asset.width;
        saveObjects(page.id, [...page.objects, { id: repository.newId(), kind: 'image', asset: `assets/${name}`, x: Math.max(0, Math.min(pageWidth - imageWidth, center.x - imageWidth / 2)), y: Math.max(0, Math.min(pageHeight - imageHeight, center.y - imageHeight / 2)), width: imageWidth, height: imageHeight, rotation: 0 }]);
      } catch { Alert.alert('Не удалось вставить изображение', 'Выберите изображение ещё раз.'); }
      finally { if (currentNotebook.current?.id === notebook.id) { toolsRef.current = previous; setTools(previous); } }
    })();
  };
  const saveInBackground = () => void saveCanvases().catch(() => Alert.alert('Не удалось сохранить страницу'));
  // Прокрутка пальцем только отмечает активную страницу; переход из меню ещё и прокручивает к ней.
  const scrolledTo = (index: number) => { if (index !== active) { setActive(index); saveInBackground(); } };
  const selectPage = (index: number) => { setScrollRequest({ index, id: Date.now() }); scrolledTo(index); };
  const eraseElements = (kinds: ElementKind[]) => {
    const page = currentNotebook.current?.pages[active];
    if (!page) return;
    const inks = kinds.filter((kind): kind is InkGroup => kind === 'pen' || kind === 'pencil' || kind === 'marker');
    if (inks.length) send({ action: 'erase', inks });
    const objects = page.objects.filter(object => !kinds.includes(object.kind));
    if (objects.length !== page.objects.length) saveObjects(page.id, objects);
  };
  const narrow = width > 0 && width < 760;
  const panelTop = narrow ? 62 : 8;
  const textEditingChange = (value: boolean, kind?: 'text' | 'sticky') => {
    setEditingText(value && kind !== 'sticky');
    if (value && kind !== 'sticky' && toolsRef.current.tool === 'text') { const next = { ...toolsRef.current, tool: 'lasso' as const }; toolsRef.current = next; setTools(next); }
  };
  const clearPageAt = (index: number) => {
    const document = currentNotebook.current;
    const pageId = document?.pages[index]?.id;
    if (!document || !pageId) return;
    void saveCanvases(pageId).catch(() => Alert.alert('Не удалось очистить страницу', 'Повторите попытку.'));
  };
  return <EditorShell notebook={notebook} thumbnailRevision={thumbnailRevision} onNotebookChange={value => { currentNotebook.current = value; setNotebook(value); saveInBackground(); }} onBeforeAction={saveCanvases} activePage={active} readOnly={readOnly} onReadOnlyChange={setReadOnly} onSelectPage={selectPage} onClearPage={() => clearPageAt(active)} onClearPageAt={clearPageAt} onEraseElements={eraseElements} appendPageRequest={appendPageRequest}
    toolbar={<EditorTools state={tools} onChange={changeTools} ruler={ruler} onRulerChange={setRuler} onWriting={() => changeTools({ ...defaultPresets[lastWriting.current], ...presets.current[lastWriting.current] })} onRepeatEraser={() => setEraserPanel(value => !value)} />}>
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ flex: 1, backgroundColor: '#EEF0EF' }}>
      <EditorPageRibbon notebook={notebook} tools={tools} readOnly={readOnly} fingerDrawing={settings.fingerDrawing} ruler={ruler && !readOnly} horizontal={settings.horizontal}
        insetTop={readOnly ? 12 : panelTop + 46 + 12} activePage={active} scrollRequest={scrollRequest} command={command} thumbnailRevision={thumbnailRevision}
        onVisibleCenter={center => { visibleCenterRequest.current?.(center); visibleCenterRequest.current = undefined; }} onActivePageChange={scrolledTo}
        onPullAddPage={readOnly ? undefined : () => setAppendPageRequest(Date.now())}
        onHistoryChange={value => history.current?.update(value)} textFormat={textFormat} onObjectsChange={saveObjects} onTextEditingChange={textEditingChange}
        onToolEnd={() => { saveInBackground(); if (toolsRef.current.tool === 'eraser' && settings.eraserAutoReturn) changeTools(previousWriting.current); }} />
      {!readOnly && width > 0 && <>
        <View style={{ position: 'absolute', top: 8, left: 12 }}><EditorHistory ref={history} onUndo={() => send({ action: 'undo' })} onRedo={() => send({ action: 'redo' })} /></View>
        {(tools.tool !== 'eraser' || eraserPanel) && <View pointerEvents="box-none" style={{ position: 'absolute', top: panelTop, left: narrow ? 12 : 112, right: 12, alignItems: narrow ? 'flex-start' : 'center' }}>
          {(tools.tool === 'text' || editingText) ? <EditorTextFormat textFormat={textFormat} setTextFormat={setTextFormat} availableWidth={width - (narrow ? 24 : 224)} />
            : <EditorToolPanel state={tools} onChange={changeTools} eraserAutoReturn={settings.eraserAutoReturn} onEraserAutoReturnChange={eraserAutoReturn => saveSettings({ ...settings, eraserAutoReturn })} availableWidth={width - (narrow ? 24 : 224)} onClear={() => Alert.alert('Очистить страницу?', 'Все рукописные штрихи на странице будут удалены.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Очистить', style: 'destructive', onPress: () => clearPageAt(active) }])} />}
        </View>}
        {tools.tool === 'text' && textHint && <View style={{ position: 'absolute', bottom: 20, alignSelf: 'center' }}><Host style={{ height: 44, width: 330 }}><HStack spacing={10} modifiers={[padding({ leading: 16, trailing: 6 }), frame({ height: 44 }), glassEffect({ shape: 'capsule' })]}><Image systemName="hand.tap" size={15} color="#0F8FA8" /><Text modifiers={[font({ size: 14 })]}>Коснитесь страницы, чтобы добавить текст</Text><Button onPress={() => setTextHint(false)} modifiers={[buttonStyle('plain'), frame({ width: 32, height: 32 }), accessibilityLabel('Скрыть подсказку')]}><Image systemName="xmark" size={11} color="#6B7170" modifiers={[font({ size: 11, weight: 'semibold' })]} /></Button></HStack></Host></View>}
      </>}
    </View>
  </EditorShell>;
}

const textFamilies = [['Современный', 'System'], ['Классический', 'Georgia'], ['Технический', 'Menlo']] as const;
const textInk = '#2E3433';

export function EditorTextFormat({ textFormat, setTextFormat, availableWidth }: { textFormat: TextFormat; setTextFormat: (format: TextFormat) => void; availableWidth: number }) {
  const [open, setOpen] = useState<string>();
  const update = (patch: TextFormat) => setTextFormat({ ...textFormat, ...patch });
  const size = Math.round(textFormat.fontSize ?? 24);
  const family = textFamilies.find(([, value]) => value === textFormat.fontFamily)?.[0] ?? 'Современный';
  const alignmentSymbol = textFormat.alignment === 'center' ? 'text.aligncenter' : textFormat.alignment === 'right' ? 'text.alignright' : 'text.alignleft';
  const popover = (key: string, trigger: React.ReactElement, content: React.ReactElement) => <Popover isPresented={open === key} onIsPresentedChange={value => setOpen(value ? key : undefined)} attachmentAnchor="bottom" arrowEdge="top"><Popover.Trigger>{trigger}</Popover.Trigger><Popover.Content>{content}</Popover.Content></Popover>;
  const chevron = <Image systemName="chevron.down" size={8} color="#6B7170" modifiers={[font({ size: 8, weight: 'semibold' })]} />;
  const toggle = (label: string, symbol: 'bold' | 'italic' | 'underline' | 'strikethrough', value: boolean | undefined, patch: TextFormat) => <Button onPress={() => update(patch)} modifiers={[buttonStyle('plain'), frame({ width: 36, height: 34 }), ...(value ? [background('#DFF3F6', { shape: 'roundedRectangle' as const, cornerRadius: 9 })] : []), accessibilityLabel(value ? `${label}, включено` : label)]}><Image systemName={symbol} size={15} color={value ? '#0F8FA8' : textInk} modifiers={[font({ size: 15, weight: value ? 'semibold' : 'regular' })]} /></Button>;
  const divider = <Divider modifiers={[frame({ height: 22 }), padding({ horizontal: 6 })]} />;
  const panelWidth = Math.min(520, availableWidth);
  return <Host style={{ height: 46, width: panelWidth }}><HStack spacing={0} modifiers={[padding({ horizontal: 10 }), frame({ width: panelWidth, height: 46 }), glassEffect({ shape: 'capsule' })]}>
    <ColorPicker label="Цвет текста" modifiers={[labelsHidden(), frame({ width: 36 })]} selection={textFormat.color ?? '#151515'} supportsOpacity={false} onSelectionChange={color => update({ color })} />
    {divider}
    {popover('size', <Button onPress={() => setOpen('size')} modifiers={[buttonStyle('plain'), frame({ width: 58, height: 34 }), accessibilityLabel(`Размер шрифта ${size}`)]}><HStack spacing={4}><Text modifiers={[font({ size: 15 }), foregroundStyle(textInk)]}>{String(size)}</Text>{chevron}</HStack></Button>,
      <VStack spacing={14} modifiers={[padding({ all: 18 }), frame({ width: 320 })]}>
        <Text modifiers={[font({ size: 17, weight: 'semibold' })]}>Размер шрифта</Text>
        <HStack spacing={12}><Text modifiers={[font({ size: 28, weight: 'medium' }), frame({ width: 52 })]}>{String(size)}</Text><Slider value={textFormat.fontSize ?? 24} min={8} max={96} step={1} onValueChange={fontSize => update({ fontSize })} /><Stepper label="Размер" value={size} min={8} max={96} onValueChange={fontSize => update({ fontSize })} modifiers={[labelsHidden()]} /></HStack>
      </VStack>)}
    {popover('font', <Button onPress={() => setOpen('font')} modifiers={[buttonStyle('plain'), frame({ width: 128, height: 34 }), accessibilityLabel(`Шрифт ${family}`)]}><HStack spacing={4}><Text modifiers={[font({ size: 15 }), foregroundStyle(textInk)]}>{family}</Text>{chevron}</HStack></Button>,
      <VStack spacing={0} modifiers={[padding({ vertical: 8 }), frame({ width: 260 })]}>{textFamilies.map(([label, fontFamily]) => <Button key={fontFamily} onPress={() => { update({ fontFamily }); setOpen(undefined); }} modifiers={[buttonStyle('plain'), frame({ width: 260, height: 48 })]}>
        <HStack spacing={0} modifiers={[padding({ horizontal: 18 })]}><Text modifiers={[font({ family: fontFamily === 'System' ? undefined : fontFamily, size: 17 }), foregroundStyle(textInk)]}>{label}</Text><Spacer />{textFormat.fontFamily === fontFamily && <Image systemName="checkmark" size={14} color="#0F8FA8" modifiers={[font({ size: 14, weight: 'semibold' })]} />}</HStack>
      </Button>)}</VStack>)}
    {divider}
    {toggle('Жирный', 'bold', textFormat.bold, { bold: !textFormat.bold })}
    {toggle('Курсив', 'italic', textFormat.italic, { italic: !textFormat.italic })}
    {toggle('Подчёркнутый', 'underline', textFormat.underline, { underline: !textFormat.underline })}
    {toggle('Зачёркнутый', 'strikethrough', textFormat.strikethrough, { strikethrough: !textFormat.strikethrough })}
    {divider}
    {popover('alignment', <Button onPress={() => setOpen('alignment')} modifiers={[buttonStyle('plain'), frame({ width: 50, height: 34 }), accessibilityLabel('Выравнивание')]}><HStack spacing={3}><Image systemName={alignmentSymbol} size={15} color={textInk} />{chevron}</HStack></Button>,
      <HStack spacing={4} modifiers={[padding({ all: 8 })]}>{(['left', 'center', 'right'] as const).map((alignment, index) => {
        const selected = (textFormat.alignment ?? 'left') === alignment;
        return <Button key={alignment} onPress={() => update({ alignment })} modifiers={[buttonStyle('plain'), frame({ width: 44, height: 40 }), ...(selected ? [background('#DFF3F6', { shape: 'roundedRectangle' as const, cornerRadius: 9 })] : []), accessibilityLabel(['По левому краю', 'По центру', 'По правому краю'][index])]}><Image systemName={(['text.alignleft', 'text.aligncenter', 'text.alignright'] as const)[index]} size={16} color={selected ? '#0F8FA8' : textInk} /></Button>;
      })}</HStack>)}
  </HStack></Host>;
}
