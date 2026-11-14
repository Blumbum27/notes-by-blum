import { requireNativeView, requireNativeModule } from 'expo';
import type { ViewProps } from 'react-native';
import type { PageBackground, PageObject } from '../../src/shared/documents/types';

export type CanvasTool = 'pen' | 'monoline' | 'fountain' | 'marker' | 'pencil' | 'eraser' | 'lasso' | 'text' | 'image';
export type CanvasCommand = { id: number; action: 'undo' | 'redo' | 'clear' | 'viewport' };
export type TextFormat = Partial<Extract<PageObject, { kind: 'text' }>> & { underline?: boolean; strikethrough?: boolean };
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
  color: string;
  strokeWidth: number;
  eraserMode: 'bitmap' | 'vector';
  pattern: 'blank' | 'ruled' | 'grid' | 'dots';
  paperColor: string;
  readOnly: boolean;
  fingerDrawing: boolean;
  command?: CanvasCommand;
  onDrawingChange?: (event: { nativeEvent: { canUndo: boolean; canRedo: boolean } }) => void;
  onError?: (event: { nativeEvent: { message: string } }) => void;
  onObjectsChange?: (event: { nativeEvent: { objects: PageObject[] } }) => void;
  onToolEnd?: () => void;
  onTextEditingChange?: (event: { nativeEvent: { editing: boolean } }) => void;
  onVisibleCenter?: (event: { nativeEvent: { x: number; y: number } }) => void;
};

export const NotesCanvas = requireNativeView<NotesCanvasProps>('NotesCanvas');
export const saveAllCanvases = () => requireNativeModule<{ saveAll: () => Promise<boolean> }>('NotesCanvas').saveAll();
export const clearCanvasPage = (path: string) => requireNativeModule<{ clearPage: (path: string) => Promise<boolean> }>('NotesCanvas').clearPage(path);
