import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Image, ScrollView, Text, View, type ViewToken } from 'react-native';
import { NotesCanvas, type CanvasCommand } from '../../../modules/notes-canvas';
import * as repository from '../../shared/documents/repository';
import type { NotebookManifest, NotebookPage, PageObject } from '../../shared/documents/types';
import type { EditorToolState } from './EditorTools';

export type EditorPageRibbonProps = {
  notebook: NotebookManifest; tools: EditorToolState; readOnly: boolean; fingerDrawing: boolean;
  horizontal?: boolean; width: number; activePage: number; command?: CanvasCommand;
  onActivePageChange: (index: number) => void;
  onHistoryChange: (history: { canUndo: boolean; canRedo: boolean }) => void;
  textFormat?: Partial<Extract<PageObject, { kind: 'text' }>>;
  onObjectsChange: (pageId: string, objects: PageObject[]) => void;
  onToolEnd?: () => void;
  onTextEditingChange?: (editing: boolean) => void;
  onVisibleCenter?: (center: { x: number; y: number }) => void;
};

type PageProps = Pick<EditorPageRibbonProps, 'tools' | 'readOnly' | 'fingerDrawing' | 'textFormat' | 'onObjectsChange' | 'onToolEnd' | 'onTextEditingChange' | 'onHistoryChange' | 'onVisibleCenter'> & {
  item: NotebookPage; documentId: string; width: number; live: boolean; command?: CanvasCommand;
};
const PageCell = memo(function PageCell({ item, documentId, width, live, command, tools, readOnly, fingerDrawing, textFormat, onObjectsChange, onToolEnd, onTextEditingChange, onHistoryChange, onVisibleCenter }: PageProps) {
  const ratio = item.paper.size === 'Letter' ? 11 / 8.5 : Math.SQRT2;
  const sideways = item.rotation % 180 !== 0;
  const height = width * ((item.paper.orientation === 'portrait') !== sideways ? ratio : 1 / ratio);
  const short = item.paper.size === 'Letter' ? 612 : 595;
  return <View style={{ width, height, backgroundColor: '#FFFFFF', shadowColor: '#28302D', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.22, shadowRadius: 5 }}><ScrollView style={{ width, height, flexGrow: 0 }} contentContainerStyle={{ width, height }} minimumZoomScale={1} maximumZoomScale={4} scrollEnabled pinchGestureEnabled nestedScrollEnabled>
    {live ? <NotesCanvas style={{ width, height }} filePath={repository.drawingPath(documentId, item.id)} packagePath={repository.packageDirectory(documentId).uri}
      rotation={item.rotation} background={item.background} objects={item.objects} tool={tools.tool} color={tools.color}
      pageWidth={item.paper.orientation === 'portrait' ? short : short * ratio} pageHeight={item.paper.orientation === 'portrait' ? short * ratio : short}
      textFormat={textFormat} onObjectsChange={event => onObjectsChange(item.id, event.nativeEvent.objects)} onToolEnd={onToolEnd}
      onTextEditingChange={event => onTextEditingChange?.(event.nativeEvent.editing)}
      onVisibleCenter={event => onVisibleCenter?.(event.nativeEvent)}
      strokeWidth={tools.width} eraserMode={tools.eraserMode} pattern={item.paper.pattern} paperColor={item.paper.color === 'white' ? '#FFFFFF' : '#FFF6D5'}
      readOnly={readOnly} fingerDrawing={fingerDrawing} command={command} onDrawingChange={event => onHistoryChange(event.nativeEvent)}
      onError={event => Alert.alert('Ошибка страницы', event.nativeEvent.message)} /> : <Image style={{ width, height }} source={{ uri: `${repository.packageDirectory(documentId).uri}/thumbnails/${item.id}.png` }} resizeMode="contain" />}
  </ScrollView></View>;
});

/** Только видимая страница и соседи содержат PKCanvasView. Колбэки не меняют identity ячеек. */
export function EditorPageRibbon(props: EditorPageRibbonProps) {
  const [visible, setVisible] = useState(0);
  const list = useRef<FlatList<NotebookPage>>(null);
  const latest = useRef(props);
  useEffect(() => { latest.current = props; }, [props]);
  const histories = useRef(new Map<string, { canUndo: boolean; canRedo: boolean }>());
  const { notebook, activePage, onHistoryChange } = props;
  useEffect(() => { list.current?.scrollToIndex({ index: props.activePage, animated: false }); }, [props.activePage]);
  useEffect(() => { const id = notebook.pages[activePage]?.id; onHistoryChange(histories.current.get(id) ?? { canUndo: false, canRedo: false }); }, [activePage, notebook.pages, onHistoryChange]);
  const viewability = useCallback(({ viewableItems }: { viewableItems: ViewToken<NotebookPage>[] }) => {
    const index = viewableItems[0]?.index;
    if (index != null) { setVisible(index); latest.current.onActivePageChange(index); }
  }, []);
  const objects = useCallback((id: string, value: PageObject[]) => latest.current.onObjectsChange(id, value), []);
  const toolEnd = useCallback(() => latest.current.onToolEnd?.(), []);
  const textEditing = useCallback((editing: boolean) => latest.current.onTextEditingChange?.(editing), []);
  const visibleCenter = useCallback((center: { x: number; y: number }) => latest.current.onVisibleCenter?.(center), []);
  const historyCallbacks = useRef(new Map<string, (value: { canUndo: boolean; canRedo: boolean }) => void>());
  const historyFor = (id: string) => {
    if (!historyCallbacks.current.has(id)) historyCallbacks.current.set(id, value => {
      histories.current.set(id, value);
      if (latest.current.notebook.pages[latest.current.activePage]?.id === id) latest.current.onHistoryChange(value);
    });
    return historyCallbacks.current.get(id)!;
  };
  const width = Math.min(props.width - 32, 530);
  return <View style={{ flex: 1 }}><FlatList ref={list} key={String(props.horizontal)} horizontal={props.horizontal} data={props.notebook.pages}
    onScrollToIndexFailed={({ index, averageItemLength }) => list.current?.scrollToOffset({ offset: index * averageItemLength })}
    extraData={[props.tools, props.command, visible, props.readOnly, props.textFormat]} keyExtractor={page => page.id}
    initialNumToRender={2} maxToRenderPerBatch={3} windowSize={3}
    onViewableItemsChanged={viewability} viewabilityConfig={{ itemVisiblePercentThreshold: 20 }}
    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, gap: 7, alignItems: 'center', ...(props.horizontal ? {} : { width: props.width }) }}
    renderItem={({ item, index }) => <PageCell item={item} documentId={props.notebook.id} width={width} live={Math.abs(index - visible) <= 1}
      tools={props.tools} readOnly={props.readOnly} fingerDrawing={props.fingerDrawing} textFormat={props.textFormat}
      command={index === props.activePage ? props.command : undefined}
      onObjectsChange={objects} onToolEnd={toolEnd} onTextEditingChange={textEditing} onVisibleCenter={visibleCenter} onHistoryChange={historyFor(item.id)} />} />
    <View pointerEvents="none" style={{ position: 'absolute', bottom: 31, left: 20, width: 72, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.78)' }}><Text style={{ fontSize: 14, color: '#6B7070' }}>{props.activePage + 1} из {props.notebook.pages.length}</Text></View>
  </View>;
}
