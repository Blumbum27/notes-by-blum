import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import type { CanvasCommand, TextFormat } from '../../../modules/notes-canvas';
import { renderThumbnails } from '../../../modules/notes-canvas/rendering';
import * as repository from '../../shared/documents/repository';
import type { NotebookManifest, PageObject } from '../../shared/documents/types';
import { useSettings } from '../../shared/settings';
import { EditorShell } from '../editor-shell/EditorShell';
import { EditorHistory, EditorToolPanel, EditorTools, type EditorToolState } from './EditorTools';
import { EditorPageRibbon } from './EditorPageRibbon';

export default function NotebookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [notebook, setNotebook] = useState<NotebookManifest>();
  const [tools, setTools] = useState<EditorToolState>({ tool: 'pen', color: '#151515', width: 3, eraserMode: 'bitmap' });
  const [active, setActive] = useState(0);
  const [readOnly, setReadOnly] = useState(false);
  const [width, setWidth] = useState(650);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [command, setCommand] = useState<CanvasCommand>();
  const [textFormat, setTextFormat] = useState<TextFormat>({ color: '#151515', fontSize: 24, fontFamily: 'System', bold: false, italic: false, alignment: 'left' });
  const settings = useSettings();
  const pendingSave = useRef<Promise<unknown>>(Promise.resolve());
  const presets = useRef<Partial<Record<EditorToolState['tool'], EditorToolState>>>({});
  const previousWriting = useRef<EditorToolState>({ tool: 'pen', color: '#151515', width: 3, eraserMode: 'bitmap' });
  const currentNotebook = useRef<NotebookManifest | undefined>(undefined);
  const livePages = useRef<string[]>([]);
  const saveRequest = useRef<{ id: number; remaining: Set<string>; resolve: () => void; reject: (error: Error) => void } | undefined>(undefined);
  const saveCanvases = async () => {
    const id = Date.now();
    await new Promise<void>((resolve, reject) => {
      if (!livePages.current.length) { resolve(); return; }
      saveRequest.current = { id, remaining: new Set(livePages.current), resolve, reject };
      setCommand({ id, action: 'save' });
    });
    await pendingSave.current;
    const document = currentNotebook.current;
    if (document) await renderThumbnails(repository.packageDirectory(document.id).uri, document);
  };
  useEffect(() => { currentNotebook.current = notebook; }, [notebook]);
  useEffect(() => {
    const file = new File(Paths.document, 'editor-presets.json');
    if (file.exists) {
      try { presets.current = JSON.parse(file.textSync()); }
      catch { Alert.alert('Не удалось открыть настройки инструментов'); }
    }
  }, []);
  useEffect(() => {
    let current = true;
    setNotebook(undefined); setActive(0);
    repository.readNotebook(id).then(value => { if (current) setNotebook(value); }).catch(() => Alert.alert('Не удалось открыть блокнот', 'Вернитесь в библиотеку и попробуйте снова.'));
    return () => { current = false; currentNotebook.current = undefined; };
  }, [id]);
  const send = (action: CanvasCommand['action']) => setCommand({ id: Date.now(), action });
  const saveObjects = (pageId: string, objects: PageObject[]) => {
    const document = currentNotebook.current;
    if (!document) return;
    const next = { ...document, pages: document.pages.map(page => page.id === pageId ? { ...page, objects } : page) };
    currentNotebook.current = next;
    setNotebook(next);
    pendingSave.current = pendingSave.current.then(() => repository.saveNotebook(next));
    void pendingSave.current.catch(() => Alert.alert('Не удалось сохранить объекты', 'Не закрывайте документ и попробуйте снова.'));
  };
  const changeTools = (next: EditorToolState) => {
    if (next.tool === 'eraser' && ['pen', 'monoline', 'fountain', 'marker', 'pencil'].includes(tools.tool)) previousWriting.current = tools;
    if (next.tool !== tools.tool) {
      presets.current[tools.tool] = tools;
      next = presets.current[next.tool] ?? next;
    }
    setTools(next);
    presets.current[next.tool] = next;
    try { new File(Paths.document, 'editor-presets.json').write(JSON.stringify(presets.current)); }
    catch { Alert.alert('Не удалось сохранить настройки инструмента'); }
    if (next.tool === 'image' && notebook) void (async () => {
      const pageId = notebook.pages[active].id;
      try {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
        if (result.canceled || currentNotebook.current?.id !== notebook.id) return;
        const asset = result.assets[0]; const name = `${repository.newId()}.${asset.uri.split('.').pop() ?? 'jpg'}`;
        const destination = new File(repository.packageDirectory(notebook.id), 'assets', name);
        new File(asset.uri).copy(destination);
        const page = currentNotebook.current.pages.find(page => page.id === pageId);
        if (!page) return;
        saveObjects(page.id, [...page.objects, { id: repository.newId(), kind: 'image', asset: `assets/${name}`, x: 60, y: 80, width: 260, height: 260 * asset.height / asset.width, rotation: 0 }]);
      } catch { Alert.alert('Не удалось вставить изображение', 'Выберите изображение ещё раз.'); }
    })();
  };
  if (!notebook) return null;
  return <EditorShell notebook={notebook} onNotebookChange={value => { currentNotebook.current = value; setNotebook(value); }} onBeforeAction={saveCanvases} activePage={active} readOnly={readOnly} onReadOnlyChange={setReadOnly} onSelectPage={setActive} onClearPage={() => send('clear')} toolbar={<EditorTools state={tools} onChange={changeTools} />}><View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{ flex: 1, backgroundColor: '#E8EAEE' }}>
    <Stack.Screen options={{ headerShown: false }} />
    {!readOnly && <><EditorToolPanel state={tools} onChange={changeTools} onClear={() => Alert.alert('Очистить страницу?', 'Все рукописные штрихи на странице будут удалены.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Очистить', style: 'destructive', onPress: () => send('clear') }])} />
    <EditorHistory {...history} onUndo={() => send('undo')} onRedo={() => send('redo')} />
    {tools.tool === 'text' && <EditorTextFormat textFormat={textFormat} setTextFormat={setTextFormat} />}</>}
    <EditorPageRibbon notebook={notebook} tools={tools} readOnly={readOnly} fingerDrawing={settings.fingerDrawing} horizontal={settings.horizontal} width={width} activePage={active} command={command} onLivePages={ids => { livePages.current = ids; }} onSaved={(pageId, id, success) => {
      const request = saveRequest.current;
      if (!request || request.id !== id) return;
      if (!success) { saveRequest.current = undefined; request.reject(new Error('Не удалось сохранить страницу')); return; }
      request.remaining.delete(pageId);
      if (!request.remaining.size) { saveRequest.current = undefined; request.resolve(); }
    }} onActivePageChange={setActive} onHistoryChange={setHistory} textFormat={textFormat} onObjectsChange={saveObjects} onToolEnd={() => { if (tools.tool === 'eraser' && tools.eraserAutoReturn) changeTools(previousWriting.current); }} />
  </View></EditorShell>;
}

