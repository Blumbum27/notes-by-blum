import { BottomSheet, Button, Form, Host, HStack, Menu, Picker, Section, Spacer, Text as NativeText, TextField, VStack } from '@expo/ui/swift-ui';
import { buttonStyle, padding, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { Link, Stack, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Image } from 'expo-image';
import { File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { documentImport } from '../../../modules/document-import';
import * as repository from '../../shared/documents/repository';
import { defaultPaper, paperColorNames, paperNames, paperOrder, paperSizes, type LibraryItem, type PaperSettings } from '../../shared/documents/types';

export default function LibraryScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [parentId, setParentId] = useState<string | null>(null);
  const [section, setSection] = useState<'documents' | 'favorites' | 'trash'>('documents');
  const [filter, setFilter] = useState('all');
  const [list, setList] = useState(false);
  const [sort, setSort] = useState('modifiedAt');
  const [ascending, setAscending] = useState(false);
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState<'notebook' | 'folder' | null>(null);
  const [title, setTitle] = useState('');
  const [paper, setPaper] = useState(defaultPaper);
  const [cover, setCover] = useState('#4377A8');
  const [moving, setMoving] = useState<LibraryItem | null>(null);
  const [selection, setSelection] = useState<string[] | null>(null);
  const [sidebar, setSidebar] = useState(false);
  const [moveSearch, setMoveSearch] = useState('');
  const [moveIds, setMoveIds] = useState<string[]>([]);
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
  const refresh = useCallback(() => repository.listItems().then(setItems), []);
  useFocusEffect(useCallback(() => { void refresh().catch(() => Alert.alert('Не удалось открыть библиотеку', 'Вернитесь в библиотеку и попробуйте ещё раз. Документы не удалены.')); }, [refresh]));
  const perform = async (action: () => Promise<unknown>) => {
    try { await action(); await refresh(); } catch { Alert.alert('Не удалось выполнить действие', 'Изменения не завершены. Проверьте доступ к файлу и попробуйте ещё раз.'); }
  };
  const current = items.find(item => item.id === parentId);
  const visible = items.filter(item => {
    if (section === 'trash') return !!item.deletedAt && (filter === 'all' || item.kind === filter) && item.title.toLocaleLowerCase().includes(search.toLocaleLowerCase());
    if (repository.isInTrash(item, items)) return false;
    if (section === 'favorites' && !item.favorite) return false;
    if (section === 'documents' && !search && item.parentId !== parentId) return false;
    return (filter === 'all' || item.kind === filter) && item.title.toLocaleLowerCase().includes(search.toLocaleLowerCase());
  }).sort((a, b) => {
    const key = sort as 'title' | 'kind' | 'createdAt' | 'modifiedAt';
    return a[key].localeCompare(b[key], 'ru') * (ascending ? 1 : -1);
  });
  const columns = list ? 1 : Math.max(2, Math.floor((width - (sidebar ? 320 : 0)) / 185));
  const rename = (item: LibraryItem) => Alert.prompt('Переименовать', undefined, value => {
    if (value.trim()) void perform(() => repository.updateItem(item.id, { title: value.trim() }));
  }, 'plain-text', item.title);
  const open = (item: LibraryItem) => {
    if (selection) { setSelection(selection.includes(item.id) ? selection.filter(id => id !== item.id) : [...selection, item.id]); return; }
    if (section === 'trash') return;
    if (item.kind === 'folder') { setParentId(item.id); setSection('documents'); }
  };
  const preview = (item: LibraryItem, onPress?: () => void) => <Pressable accessibilityRole="button" accessibilityLabel={item.title} onPress={onPress} style={StyleSheet.flatten([styles.preview, list && styles.smallPreview, item.kind === 'notebook' && { backgroundColor: item.cover }, selection?.includes(item.id) && styles.selected])}>
    {item.kind === 'notebook' && new File(repository.packageDirectory(item.id), 'thumbnails', 'cover.png').exists ? <Image source={{ uri: new File(repository.packageDirectory(item.id), 'thumbnails', 'cover.png').uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" /> : <SymbolView name={item.kind === 'folder' ? 'folder.fill' : 'book.closed.fill'} tintColor={item.kind === 'folder' ? item.cover : '#FFFFFF'} size={list ? 44 : item.kind === 'folder' ? 110 : 48} />}
  </Pressable>;
  return <View style={[styles.root, { paddingTop: insets.top + 112, paddingBottom: insets.bottom }]}>
    <Stack.Screen options={{ title: current?.title ?? (section === 'favorites' ? 'Избранное' : section === 'trash' ? 'Корзина' : 'Документы'), headerLargeTitle: true,
      headerSearchBarOptions: { placeholder: 'Поиск по названиям', onChangeText: event => setSearch(event.nativeEvent.text) },
      headerLeft: () => <Host ignoreSafeArea="all" style={{ width: parentId ? 210 : 110, height: 44 }}><HStack><Button label="Разделы" systemImage="sidebar.left" onPress={() => setSidebar(!sidebar)} />{parentId && <Button label="Назад" systemImage="chevron.left" onPress={() => setParentId(current?.parentId ?? null)} />}</HStack></Host>,
      headerRight: () => <Host ignoreSafeArea="all" style={{ width: 120, height: 44 }}><Menu label="Меню" systemImage="person.crop.circle"><Button label="Настройки" systemImage="gearshape" onPress={() => router.push('/settings')} /><Button label="Корзина" systemImage="trash" onPress={() => { setSection('trash'); setParentId(null); }} /></Menu></Host> }} />
    {sidebar && <View style={styles.sidebar}><Host ignoreSafeArea="all" style={{ height: 140 }}><VStack alignment="leading" spacing={20} modifiers={[padding({ all: 20 })]}>
      <Button label="Документы" systemImage="folder" onPress={() => { setSection('documents'); setParentId(null); }} />
      <Button label="Избранное" systemImage="star" onPress={() => { setSection('favorites'); setParentId(null); }} />
    </VStack></Host></View>}
    <View style={styles.content}>
      <Host ignoreSafeArea="all" style={{ height: 64 }}><HStack spacing={18} modifiers={[padding({ horizontal: 16 })]}>
        <Menu label={filter === 'all' ? 'Все' : filter === 'folder' ? 'Папки' : 'Документы'} systemImage="line.3.horizontal.decrease"><Button label="Все" onPress={() => setFilter('all')} /><Button label="Документы" onPress={() => setFilter('notebook')} /><Button label="Папки" onPress={() => setFilter('folder')} /></Menu>
        <Spacer />
        {section === 'documents' && <Menu label="Создать" systemImage="plus" modifiers={[buttonStyle('glassProminent')]}><Button label="Блокнот" systemImage="book.closed" onPress={() => { setTitle(''); setCreating('notebook'); }} /><Button label="Папка" systemImage="folder.badge.plus" onPress={() => { setTitle(''); setCreating('folder'); }} /><Button label="Импорт PDF или изображения" systemImage="square.and.arrow.down" onPress={() => void importFile()} /><Button label="Изображение из Фото" systemImage="photo" onPress={() => void importPhoto()} /></Menu>}
        <Menu label="Вид" systemImage={list ? 'list.bullet' : 'square.grid.2x2'}>
          <Button label="Выбор элементов" onPress={() => setSelection([])} /><Button label="Сетка" onPress={() => setList(false)} /><Button label="Список" onPress={() => setList(true)} />
          {Object.entries({ createdAt: 'Дата создания', modifiedAt: 'Последнее изменение', title: 'Имя', kind: 'Тип' }).map(([key, label]) => <Button key={key} label={`${sort === key ? '✓ ' : ''}${label}`} onPress={() => { if (sort === key) setAscending(!ascending); else setSort(key); }} />)}
        </Menu>
        {section === 'trash' && <Button label="Очистить" role="destructive" onPress={() => Alert.alert('Очистить корзину?', 'Документы будут удалены навсегда.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: () => void perform(async () => { for (const item of items.filter(value => value.deletedAt)) { if ((await repository.listItems()).some(value => value.id === item.id)) await repository.deletePermanently(item.id); } }) }])} />}
      </HStack></Host>
      {selection && <Host ignoreSafeArea="all" style={{ height: 64 }}><HStack spacing={16}><Button label="Выбрать все" onPress={() => setSelection(visible.map(item => item.id))} />{selection.length > 0 && <><Button label="Дублировать" onPress={() => void perform(async () => { for (const id of selection) await repository.duplicateItem(id); setSelection(null); })} /><Button label="Переместить" onPress={() => { setMoveIds(selection); setMoving(items.find(item => item.id === selection[0]) ?? null); }} /><Button label={section === 'trash' ? 'Восстановить' : `В корзину (${selection.length})`} role={section === 'trash' ? 'default' : 'destructive'} onPress={() => void perform(async () => { for (const id of selection) await repository.updateItem(id, { deletedAt: section === 'trash' ? null : new Date().toISOString() }); setSelection(null); })} /></>}<Button label="Готово" onPress={() => setSelection(null)} /></HStack></Host>}
      <FlatList key={columns} numColumns={columns} data={visible} contentContainerStyle={styles.grid} keyExtractor={item => item.id}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>{search ? 'Ничего не найдено' : section === 'trash' ? 'Корзина пуста' : section === 'favorites' ? 'В избранном пока ничего нет' : 'Здесь пока нет документов'}</Text><Text style={styles.date}>{search ? 'Попробуйте другое название.' : section === 'documents' ? 'Создайте блокнот, папку или импортируйте файл.' : section === 'favorites' ? 'Добавляйте документы и папки через их меню.' : 'Удалённые документы появятся здесь.'}</Text></View>}
        renderItem={({ item }) => <View style={[styles.item, list && styles.listItem, { width: list ? '100%' : `${100 / columns}%` }]}>
          {item.kind === 'notebook' && !selection && section !== 'trash'
            ? <Link href={{ pathname: '/notebook/[id]', params: { id: item.id } }} asChild><Link.AppleZoom>{preview(item)}</Link.AppleZoom></Link>
            : preview(item, () => open(item))}
          <View style={list ? { flex: 1 } : undefined}><Host ignoreSafeArea="all" style={{ height: 40, width: list ? 260 : 165 }}><Menu label={item.title} systemImage="chevron.down">
            {section === 'trash' ? <><Button label="Восстановить" onPress={() => void perform(() => repository.updateItem(item.id, { deletedAt: null }))} /><Button label="Удалить навсегда" role="destructive" onPress={() => Alert.alert('Удалить навсегда?', 'Восстановить документ будет невозможно.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: () => void perform(() => repository.deletePermanently(item.id)) }])} /></> : <>
              <Button label="Переименовать" onPress={() => rename(item)} /><Button label={item.favorite ? 'Убрать из избранного' : 'В избранное'} systemImage="star" onPress={() => void perform(() => repository.updateItem(item.id, { favorite: !item.favorite }))} />
               <Button label="Дублировать" systemImage="doc.on.doc" onPress={() => void perform(() => repository.duplicateItem(item.id))} />
               {item.kind === 'folder' && <Menu label="Цвет папки">{Object.entries({ '#4377A8': 'Синий', '#E65A64': 'Красный', '#E3AD43': 'Жёлтый', '#6C9E76': 'Зелёный' }).map(([color, name]) => <Button key={color} label={name} onPress={() => void perform(() => repository.updateItem(item.id, { cover: color }))} />)}</Menu>}
              <Button label="Переместить" systemImage="folder" onPress={() => { setMoveIds([item.id]); setMoveSearch(''); setMoving(item); }} /><Button label="Отправить в корзину" systemImage="trash" role="destructive" onPress={() => void perform(() => repository.updateItem(item.id, { deletedAt: new Date().toISOString() }))} />
            </>}
           </Menu></Host><Text numberOfLines={1} style={[styles.date, list && { textAlign: 'left', paddingLeft: 8 }]}>{new Date(item.modifiedAt).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}{item.favorite ? ' · ★' : ''}</Text></View>
           {list && <Pressable accessibilityRole="button" accessibilityLabel={item.favorite ? 'Убрать из избранного' : 'В избранное'} onPress={() => void perform(() => repository.updateItem(item.id, { favorite: !item.favorite }))} style={{ padding: 12 }}><SymbolView name={item.favorite ? 'star.fill' : 'star'} size={24} tintColor={item.favorite ? '#E65A64' : '#333333'} /></Pressable>}
        </View>} />
    </View>
    <Host ignoreSafeArea="all" style={styles.sheetHost}><BottomSheet isPresented={creating !== null} onIsPresentedChange={value => { if (!value) setCreating(null); }}><Form>
      <Section title={creating === 'folder' ? 'Новая папка' : 'Новый блокнот'}><TextField placeholder="Название" onTextChange={setTitle} /></Section>
      <Section title="Обложка"><Picker label="Цвет" selection={cover} onSelectionChange={setCover}>{Object.entries({ '#4377A8': 'Синий', '#E65A64': 'Красный', '#E3AD43': 'Жёлтый', '#6C9E76': 'Зелёный' }).map(([value, name]) => <NativeText key={value} modifiers={[tag(value)]}>{name}</NativeText>)}</Picker></Section>
      {creating === 'notebook' && <Section title="Бумага">
        <Picker label="Шаблон" selection={paper.pattern} onSelectionChange={value => setPaper({ ...paper, pattern: value as PaperSettings['pattern'] })}>{paperOrder.map(value => <NativeText key={value} modifiers={[tag(value)]}>{paperNames[value]}</NativeText>)}</Picker>
        <Picker label="Цвет бумаги" selection={paper.color} onSelectionChange={value => setPaper({ ...paper, color: value as PaperSettings['color'] })}>{(Object.keys(paperColorNames) as PaperSettings['color'][]).map(value => <NativeText key={value} modifiers={[tag(value)]}>{paperColorNames[value]}</NativeText>)}</Picker>
        <Picker label="Размер" selection={paper.size} onSelectionChange={value => setPaper({ ...paper, size: value as PaperSettings['size'] })}>{paperSizes.map(value => <NativeText key={value} modifiers={[tag(value)]}>{value}</NativeText>)}</Picker>
        <Picker label="Ориентация" selection={paper.orientation} modifiers={[pickerStyle('segmented')]} onSelectionChange={value => setPaper({ ...paper, orientation: value as PaperSettings['orientation'] })}><NativeText modifiers={[tag('portrait')]}>Портрет</NativeText><NativeText modifiers={[tag('landscape')]}>Альбом</NativeText></Picker>
      </Section>}
      <Button label="Создать" modifiers={[buttonStyle('glassProminent')]} onPress={() => void perform(async () => { if (creating) await repository.createItem(title, creating, parentId, cover, paper); setCreating(null); })} /><Button label="Отмена" role="cancel" onPress={() => setCreating(null)} />
    </Form></BottomSheet>
    <BottomSheet isPresented={moving !== null} onIsPresentedChange={value => { if (!value) setMoving(null); }}><Form><Section title="Выбор папки"><NativeText>{moving?.title ?? ''}</NativeText><TextField placeholder="Поиск папки" onTextChange={setMoveSearch} /><Button label="Документы" onPress={() => void perform(async () => { for (const id of moveIds) await repository.moveItem(id, null); setMoving(null); setSelection(null); })} />{items.filter(item => item.kind === 'folder' && !repository.isInTrash(item, items) && !moveIds.includes(item.id) && item.title.toLocaleLowerCase().includes(moveSearch.toLocaleLowerCase())).map(item => <Button key={item.id} label={item.title} systemImage="folder" onPress={() => void perform(async () => { for (const id of moveIds) await repository.moveItem(id, item.id); setMoving(null); setSelection(null); })} />)}<Button label="Отмена" role="cancel" onPress={() => setMoving(null)} /></Section></Form></BottomSheet></Host>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: '#FAFAFC' }, sidebar: { width: 300, borderRadius: 24, margin: 10, backgroundColor: '#F0F1F5' }, content: { flex: 1 },
  grid: { padding: 16 }, item: { alignItems: 'center', padding: 12, minHeight: 260 }, listItem: { flexDirection: 'row', gap: 20, minHeight: 96, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D1D1D6' },
  preview: { width: 140, height: 176, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, smallPreview: { width: 52, height: 68 }, selected: { borderWidth: 4, borderColor: '#007AFF' },
  date: { color: '#77777E', fontSize: 13, textAlign: 'center' }, empty: { padding: 64, alignItems: 'center', gap: 12 }, emptyTitle: { fontSize: 22, fontWeight: '600' }, sheetHost: { position: 'absolute', width: 1, height: 1 },
});
