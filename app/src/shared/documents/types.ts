export type Paper = 'blank' | 'ruled' | 'ruledWide' | 'grid' | 'dots' | 'cornell' | 'legal' | 'music';
export type PaperColor = 'white' | 'yellow' | 'dark';
export type PaperSize = 'A4' | 'A5' | 'Letter';
export type PaperSettings = { pattern: Paper; color: PaperColor; size: PaperSize; orientation: 'portrait' | 'landscape' };
type ObjectGeometry = {
  id: string; x: number; y: number; width: number; height: number; rotation: number;
};
export type PageObject = ObjectGeometry & ({
  kind: 'text'; text: string; color?: string; fontSize?: number;
  fontFamily?: string; bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean; alignment?: 'left' | 'center' | 'right';
} | { kind: 'image'; asset: string }
  | { kind: 'sticky'; text: string; color: string }
  | { kind: 'tape'; color: string });
export type PageBackground =
  | { kind: 'paper'; paper: PaperSettings }
  | { kind: 'pdf'; asset: string; page: number }
  | { kind: 'image'; asset: string };
export type NotebookPage = { id: string; paper: PaperSettings; background: PageBackground; rotation: number; favorite: boolean; objects: PageObject[] };
export type OutlineEntry = { id: string; title: string; pageId: string };
export type LibraryItem = {
  id: string; kind: 'notebook' | 'folder'; title: string; parentId: string | null;
  cover: string; favorite: boolean; createdAt: string; modifiedAt: string; deletedAt: string | null;
};
export type NotebookManifest = LibraryItem & { version: 1; pages: NotebookPage[]; outline?: OutlineEntry[] };
export const defaultPaper: PaperSettings = { pattern: 'grid', color: 'white', size: 'A4', orientation: 'portrait' };
export const paperFill: Record<PaperColor, string> = { white: '#FFFFFF', yellow: '#FFF6D5', dark: '#2E3133' };

const portraitSizes: Record<PaperSize, { width: number; height: number }> = {
  A4: { width: 595, height: 842 }, A5: { width: 420, height: 595 }, Letter: { width: 612, height: 792 },
};
/** Размер страницы в типографских точках с учётом ориентации; совпадает с NotebookRenderer.size. */
export const pageSize = (paper: PaperSettings) => {
  const size = portraitSizes[paper.size] ?? portraitSizes.A4;
  return paper.orientation === 'landscape' ? { width: size.height, height: size.width } : size;
};

export const paperNames: Record<Paper, string> = {
  blank: 'Пустая', ruled: 'Линованная узкая', ruledWide: 'Линованная широкая', grid: 'В клетку', dots: 'В точку',
  cornell: 'Корнельская', legal: 'Правовая', music: 'Нотная',
};
export const paperOrder = Object.keys(paperNames) as Paper[];
export const paperSizes: PaperSize[] = ['A4', 'A5', 'Letter'];
export const paperColorNames: Record<PaperColor, string> = { white: 'Белая', yellow: 'Жёлтая', dark: 'Тёмная' };
