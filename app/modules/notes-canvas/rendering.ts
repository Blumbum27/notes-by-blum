import { requireNativeModule } from 'expo';
import type { NotebookManifest } from '../../src/shared/documents/types';

export type SearchResult = { page: number; snippet: string; source: 'text' | 'sticky' | 'pdf' };
const renderer = requireNativeModule<{
  thumbnails(path: string, manifest: string): Promise<string[]>;
  sharePDF(path: string, manifest: string, pageIds: string[], background: boolean, annotations: boolean): Promise<void>;
  shareImages(path: string, manifest: string, pageIds: string[], background: boolean, annotations: boolean): Promise<void>;
  printPages(path: string, manifest: string, pageIds: string[]): Promise<void>;
  search(path: string, manifest: string, query: string): Promise<SearchResult[]>;
}>('NotesRendering');
/** Omit pageIds to rebuild the document; an explicit list renders only those pages. */
export const renderThumbnails = (path: string, manifest: NotebookManifest, pageIds?: string[]) =>
  renderer.thumbnails(path, JSON.stringify({ ...manifest, thumbnailPageIds: pageIds }));
export const shareNotebookPDF = (path: string, manifest: NotebookManifest, pageIds: string[], background = true, annotations = true) => renderer.sharePDF(path, JSON.stringify(manifest), pageIds, background, annotations);
export const shareNotebookImages = (path: string, manifest: NotebookManifest, pageIds: string[], background = true, annotations = true) => renderer.shareImages(path, JSON.stringify(manifest), pageIds, background, annotations);
export const printNotebook = (path: string, manifest: NotebookManifest, pageIds: string[]) => renderer.printPages(path, JSON.stringify(manifest), pageIds);
/** Текстовые поля, клейкие заметки и текстовый слой PDF; рукописный текст не распознаётся. */
export const searchNotebook = (path: string, manifest: NotebookManifest, query: string) => renderer.search(path, JSON.stringify(manifest), query);
