import { Button, Host, HStack, Image as Symbol, Menu, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { buttonStyle, disabled, font, foregroundStyle, frame, labelStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { memo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import type { NotebookManifest } from '../../shared/documents/types';
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
};

export const PagesSidebar = memo(function PagesSidebar({ notebook, activePage, revision, packagePath, onClose, actions, canClear, canClearInactive }: {
  notebook: NotebookManifest; activePage: number; revision: number; packagePath: string;
  onClose: () => void; actions: PageActions; canClear: boolean; canClearInactive: boolean;
}) {
  const [bookmarks, setBookmarks] = useState(false);
  const [selection, setSelection] = useState<string[] | null>(null);
  const visible = notebook.pages.map((page, index) => ({ page, index })).filter(({ page }) => !bookmarks || page.favorite);
  return <View style={styles.sidebar}>
    <View style={styles.header}>
    <Host style={{ height: 64 }}><HStack modifiers={[padding({ horizontal: 24, vertical: 10 })]}>
      {selection ? <Button label="Выбрать все" onPress={() => setSelection(visible.map(({ page }) => page.id))} /> : <Menu label="Параметры страниц" systemImage="ellipsis" modifiers={[labelStyle('iconOnly'), frame({ width: 36, height: 37 })]}>
        <Button label="Выбрать страницы" systemImage="checkmark.circle" onPress={() => setSelection([])} />
      </Menu>}
      <Spacer /><Text modifiers={[font({ textStyle: 'headline' })]}>{selection ? `Выбрано: ${selection.length}` : 'Страницы'}</Text><Spacer />
      <Button label={selection ? 'Готово' : 'Закрыть панель страниц'} systemImage={selection ? 'checkmark' : 'xmark'} modifiers={[labelStyle('iconOnly'), buttonStyle(selection ? 'glassProminent' : 'plain'), frame({ width: 36, height: 37 })]} onPress={() => { if (selection) setSelection(null); else onClose(); }} />
    </HStack></Host>
    <Host style={{ height: selection ? 92 : 44 }}><VStack alignment="leading" spacing={8} modifiers={[padding({ horizontal: 24 })]}>
      {selection && <HStack spacing={18}>
        <Button label="Экспорт" systemImage="square.and.arrow.up" modifiers={[disabled(!selection.length)]} onPress={() => actions.export(selection)} />
        <Button label="Удалить" systemImage="trash" role="destructive" modifiers={[disabled(!selection.length || selection.length === notebook.pages.length)]} onPress={() => { actions.remove(selection); setSelection(null); }} />
      </HStack>}
      <HStack><Menu label={<HStack spacing={6}><Text>{bookmarks ? 'Только закладки' : 'Все страницы'}</Text><Symbol systemName="chevron.down" size={12} /></HStack>} modifiers={[buttonStyle('bordered')]}>
        <Button label="Все страницы" systemImage={!bookmarks ? 'checkmark' : undefined} onPress={() => setBookmarks(false)} />
        <Button label="Только закладки" systemImage={bookmarks ? 'checkmark' : undefined} onPress={() => setBookmarks(true)} />
      </Menu><Spacer /></HStack>
    </VStack></Host>
    </View>
    <View style={styles.viewport}><ScrollView contentContainerStyle={styles.grid}>
      {visible.map(({ page, index }) => <View key={page.id} style={styles.cell}>
        <View style={[styles.preview, index === activePage && styles.active]}>
          <Image source={{ uri: `${packagePath}/thumbnails/${page.id}.png?v=${revision}` }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          <Pressable accessibilityRole="button" accessibilityLabel={`Открыть страницу ${index + 1}`} accessibilityState={{ selected: selection ? selection.includes(page.id) : index === activePage }} style={StyleSheet.absoluteFill} onPress={() => {
            if (selection) setSelection(selection.includes(page.id) ? selection.filter(id => id !== page.id) : [...selection, page.id]);
            else actions.select(index);
          }} />
          {selection?.includes(page.id) && <Host pointerEvents="none" style={styles.selection}><Text modifiers={[font({ size: 30 })]}>✓</Text></Host>}
          {!selection && <Host style={styles.bookmark}><Button label={page.favorite ? 'Удалить закладку' : 'Добавить закладку'} systemImage={page.favorite ? 'bookmark.fill' : 'bookmark'} modifiers={[labelStyle('iconOnly'), buttonStyle('plain'), frame({ width: 44, height: 44 })]} onPress={() => actions.bookmark(index)} /></Host>}
        </View>
        <Host style={{ height: 48 }}><HStack modifiers={[padding({ leading: 12 })]}>
          <Text modifiers={[font({ size: 12 })]}>{String(index + 1)}</Text><Spacer />
          {!selection && <Menu label={`Меню страницы ${index + 1}`} systemImage="chevron.down" modifiers={[labelStyle('iconOnly'), frame({ width: 45, height: 45 })]}>
            <Button label="Добавить страницу перед" systemImage="doc.badge.plus" onPress={() => actions.add(index, index)} />
            <Button label="Добавить страницу после" systemImage="doc.badge.plus" onPress={() => actions.add(index + 1, index)} />
            <Button label="Дублировать" systemImage="doc.on.doc" onPress={() => actions.duplicate(index)} />
            <RotationMenu onRotate={degrees => actions.rotate(index, degrees)} />
            <Button label="Экспорт" systemImage="square.and.arrow.up" onPress={() => actions.export([page.id])} />
            {(canClearInactive || (canClear && index === activePage)) && <Button label="Очистить страницу" role="destructive" onPress={() => actions.clear(index)} />}
            <Button label="Удалить страницу" role="destructive" modifiers={[disabled(notebook.pages.length < 2)]} onPress={() => actions.remove([page.id])} />
          </Menu>}
        </HStack></Host>
      </View>)}
      {!visible.length && <View style={styles.empty}><RNText style={{ color: '#697271', textAlign: 'center' }}>Нет страниц с закладками</RNText></View>}
      {!selection && <View style={styles.cell}><View style={[styles.preview, styles.add]}><Host style={{ flex: 1 }}><Button label="Добавить страницу в конец" systemImage="plus" modifiers={[labelStyle('iconOnly'), buttonStyle('plain'), foregroundStyle('#0089FF'), frame({ width: 150, height: 175 })]} onPress={() => actions.add(notebook.pages.length)} /></Host></View></View>}
    </ScrollView></View>
  </View>;
});

const styles = StyleSheet.create({
  sidebar: { width: 375, backgroundColor: '#F7F8F7', borderRightWidth: StyleSheet.hairlineWidth, borderColor: '#D6DBD9' },
  header: { backgroundColor: '#F7F8F7', zIndex: 1, paddingBottom: 12 },
  viewport: { flex: 1, overflow: 'hidden' },
  grid: { padding: 16, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 23 },
  cell: { width: 160, height: 241, paddingTop: 3 },
  preview: { width: 158, height: 183, padding: 2, marginHorizontal: 1, backgroundColor: 'white', borderWidth: 2, borderColor: 'transparent', boxShadow: '0px 2px 4px #00000012' },
  active: { borderColor: '#0089FF' },
  bookmark: { position: 'absolute', top: -9, right: -4, width: 44, height: 44 },
  selection: { position: 'absolute', alignSelf: 'center', top: 66, width: 40, height: 40, backgroundColor: '#D9EEFF', borderRadius: 20 },
  add: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: '#0089FF', boxShadow: 'none' },
  empty: { width: '100%', paddingVertical: 32 },
});
