import { requireNativeView, requireNativeModule } from 'expo';
import type { ViewProps } from 'react-native';
import type { Paper, PageBackground, PageObject } from '../../src/shared/documents/types';

export type InkTool = 'pen' | 'monoline' | 'fountain' | 'marker' | 'pencil' | 'drawShape';
export type CanvasTool = InkTool | 'eraser' | 'lasso' | 'text' | 'image' | 'shape' | 'tape' | 'sticky' | 'laser';
/** freeform — нарисованный от руки контур распознаётся в ровную фигуру; остальные строятся протягиванием. */
export type ShapeKind = 'freeform' | 'rectangle' | 'ellipse' | 'triangle' | 'diamond' | 'rounded' | 'elbow' | 'curve';
export type InkGroup = 'pen' | 'pencil' | 'marker';
export type CanvasCommand = { id: number } & ({ action: 'undo' | 'redo' | 'clear' | 'viewport' } | { action: 'erase'; inks: InkGroup[] });
export type TextFormat = Partial<Extract<PageObject, { kind: 'text' }>> & { underline?: boolean; strikethrough?: boolean };
/** pressure 0…1 — доля влияния нажима на толщину; stabilization 0…1 — сглаживание штриха. */
export type PenOptions = { pressure: number; stabilization: number; holdToSnap: boolean };
export type NotesCanvasProps = ViewProps & {
  preview?: boolean;
  filePath: string;
  /** Относительные asset-пути разрешаются относительно packagePath. PDF page — с нуля. */
  packagePath?: string;
  background?: PageBackground;
  objects?: PageObject[];
  textFormat?: TextFormat;
  pageWidth?: number;
  pageHeight?: number;
  rotation?: number;
  tool: CanvasTool;
  /** #RRGGBB либо `stars` для узорной ленты. */
  color: string;
  strokeWidth: number;
  eraserMode: 'bitmap' | 'vector';
  shapeKind?: ShapeKind;
  laserMode?: 'dot' | 'line';
  ruler?: boolean;
  penOptions?: PenOptions;
  pattern: Paper;
  paperColor: string;
  readOnly: boolean;
  fingerDrawing: boolean;
  command?: CanvasCommand;
  onDrawingChange?: (event: { nativeEvent: { canUndo: boolean; canRedo: boolean } }) => void;
  onError?: (event: { nativeEvent: { message: string } }) => void;
  onObjectsChange?: (event: { nativeEvent: { objects: PageObject[] } }) => void;
  onToolEnd?: () => void;
  onTextEditingChange?: (event: { nativeEvent: { editing: boolean; kind?: 'text' | 'sticky' } }) => void;
  onVisibleCenter?: (event: { nativeEvent: { x: number; y: number } }) => void;
};

export const NotesCanvas = requireNativeView<NotesCanvasProps>('NotesCanvas');
export const saveAllCanvases = () => requireNativeModule<{ saveAll: () => Promise<boolean> }>('NotesCanvas').saveAll();
export const clearCanvasPage = (path: string) => requireNativeModule<{ clearPage: (path: string) => Promise<boolean> }>('NotesCanvas').clearPage(path);
