import { Button, ColorPicker, Host, HStack, Menu } from '@expo/ui/swift-ui';
import { buttonStyle, disabled, padding } from '@expo/ui/swift-ui/modifiers';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { NotesCanvas, type CanvasCommand, type CanvasTool } from '../../../modules/notes-canvas';
import * as repository from '../../shared/documents/repository';
import type { NotebookManifest } from '../../shared/documents/types';
import { readSettings } from '../settings/SettingsScreen';
import { EditorShell } from '../editor-shell/EditorShell';

export default function NotebookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [notebook, setNotebook] = useState<NotebookManifest>();
  const [tool, setTool] = useState<CanvasTool>('pen');
  const [color, setColor] = useState('#151515');
  const [width, setWidth] = useState(3);
  const [readOnly, setReadOnly] = useState(false);
  const [eraserMode, setEraserMode] = useState<'bitmap' | 'vector'>('bitmap');
  const [command, setCommand] = useState<CanvasCommand>();
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [active, setActive] = useState(0);
  const [pages, setPages] = useState(false);
  const settings = readSettings();
  const dimensions = useWindowDimensions();
  useEffect(() => { repository.readNotebook(id).then(setNotebook).catch(error => Alert.alert('Не удалось открыть блокнот', String(error))); }, [id]);
  const send = (action: CanvasCommand['action']) => setCommand({ id: Date.now(), action });
  const save = async (value: NotebookManifest) => { try { setNotebook(await repository.saveNotebook(value)); } catch (error) { Alert.alert('Не удалось сохранить', String(error)); } };
  if (!notebook) return null;
  const addPage = (position: 'before' | 'after' | 'last') => {
    const next = [...notebook.pages];
    next.splice(position === 'last' ? next.length : active + (position === 'after' ? 1 : 0), 0, repository.createPage(notebook.pages[active].paper));
    void save({ ...notebook, pages: next });
  };
  return <EditorShell><View style={styles.root}><Stack.Screen options={{ headerShown: false }} />
    <Host style={{ height: 64 }}><HStack spacing={20} modifiers={[padding({ all: 12 })]}><Button label="Домой" systemImage="house" onPress={() => router.back()} /><Menu label={notebook.title} systemImage="chevron.down"><Button label="Переименовать" onPress={() => Alert.prompt('Название блокнота', undefined, title => { if (title.trim()) void save({ ...notebook, title }); }, 'plain-text', notebook.title)} /><Button label="Закрыть" onPress={() => router.back()} /></Menu></HStack></Host>
    <Host style={{ height: 62 }}><HStack spacing={16} modifiers={[padding({ all: 8 })]}>
      <Button label="Страницы" systemImage="sidebar.left" onPress={() => setPages(!pages)} />
      <Button label={readOnly ? 'Только чтение' : 'Правка'} systemImage="pencil.tip" onPress={() => setReadOnly(!readOnly)} />
      {!readOnly && <><Button label="Лассо" systemImage="lasso" onPress={() => setTool('lasso')} /><Button label="Письмо" systemImage="pencil.tip.crop.circle" onPress={() => setTool('pen')} /><Button label="Ластик" systemImage="eraser" onPress={() => setTool('eraser')} /></>}
      <Menu label="Добавить" systemImage="doc.badge.plus"><Button label="Перед" onPress={() => addPage('before')} /><Button label="После" onPress={() => addPage('after')} /><Button label="Последняя страница" onPress={() => addPage('last')} /></Menu>
      <Menu label="Ещё" systemImage="ellipsis.circle"><Button label="Очистить страницу" role="destructive" onPress={() => send('clear')} /><Button label="Удалить страницу" role="destructive" onPress={() => { if (notebook.pages.length > 1) { void save({ ...notebook, pages: notebook.pages.filter((_, index) => index !== active) }); setActive(0); } }} /></Menu>
    </HStack></Host>
    {!readOnly && <Host style={{ height: 60 }}><HStack spacing={12} modifiers={[padding({ all: 8 })]}>
      <Button label="Отмена" systemImage="arrow.uturn.backward" modifiers={[disabled(!history.canUndo)]} onPress={() => send('undo')} /><Button label="Повторить" systemImage="arrow.uturn.forward" modifiers={[disabled(!history.canRedo)]} onPress={() => send('redo')} />
      {tool !== 'eraser' && tool !== 'lasso' && <><Menu label="Ручка" systemImage="pencil.tip"><Button label="Перьевая" onPress={() => setTool('fountain')} /><Button label="Шариковая" onPress={() => setTool('monoline')} /><Button label="Ручка-кисть" onPress={() => setTool('pen')} /></Menu><Button label="Карандаш" systemImage="pencil" onPress={() => setTool('pencil')} /><Button label="Маркер" systemImage="highlighter" onPress={() => setTool('marker')} /><ColorPicker label="Цвет" selection={color} onSelectionChange={setColor} /></>}
      {tool === 'eraser' && <Menu label={eraserMode === 'vector' ? 'Для штрихов' : 'Точный'}><Button label="Точный" onPress={() => { setEraserMode('bitmap'); setWidth(5); }} /><Button label="Стандартный" onPress={() => { setEraserMode('bitmap'); setWidth(20); }} /><Button label="Для штрихов" onPress={() => setEraserMode('vector')} /></Menu>}
      {tool !== 'lasso' && [2, 5, 12].map(size => <Button key={size} label={`${size}`} modifiers={[buttonStyle(width === size ? 'borderedProminent' : 'bordered')]} onPress={() => setWidth(size)} />)}
    </HStack></Host>}
    <View style={{ flex: 1, flexDirection: 'row' }}>{pages && <Host style={{ width: 180 }}><Menu label={`Страница ${active + 1}`}>
      {notebook.pages.map((page, index) => <Button key={page.id} label={`Страница ${index + 1}`} onPress={() => setActive(index)} />)}
    </Menu></Host>}
    <FlatList data={notebook.pages} horizontal={settings.horizontal} key={String(settings.horizontal)} initialNumToRender={2} maxToRenderPerBatch={3} windowSize={3} onViewableItemsChanged={({ viewableItems }) => { if (viewableItems[0]?.index != null) setActive(viewableItems[0].index); }} viewabilityConfig={{ itemVisiblePercentThreshold: 50 }} contentContainerStyle={{ padding: 24, gap: 18, alignItems: 'center' }} keyExtractor={page => page.id} renderItem={({ item, index }) => {
      const pageWidth = Math.min(dimensions.width - (pages ? 240 : 80), 650);
      const height = pageWidth * (item.paper.orientation === 'portrait' ? 1.414 : 0.707);
      return <View style={{ width: pageWidth, height, backgroundColor: '#FFF', shadowOpacity: 0.14, shadowRadius: 5 }}><NotesCanvas style={{ flex: 1 }} filePath={repository.drawingPath(id, item.id)} tool={tool} color={color} width={width} eraserMode={eraserMode} pattern={item.paper.pattern} paperColor={item.paper.color === 'white' ? '#FFFFFF' : '#FFF6D5'} readOnly={readOnly} fingerDrawing={settings.fingerDrawing} command={index === active ? command : undefined} onDrawingChange={event => { if (index === active) setHistory(event.nativeEvent); }} onError={event => Alert.alert('Ошибка страницы', event.nativeEvent.message)} /></View>;
    }} />
    </View>
  </View></EditorShell>;
}

const styles = StyleSheet.create({ root: { flex: 1, paddingTop: 24, backgroundColor: '#E8EAEE' } });
