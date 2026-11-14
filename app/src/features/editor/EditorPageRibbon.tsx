import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Image, ScrollView, View, type ViewToken } from 'react-native';
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
};

/** Только текущая страница и соседи содержат живой PKCanvasView. */
export function EditorPageRibbon(props: EditorPageRibbonProps) {
  const [visible, setVisible] = useState(0);
  const list = useRef<FlatList<NotebookPage>>(null);
  const latest = useRef(props);
  useEffect(() => { latest.current = props; }, [props]);
  const viewability = useCallback(({ viewableItems }: { viewableItems: ViewToken<NotebookPage>[] }) => {
    const index = viewableItems[0]?.index;
    if (index != null) { setVisible(index); latest.current.onActivePageChange(index); }
  }, []);
  const width = Math.min(props.width - 48, 650);
  return <FlatList ref={list} key={String(props.horizontal)} horizontal={props.horizontal} data={props.notebook.pages}
    extraData={[props.tools, props.command, visible, props.readOnly]} keyExtractor={page => page.id}
    initialNumToRender={2} maxToRenderPerBatch={3} windowSize={3}
    onViewableItemsChanged={viewability} viewabilityConfig={{ itemVisiblePercentThreshold: 1 }}
    contentContainerStyle={{ padding: 24, gap: 18, alignItems: 'center' }}
    renderItem={({ item, index }) => {
      const ratio = item.paper.size === 'Letter' ? 11 / 8.5 : Math.SQRT2;
      const height = width * (item.paper.orientation === 'portrait' ? ratio : 1 / ratio);
      const short = item.paper.size === 'Letter' ? 612 : 595;
      return <ScrollView style={{ width, height, backgroundColor: '#fff', flexGrow: 0 }} contentContainerStyle={{ width, height }} minimumZoomScale={1} maximumZoomScale={4} scrollEnabled pinchGestureEnabled nestedScrollEnabled>
        <View style={{ width, height }}>
        {Math.abs(index - visible) <= 1 && <NotesCanvas style={{ width, height }}
          filePath={repository.drawingPath(props.notebook.id, item.id)} packagePath={repository.packageDirectory(props.notebook.id).uri}
          background={item.background} objects={item.objects} tool={props.tools.tool} color={props.tools.color}
          pageWidth={item.paper.orientation === 'portrait' ? short : short * ratio}
          pageHeight={item.paper.orientation === 'portrait' ? short * ratio : short}
           textFormat={props.textFormat} onObjectsChange={event => props.onObjectsChange(item.id, event.nativeEvent.objects)}
           onToolEnd={props.onToolEnd}
          strokeWidth={props.tools.width} eraserMode={props.tools.eraserMode} pattern={item.paper.pattern}
          paperColor={item.paper.color === 'white' ? '#FFFFFF' : '#FFF6D5'} readOnly={props.readOnly} fingerDrawing={props.fingerDrawing}
          command={index === props.activePage ? props.command : undefined}
          onDrawingChange={event => { if (index === latest.current.activePage) props.onHistoryChange(event.nativeEvent); }}
          onError={event => Alert.alert('Ошибка страницы', event.nativeEvent.message)} />}
        {Math.abs(index - visible) > 1 && <Image style={{ width, height }} source={{ uri: `${repository.packageDirectory(props.notebook.id).uri}/thumbnails/${item.id}-canvas.png` }} resizeMode="contain" />}
        </View></ScrollView>;
    }} />;
}
