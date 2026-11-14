import { BottomSheet, Button, Divider, Form, Host, HStack, Menu, NavigationStack, Picker, Section, Spacer, Text as NativeText, TextField, Toolbar, ToolbarItem } from '@expo/ui/swift-ui';
import { buttonBorderShape, buttonStyle, disabled, labelStyle, navigationBarTitleDisplayMode, navigationTitle, padding, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Stack, router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, PlatformColor, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SearchBarCommands } from 'react-native-screens';
import Animated, { FadeOut, LayoutAnimationConfig, LinearTransition } from 'react-native-reanimated';
import { documentImport } from '../../../modules/document-import';
import * as repository from '../../shared/documents/repository';
import { defaultPaper, paperColorNames, paperNames, paperOrder, paperSizes, type LibraryItem, type PaperSettings } from '../../shared/documents/types';
import { LibraryCell } from './LibraryCell';
import type { MenuGroups } from './menus';

type Mode = 'documents' | 'favorites' | 'search' | 'trash';
type Filter = 'all' | LibraryItem['kind'];
type SortKey = 'title' | 'kind' | 'createdAt' | 'modifiedAt';
type ViewOptions = { list: boolean; sort: SortKey; ascending: boolean };

let viewOptions: ViewOptions = { list: false, sort: 'modifiedAt', ascending: false };
const viewListeners = new Set<() => void>();
const setViewOptions = (value: Partial<ViewOptions>) => { viewOptions = { ...viewOptions, ...value }; viewListeners.forEach(listener => listener()); };
const subscribeViewOptions = (listener: () => void) => { viewListeners.add(listener); return () => { viewListeners.delete(listener); }; };

const coverColors = { '#4377A8': 'Синий', '#E65A64': 'Красный', '#E3AD43': 'Жёлтый', '#6C9E76': 'Зелёный' };
const sortLabels: Record<SortKey, string> = { createdAt: 'Дата создания', modifiedAt: 'Последнее изменение', title: 'Имя', kind: 'Тип' };
const filterLabels: Record<Filter, string> = { all: 'Все', notebook: 'Документы', folder: 'Папки' };
const gap = 20;
const animation = LinearTransition.duration(260);

