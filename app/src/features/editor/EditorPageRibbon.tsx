import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, ScrollView, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { NotesCanvas, type CanvasCommand, type TextFormat } from '../../../modules/notes-canvas';
import * as repository from '../../shared/documents/repository';
import { pageSize, paperFill, type NotebookManifest, type NotebookPage, type PageObject } from '../../shared/documents/types';
import type { EditorToolState } from './EditorTools';

type History = { canUndo: boolean; canRedo: boolean };
export type EditorPageRibbonProps = {
  notebook: NotebookManifest; tools: EditorToolState; readOnly: boolean; fingerDrawing: boolean; ruler: boolean;
  horizontal?: boolean; activePage: number; command?: CanvasCommand; thumbnailRevision: number;
  /** Отступ сверху под плавающими панелями инструментов. */
  insetTop: number;
  /** Программный переход: прокрутка к странице с анимацией. */
  scrollRequest?: { index: number; id: number };
  /** Пользователь прокрутил к другой странице; лента не возвращает прокрутку. */
  onActivePageChange: (index: number) => void;
  onHistoryChange: (history: History) => void;
  textFormat?: TextFormat;
  onObjectsChange: (pageId: string, objects: PageObject[]) => void;
  onToolEnd?: () => void;
  onTextEditingChange?: (editing: boolean, kind?: 'text' | 'sticky') => void;
  onVisibleCenter?: (center: { x: number; y: number }) => void;
};

type PageProps = Pick<EditorPageRibbonProps, 'tools' | 'readOnly' | 'fingerDrawing' | 'textFormat'> & {
  item: NotebookPage; documentId: string; width: number; height: number; mode: 'live' | 'thumbnail' | 'empty';
  command?: CanvasCommand; ruler: boolean; thumbnail: string;
  onObjectsChange: EditorPageRibbonProps['onObjectsChange']; onToolEnd: () => void;
  onTextEditingChange: (editing: boolean, kind?: 'text' | 'sticky') => void;
  onHistoryChange: (id: string, history: History) => void; onVisibleCenter: (center: { x: number; y: number }) => void;
};
const PageCell = memo(function PageCell({ item, documentId, width, height, mode, command, ruler, thumbnail, tools, readOnly, fingerDrawing, textFormat, onObjectsChange, onToolEnd, onTextEditingChange, onHistoryChange, onVisibleCenter }: PageProps) {
  const size = pageSize(item.paper);
  const fill = paperFill[item.paper.color] ?? paperFill.white;
  return <View style={{ width, height, backgroundColor: fill, borderRadius: 2, shadowColor: '#1D2422', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.14, shadowRadius: 6 }}>
    {mode === 'live' ? <NotesCanvas style={{ width, height }} filePath={repository.drawingPath(documentId, item.id)} packagePath={repository.packageDirectory(documentId).uri}
      rotation={item.rotation} background={item.background} objects={item.objects} tool={tools.tool} color={tools.color}
      pageWidth={size.width} pageHeight={size.height} shapeKind={tools.shapeKind} laserMode={tools.laserMode} penOptions={tools.penOptions} ruler={ruler}
      textFormat={textFormat} onObjectsChange={event => onObjectsChange(item.id, event.nativeEvent.objects)} onToolEnd={onToolEnd}
      onTextEditingChange={event => onTextEditingChange(event.nativeEvent.editing, event.nativeEvent.kind)}
      onVisibleCenter={event => onVisibleCenter(event.nativeEvent)}
      strokeWidth={tools.width} eraserMode={tools.eraserMode} pattern={item.paper.pattern} paperColor={fill}
      readOnly={readOnly} fingerDrawing={fingerDrawing} command={command} onDrawingChange={event => onHistoryChange(item.id, event.nativeEvent)}
      onError={event => Alert.alert('Ошибка страницы', event.nativeEvent.message)} />
      : mode === 'thumbnail' ? <Image style={{ width, height }} source={{ uri: thumbnail }} resizeMode="contain" fadeDuration={0} /> : null}
  </View>;
});

const gap = 14;

/**
 * Документ прокручивается и масштабируется одним UIScrollView. PKCanvasView есть только у видимой
 * страницы и соседей; дальние страницы показывают миниатюру. Активная страница вычисляется по центру
 * экрана и не перехватывает прокрутку.
 */
