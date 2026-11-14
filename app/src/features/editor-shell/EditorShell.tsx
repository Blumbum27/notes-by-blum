import { Button, Host, HStack, Menu, ProgressView, Text as NativeText } from '@expo/ui/swift-ui';
import { buttonStyle, frame, glassEffect, labelStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { GlassView } from 'expo-glass-effect';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shareNotebookImages, shareNotebookPDF } from '../../../modules/notes-canvas/rendering';
import * as repository from '../../shared/documents/repository';
import type { NotebookManifest, NotebookPage, Paper } from '../../shared/documents/types';
import { AddPagePopover } from './AddPagePopover';
import { DocumentTabs, getOpenTabs, publishTabs } from './DocumentTabs';
import { ExportSheet } from './ExportSheet';
import { FolderSheet } from './FolderSheet';
import { MorePopover } from './MorePopover';
import { PagesSidebar, type PageActions } from './PagesSidebar';

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
}>;

export function EditorShell(props: EditorShellProps) {
  const { children, toolbar, notebook, activePage = 0, readOnly = false, thumbnailRevision } = props;
  const insets = useSafeAreaInsets();
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; });
  const [sidebar, setSidebar] = useState(false);
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

  const add = useCallback((index: number, sourceIndex?: number, pattern?: Paper) => {
    void perform(async document => {
      const source = document.pages[sourceIndex ?? latest.current.activePage ?? 0];
      const paper = { ...source.paper, ...(pattern ? { pattern } : {}) };
      const pages = [...document.pages];
      pages.splice(index, 0, repository.createPage(paper));
      await save(document, pages);
      latest.current.onSelectPage?.(index);
    });
  }, [perform, save]);

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
  }), [add, clear, perform, save, update]);

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
  const closeSidebar = useCallback(() => setSidebar(false), []);

  if (!notebook) return <View style={{ flex: 1 }}>{toolbar}{children}</View>;
  const page = notebook.pages[activePage];
  const packagePath = repository.packageDirectory(notebook.id).uri.replace(/\/$/, '');
  return <View style={[styles.root, { paddingTop: insets.top }]}>
    <DocumentTabs notebook={notebook} activePage={activePage} readOnly={readOnly} onHome={home} onSwitch={switchTab} onClose={closeTab} onRename={rename} onMove={openMove} onCloseOthers={closeOthers} />
    <GlassView glassEffectStyle="regular" style={styles.toolbar}>
      <Host style={{ width: readOnly ? 202 : 92, height: 44 }}><HStack spacing={8} modifiers={[padding({ horizontal: 4 })]}>
        <Button label="Боковая панель страниц" systemImage="sidebar.left" modifiers={[labelStyle('iconOnly'), buttonStyle(sidebar ? 'bordered' : 'plain'), frame({ width: 36, height: 36 })]} onPress={() => {
          if (sidebar) setSidebar(false);
          else { void perform(async () => { setSidebar(true); }); }
        }} />
        <Button label={readOnly ? 'Только чтение' : 'Режим редактирования'} systemImage={readOnly ? 'doc.text' : 'pencil.tip'} modifiers={[...(readOnly ? [] : [labelStyle('iconOnly')]), buttonStyle('bordered'), frame({ width: readOnly ? 146 : 36, height: 36 })]} onPress={() => { void perform(async () => { latest.current.onReadOnlyChange?.(!readOnly); }); }} />
      </HStack></Host>
      <View style={styles.center}>{!readOnly && toolbar}</View>
      <Host style={{ width: readOnly ? 92 : 136, height: 44 }}><HStack spacing={8} modifiers={[padding({ horizontal: 4 })]}>
        {!readOnly && <AddPagePopover currentPattern={page.paper.pattern} paperColor={page.paper.color} onAdd={(position, pattern) => add(position === 'last' ? notebook.pages.length : activePage + (position === 'after' ? 1 : 0), activePage, pattern)} />}
        <Menu label="Поделиться" systemImage="square.and.arrow.up" modifiers={[labelStyle('iconOnly'), frame({ width: 36, height: 36 })]}>
          <Button label="Экспортировать эту страницу" onPress={() => actions.export([page.id])} />
          <Button label="Экспортировать все" onPress={() => actions.export([])} />
        </Menu>
        <MorePopover page={page} index={activePage} count={notebook.pages.length} thumbnail={`${packagePath}/thumbnails/${page.id}.png?v=${thumbnailRevision}`} onBookmark={() => actions.bookmark(activePage)} onRotate={degrees => actions.rotate(activePage, degrees)} onTemplate={pattern => update(activePage, current => { const paper = { ...current.paper, pattern }; return { paper, background: { kind: 'paper', paper } }; })} onGo={actions.select} onClear={props.onClearPage || props.onClearPageAt ? () => clear(activePage) : undefined} onRemove={() => actions.remove([page.id])} />
      </HStack></Host>
    </GlassView>
    <View style={styles.content}>
      {sidebar && <PagesSidebar key={notebook.id} notebook={notebook} activePage={activePage} revision={thumbnailRevision} packagePath={packagePath} onClose={closeSidebar} actions={actions} canClear={!!(props.onClearPage || props.onClearPageAt)} canClearInactive={!!props.onClearPageAt} />}
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
  toolbar: { height: 44, marginHorizontal: 4, borderRadius: 22, flexDirection: 'row', alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0 },
  content: { flex: 1, flexDirection: 'row' },
  document: { flex: 1, minWidth: 0 },
  status: { position: 'absolute', bottom: 32, width: 184, height: 48, alignSelf: 'center' },
});
