import { Button, Host, HStack, Image as Symbol, Menu, ProgressView, Text as NativeText } from '@expo/ui/swift-ui';
import { accessibilityLabel, background, buttonStyle, font, foregroundStyle, frame, glassEffect, padding, shapes } from '@expo/ui/swift-ui/modifiers';
import * as DocumentPicker from 'expo-document-picker';
import { GlassView } from 'expo-glass-effect';
import { Directory, File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { documentImport } from '../../../modules/document-import';
import { printNotebook, shareNotebookImages, shareNotebookPDF } from '../../../modules/notes-canvas/rendering';
import * as repository from '../../shared/documents/repository';
import type { NotebookManifest, NotebookPage, OutlineEntry, PageBackground, Paper, PaperColor } from '../../shared/documents/types';
import { saveSettings, useSettings } from '../../shared/settings';
import { AddPagePopover, type AddPosition } from './AddPagePopover';
import { DocumentTabs, getOpenTabs, publishTabs } from './DocumentTabs';
import { ExportSheet } from './ExportSheet';
import { FolderSheet } from './FolderSheet';
import { MorePopover, type ElementKind } from './MorePopover';
import { PagesSidebar, type PageActions } from './PagesSidebar';
import { SearchPanel } from './SearchPanel';
import { ToolbarButton } from './ToolbarButton';

export type EditorShellProps = PropsWithChildren<{
  toolbar?: ReactNode;
  notebook?: NotebookManifest;
  activePage?: number;
  thumbnailRevision: number;
  readOnly?: boolean;
  onReadOnlyChange?: (value: boolean) => void;
  onNotebookChange?: (manifest: NotebookManifest) => void;
  onSelectPage?: (index: number) => void;
  /** Saves live canvases, pending objects and changed thumbnails in the editor. */
  onBeforeAction?: () => Promise<void>;
  onClearPage?: () => void;
  onClearPageAt?: (index: number) => void;
  /** Removes chosen kinds of content from the active page. */
  onEraseElements?: (kinds: ElementKind[]) => void;
}>;

export function EditorShell(props: EditorShellProps) {
  const { children, toolbar, notebook, activePage = 0, readOnly = false, thumbnailRevision } = props;
  const insets = useSafeAreaInsets();
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; });
  const [panel, setPanel] = useState<'pages' | 'search'>();
  const settings = useSettings();
  const [exportIds, setExportIds] = useState<string[]>();
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);

  const perform = useCallback(async (action: (document: NotebookManifest) => Promise<void>) => {
    const id = latest.current.notebook?.id;
    if (!id || locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      await latest.current.onBeforeAction?.();
      const document = await repository.readNotebook(id);
      if (latest.current.notebook?.id !== id) return;
      await action(document);
    } catch {
      Alert.alert('Не удалось выполнить действие', 'Попробуйте ещё раз. Если ошибка повторится, оставьте блокнот открытым.');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }, []);

  const save = useCallback(async (document: NotebookManifest, pages: NotebookPage[]) => {
    const current = await repository.readNotebook(document.id);
    const next = await repository.saveNotebook({
      ...current,
      pages: pages.map(page => ({ ...page, objects: current.pages.find(value => value.id === page.id)?.objects ?? page.objects })),
    });
    if (latest.current.notebook?.id === document.id) latest.current.onNotebookChange?.(next);
  }, []);

  const add = useCallback((index: number, sourceIndex?: number, template: { pattern?: Paper; color?: PaperColor } = {}) => {
    void perform(async document => {
      const source = document.pages[sourceIndex ?? latest.current.activePage ?? 0];
      const paper = { ...source.paper, ...(template.pattern ? { pattern: template.pattern } : {}), ...(template.color ? { color: template.color } : {}) };
      const pages = [...document.pages];
      pages.splice(index, 0, repository.createPage(paper));
      await save(document, pages);
      latest.current.onSelectPage?.(index);
    });
  }, [perform, save]);

  /** Inserts pages whose background is a copied image or PDF asset; the picker is shown before the save lock. */
  const insertBackgrounds = useCallback(async (position: AddPosition, pick: () => Promise<{ uri: string; extension: string; pages: number } | undefined>) => {
    const picked = await pick().catch(() => { Alert.alert('Не удалось открыть файл', 'Выберите другой файл и попробуйте ещё раз.'); return undefined; });
    if (!picked) return;
    void perform(async document => {
      const active = latest.current.activePage ?? 0;
      const asset = `assets/${repository.newId()}.${picked.extension}`;
      new Directory(repository.packageDirectory(document.id), 'assets').create({ idempotent: true });
      new File(picked.uri).copy(new File(repository.packageDirectory(document.id), asset));
      const inserted = Array.from({ length: picked.pages }, (_, page) => {
        const background: PageBackground = picked.extension === 'pdf' ? { kind: 'pdf', asset, page } : { kind: 'image', asset };
        return { ...repository.createPage(document.pages[active].paper), background };
      });
      const index = position === 'last' ? document.pages.length : active + (position === 'after' ? 1 : 0);
      const pages = [...document.pages];
      pages.splice(index, 0, ...inserted);
      await save(document, pages);
      latest.current.onSelectPage?.(index);
    });
  }, [perform, save]);
  const addImagePage = useCallback((position: AddPosition) => insertBackgrounds(position, async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled) return;
    const image = result.assets[0];
    return { uri: image.uri, extension: image.uri.split('.').pop()?.toLowerCase() || 'jpg', pages: 1 };
  }), [insertBackgrounds]);
  const importPages = useCallback((position: AddPosition) => insertBackgrounds(position, async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (result.canceled) return;
    const file = result.assets[0];
    const pdf = file.mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const pages = pdf ? await documentImport.pdfPageCount(file.uri) : 1;
    if (!pages) throw new Error('empty');
    return { uri: file.uri, extension: pdf ? 'pdf' : file.name.split('.').pop()?.toLowerCase() || 'jpg', pages };
  }), [insertBackgrounds]);

  const update = useCallback((index: number, patch: (page: NotebookPage) => Partial<NotebookPage>) => {
    void perform(async document => {
      await save(document, document.pages.map((page, i) => i === index ? { ...page, ...patch(page) } : page));
    });
  }, [perform, save]);

  const clear = useCallback((index: number) => {
    Alert.alert('Очистить страницу?', 'Все рукописные штрихи на странице будут удалены.', [
      { text: 'Отменить', style: 'cancel' },
      { text: 'Очистить', style: 'destructive', onPress: () => { void perform(async () => {
        if (latest.current.onClearPageAt) latest.current.onClearPageAt(index);
        else if (index === (latest.current.activePage ?? 0)) latest.current.onClearPage?.();
      }); } },
    ]);
  }, [perform]);

  const actions = useMemo<PageActions>(() => ({
    select: index => { void perform(async () => { latest.current.onSelectPage?.(index); }); },
    add,
    bookmark: index => update(index, page => ({ favorite: !page.favorite })),
    rotate: (index, degrees) => update(index, page => ({ rotation: (page.rotation + degrees) % 360 })),
    duplicate: index => { void perform(async document => {
      const original = document.pages[index];
      const copy = { ...original, id: repository.newId(), objects: original.objects.map(object => ({ ...object, id: repository.newId() })) };
      const source = new File(repository.drawingPath(document.id, original.id));
      if (source.exists) source.copy(new File(repository.drawingPath(document.id, copy.id)));
      const pages = [...document.pages];
      pages.splice(index + 1, 0, copy);
      await save(document, pages);
      latest.current.onSelectPage?.(index + 1);
    }); },
    clear,
    remove: ids => Alert.alert(ids.length > 1 ? 'Удалить выбранные страницы?' : 'Удалить страницу?', 'Это действие нельзя отменить.', [
      { text: 'Отменить', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => { void perform(async document => {
        const pages = document.pages.filter(page => !ids.includes(page.id));
        if (!pages.length) return;
        const currentId = document.pages[latest.current.activePage ?? 0]?.id;
        await save(document, pages);
        const preserved = pages.findIndex(page => page.id === currentId);
        latest.current.onSelectPage?.(preserved >= 0 ? preserved : Math.min(latest.current.activePage ?? 0, pages.length - 1));
      }); } },
    ]),
    export: ids => { void perform(async () => { setExportIds(ids); }); },
    outline: (entries: OutlineEntry[]) => { void perform(async document => {
      const next = await repository.saveNotebook({ ...await repository.readNotebook(document.id), outline: entries });
      if (latest.current.notebook?.id === document.id) latest.current.onNotebookChange?.(next);
    }); },
  }), [add, clear, perform, save, update]);
  const print = useCallback((ids: string[]) => { void perform(document => printNotebook(repository.packageDirectory(document.id).uri, document, ids)); }, [perform]);

  const home = useCallback(() => { void perform(async () => { router.dismissTo('/'); }); }, [perform]);
  const switchTab = useCallback((id: string) => {
    if (id === latest.current.notebook?.id) return;
    void perform(async () => { router.setParams({ id }); });
  }, [perform]);
  const closeTab = useCallback((id: string) => { void perform(async document => {
    const remaining = getOpenTabs().filter(tab => tab.id !== id);
    publishTabs(remaining);
    if (id !== document.id) return;
    if (remaining.length) router.setParams({ id: remaining[remaining.length - 1].id });
    else router.dismissTo('/');
  }); }, [perform]);
  const rename = useCallback((title: string) => perform(async document => {
    const next = await repository.updateItem(document.id, { title });
    if (latest.current.notebook?.id === document.id) latest.current.onNotebookChange?.(next);
  }), [perform]);
  const closeOthers = useCallback(() => { void perform(async document => { publishTabs([{ id: document.id, title: document.title }]); }); }, [perform]);
  const openMove = useCallback(() => { void perform(async () => { setMoving(true); }); }, [perform]);
  const closePanel = useCallback(() => setPanel(undefined), []);
  const togglePanel = (value: 'pages' | 'search') => {
    if (panel === value) setPanel(undefined);
    else { void perform(async () => { setPanel(value); }); }
  };
  const selectFound = useCallback((index: number) => { latest.current.onSelectPage?.(index); }, []);

  if (!notebook) return <View style={{ flex: 1 }}>{toolbar}{children}</View>;
  const page = notebook.pages[activePage];
  const packagePath = repository.packageDirectory(notebook.id).uri.replace(/\/$/, '');
  return <View style={[styles.root, { paddingTop: insets.top }]}>
    <DocumentTabs notebook={notebook} activePage={activePage} readOnly={readOnly} onHome={home} onSwitch={switchTab} onClose={closeTab} onRename={rename} onMove={openMove} onCloseOthers={closeOthers} />
    <GlassView glassEffectStyle="regular" style={styles.toolbar}>
      <Host style={{ width: readOnly ? 248 : 144, height: 44 }}><HStack spacing={2} modifiers={[padding({ horizontal: 6 })]}>
        <ToolbarButton label="Боковое меню" symbol="sidebar.left" selected={panel === 'pages'} onPress={() => togglePanel('pages')} />
        <ToolbarButton label="Поиск" symbol="magnifyingglass" selected={panel === 'search'} onPress={() => togglePanel('search')} />
        <Button onPress={() => { void perform(async () => { latest.current.onReadOnlyChange?.(!readOnly); }); }} modifiers={[buttonStyle('plain'), accessibilityLabel(readOnly ? 'Только чтение. Включить редактирование' : 'Режим редактирования. Включить только чтение')]}>
          {readOnly
            ? <HStack spacing={6} modifiers={[padding({ horizontal: 12 }), frame({ height: 32 }), background('#FFE7D6', shapes.capsule())]}>
              <Symbol systemName="eye" size={14} color="#C25400" /><NativeText modifiers={[font({ size: 14, weight: 'medium' }), foregroundStyle('#C25400')]}>Только чтение</NativeText>
            </HStack>
            : <Symbol systemName="pencil.and.scribble" size={18} color="#2A2F2E" modifiers={[frame({ width: 40, height: 44 })]} />}
        </Button>
      </HStack></Host>
      <View style={styles.center}>{!readOnly && toolbar}</View>
      <Host style={{ width: readOnly ? 96 : 136, height: 44 }}><HStack spacing={2} modifiers={[padding({ horizontal: 6 })]}>
        {!readOnly && <AddPagePopover currentPattern={page.paper.pattern} paperColor={page.paper.color} onAddImage={addImagePage} onImport={importPages}
          onAdd={(position, template) => add(position === 'last' ? notebook.pages.length : activePage + (position === 'after' ? 1 : 0), activePage, template)} />}
        <Menu label={<Symbol systemName="square.and.arrow.up" size={18} color="#2A2F2E" modifiers={[frame({ width: 40, height: 44 })]} />} modifiers={[buttonStyle('plain'), accessibilityLabel('Поделиться')]}>
          <Button label="Экспортировать эту страницу" systemImage="doc" onPress={() => actions.export([page.id])} />
          <Button label="Экспортировать все страницы" systemImage="doc.on.doc" onPress={() => actions.export([])} />
          <Button label="Печать" systemImage="printer" onPress={() => print([])} />
        </Menu>
        <MorePopover page={page} index={activePage} count={notebook.pages.length} thumbnail={`${packagePath}/thumbnails/${page.id}.png?v=${thumbnailRevision}`}
          inOutline={!!notebook.outline?.some(entry => entry.pageId === page.id)} horizontal={settings.horizontal}
          onBookmark={() => actions.bookmark(activePage)} onRotate={degrees => actions.rotate(activePage, degrees)}
          onTemplate={template => update(activePage, current => { const paper = { ...current.paper, ...template }; return current.background.kind === 'paper' ? { paper, background: { kind: 'paper', paper } } : { paper }; })}
          onGo={actions.select} onOutline={() => actions.outline([...(notebook.outline ?? []), { id: `${page.id}-${Date.now()}`, title: `Страница ${activePage + 1}`, pageId: page.id }])}
          onHorizontal={horizontal => saveSettings({ ...settings, horizontal })}
          onErase={readOnly ? undefined : props.onEraseElements} onClear={props.onClearPage || props.onClearPageAt ? () => clear(activePage) : undefined} onRemove={() => actions.remove([page.id])} />
      </HStack></Host>
    </GlassView>
    <View style={styles.content}>
      {panel === 'pages' && <PagesSidebar key={notebook.id} notebook={notebook} activePage={activePage} revision={thumbnailRevision} packagePath={packagePath} onClose={closePanel} actions={actions} canClear={!!(props.onClearPage || props.onClearPageAt)} canClearInactive={!!props.onClearPageAt} />}
      {panel === 'search' && <SearchPanel key={notebook.id} notebook={notebook} packagePath={packagePath} activePage={activePage} onSelect={selectFound} onClose={closePanel} />}
      <View style={styles.document}>{children}</View>
    </View>
    {exportIds && <ExportSheet title={notebook.title} scope={!exportIds.length ? 'all' : exportIds.length === 1 ? 'page' : 'selected'} onCancel={() => setExportIds(undefined)} onExport={(title, format, background, annotations) => {
      const ids = exportIds;
      setExportIds(undefined);
      void perform(document => (format === 'pdf' ? shareNotebookPDF : shareNotebookImages)(repository.packageDirectory(document.id).uri, { ...document, title }, ids, background, annotations));
    }} />}
    {moving && <FolderSheet parentId={notebook.parentId} onCancel={() => setMoving(false)} onSelect={id => perform(async document => {
      await repository.moveItem(document.id, id);
      const next = await repository.readNotebook(document.id);
      if (latest.current.notebook?.id === document.id) latest.current.onNotebookChange?.(next);
      setMoving(false);
    })} />}
    {busy && <Host pointerEvents="none" style={styles.status}><HStack spacing={10} modifiers={[padding({ horizontal: 18, vertical: 12 }), glassEffect({ shape: 'capsule' })]}><ProgressView /><NativeText>Подготовка…</NativeText></HStack></Host>}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F6F5' },
  toolbar: { height: 44, marginHorizontal: 8, marginTop: 2, borderRadius: 22, flexDirection: 'row', alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0 },
  content: { flex: 1, flexDirection: 'row' },
  document: { flex: 1, minWidth: 0 },
  status: { position: 'absolute', bottom: 32, width: 184, height: 48, alignSelf: 'center' },
});
