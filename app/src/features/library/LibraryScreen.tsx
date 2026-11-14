import { BottomSheet, Button, Form, Host, HStack, Menu, Picker, Section, Text as NativeText, TextField, VStack } from '@expo/ui/swift-ui';
import { buttonStyle, padding, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SymbolView } from 'expo-symbols';
import * as repository from '../../shared/documents/repository';
import { defaultPaper, type LibraryItem, type PaperSettings } from '../../shared/documents/types';

export default function LibraryScreen() {
  const { width } = useWindowDimensions();
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
  const refresh = useCallback(() => repository.listItems().then(setItems).catch(error => Alert.alert('Не удалось открыть библиотеку', String(error))), []);
  useEffect(() => { void refresh(); }, [refresh]);
  const perform = async (action: () => Promise<unknown>) => {
    try { await action(); await refresh(); } catch (error) { Alert.alert('Не удалось выполнить действие', String(error)); }
  };
  const current = items.find(item => item.id === parentId);
  const visible = items.filter(item => {
    if (section === 'trash') return !!item.deletedAt;
    if (item.deletedAt) return false;
    if (section === 'favorites' && !item.favorite) return false;
    if (section === 'documents' && item.parentId !== parentId) return false;
    return (filter === 'all' || item.kind === filter) && item.title.toLocaleLowerCase().includes(search.toLocaleLowerCase());
  }).sort((a, b) => {
    const key = sort as 'title' | 'kind' | 'createdAt' | 'modifiedAt';
    return a[key].localeCompare(b[key], 'ru') * (ascending ? 1 : -1);
  });
  const columns = list ? 1 : Math.max(2, Math.floor((width - 260) / 185));
  const rename = (item: LibraryItem) => Alert.prompt('Переименовать', undefined, value => {
    if (value.trim()) void perform(() => repository.updateItem(item.id, { title: value.trim() }));
  }, 'plain-text', item.title);
  const open = (item: LibraryItem) => {
    if (selection) { setSelection(selection.includes(item.id) ? selection.filter(id => id !== item.id) : [...selection, item.id]); return; }
    if (section === 'trash') return;
    if (item.kind === 'folder') { setParentId(item.id); setSection('documents'); }
    else router.push({ pathname: '/notebook/[id]', params: { id: item.id } });
  };
  return <View style={styles.root}>
    <Stack.Screen options={{ title: current?.title ?? (section === 'favorites' ? 'Избранное' : section === 'trash' ? 'Корзина' : 'Документы'), headerLargeTitle: true,
      headerSearchBarOptions: { placeholder: 'Поиск по названиям', onChangeText: event => setSearch(event.nativeEvent.text) },
      headerLeft: parentId ? () => <Host ignoreSafeArea="all" style={{ width: 110, height: 44 }}><Button label="Назад" systemImage="chevron.left" onPress={() => setParentId(current?.parentId ?? null)} /></Host> : undefined,
      headerRight: () => <Host ignoreSafeArea="all" style={{ width: 72, height: 44 }}><Menu label="Меню" systemImage="person.crop.circle"><Button label="Настройки" systemImage="gearshape" onPress={() => router.push('/settings')} /><Button label="Корзина" systemImage="trash" onPress={() => { setSection('trash'); setParentId(null); }} /></Menu></Host> }} />
    <View style={styles.sidebar}><Host ignoreSafeArea="all" style={{ flex: 1 }}><VStack alignment="leading" spacing={20} modifiers={[padding({ all: 20 })]}>
      <Button label="Документы" systemImage="folder" onPress={() => { setSection('documents'); setParentId(null); }} />
      <Button label="Избранное" systemImage="star" onPress={() => { setSection('favorites'); setParentId(null); }} />
    </VStack></Host></View>
    <View style={styles.content}>
      <Host ignoreSafeArea="all" style={{ height: 64 }}><HStack spacing={18} modifiers={[padding({ horizontal: 16 })]}>
        <Menu label={filter === 'all' ? 'Все' : filter === 'folder' ? 'Папки' : 'Документы'} systemImage="line.3.horizontal.decrease"><Button label="Все" onPress={() => setFilter('all')} /><Button label="Документы" onPress={() => setFilter('notebook')} /><Button label="Папки" onPress={() => setFilter('folder')} /></Menu>
        {section === 'documents' && <Menu label="Создать" systemImage="plus" modifiers={[buttonStyle('glassProminent')]}><Button label="Блокнот" systemImage="book.closed" onPress={() => { setTitle(''); setCreating('notebook'); }} /><Button label="Папка" systemImage="folder.badge.plus" onPress={() => { setTitle(''); setCreating('folder'); }} /></Menu>}
        <Menu label="Вид" systemImage={list ? 'list.bullet' : 'square.grid.2x2'}>
          <Button label="Выбор элементов" onPress={() => setSelection([])} /><Button label="Сетка" onPress={() => setList(false)} /><Button label="Список" onPress={() => setList(true)} />
          {Object.entries({ createdAt: 'Дата создания', modifiedAt: 'Последнее изменение', title: 'Имя', kind: 'Тип' }).map(([key, label]) => <Button key={key} label={`${sort === key ? '✓ ' : ''}${label}`} onPress={() => { if (sort === key) setAscending(!ascending); else setSort(key); }} />)}
        </Menu>
        {selection && <><Button label={`В корзину (${selection.length})`} role="destructive" onPress={() => void perform(async () => { for (const id of selection) await repository.updateItem(id, { deletedAt: new Date().toISOString() }); setSelection(null); })} /><Button label="Готово" onPress={() => setSelection(null)} /></>}
      </HStack></Host>
      <FlatList key={columns} numColumns={columns} data={visible} contentContainerStyle={styles.grid} keyExtractor={item => item.id}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>{section === 'trash' ? 'Корзина пуста' : 'Здесь пока нет документов'}</Text><Text style={styles.date}>Создайте блокнот или папку.</Text></View>}
        renderItem={({ item }) => <View style={[styles.item, list && styles.listItem, { width: list ? '100%' : `${100 / columns}%` }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={item.title} onPress={() => open(item)} style={[styles.preview, list && styles.smallPreview, item.kind === 'notebook' && { backgroundColor: item.cover }, selection?.includes(item.id) && styles.selected]}>
            <SymbolView name={item.kind === 'folder' ? 'folder.fill' : 'book.closed.fill'} tintColor={item.kind === 'folder' ? item.cover : '#FFFFFF'} size={item.kind === 'folder' ? 110 : 48} />
          </Pressable>
          <View style={list ? { flex: 1 } : undefined}><Host ignoreSafeArea="all" style={{ height: 40, width: list ? 260 : 165 }}><Menu label={item.title} systemImage="chevron.down">
            {section === 'trash' ? <><Button label="Восстановить" onPress={() => void perform(() => repository.updateItem(item.id, { deletedAt: null }))} /><Button label="Удалить навсегда" role="destructive" onPress={() => Alert.alert('Удалить навсегда?', 'Восстановить документ будет невозможно.', [{ text: 'Отмена', style: 'cancel' }, { text: 'Удалить', style: 'destructive', onPress: () => void perform(() => repository.deletePermanently(item.id)) }])} /></> : <>
              <Button label="Переименовать" onPress={() => rename(item)} /><Button label={item.favorite ? 'Убрать из избранного' : 'В избранное'} systemImage="star" onPress={() => void perform(() => repository.updateItem(item.id, { favorite: !item.favorite }))} />
              {item.kind === 'notebook' && <Button label="Дублировать" systemImage="doc.on.doc" onPress={() => void perform(() => repository.duplicateItem(item.id))} />}
              {item.kind === 'folder' && <Menu label="Цвет папки">{['#4377A8', '#E65A64', '#E3AD43', '#6C9E76'].map(color => <Button key={color} label={color} onPress={() => void perform(() => repository.updateItem(item.id, { cover: color }))} />)}</Menu>}
              <Button label="Переместить" systemImage="folder" onPress={() => setMoving(item)} /><Button label="Отправить в корзину" systemImage="trash" role="destructive" onPress={() => void perform(() => repository.updateItem(item.id, { deletedAt: new Date().toISOString() }))} />
            </>}
          </Menu></Host><Text numberOfLines={1} style={styles.date}>{new Date(item.modifiedAt).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}{item.favorite ? ' · ★' : ''}</Text></View>
        </View>} />
    </View>
    <Host ignoreSafeArea="all" style={styles.sheetHost}><BottomSheet isPresented={creating !== null} onIsPresentedChange={value => { if (!value) setCreating(null); }}><Form>
      <Section title={creating === 'folder' ? 'Новая папка' : 'Новый блокнот'}><TextField placeholder="Название" onTextChange={setTitle} /></Section>
      <Section title="Обложка"><Picker label="Цвет" selection={cover} onSelectionChange={setCover}>{Object.entries({ '#4377A8': 'Синий', '#E65A64': 'Красный', '#E3AD43': 'Жёлтый', '#6C9E76': 'Зелёный' }).map(([value, name]) => <NativeText key={value} modifiers={[tag(value)]}>{name}</NativeText>)}</Picker></Section>
      {creating === 'notebook' && <Section title="Бумага">
        <Picker label="Шаблон" selection={paper.pattern} onSelectionChange={value => setPaper({ ...paper, pattern: value as PaperSettings['pattern'] })}>{Object.entries({ blank: 'Без линий', ruled: 'Линейка', grid: 'Клетка', dots: 'Точки' }).map(([value, name]) => <NativeText key={value} modifiers={[tag(value)]}>{name}</NativeText>)}</Picker>
        <Picker label="Цвет бумаги" selection={paper.color} onSelectionChange={value => setPaper({ ...paper, color: value as PaperSettings['color'] })}><NativeText modifiers={[tag('white')]}>Белая</NativeText><NativeText modifiers={[tag('yellow')]}>Жёлтая</NativeText></Picker>
        <Picker label="Размер" selection={paper.size} onSelectionChange={value => setPaper({ ...paper, size: value as PaperSettings['size'] })}><NativeText modifiers={[tag('A4')]}>A4</NativeText><NativeText modifiers={[tag('Letter')]}>Letter</NativeText></Picker>
        <Picker label="Ориентация" selection={paper.orientation} modifiers={[pickerStyle('segmented')]} onSelectionChange={value => setPaper({ ...paper, orientation: value as PaperSettings['orientation'] })}><NativeText modifiers={[tag('portrait')]}>Портрет</NativeText><NativeText modifiers={[tag('landscape')]}>Альбом</NativeText></Picker>
      </Section>}
      <Button label="Создать" modifiers={[buttonStyle('glassProminent')]} onPress={() => void perform(async () => { if (creating) await repository.createItem(title, creating, parentId, cover, paper); setCreating(null); })} /><Button label="Отмена" role="cancel" onPress={() => setCreating(null)} />
    </Form></BottomSheet>
    <BottomSheet isPresented={moving !== null} onIsPresentedChange={value => { if (!value) setMoving(null); }}><Form><Section title="Переместить в папку"><Button label="Документы" onPress={() => void perform(async () => { if (moving) await repository.moveItem(moving.id, null); setMoving(null); })} />{items.filter(item => item.kind === 'folder' && !item.deletedAt && item.id !== moving?.id).map(item => <Button key={item.id} label={item.title} onPress={() => void perform(async () => { if (moving) await repository.moveItem(moving.id, item.id); setMoving(null); })} />)}</Section></Form></BottomSheet></Host>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 138, flexDirection: 'row', backgroundColor: '#FAFAFC' }, sidebar: { width: 230, backgroundColor: '#F0F1F5' }, content: { flex: 1 },
  grid: { padding: 16 }, item: { alignItems: 'center', padding: 12, minHeight: 260 }, listItem: { flexDirection: 'row', gap: 20, minHeight: 96, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D1D1D6' },
  preview: { width: 140, height: 176, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }, smallPreview: { width: 52, height: 68 }, selected: { borderWidth: 4, borderColor: '#007AFF' },
  date: { color: '#77777E', fontSize: 13, textAlign: 'center' }, empty: { padding: 64, alignItems: 'center', gap: 12 }, emptyTitle: { fontSize: 22, fontWeight: '600' }, sheetHost: { position: 'absolute', width: 1, height: 1 },
});