export default function LibraryScreen({ mode, folderId }: { mode: Mode; folderId?: string }) {
  const { list, sort, ascending } = useSyncExternalStore(subscribeViewOptions, () => viewOptions);
  const [width, setWidth] = useState(0);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState<LibraryItem['kind'] | null>(null);
  const [title, setTitle] = useState('');
  const [paper, setPaper] = useState(defaultPaper);
  const [cover, setCover] = useState('#4377A8');
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [moveSearch, setMoveSearch] = useState('');
  const [selection, setSelection] = useState<string[] | null>(null);
  const parentId = folderId ?? null;
  const trash = mode === 'trash';

  const refresh = useCallback(() => repository.listItems().then(setItems), []);
  const searchBar = useRef<SearchBarCommands>(null);
  useFocusEffect(useCallback(() => {
    if (mode !== 'search') return;
    const frame = requestAnimationFrame(() => searchBar.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [mode]));
  useFocusEffect(useCallback(() => { void refresh().catch(() => Alert.alert('Не удалось открыть библиотеку', 'Вернитесь в библиотеку и попробуйте ещё раз. Документы не удалены.')); }, [refresh]));
  const perform = async (action: () => Promise<unknown>) => {
    try { await action(); await refresh(); } catch { Alert.alert('Не удалось выполнить действие', 'Изменения не завершены. Проверьте доступ к файлу и попробуйте ещё раз.'); }
  };
  const importFile = () => perform(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    const kind = asset.mimeType === 'application/pdf' || asset.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image';
    await repository.importDocument({ ...asset, kind, pageCount: kind === 'pdf' ? await documentImport.pdfPageCount(asset.uri) : 1 }, parentId);
  });
  const importPhoto = () => perform(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
    if (result.canceled) return;
    const asset = result.assets[0];
    await repository.importDocument({ uri: asset.uri, name: asset.fileName || 'Изображение.jpg', kind: 'image' }, parentId);
  });

  const folder = items.find(item => item.id === parentId);
  const query = search.trim().toLocaleLowerCase();
  const visible = items.filter(item => {
    if (trash ? !item.deletedAt : repository.isInTrash(item, items)) return false;
    if (mode === 'favorites' && !item.favorite) return false;
    if (mode === 'documents' && item.parentId !== parentId) return false;
    if (mode === 'search' && !query) return false;
    return (filter === 'all' || item.kind === filter) && item.title.toLocaleLowerCase().includes(query);
  }).sort((a, b) => a[sort].localeCompare(b[sort], 'ru') * (ascending ? 1 : -1));

  const margin = width >= 600 ? 28 : 16;
  const columns = list ? 1 : Math.max(2, Math.floor((width - margin * 2 + gap) / (150 + gap)));
  const cellWidth = list ? width - margin * 2 : Math.floor((width - margin * 2 - gap * (columns - 1)) / columns);

  const rename = (item: LibraryItem) => Alert.prompt('Переименовать', undefined, value => {
    if (value.trim()) void perform(() => repository.updateItem(item.id, { title: value.trim() }));
  }, 'plain-text', item.title);
  const startMove = (ids: string[]) => { setMoveSearch(''); setMoveIds(ids); };
  const toggle = (item: LibraryItem) => {
    if (!selection) return;
    void Haptics.selectionAsync();
    setSelection(selection.includes(item.id) ? selection.filter(id => id !== item.id) : [...selection, item.id]);
  };
  const clearTrash = () => Alert.alert('Очистить корзину?', 'Документы будут удалены навсегда.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: () => void perform(async () => {
    for (const item of items.filter(value => value.deletedAt)) { if ((await repository.listItems()).some(value => value.id === item.id)) await repository.deletePermanently(item.id); }
  }) }]);
  const deleteForever = (ids: string[]) => Alert.alert(ids.length > 1 ? 'Удалить навсегда выбранное?' : 'Удалить навсегда?', 'Восстановить документ будет невозможно.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: () => void perform(async () => { for (const id of ids) await repository.deletePermanently(id); setSelection(null); }) }]);
  const setTrashed = (ids: string[], value: boolean) => perform(async () => { for (const id of ids) await repository.updateItem(id, { deletedAt: value ? new Date().toISOString() : null }); setSelection(null); });

  const menu = (item: LibraryItem): MenuGroups => trash
    ? [[{ title: 'Восстановить', icon: 'arrow.uturn.backward', onPress: () => void setTrashed([item.id], false) }], [{ title: 'Удалить навсегда', icon: 'trash', destructive: true, onPress: () => deleteForever([item.id]) }]]
    : [[
      { title: 'Переименовать', icon: 'pencil', onPress: () => rename(item) },
      { title: item.favorite ? 'Убрать из избранного' : 'В избранное', icon: item.favorite ? 'star.slash' : 'star', onPress: () => void perform(() => repository.updateItem(item.id, { favorite: !item.favorite })) },
      { title: 'Дублировать', icon: 'plus.square.on.square', onPress: () => void perform(() => repository.duplicateItem(item.id)) },
      ...(item.kind === 'folder' ? [{ title: 'Цвет папки', icon: 'paintpalette' as const, children: Object.entries(coverColors).map(([color, name]) => ({ title: name, isOn: item.cover === color, onPress: () => void perform(() => repository.updateItem(item.id, { cover: color })) })) }] : []),
      { title: 'Переместить', icon: 'folder', onPress: () => startMove([item.id]) },
    ], [{ title: 'В корзину', icon: 'trash', destructive: true, onPress: () => void setTrashed([item.id], true) }]];

  const screenTitle = selection ? (selection.length ? `Выбрано: ${selection.length}` : 'Выберите объекты')
    : folder?.title ?? { documents: 'Документы', favorites: 'Избранное', search: 'Поиск', trash: 'Корзина' }[mode];
  const allSelected = !!selection && visible.length > 0 && visible.every(item => selection.includes(item.id));
  const empty = query ? { icon: 'magnifyingglass', title: 'Ничего не найдено', text: 'Попробуйте другое название.' } as const
    : mode === 'search' ? { icon: 'magnifyingglass', title: 'Поиск по названиям', text: 'Введите название документа или папки.' } as const
    : trash ? { icon: 'trash', title: 'Корзина пуста', text: 'Удалённые документы появятся здесь.' } as const
    : mode === 'favorites' ? { icon: 'star', title: 'В избранном пока ничего нет', text: 'Добавляйте документы и папки через их меню.' } as const
    : folder ? { icon: 'folder', title: 'Папка пуста', text: 'Создайте блокнот или папку, или импортируйте файл.' } as const
    : { icon: 'book.closed', title: 'Здесь пока нет документов', text: 'Создайте блокнот, папку или импортируйте файл.' } as const;

  const controls = mode !== 'search' && <Host matchContents={{ vertical: true }} style={{ marginHorizontal: list ? -4 : margin - 4, marginBottom: list ? 4 : 16 }}><HStack spacing={12} modifiers={[padding({ vertical: 4 })]}>
    <Menu label={filterLabels[filter]} systemImage="line.3.horizontal.decrease" modifiers={[buttonStyle('glass')]}>
      <Picker label="Показать" selection={filter} onSelectionChange={value => setFilter(value as Filter)} modifiers={[pickerStyle('inline')]}>
        {Object.entries(filterLabels).map(([value, name]) => <NativeText key={value} modifiers={[tag(value)]}>{name}</NativeText>)}
      </Picker>
    </Menu>
    <Spacer />
    {mode === 'documents' && <Menu label="Создать" systemImage="plus" modifiers={[buttonStyle('glassProminent'), disabled(!!selection)]}>
      <Button label="Блокнот" systemImage="book.closed" onPress={() => { setTitle(''); setCreating('notebook'); }} />
      <Button label="Папка" systemImage="folder.badge.plus" onPress={() => { setTitle(''); setCreating('folder'); }} />
      <Divider />
      <Button label="Импорт PDF или изображения" systemImage="square.and.arrow.down" onPress={() => void importFile()} />
      <Button label="Изображение из Фото" systemImage="photo" onPress={() => void importPhoto()} />
    </Menu>}
    <Menu label="Вид" systemImage={list ? 'list.bullet' : 'square.grid.2x2'} modifiers={[labelStyle('iconOnly'), buttonStyle('glass'), buttonBorderShape('circle'), disabled(!!selection)]}>
      <Button label="Выбор элементов" systemImage="checkmark.circle" onPress={() => setSelection([])} />
      <Picker label="Вид" selection={list ? 'list' : 'grid'} onSelectionChange={value => setViewOptions({ list: value === 'list' })} modifiers={[pickerStyle('inline')]}>
        <NativeText modifiers={[tag('grid')]}>Сетка</NativeText><NativeText modifiers={[tag('list')]}>Список</NativeText>
      </Picker>
      <Section title="Сортировка">
        <Picker label="Сортировка" selection={sort} onSelectionChange={value => setViewOptions({ sort: value as SortKey, ascending: value === 'title' || value === 'kind' })} modifiers={[pickerStyle('inline')]}>
          {(Object.keys(sortLabels) as SortKey[]).map(key => <NativeText key={key} modifiers={[tag(key)]}>{sortLabels[key]}</NativeText>)}
        </Picker>
        <Picker label="Порядок" selection={ascending ? 'up' : 'down'} onSelectionChange={value => setViewOptions({ ascending: value === 'up' })} modifiers={[pickerStyle('inline')]}>
          <NativeText modifiers={[tag('up')]}>{sort === 'title' || sort === 'kind' ? 'От А до Я' : 'Сначала старые'}</NativeText>
          <NativeText modifiers={[tag('down')]}>{sort === 'title' || sort === 'kind' ? 'От Я до А' : 'Сначала новые'}</NativeText>
        </Picker>
      </Section>
    </Menu>
  </HStack></Host>;

  const moveTo = (target: string | null) => void perform(async () => { for (const id of moveIds ?? []) await repository.moveItem(id, target); setMoveIds(null); setSelection(null); });
  const createConfirm = () => void perform(async () => {
    if (!creating) return;
    const created = await repository.createItem(title, creating, parentId, cover, paper);
    setCreating(null);
    if (created.kind === 'notebook') router.push({ pathname: '/notebook/[id]', params: { id: created.id } });
  });

  return <SafeAreaView edges={['left', 'right']} style={styles.root}><View style={styles.fill} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <Stack.Screen options={{ title: screenTitle,
      headerSearchBarOptions: mode === 'search' ? { placeholder: 'Поиск по названиям', placement: 'stacked', ref: searchBar, hideNavigationBar: false, hideWhenScrolling: false, obscureBackground: false, onChangeText: event => setSearch(event.nativeEvent.text) } : undefined }} />
    {selection ? <>
      <Stack.Toolbar placement="left"><Stack.Toolbar.Button onPress={() => setSelection(allSelected ? [] : visible.map(item => item.id))}>{allSelected ? 'Снять выбор' : 'Выбрать все'}</Stack.Toolbar.Button></Stack.Toolbar>
      <Stack.Toolbar placement="right"><Stack.Toolbar.Button icon="checkmark" variant="done" accessibilityLabel="Готово" onPress={() => setSelection(null)} /></Stack.Toolbar>
      <Stack.Toolbar placement="bottom">
        {trash ? <>
          <Stack.Toolbar.Button icon="arrow.uturn.backward" disabled={!selection.length} onPress={() => void setTrashed(selection, false)}>Восстановить</Stack.Toolbar.Button>
          <Stack.Toolbar.Spacer />
          <Stack.Toolbar.Button icon="trash" tintColor={PlatformColor('systemRed')} disabled={!selection.length} onPress={() => deleteForever(selection)}>Удалить навсегда</Stack.Toolbar.Button>
        </> : <>
          <Stack.Toolbar.Button icon="plus.square.on.square" disabled={!selection.length} onPress={() => void perform(async () => { for (const id of selection) await repository.duplicateItem(id); setSelection(null); })}>Дублировать</Stack.Toolbar.Button>
          <Stack.Toolbar.Spacer />
          <Stack.Toolbar.Button icon="folder" disabled={!selection.length} onPress={() => startMove(selection)}>Переместить</Stack.Toolbar.Button>
          <Stack.Toolbar.Spacer />
          <Stack.Toolbar.Button icon="trash" tintColor={PlatformColor('systemRed')} disabled={!selection.length} onPress={() => void setTrashed(selection, true)}>В корзину</Stack.Toolbar.Button>
        </>}
      </Stack.Toolbar>
    </> : trash ? <>
      <Stack.Toolbar placement="left"><Stack.Toolbar.Button icon="xmark" accessibilityLabel="Закрыть" onPress={() => router.back()} /></Stack.Toolbar>
      <Stack.Toolbar placement="right"><Stack.Toolbar.Button tintColor={PlatformColor('systemRed')} disabled={!visible.length} onPress={clearTrash}>Очистить</Stack.Toolbar.Button></Stack.Toolbar>
    </> : <Stack.Toolbar placement="right">
      <Stack.Toolbar.Menu icon="person.crop.circle" accessibilityLabel="Меню">
        <Stack.Toolbar.MenuAction icon="gearshape" onPress={() => router.push('/settings')}>Настройки</Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction icon="trash" onPress={() => router.push('/trash')}>Корзина</Stack.Toolbar.MenuAction>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>}
    {width > 0 && <LayoutAnimationConfig key={`${columns}-${mode}`} skipEntering>
      <Animated.FlatList key={columns} numColumns={columns} data={visible} keyExtractor={item => item.id} contentInsetAdjustmentBehavior="automatic" keyboardDismissMode="on-drag"
        itemLayoutAnimation={animation} ListHeaderComponent={controls || null}
        columnWrapperStyle={columns > 1 ? { gap, paddingHorizontal: margin } : undefined}
        contentContainerStyle={[styles.content, columns === 1 && { paddingHorizontal: margin }]}
        ItemSeparatorComponent={columns > 1 ? () => <View style={{ height: 28 }} /> : null}
        ListEmptyComponent={<View style={styles.empty}><SymbolView name={empty.icon} size={44} tintColor={PlatformColor('tertiaryLabel')} style={styles.emptyIcon} /><Text style={styles.emptyTitle}>{empty.title}</Text><Text style={styles.emptyText}>{empty.text}</Text></View>}
        renderItem={({ item }) => <Animated.View exiting={FadeOut.duration(160)}>
          <LibraryCell item={item} width={cellWidth} list={list} menu={menu(item)} selected={selection ? selection.includes(item.id) : undefined}
            href={selection || trash ? undefined : item.kind === 'folder' ? { pathname: '/folder/[id]', params: { id: item.id } } : { pathname: '/notebook/[id]', params: { id: item.id } }}
            zoom={item.kind === 'notebook'} onPress={selection ? () => toggle(item) : undefined} />
        </Animated.View>} />
    </LayoutAnimationConfig>}
    <Host style={styles.sheetHost}>
      <BottomSheet isPresented={creating !== null} onIsPresentedChange={value => { if (!value) setCreating(null); }}>
        <NavigationStack><Toolbar modifiers={[navigationTitle(creating === 'folder' ? 'Новая папка' : 'Новый блокнот'), navigationBarTitleDisplayMode('inline')]}>
          <Form>
            <Section>
              <TextField autoFocus placeholder={creating === 'folder' ? 'Новая папка' : 'Новый блокнот'} onTextChange={setTitle} />
              <Picker label={creating === 'folder' ? 'Цвет' : 'Обложка'} selection={cover} onSelectionChange={setCover}>{Object.entries(coverColors).map(([value, name]) => <NativeText key={value} modifiers={[tag(value)]}>{name}</NativeText>)}</Picker>
            </Section>
            {creating === 'notebook' && <Section title="Бумага">
              <Picker label="Шаблон" selection={paper.pattern} onSelectionChange={value => setPaper({ ...paper, pattern: value as PaperSettings['pattern'] })}>{paperOrder.map(value => <NativeText key={value} modifiers={[tag(value)]}>{paperNames[value]}</NativeText>)}</Picker>
              <Picker label="Цвет бумаги" selection={paper.color} onSelectionChange={value => setPaper({ ...paper, color: value as PaperSettings['color'] })}>{(Object.keys(paperColorNames) as PaperSettings['color'][]).map(value => <NativeText key={value} modifiers={[tag(value)]}>{paperColorNames[value]}</NativeText>)}</Picker>
              <Picker label="Размер" selection={paper.size} onSelectionChange={value => setPaper({ ...paper, size: value as PaperSettings['size'] })}>{paperSizes.map(value => <NativeText key={value} modifiers={[tag(value)]}>{value}</NativeText>)}</Picker>
              <Picker label="Ориентация" selection={paper.orientation} modifiers={[pickerStyle('segmented')]} onSelectionChange={value => setPaper({ ...paper, orientation: value as PaperSettings['orientation'] })}><NativeText modifiers={[tag('portrait')]}>Портрет</NativeText><NativeText modifiers={[tag('landscape')]}>Альбом</NativeText></Picker>
            </Section>}
          </Form>
          <Toolbar.Content>
            <ToolbarItem placement="cancellationAction"><Button label="Отмена" onPress={() => setCreating(null)} /></ToolbarItem>
            <ToolbarItem placement="confirmationAction"><Button label="Создать" onPress={createConfirm} /></ToolbarItem>
          </Toolbar.Content>
        </Toolbar></NavigationStack>
      </BottomSheet>
      <BottomSheet isPresented={moveIds !== null} onIsPresentedChange={value => { if (!value) setMoveIds(null); }}>
        <NavigationStack><Toolbar modifiers={[navigationTitle(moveIds && moveIds.length > 1 ? `Переместить: ${moveIds.length}` : 'Переместить'), navigationBarTitleDisplayMode('inline')]}>
          <Form>
            <Section><TextField placeholder="Поиск папки" onTextChange={setMoveSearch} /></Section>
            <Section title="Куда">
              <Button label="Документы" systemImage="folder" onPress={() => moveTo(null)} />
              {items.filter(item => item.kind === 'folder' && !repository.isInTrash(item, items) && !moveIds?.includes(item.id) && item.title.toLocaleLowerCase().includes(moveSearch.trim().toLocaleLowerCase()))
                .map(item => <Button key={item.id} label={item.title} systemImage="folder" onPress={() => moveTo(item.id)} />)}
            </Section>
          </Form>
          <Toolbar.Content><ToolbarItem placement="cancellationAction"><Button label="Отмена" onPress={() => setMoveIds(null)} /></ToolbarItem></Toolbar.Content>
        </Toolbar></NavigationStack>
      </BottomSheet>
    </Host>
  </View></SafeAreaView>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  root: { flex: 1, backgroundColor: PlatformColor('systemBackground') },
  content: { paddingTop: 8, paddingBottom: 32 },
  empty: { paddingHorizontal: 32, paddingVertical: 96, alignItems: 'center', gap: 8 },
  emptyIcon: { width: 56, height: 56, marginBottom: 4 },
  emptyTitle: { fontSize: 22, fontWeight: '600', color: PlatformColor('label'), textAlign: 'center' },
  emptyText: { fontSize: 15, color: PlatformColor('secondaryLabel'), textAlign: 'center' },
  sheetHost: { position: 'absolute', width: 1, height: 1 },
});