import { Button, ColorPicker, Host, HStack, Menu } from '@expo/ui/swift-ui';
import { glassEffect, labelsHidden, padding } from '@expo/ui/swift-ui/modifiers';
import { useWindowDimensions } from 'react-native';

export function EditorTextFormat({ textFormat, setTextFormat }: { textFormat: TextFormat; setTextFormat: (format: TextFormat) => void }) {
  const { width } = useWindowDimensions();
  return <Host style={{ height: 52, width: Math.min(700, width - 24), alignSelf: 'center' }}><HStack spacing={12} modifiers={[padding({ all: 8 }), glassEffect()]}>
    <ColorPicker label="Цвет текста" modifiers={[labelsHidden()]} selection={textFormat.color ?? '#151515'} onSelectionChange={color => setTextFormat({ ...textFormat, color })} />
    <Menu label={`${textFormat.fontSize}`}>{[12, 18, 24, 32, 48].map(fontSize => <Button key={fontSize} label={`${fontSize}`} onPress={() => setTextFormat({ ...textFormat, fontSize })} />)}</Menu>
    <Menu label="Шрифт">{[['Современный', 'System'], ['Классический', 'Georgia'], ['Технический', 'Menlo']].map(([label, fontFamily]) => <Button key={fontFamily} label={label} onPress={() => setTextFormat({ ...textFormat, fontFamily })} />)}</Menu>
    <Button label="B" onPress={() => setTextFormat({ ...textFormat, bold: !textFormat.bold })} /><Button label="I" onPress={() => setTextFormat({ ...textFormat, italic: !textFormat.italic })} />
    <Button label="U" onPress={() => setTextFormat({ ...textFormat, underline: !textFormat.underline })} /><Button label="S" onPress={() => setTextFormat({ ...textFormat, strikethrough: !textFormat.strikethrough })} />
    <Menu label="Выравнивание">{(['left', 'center', 'right'] as const).map((alignment, index) => <Button key={alignment} label={['Слева', 'По центру', 'Справа'][index]} onPress={() => setTextFormat({ ...textFormat, alignment })} />)}</Menu>
  </HStack></Host>;
}
