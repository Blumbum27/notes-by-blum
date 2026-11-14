import { requireNativeModule } from 'expo';
import type { NotebookManifest } from '../../src/shared/documents/types';

const renderer = requireNativeModule<{
  thumbnails(path: string, manifest: string): Promise<string[]>;
  sharePDF(path: string, manifest: string, pageIds: string[], background: boolean, annotations: boolean): Promise<void>;
}>('NotesRendering');
export const renderThumbnails = (path: string, manifest: NotebookManifest) => renderer.thumbnails(path, JSON.stringify(manifest));
export const shareNotebookPDF = (path: string, manifest: NotebookManifest, pageIds: string[], background = true, annotations = true) => renderer.sharePDF(path, JSON.stringify(manifest), pageIds, background, annotations);
