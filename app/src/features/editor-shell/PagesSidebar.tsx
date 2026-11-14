import { Button, Host, HStack, Image as Symbol, Menu, Picker, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonStyle, disabled, font, foregroundStyle, frame, labelStyle, padding, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { memo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import type { NotebookManifest, OutlineEntry } from '../../shared/documents/types';
import { RotationMenu } from './MorePopover';

export type PageActions = {
  select: (index: number) => void;
  add: (index: number, sourceIndex?: number) => void;
  bookmark: (index: number) => void;
  duplicate: (index: number) => void;
  rotate: (index: number, degrees: number) => void;
  clear: (index: number) => void;
  remove: (ids: string[]) => void;
  export: (ids: string[]) => void;
  outline: (entries: OutlineEntry[]) => void;
};

export const sidebarWidth = 320;
const cellWidth = 136;

export const PagesSidebar = memo(function PagesSidebar({ notebook, activePage, revision, packagePath, onClose, actions, canClear, canClearInactive }: {
  notebook: NotebookManifest; activePage: number; revision: number; packagePath: string;
  onClose: () => void; actions: PageActions; canClear: boolean; canClearInactive: boolean;
}) {
  const [mode, setMode] = useState<'pages' | 'outline'>('pages');
  const [bookmarks, setBookmarks] = useState(false);
  const [selection, setSelection] = useState<string[] | null>(null);
  const visible = notebook.pages.map((page, index) => ({ page, index })).filter(({ page }) => !bookmarks || page.favorite);
  const outline = (notebook.outline ?? []).filter(entry => notebook.pages.some(page => page.id === entry.pageId));
  const renameEntry = (entry: OutlineEntry) => Alert.prompt('Переименовать раздел', undefined, [
    { text: 'Отменить', style: 'cancel' },
    { text: 'Сохранить', onPress: (value?: string) => { const title = value?.trim(); if (title) actions.outline(outline.map(item => item.id === entry.id ? { ...item, title } : item)); } },
  ], 'plain-text', entry.title);
  const pages = mode === 'pages';
  return <View style={styles.sidebar}>
    <Host style={{ height: pages ? (selection ? 152 : 112) : 112 }}><VStack spacing={10} modifiers={[padding({ horizontal: 16, top: 6 })]}>
      <HStack modifiers={[frame({ height: 40 })]}>
        {selection ? <Button label="Выбрать все" onPress={() => setSelection(visible.map(({ page }) => page.id))} />
          : <Menu label="Параметры страниц" systemImage="ellipsis.circle" modifiers={[labelStyle('iconOnly'), font({ size: 17 }), frame({ width: 36, height: 36 }), disabled(!pages)]}>
            <Button label="Выбрать страницы" systemImage="checkmark.circle" onPress={() => setSelection([])} />
          </Menu>}
        <Spacer /><Text modifiers={[font({ size: 17, weight: 'semibold' })]}>{selection ? `Выбрано: ${selection.length}` : pages ? 'Страницы' : 'Структура'}</Text><Spacer />
        <Button onPress={() => { if (selection) setSelection(null); else onClose(); }} modifiers={[buttonStyle('plain'), accessibilityLabel(selection ? 'Готово' : 'Закрыть боковое меню')]}>
          {selection ? <Text modifiers={[font({ size: 16, weight: 'semibold' }), foregroundStyle('#1F6FE5')]}>Готово</Text>
            : <Symbol systemName="xmark" size={13} color="#5D6362" modifiers={[font({ size: 13, weight: 'semibold' }), frame({ width: 36, height: 36 })]} />}
        </Button>
      </HStack>
      {!selection && <Picker selection={mode} onSelectionChange={value => setMode(value as typeof mode)} modifiers={[pickerStyle('segmented')]}>
        <Text modifiers={[tag('pages')]}>Страницы</Text><Text modifiers={[tag('outline')]}>Структура</Text>
      </Picker>}
      {pages && selection && <HStack spacing={18}>
        <Button label="Экспорт" systemImage="square.and.arrow.up" modifiers={[disabled(!selection.length)]} onPress={() => actions.export(selection)} />
        <Button label="Удалить" systemImage="trash" role="destructive" modifiers={[disabled(!selection.length || selection.length === notebook.pages.length)]} onPress={() => { actions.remove(selection); setSelection(null); }} />
        <Spacer />
      </HStack>}
      {pages && <HStack><Menu label={<HStack spacing={5}><Text modifiers={[font({ size: 14, weight: 'medium' })]}>{bookmarks ? 'Только закладки' : 'Все страницы'}</Text><Symbol systemName="chevron.down" size={10} modifiers={[font({ size: 10, weight: 'semibold' })]} /></HStack>} modifiers={[buttonStyle('bordered'), frame({ height: 30 })]}>
        <Button label="Все страницы" systemImage={!bookmarks ? 'checkmark' : undefined} onPress={() => setBookmarks(false)} />
        <Button label="Только закладки" systemImage={bookmarks ? 'checkmark' : undefined} onPress={() => setBookmarks(true)} />
      </Menu><Spacer /></HStack>}
    </VStack></Host>
    {pages ? <ScrollView style={styles.viewport} contentContainerStyle={styles.grid}>
      {visible.map(({ page, index }) => <View key={page.id} style={styles.cell}>
        <View style={[styles.preview, index === activePage && styles.active]}>
          <Image source={{ uri: `${packagePath}/thumbnails/${page.id}.png?v=${revision}` }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          <Pressable accessibilityRole="button" accessibilityLabel={`Открыть страницу ${index + 1}`} accessibilityState={{ selected: selection ? selection.includes(page.id) : index === activePage }} style={StyleSheet.absoluteFill} onPress={() => {
            if (selection) setSelection(selection.includes(page.id) ? selection.filter(id => id !== page.id) : [...selection, page.id]);
            else actions.select(index);
          }} />
          {selection?.includes(page.id) && <Host pointerEvents="none" style={styles.selection}><Symbol systemName="checkmark.circle.fill" size={28} color="#1F6FE5" /></Host>}
          {!selection && <Host style={styles.bookmark}><Button onPress={() => actions.bookmark(index)} modifiers={[buttonStyle('plain'), accessibilityLabel(page.favorite ? 'Удалить закладку' : 'Добавить закладку')]}>
            <Symbol systemName={page.favorite ? 'bookmark.fill' : 'bookmark'} size={15} color={page.favorite ? '#E5396B' : '#A5ABA9'} modifiers={[frame({ width: 36, height: 36 })]} />
          </Button></Host>}
        </View>
        <Host style={{ height: 36 }}><HStack modifiers={[padding({ leading: 6 })]}>
          <Text modifiers={[font({ size: 12, weight: index === activePage ? 'semibold' : 'regular' }), foregroundStyle(index === activePage ? '#1F6FE5' : '#5D6362')]}>{String(index + 1)}</Text><Spacer />
          {!selection && <Menu label={<Symbol systemName="chevron.down" size={11} color="#5D6362" modifiers={[font({ size: 11, weight: 'semibold' }), frame({ width: 32, height: 32 })]} />} modifiers={[buttonStyle('plain'), accessibilityLabel(`Меню страницы ${index + 1}`)]}>
            <Button label="Добавить страницу перед" systemImage="doc.badge.plus" onPress={() => actions.add(index, index)} />
            <Button label="Добавить страницу после" systemImage="doc.badge.plus" onPress={() => actions.add(index + 1, index)} />
            <Button label="Дублировать" systemImage="plus.square.on.square" onPress={() => actions.duplicate(index)} />
            <RotationMenu onRotate={degrees => actions.rotate(index, degrees)} />
            <Button label="Добавить к структуре" systemImage="list.bullet.indent" modifiers={[disabled(outline.some(entry => entry.pageId === page.id))]} onPress={() => actions.outline([...outline, { id: `${page.id}-${Date.now()}`, title: `Страница ${index + 1}`, pageId: page.id }])} />
            <Button label="Экспорт" systemImage="square.and.arrow.up" onPress={() => actions.export([page.id])} />
            {(canClearInactive || (canClear && index === activePage)) && <Button label="Очистить страницу" systemImage="eraser" role="destructive" onPress={() => actions.clear(index)} />}
            <Button label="Удалить страницу" systemImage="trash" role="destructive" modifiers={[disabled(notebook.pages.length < 2)]} onPress={() => actions.remove([page.id])} />
          </Menu>}
        </HStack></Host>
      </View>)}
      {!visible.length && <View style={styles.empty}><RNText style={styles.emptyText}>Нет страниц с закладками</RNText></View>}
      {!selection && !bookmarks && <View style={styles.cell}><Pressable accessibilityRole="button" accessibilityLabel="Добавить страницу в конец" onPress={() => actions.add(notebook.pages.length)} style={({ pressed }) => [styles.preview, styles.add, pressed && { opacity: 0.6 }]}>
        <Host pointerEvents="none" style={{ width: 28, height: 28 }}><Symbol systemName="plus" size={22} color="#1F6FE5" /></Host>
      </Pressable></View>}
    </ScrollView>
      : <ScrollView style={styles.viewport} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}>
        {outline.length ? outline.map(entry => {
          const index = notebook.pages.findIndex(page => page.id === entry.pageId);
          return <View key={entry.id} style={[styles.entry, index === activePage && styles.entryActive]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${entry.title}, страница ${index + 1}`} onPress={() => actions.select(index)} onLongPress={() => renameEntry(entry)} style={styles.entryTitle}>
              <RNText numberOfLines={1} style={styles.entryText}>{entry.title}</RNText>
              <RNText style={styles.entryPage}>{index + 1}</RNText>
            </Pressable>
            <Host style={{ width: 36, height: 44 }}><Menu label={<Symbol systemName="ellipsis" size={14} color="#5D6362" modifiers={[frame({ width: 36, height: 44 })]} />} modifiers={[buttonStyle('plain'), accessibilityLabel(`Действия с разделом ${entry.title}`)]}>
              <Button label="Переименовать" systemImage="pencil" onPress={() => renameEntry(entry)} />
              <Button label="Удалить из структуры" systemImage="minus.circle" role="destructive" onPress={() => actions.outline(outline.filter(item => item.id !== entry.id))} />
            </Menu></Host>
          </View>;
        }) : <View style={styles.empty}>
          <RNText style={[styles.emptyText, { fontWeight: '600', color: '#2A2F2E', marginBottom: 6 }]}>Структура пуста</RNText>
          <RNText style={styles.emptyText}>Добавьте страницу через «Ещё» или меню миниатюры, чтобы быстро к ней возвращаться.</RNText>
        </View>}
      </ScrollView>}
  </View>;
});

const styles = StyleSheet.create({
  sidebar: { width: sidebarWidth, backgroundColor: '#F7F8F7', borderRightWidth: StyleSheet.hairlineWidth, borderColor: '#D6DBD9' },
  viewport: { flex: 1 },
  grid: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  cell: { width: cellWidth },
  preview: { width: cellWidth, height: Math.round(cellWidth * 1.33), backgroundColor: 'white', borderRadius: 4, borderWidth: 2, borderColor: 'transparent', boxShadow: '0px 1px 4px #0000001A', overflow: 'visible' },
  active: { borderColor: '#1F6FE5' },
  bookmark: { position: 'absolute', top: -2, right: -2, width: 36, height: 36 },
  selection: { position: 'absolute', alignSelf: 'center', top: '42%', width: 32, height: 32 },
  add: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: '#9DBDF0', borderWidth: 1.5, boxShadow: 'none', alignItems: 'center', justifyContent: 'center' },
  empty: { width: '100%', paddingVertical: 40, paddingHorizontal: 24 },
  emptyText: { color: '#6B7271', textAlign: 'center', fontSize: 14, lineHeight: 19 },
  entry: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderRadius: 10, paddingLeft: 12 },
  entryActive: { backgroundColor: '#E6EFFD' },
  entryTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8 },
  entryText: { flex: 1, fontSize: 16, color: '#151716' },
  entryPage: { fontSize: 14, color: '#8A908E', fontVariant: ['tabular-nums'] },
});
