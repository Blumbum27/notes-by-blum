import { Button, Host, HStack, Menu, Spacer, Text as NativeText } from '@expo/ui/swift-ui';
import { buttonStyle, disabled, labelStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { router } from 'expo-router';
import { useEffect, useState, useSyncExternalStore, type PropsWithChildren, type ReactNode } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { renderThumbnails, shareNotebookPDF, shareNotebookImages } from '../../../modules/notes-canvas/rendering';
import * as repository from '../../shared/documents/repository';
import type { NotebookManifest, NotebookPage, Paper } from '../../shared/documents/types';
import { readSettings, saveSettings, useSettings } from '../../shared/settings';
import { AddPagePopover } from './AddPagePopover';
import { ExportSheet } from './ExportSheet';

export type EditorShellProps = PropsWithChildren<{
  toolbar?: ReactNode;
  notebook?: NotebookManifest;
  activePage?: number;
  readOnly?: boolean;
  onReadOnlyChange?: (value: boolean) => void;
  onNotebookChange?: (manifest: NotebookManifest) => void;
  onSelectPage?: (index: number) => void;
  /** Дождаться сохранения всех живых канвасов перед экспортом/сменой вкладки. */
  onBeforeAction?: () => Promise<void>;
  onClearPage?: () => void;
}>;
const tabsFile = new File(Paths.document, 'open-documents.json');
let openDocuments: { id: string; title: string }[] = tabsFile.exists ? JSON.parse(tabsFile.textSync()) : [];
const tabListeners = new Set<() => void>();
const publishTabs = (value: typeof openDocuments) => { const temporary = new File(Paths.document, 'open-documents.json.tmp'); temporary.write(JSON.stringify(value)); temporary.move(tabsFile, { overwrite: true }); openDocuments = value; tabListeners.forEach(listener => listener()); };

export function EditorShell({ children, toolbar, notebook, activePage = 0, readOnly = false, onReadOnlyChange, onNotebookChange, onSelectPage, onBeforeAction, onClearPage }: EditorShellProps) {
  const [sidebar, setSidebar] = useState(false);
  const [bookmarks, setBookmarks] = useState(false);
  const [singleColumn, setSingleColumn] = useState(false);
  const [revision, setRevision] = useState(0);
  const [exportIds, setExportIds] = useState<string[]>();
  const [selection, setSelection] = useState<string[] | null>(null);
  const [sidebarRight, setSidebarRight] = useState(false);
  const settings = useSettings();
  const tabs = useSyncExternalStore(listener => { tabListeners.add(listener); return () => { tabListeners.delete(listener); }; }, () => openDocuments);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!notebook) return;
    if (openDocuments.some(tab => tab.id === notebook.id && tab.title === notebook.title)) return;
    publishTabs([...(readSettings().newTabs ? openDocuments.filter(tab => tab.id !== notebook.id) : []), { id: notebook.id, title: notebook.title }]);
  }, [notebook]);
  useEffect(() => {
    if (!notebook) return;
    let current = true;
    renderThumbnails(repository.packageDirectory(notebook.id).uri, notebook).then(() => { if (current) setRevision(value => value + 1); }).catch(() => {});
    return () => { current = false; };
  }, [notebook]);
  if (!notebook) return <View style={{ flex: 1 }}>{toolbar}{children}</View>;
  const page = notebook.pages[activePage];
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await onBeforeAction?.(); await action(); }
    catch { Alert.alert('Не удалось выполнить действие', 'Изменения не применены. Попробуйте ещё раз.'); }
    finally { setBusy(false); }
  };
  const save = async (pages: NotebookPage[]) => {
    const latest = await repository.readNotebook(notebook.id);
    onNotebookChange?.(await repository.saveNotebook({ ...latest, pages: pages.map(page => ({ ...page, objects: latest.pages.find(value => value.id === page.id)?.objects ?? page.objects })) }));
  };
  const update = (index: number, patch: Partial<NotebookPage>) => perform(() => save(notebook.pages.map((value, i) => i === index ? { ...value, ...patch } : value)));
  const add = (index: number, pattern?: Paper) => perform(async () => {
    const paper = { ...page.paper, ...(pattern ? { pattern } : {}) };
    const pages = [...notebook.pages]; pages.splice(index, 0, repository.createPage(paper));
    await save(pages); onSelectPage?.(index);
  });
  const duplicate = (index: number) => perform(async () => {
    const original = (await repository.readNotebook(notebook.id)).pages[index];
    const copy = { ...original, id: repository.newId(), objects: original.objects.map(object => ({ ...object, id: repository.newId() })) };
    const source = new File(repository.drawingPath(notebook.id, original.id));
    if (source.exists) source.copy(new File(repository.drawingPath(notebook.id, copy.id)));
    const pages = [...notebook.pages]; pages.splice(index + 1, 0, copy); await save(pages); onSelectPage?.(index + 1);
  });
  const remove = (index: number) => Alert.alert('Удалить страницу?', 'Страница будет удалена из блокнота.', [{ text: 'Отменить', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: () => { void perform(async () => { await save(notebook.pages.filter((_, i) => i !== index)); onSelectPage?.(Math.min(activePage, notebook.pages.length - 2)); }); } }]);
  const exportPDF = (ids: string[]) => { setExportIds(ids); };
  const close = (id: string) => perform(async () => {
    publishTabs(openDocuments.filter(tab => tab.id !== id));
    if (id === notebook.id) router.replace(openDocuments.length ? `/notebook/${openDocuments[openDocuments.length - 1].id}` : '/');
  });
  const pageMenu = (index: number) => <Menu label="Меню страницы" systemImage="chevron.down" modifiers={[labelStyle('iconOnly')]}>
    <Button label="Добавить страницу перед" onPress={() => { void add(index); }} />
    <Button label="Добавить страницу после" onPress={() => { void add(index + 1); }} />
    <Button label="Дублировать" systemImage="doc.on.doc" onPress={() => { void duplicate(index); }} />
    <Menu label="Повернуть страницу"><Button label="На 90° по часовой стрелке" onPress={() => { void update(index, { rotation: (notebook.pages[index].rotation + 90) % 360 }); }} /><Button label="На 90° против часовой стрелки" onPress={() => { void update(index, { rotation: (notebook.pages[index].rotation + 270) % 360 }); }} /><Button label="На 180°" onPress={() => { void update(index, { rotation: (notebook.pages[index].rotation + 180) % 360 }); }} /></Menu>
    <Button label="Экспорт PDF" systemImage="square.and.arrow.up" onPress={() => { void exportPDF([notebook.pages[index].id]); }} />
    <Button label="Удалить страницу" role="destructive" modifiers={[disabled(notebook.pages.length < 2)]} onPress={() => remove(index)} />
  </Menu>;
  return <View style={styles.root}>
    {selection && <Host style={{ height: 50 }}><HStack><Button label="Отменить выбор" onPress={() => setSelection(null)} /><NativeText>{`Выбрано: ${selection.length}`}</NativeText><Button label="Экспортировать выбранные" modifiers={[disabled(!selection.length)]} onPress={() => { setExportIds(selection); }} /><Button label="Удалить выбранные" role="destructive" modifiers={[disabled(!selection.length || selection.length === notebook.pages.length)]} onPress={() => Alert.alert('Удалить выбранные страницы?', undefined, [{ text: 'Отменить', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: () => { void perform(async () => { await save(notebook.pages.filter(item => !selection.includes(item.id))); setSelection(null); onSelectPage?.(0); }); } }])} /></HStack></Host>}
    {exportIds && <ExportSheet title={notebook.title} onCancel={() => setExportIds(undefined)} onExport={(title, format, background, annotations) => { const ids = exportIds; setExportIds(undefined); void perform(() => (format === 'pdf' ? shareNotebookPDF : shareNotebookImages)(repository.packageDirectory(notebook.id).uri, { ...notebook, title }, ids, background, annotations)); }} />}
    <View style={styles.tabs}><Host style={{ width: 58, height: 48 }}><Button label="Домой" systemImage="house" modifiers={[labelStyle('iconOnly')]} onPress={() => { void perform(async () => { router.replace('/'); }); }} /></Host><ScrollView horizontal showsHorizontalScrollIndicator={false}>{tabs.map(tab => <View key={tab.id} style={[styles.tab, tab.id === notebook.id && styles.activeTab]}><Host style={{ flex: 1, height: 48 }}><HStack><Menu label={tab.title} systemImage="chevron.down">
      {tab.id === notebook.id && <><Button label="Переименовать" onPress={() => Alert.prompt('Название блокнота', undefined, title => { if (title.trim()) void perform(async () => { onNotebookChange?.(await repository.updateItem(notebook.id, { title: title.trim() })); }); }, 'plain-text', notebook.title)} />
      <NativeText>{`Стр. ${activePage + 1} из ${notebook.pages.length}`}</NativeText>
      <Button label="Расположение" onPress={() => { void perform(async () => { const items = await repository.listItems(); Alert.alert('Расположение', notebook.parentId ? items.find(item => item.id === notebook.parentId)?.title ?? 'Папка' : 'Документы'); }); }} />
      <Button label="Переместить в другую папку" onPress={() => { void perform(async () => { const folders = (await repository.listItems()).filter(item => item.kind === 'folder' && !item.deletedAt); Alert.alert('Переместить в другую папку', undefined, [{ text: 'Отменить', style: 'cancel' }, { text: 'Документы', onPress: () => { void perform(async () => { await repository.moveItem(notebook.id, null); onNotebookChange?.(await repository.readNotebook(notebook.id)); }); } }, ...folders.map(folder => ({ text: folder.title, onPress: () => { void perform(async () => { await repository.moveItem(notebook.id, folder.id); onNotebookChange?.(await repository.readNotebook(notebook.id)); }); } }))]); }); }} />
      <NativeText>{`Изменён: ${new Date(notebook.modifiedAt).toLocaleString('ru')}`}</NativeText></>}
      <Button label="Закрыть другие вкладки" role="destructive" onPress={() => { publishTabs([tab]); if (tab.id !== notebook.id) void perform(async () => { router.replace(`/notebook/${tab.id}`); }); }} />
    </Menu><Button label="Открыть вкладку" modifiers={[labelStyle('iconOnly')]} systemImage="arrow.up.right" onPress={() => { if (tab.id !== notebook.id) void perform(async () => { router.replace(`/notebook/${tab.id}`); }); }} /><Button label="Закрыть вкладку" systemImage="xmark" modifiers={[labelStyle('iconOnly')]} onPress={() => { void close(tab.id); }} /></HStack></Host></View>)}</ScrollView></View>
    <View style={styles.toolbar}><Host style={{ width: 178, height: 58 }}><HStack spacing={12} modifiers={[padding({ all: 8 })]}><Button label="Боковая панель страниц" systemImage="sidebar.left" modifiers={[labelStyle('iconOnly'), buttonStyle(sidebar ? 'bordered' : 'plain')]} onPress={() => setSidebar(!sidebar)} /><Button label={readOnly ? 'Только чтение' : 'Режим редактирования'} systemImage={readOnly ? 'eye' : 'pencil.tip'} modifiers={[labelStyle('iconOnly')]} onPress={() => onReadOnlyChange?.(!readOnly)} /></HStack></Host><View style={{ flex: 1 }}>{!readOnly && toolbar}</View><Host style={{ width: 186, height: 58 }}><HStack spacing={18} modifiers={[padding({ all: 8 })]}>
      <AddPagePopover currentPattern={page.paper.pattern} onAdd={(position, pattern) => { void add(position === 'last' ? notebook.pages.length : activePage + (position === 'after' ? 1 : 0), pattern); }} />

      <Button label="Поделиться" systemImage="square.and.arrow.up" modifiers={[labelStyle('iconOnly'), disabled(busy)]} onPress={() => setExportIds([])} />
      <Menu label="Ещё" systemImage="ellipsis.circle" modifiers={[labelStyle('iconOnly')]}><Button label="Настройки" onPress={() => { void perform(async () => { router.push('/settings'); }); }} /><Menu label="Направление прокрутки"><Button label="Вертикально" onPress={() => { void perform(async () => saveSettings({ ...settings, horizontal: false })); }} /><Button label="Горизонтально" onPress={() => { void perform(async () => saveSettings({ ...settings, horizontal: true })); }} /></Menu><Button label="Переместить в корзину" role="destructive" onPress={() => Alert.alert('Переместить блокнот в корзину?', undefined, [{ text: 'Отменить', style: 'cancel' }, { text: 'В корзину', style: 'destructive', onPress: () => { void perform(async () => { await repository.updateItem(notebook.id, { deletedAt: new Date().toISOString() }); router.replace('/'); }); } }])} /><Button label={sidebarRight ? 'Панель слева' : 'Панель справа'} onPress={() => setSidebarRight(!sidebarRight)} /><Button label={page.favorite ? 'Удалить закладку' : 'Добавить закладку'} systemImage="bookmark" onPress={() => { void update(activePage, { favorite: !page.favorite }); }} />{pageMenu(activePage)}<Menu label="Изменить шаблон">{(['blank', 'ruled', 'grid', 'dots'] as const).map(pattern => <Button key={pattern} label={{ blank: 'Пустая страница', ruled: 'Линованная', grid: 'В клетку', dots: 'В точку' }[pattern]} onPress={() => { const paper = { ...page.paper, pattern }; void update(activePage, { paper, background: { kind: 'paper', paper } }); }} />)}</Menu><Button label="Перейти к странице" onPress={() => Alert.prompt(`Перейти к странице (1–${notebook.pages.length})`, undefined, value => { const index = Number(value) - 1; if (Number.isInteger(index) && index >= 0 && index < notebook.pages.length) void perform(async () => { onSelectPage?.(index); }); else Alert.alert('Такой страницы нет'); }, 'plain-text', String(activePage + 1), 'number-pad')} />{onClearPage && <Button label="Очистить страницу" role="destructive" onPress={() => Alert.alert('Очистить страницу?', 'Рукописные заметки будут удалены.', [{ text: 'Отменить', style: 'cancel' }, { text: 'Очистить', style: 'destructive', onPress: onClearPage }])} />}</Menu>
    </HStack></Host></View>
    <View style={[styles.content, sidebarRight && { flexDirection: 'row-reverse' }]}>{sidebar && <View style={styles.sidebar}><Host style={{ height: 64 }}><HStack modifiers={[padding({ all: 12 })]}><Menu label="Параметры страниц" systemImage="ellipsis" modifiers={[labelStyle('iconOnly')]}><Button label="Выбрать страницы" onPress={() => setSelection([])} /><Button label={sidebarRight ? 'Панель слева' : 'Панель справа'} onPress={() => setSidebarRight(!sidebarRight)} /><Button label={singleColumn ? 'Две колонки' : 'Одна колонка'} onPress={() => setSingleColumn(!singleColumn)} /></Menu><Spacer /><NativeText>Страницы</NativeText><Spacer /><Button label="Закрыть панель страниц" systemImage="xmark" modifiers={[labelStyle('iconOnly')]} onPress={() => setSidebar(false)} /></HStack></Host><Host style={{ height: 48 }}><Menu label={bookmarks ? 'Только закладки' : 'Все страницы'}><Button label="Все страницы" onPress={() => setBookmarks(false)} /><Button label="Только закладки" onPress={() => setBookmarks(true)} /></Menu></Host><ScrollView contentContainerStyle={styles.grid}>{notebook.pages.map((item, index) => {
      if (bookmarks && !item.favorite) return null;
      const uri = new File(repository.packageDirectory(notebook.id), 'thumbnails', `${item.id}.png`).uri;
      return <View key={item.id} style={{ width: singleColumn ? '100%' : '46%' }}><View style={[styles.preview, index === activePage && styles.selected]}><Image source={{ uri: `${uri}?v=${revision}` }} style={StyleSheet.absoluteFill} resizeMode="contain" /><Pressable accessibilityRole="button" accessibilityLabel={`Открыть страницу ${index + 1}`} style={StyleSheet.absoluteFill} onPress={() => { if (selection) setSelection(selection.includes(item.id) ? selection.filter(id => id !== item.id) : [...selection, item.id]); else void perform(async () => { onSelectPage?.(index); }); }} />{selection?.includes(item.id) && <Text style={{ position: 'absolute', top: 8, right: 8, color: '#0087FF' }}>✓</Text>}</View><Host style={{ height: 42 }}><HStack><NativeText>{String(index + 1)}</NativeText><Spacer /><Button label={item.favorite ? 'Удалить закладку' : 'Добавить закладку'} systemImage={item.favorite ? 'bookmark.fill' : 'bookmark'} modifiers={[labelStyle('iconOnly')]} onPress={() => { void update(index, { favorite: !item.favorite }); }} />{pageMenu(index)}</HStack></Host></View>;
    })}<Host style={{ width: singleColumn ? '100%' : '46%', height: 140 }}><Button label="Добавить страницу" systemImage="plus" modifiers={[labelStyle('iconOnly'), buttonStyle('bordered')]} onPress={() => { void add(notebook.pages.length); }} /></Host></ScrollView></View>}<View style={{ flex: 1 }}>{children}</View></View>
    {busy && <Text accessibilityLiveRegion="polite" style={styles.status}>Подготовка…</Text>}
  </View>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#EEF0F3' }, tabs: { flexDirection: 'row', paddingTop: 24, backgroundColor: '#E3E8EF' }, tab: { width: 260, borderRightWidth: StyleSheet.hairlineWidth, borderColor: '#C6CDD5' }, activeTab: { backgroundColor: '#F8F9FB', borderTopLeftRadius: 14, borderTopRightRadius: 14 }, toolbar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F7FA' }, content: { flex: 1, flexDirection: 'row' }, sidebar: { width: 300, backgroundColor: '#F8F9FA', borderRightWidth: StyleSheet.hairlineWidth, borderColor: '#CCD1D7' }, grid: { padding: 18, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 18 }, preview: { height: 170, backgroundColor: 'white', borderWidth: 2, borderColor: '#E3E5E8' }, selected: { borderColor: '#0087FF' }, status: { position: 'absolute', bottom: 24, alignSelf: 'center', padding: 12, borderRadius: 12, backgroundColor: 'white' } });