export function EditorPageRibbon(props: EditorPageRibbonProps) {
  const { notebook, activePage, onHistoryChange, horizontal, insetTop } = props;
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const list = useRef<ScrollView>(null);
  const latest = useRef(props);
  useEffect(() => { latest.current = props; }, [props]);
  const visible = useRef(activePage);
  const histories = useRef(new Map<string, History>());

  const layout = useMemo(() => {
    const room = Math.max(1, viewport.height - insetTop - 24);
    const result: { width: number; height: number; start: number; slot: number }[] = [];
    let offset = horizontal ? 0 : insetTop;
    for (const page of notebook.pages) {
      const size = pageSize(page.paper);
      const sideways = page.rotation % 180 !== 0;
      const ratio = sideways ? size.width / size.height : size.height / size.width;
      const width = Math.max(1, horizontal ? Math.min(viewport.width - 40, room / ratio) : Math.min(viewport.width - 40, Math.max(530, room / ratio)));
      const height = width * ratio;
      const slot = horizontal ? viewport.width : height + gap;
      result.push({ width, height, start: offset, slot });
      offset += slot;
    }
    return result;
  }, [notebook.pages, viewport, horizontal, insetTop]);

  const layoutRef = useRef(layout);
  useEffect(() => { layoutRef.current = layout; }, [layout]);
  const [visibleIndex, setVisibleIndex] = useState(activePage);
  const zoom = useRef(1);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, zoomScale, layoutMeasurement } = event.nativeEvent;
    zoom.current = zoomScale || 1;
    const pages = layoutRef.current;
    const center = ((latest.current.horizontal ? contentOffset.x + layoutMeasurement.width / 2 : contentOffset.y + layoutMeasurement.height / 2)) / zoom.current;
    let index = 0;
    while (index + 1 < pages.length && pages[index + 1].start <= center) index++;
    if (index !== visible.current) { visible.current = index; setVisibleIndex(index); latest.current.onActivePageChange(index); }
  }, []);

  // Внешний переход (боковая панель, «Перейти к странице») — плавная прокрутка; прокрутка пальцем сюда не попадает.
  const request = props.scrollRequest;
  useEffect(() => {
    if (!request || !viewport.width) return;
    const target = layoutRef.current[request.index];
    if (!target) return;
    visible.current = request.index; setVisibleIndex(request.index);
    const offset = Math.max(0, (target.start - (horizontal ? 0 : insetTop)) * zoom.current);
    list.current?.scrollTo(horizontal ? { x: offset, animated: true } : { y: offset, animated: true });
  }, [request, horizontal, insetTop, viewport.width]);

  useEffect(() => { const id = notebook.pages[activePage]?.id; onHistoryChange(histories.current.get(id) ?? { canUndo: false, canRedo: false }); }, [activePage, notebook.pages, onHistoryChange]);
  const objects = useCallback((id: string, value: PageObject[]) => latest.current.onObjectsChange(id, value), []);
  const toolEnd = useCallback(() => latest.current.onToolEnd?.(), []);
  const textEditing = useCallback((editing: boolean, kind?: 'text' | 'sticky') => latest.current.onTextEditingChange?.(editing, kind), []);
  const visibleCenter = useCallback((center: { x: number; y: number }) => latest.current.onVisibleCenter?.(center), []);
  const history = useCallback((id: string, value: History) => {
    histories.current.set(id, value);
    if (latest.current.notebook.pages[latest.current.activePage]?.id === id) latest.current.onHistoryChange(value);
  }, []);
  const measure = (event: LayoutChangeEvent) => { const { width, height } = event.nativeEvent.layout; setViewport(current => current.width === width && current.height === height ? current : { width, height }); };
  const packagePath = repository.packageDirectory(notebook.id).uri;
  const length = horizontal ? viewport.width * notebook.pages.length : (layout.at(-1) ? layout.at(-1)!.start + layout.at(-1)!.height + 32 : 0);

  return <View style={{ flex: 1 }} onLayout={measure}>
    {viewport.width > 0 && <ScrollView ref={list} key={String(horizontal)} horizontal={horizontal} pagingEnabled={horizontal}
      minimumZoomScale={1} maximumZoomScale={4} bouncesZoom pinchGestureEnabled
      scrollEventThrottle={16} onScroll={onScroll} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={!horizontal}
      contentContainerStyle={horizontal ? { width: length, height: viewport.height } : { width: viewport.width, height: length }}>
      {notebook.pages.map((item, index) => {
        const slot = layout[index];
        const distance = Math.abs(index - visibleIndex);
        return <View key={item.id} style={horizontal
          ? { position: 'absolute', left: slot.start, top: insetTop, width: viewport.width, height: viewport.height - insetTop, alignItems: 'center', justifyContent: 'center', paddingBottom: 24 }
          : { position: 'absolute', top: slot.start, left: (viewport.width - slot.width) / 2 }}>
          <PageCell item={item} documentId={notebook.id} width={slot.width} height={slot.height}
            mode={distance <= 1 ? 'live' : distance <= 5 ? 'thumbnail' : 'empty'}
            thumbnail={`${packagePath}/thumbnails/${item.id}.png?v=${props.thumbnailRevision}`}
            tools={props.tools} readOnly={props.readOnly} fingerDrawing={props.fingerDrawing} textFormat={props.textFormat}
            ruler={props.ruler && index === activePage} command={index === activePage ? props.command : undefined}
            onObjectsChange={objects} onToolEnd={toolEnd} onTextEditingChange={textEditing} onVisibleCenter={visibleCenter} onHistoryChange={history} />
        </View>;
      })}
    </ScrollView>}
    <View pointerEvents="none" style={{ position: 'absolute', bottom: 20, left: 16, paddingHorizontal: 10, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.86)', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } }}>
      <Text style={{ fontSize: 13, fontWeight: '500', color: '#5E6463', fontVariant: ['tabular-nums'] }}>{activePage + 1} из {notebook.pages.length}</Text>
    </View>
  </View>;
}
