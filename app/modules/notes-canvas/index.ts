import { requireNativeView } from 'expo';
import type { ViewProps } from 'react-native';
import type { PageBackground, PageObject } from '../../src/shared/documents/types';

export type CanvasTool = 'pen' | 'monoline' | 'fountain' | 'marker' | 'pencil' | 'eraser' | 'lasso';
export type CanvasCommand = { id: number; action: 'undo' | 'redo' | 'clear' | 'save' };
export type NotesCanvasProps = ViewProps & {
  filePath: string;
  /** Относительные asset-пути разрешаются относительно packagePath. PDF page — с нуля. */
  packagePath?: string;
  background?: PageBackground;
  objects?: PageObject[];
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
};

export const NotesCanvas = requireNativeView<NotesCanvasProps>('NotesCanvas');
