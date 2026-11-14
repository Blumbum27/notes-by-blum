import { Button, ColorPicker, Host, HStack, Menu } from '@expo/ui/swift-ui';
import { buttonStyle, disabled, padding } from '@expo/ui/swift-ui/modifiers';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { NotesCanvas, type CanvasCommand, type CanvasTool } from '../../../modules/notes-canvas';
import * as repository from '../../shared/documents/repository';
import type { NotebookManifest } from '../../shared/documents/types';
import { useSettings } from '../../shared/settings';
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
  const list = useRef<FlatList>(null);
  const settings = useSettings();
  const dimensions = useWindowDimensions();
  useEffect(() => { repository.readNotebook(id).then(setNotebook).catch(error => Alert.alert('Не удалось открыть блокнот', String(error))); }, [id]);
  const send = (action: CanvasCommand['action']) => setCommand({ id: Date.now(), action });
  if (!notebook) return null;
  return <EditorShell notebook={notebook} onNotebookChange={setNotebook} activePage={active} readOnly={readOnly} onReadOnlyChange={setReadOnly} onClearPage={() => send('clear')} onSelectPage={index => { setActive(index); list.current?.scrollToIndex({ index, animated: true }); }} toolbar={<Host style={{ height: 58 }}><HStack spacing={16}><Button label="Лассо" systemImage="lasso" onPress={() => setTool('lasso')} /><Button label="Письмо" systemImage="pencil.tip" onPress={() => setTool('pen')} /><Button label="Ластик" systemImage="eraser" onPress={() => setTool('eraser')} /></HStack></Host>}><View style={styles.root}><Stack.Screen options={{ headerShown: false }} />
    {!readOnly && <ScrollView horizontal style={{ maxHeight: 60 }}><Host ignoreSafeArea="all" style={{ height: 60, width: 820 }}><HStack spacing={12} modifiers={[padding({ all: 8 })]}>
      <Button label="Отмена" systemImage="arrow.uturn.backward" modifiers={[disabled(!history.canUndo)]} onPress={() => send('undo')} /><Button label="Повторить" systemImage="arrow.uturn.forward" modifiers={[disabled(!history.canRedo)]} onPress={() => send('redo')} />
      {tool !== 'eraser' && tool !== 'lasso' && <><Menu label="Ручка" systemImage="pencil.tip"><Button label="Перьевая" onPress={() => setTool('fountain')} /><Button label="Шариковая" onPress={() => setTool('monoline')} /><Button label="Ручка-кисть" onPress={() => setTool('pen')} /></Menu><Button label="Карандаш" systemImage="pencil" onPress={() => setTool('pencil')} /><Button label="Маркер" systemImage="highlighter" onPress={() => setTool('marker')} /><ColorPicker label="Цвет" selection={color} onSelectionChange={setColor} /></>}
      {tool === 'eraser' && <Menu label={eraserMode === 'vector' ? 'Для штрихов' : 'Точный'}><Button label="Точный" onPress={() => { setEraserMode('bitmap'); setWidth(5); }} /><Button label="Стандартный" onPress={() => { setEraserMode('bitmap'); setWidth(20); }} /><Button label="Для штрихов" onPress={() => setEraserMode('vector')} /></Menu>}
      {tool !== 'lasso' && [2, 5, 12].map(size => <Button key={size} label={`${size}`} modifiers={[buttonStyle(width === size ? 'borderedProminent' : 'bordered')]} onPress={() => setWidth(size)} />)}
    </HStack></Host></ScrollView>}
    <View style={{ flex: 1, flexDirection: 'row' }}>
    <FlatList ref={list} onScrollToIndexFailed={({ averageItemLength, index }) => list.current?.scrollToOffset({ offset: averageItemLength * index })} data={notebook.pages} horizontal={settings.horizontal} key={String(settings.horizontal)} initialNumToRender={2} maxToRenderPerBatch={3} windowSize={3} onViewableItemsChanged={({ viewableItems }) => { if (viewableItems[0]?.index != null) setActive(viewableItems[0].index); }} viewabilityConfig={{ itemVisiblePercentThreshold: 50 }} contentContainerStyle={{ padding: 24, gap: 18, alignItems: 'center' }} keyExtractor={page => page.id} renderItem={({ item, index }) => {
      const pageWidth = Math.min(dimensions.width - 380, 650);
      const height = pageWidth * (item.paper.orientation === 'portrait' ? 1.414 : 0.707);
      return <View style={{ width: pageWidth, height, backgroundColor: '#FFF', shadowOpacity: 0.14, shadowRadius: 5 }}><NotesCanvas style={{ width: pageWidth, height }} filePath={repository.drawingPath(id, item.id)} tool={tool} color={color} strokeWidth={width} eraserMode={eraserMode} pattern={item.paper.pattern} paperColor={item.paper.color === 'white' ? '#FFFFFF' : '#FFF6D5'} readOnly={readOnly} fingerDrawing={settings.fingerDrawing} command={index === active ? command : undefined} onDrawingChange={event => { if (index === active) setHistory(event.nativeEvent); }} onError={event => Alert.alert('Ошибка страницы', event.nativeEvent.message)} /></View>;
    }} />
    </View>
  </View></EditorShell>;
}

const styles = StyleSheet.create({ root: { flex: 1, paddingTop: 24, backgroundColor: '#E8EAEE' } });
