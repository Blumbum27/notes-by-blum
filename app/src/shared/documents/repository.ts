import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { defaultPaper, type LibraryItem, type NotebookManifest, type NotebookPage, type PaperSettings } from './types';

const library = new Directory(Paths.document, 'Library');
let database: Promise<SQLite.SQLiteDatabase> | undefined;
export const newId = () => randomUUID();
export const packageDirectory = (id: string) => new Directory(library, `${id}.notebook`);
export const drawingPath = (id: string, pageId: string) => new File(packageDirectory(id), 'pages', `${pageId}.drawing`).uri;

async function atomicJSON(file: File, value: unknown) {
  const temporary = new File(file.parentDirectory, `${file.name}.${newId()}.tmp`);
  temporary.write(JSON.stringify(value));
  await temporary.move(file, { overwrite: true });
}

async function db() {
  if (!database) database = (async () => {
    library.create({ intermediates: true, idempotent: true });
    const connection = await SQLite.openDatabaseAsync('library.db');
    await connection.execAsync(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL,
      parentId TEXT, cover TEXT NOT NULL, favorite INTEGER NOT NULL, createdAt TEXT NOT NULL,
      modifiedAt TEXT NOT NULL, deletedAt TEXT);`);
    // Индекс восстанавливается из пакетов: потеря SQLite не уничтожает библиотеку.
    const manifests: LibraryItem[] = [];
    for (const entry of library.list()) {
      if (!(entry instanceof Directory) || !entry.name.endsWith('.notebook')) continue;
      const manifest = new File(entry, 'manifest.json');
      if (manifest.exists) manifests.push(JSON.parse(await manifest.text()));
    }
    await connection.withTransactionAsync(async () => {
      await connection.runAsync('DELETE FROM items');
      for (const manifest of manifests) await indexItem(connection, manifest);
    });
    return connection;
  })();
  return database;
}

async function indexItem(connection: SQLite.SQLiteDatabase, item: LibraryItem) {
  await connection.runAsync('INSERT OR REPLACE INTO items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    item.id, item.kind, item.title, item.parentId, item.cover, Number(item.favorite), item.createdAt, item.modifiedAt, item.deletedAt);
}

export async function listItems(): Promise<LibraryItem[]> {
  const rows = await (await db()).getAllAsync<Omit<LibraryItem, 'favorite'> & { favorite: number }>('SELECT * FROM items');
  return rows.map(row => ({ ...row, favorite: !!row.favorite }));
}

export async function readNotebook(id: string): Promise<NotebookManifest> {
  await db();
  return JSON.parse(await new File(packageDirectory(id), 'manifest.json').text());
}

export async function saveNotebook(manifest: NotebookManifest) {
  const connection = await db();
  manifest = { ...manifest, modifiedAt: new Date().toISOString() };
  const directory = packageDirectory(manifest.id);
  directory.create({ intermediates: true, idempotent: true });
  for (const child of ['pages', 'assets', 'thumbnails']) new Directory(directory, child).create({ idempotent: true });
  for (const page of manifest.pages) await atomicJSON(new File(directory, 'pages', `${page.id}.json`), page.objects);
  await atomicJSON(new File(directory, 'manifest.json'), manifest);
  await indexItem(connection, manifest);
  return manifest;
}

export function createPage(paper: PaperSettings): NotebookPage {
  return { id: newId(), paper, background: { kind: 'paper', paper }, rotation: 0, favorite: false, objects: [] };
}

export async function createItem(title: string, kind: LibraryItem['kind'], parentId: string | null, cover: string, paper: PaperSettings) {
  const now = new Date().toISOString();
  return saveNotebook({ id: newId(), kind, title: title.trim() || (kind === 'folder' ? 'Новая папка' : 'Новый блокнот'),
    parentId, cover, favorite: false, createdAt: now, modifiedAt: now, deletedAt: null, version: 1,
    pages: kind === 'notebook' ? [createPage(paper)] : [] });
}

export async function updateItem(id: string, update: Partial<LibraryItem>) {
  if (update.deletedAt !== undefined) return updateTrash(id, update.deletedAt);
  return saveNotebook({ ...await readNotebook(id), ...update, id });
}

/** Дочерние пакеты остаются на месте; видимость определяется всей цепочкой родителей. */
export function isInTrash(item: LibraryItem, items: LibraryItem[]): boolean {
  const byId = new Map(items.map(value => [value.id, value]));
  let current: LibraryItem | undefined = item;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    if (current.deletedAt) return true;
    visited.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return false;
}

async function updateTrash(id: string, deletedAt: string | null) {
  const manifest = await readNotebook(id);
  const items = await listItems();
  const parent = items.find(item => item.id === manifest.parentId);
  return saveNotebook({ ...manifest, deletedAt,
    parentId: !deletedAt && parent && isInTrash(parent, items) ? null : manifest.parentId });
}

export async function duplicateItem(id: string) {
  const original = await readNotebook(id);
  const children = (await listItems()).filter(item => item.parentId === id && !item.deletedAt);
  const copy = { ...original, id: newId(), title: `${original.title} — копия`, createdAt: new Date().toISOString() };
  await packageDirectory(id).copy(packageDirectory(copy.id));
  await saveNotebook(copy);
  for (const child of children) {
    const duplicated = await duplicateItem(child.id);
    await saveNotebook({ ...duplicated, title: child.title, parentId: copy.id });
  }
  return copy;
}

/** Исходник копируется до публикации manifest, отмена picker не вызывает этот API. */
export async function importDocument(input: { uri: string; name: string; kind: 'image' | 'pdf'; pageCount?: number }, parentId: string | null) {
  await db();
  const count = input.kind === 'pdf' ? input.pageCount : 1;
  if (!count || !Number.isInteger(count) || count < 1) throw new Error('В выбранном документе нет страниц.');
  const id = newId();
  const directory = packageDirectory(id);
  directory.create({ intermediates: true });
  new Directory(directory, 'assets').create();
  const extension = input.kind === 'pdf' ? 'pdf' : (input.name.split('.').pop()?.toLowerCase() || 'jpg');
  const asset = `assets/source.${extension}`;
  await new File(input.uri).copy(new File(directory, asset));
  const now = new Date().toISOString();
  return saveNotebook({ id, kind: 'notebook', title: input.name.replace(/\.[^.]+$/, '') || 'Импортированный документ',
    parentId, cover: '#4377A8', favorite: false, createdAt: now, modifiedAt: now, deletedAt: null, version: 1,
    pages: Array.from({ length: count }, (_, page) => ({ ...createPage(defaultPaper),
      background: input.kind === 'pdf' ? { kind: 'pdf' as const, asset, page } : { kind: 'image' as const, asset } })) });
}

export async function deletePermanently(id: string) {
  const items = await listItems();
  const item = items.find(value => value.id === id);
  if (!item || !isInTrash(item, items)) throw new Error('Сначала переместите документ в корзину.');
  for (const child of items.filter(item => item.parentId === id)) await deletePermanently(child.id);
  packageDirectory(id).delete();
  await (await db()).runAsync('DELETE FROM items WHERE id = ?', id);
}

export async function moveItem(id: string, parentId: string | null) {
  const items = await listItems();
  const target = items.find(item => item.id === parentId);
  if (parentId && (!target || target.kind !== 'folder' || isInTrash(target, items))) {
    throw new Error('Выберите существующую папку вне корзины.');
  }
  let ancestor = parentId;
  while (ancestor) {
    if (ancestor === id) throw new Error('Нельзя переместить папку внутрь себя.');
    ancestor = items.find(item => item.id === ancestor)?.parentId ?? null;
  }
  return updateItem(id, { parentId });
}
