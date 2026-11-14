export type Paper = 'blank' | 'ruled' | 'grid' | 'dots';
export type PaperSettings = { pattern: Paper; color: 'white' | 'yellow'; size: 'A4' | 'Letter'; orientation: 'portrait' | 'landscape' };
type ObjectGeometry = {
  id: string; x: number; y: number; width: number; height: number; rotation: number;
};
export type PageObject = ObjectGeometry & ({
  kind: 'text'; text: string; color?: string; fontSize?: number;
  fontFamily?: string; bold?: boolean; italic?: boolean; alignment?: 'left' | 'center' | 'right';
} | { kind: 'image'; asset: string });
export type PageBackground =
  | { kind: 'paper'; paper: PaperSettings }
  | { kind: 'pdf'; asset: string; page: number }
  | { kind: 'image'; asset: string };
export type NotebookPage = { id: string; paper: PaperSettings; background: PageBackground; rotation: number; favorite: boolean; objects: PageObject[] };
export type LibraryItem = {
  id: string; kind: 'notebook' | 'folder'; title: string; parentId: string | null;
  cover: string; favorite: boolean; createdAt: string; modifiedAt: string; deletedAt: string | null;
};
export type NotebookManifest = LibraryItem & { version: 1; pages: NotebookPage[] };
export const defaultPaper: PaperSettings = { pattern: 'grid', color: 'white', size: 'A4', orientation: 'portrait' };
