import { Button, Host, HStack, Image as Symbol, Spacer, Text, TextField, VStack, useNativeState } from '@expo/ui/swift-ui';
import { accessibilityLabel, background, buttonStyle, shapes, font, frame, onSubmit, padding, submitLabel, textFieldStyle } from '@expo/ui/swift-ui/modifiers';
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { searchNotebook, type SearchResult } from '../../../modules/notes-canvas/rendering';
import type { NotebookManifest } from '../../shared/documents/types';
import { sidebarWidth } from './PagesSidebar';

const sources: Record<SearchResult['source'], string> = { text: 'Текст', sticky: 'Клейкая заметка', pdf: 'PDF' };

/** Поиск по напечатанному тексту, клейким заметкам и текстовому слою PDF; рукописный ввод не распознаётся. */
export const SearchPanel = memo(function SearchPanel({ notebook, packagePath, activePage, onSelect, onClose }: {
  notebook: NotebookManifest; packagePath: string; activePage: number;
  onSelect: (index: number) => void; onClose: () => void;
}) {
  const query = useNativeState('');
  const [state, setState] = useState<{ query: string; results: SearchResult[]; failed?: boolean }>({ query: '', results: [] });
  const request = useRef(0);
  const latest = useRef(notebook);
  latest.current = notebook;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const run = (value: string) => {
    clearTimeout(timer.current);
    const text = value.trim();
    const id = ++request.current;
    if (!text) { setState({ query: '', results: [] }); return; }
    timer.current = setTimeout(() => {
      searchNotebook(packagePath, latest.current, text)
        .then(results => { if (id === request.current) setState({ query: text, results }); })
        .catch(() => { if (id === request.current) setState({ query: text, results: [], failed: true }); });
    }, 220);
  };
  const pages = new Set(state.results.map(result => result.page)).size;
  return <View style={styles.panel}>
    <Host style={{ height: 104 }}><VStack spacing={10} modifiers={[padding({ horizontal: 16, top: 6 })]}>
      <HStack modifiers={[frame({ height: 40 })]}>
        <Spacer modifiers={[frame({ width: 36 })]} /><Spacer />
        <Text modifiers={[font({ size: 17, weight: 'semibold' })]}>Поиск</Text><Spacer />
        <Button onPress={onClose} modifiers={[buttonStyle('plain'), accessibilityLabel('Закрыть поиск')]}>
          <Symbol systemName="xmark" size={13} color="#5D6362" modifiers={[font({ size: 13, weight: 'semibold' }), frame({ width: 36, height: 36 })]} />
        </Button>
      </HStack>
      <HStack spacing={8} modifiers={[padding({ horizontal: 10 }), frame({ height: 38 }), background('#E8EBEA', shapes.roundedRectangle({ cornerRadius: 10 }))]}>
        <Symbol systemName="magnifyingglass" size={15} color="#8A908E" />
        <TextField text={query} placeholder="Поиск в документе" autoFocus onTextChange={run} modifiers={[textFieldStyle('plain'), font({ size: 16 }), submitLabel('search'), onSubmit(() => run(query.get()))]} />
      </HStack>
    </VStack></Host>
    <ScrollView style={{ flex: 1 }} keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}>
      {!!state.query && !state.failed && <RNText style={styles.summary}>{state.results.length ? `Найдено: ${state.results.length} · страниц: ${pages}` : 'Ничего не найдено'}</RNText>}
      {state.failed && <RNText style={styles.summary}>Не удалось выполнить поиск. Попробуйте ещё раз.</RNText>}
      {!state.query && <View style={styles.hint}><RNText style={styles.hintText}>Ищет напечатанный текст, клейкие заметки и текст в импортированных PDF.</RNText></View>}
      {state.results.map((result, i) => <Pressable key={`${result.page}-${i}`} accessibilityRole="button" accessibilityLabel={`Страница ${result.page + 1}: ${result.snippet}`} onPress={() => onSelect(result.page)}
        style={({ pressed }) => [styles.result, result.page === activePage && styles.current, pressed && { opacity: 0.6 }]}>
        <View style={styles.resultHeader}><RNText style={styles.page}>{`Страница ${result.page + 1}`}</RNText><RNText style={styles.source}>{sources[result.source]}</RNText></View>
        <RNText numberOfLines={3} style={styles.snippet}>{highlight(result.snippet, state.query)}</RNText>
      </Pressable>)}
    </ScrollView>
  </View>;
});

function highlight(snippet: string, query: string) {
  const at = snippet.toLocaleLowerCase('ru').indexOf(query.toLocaleLowerCase('ru'));
  if (at < 0) return snippet;
  return <>{snippet.slice(0, at)}<RNText style={styles.match}>{snippet.slice(at, at + query.length)}</RNText>{snippet.slice(at + query.length)}</>;
}

const styles = StyleSheet.create({
  panel: { width: sidebarWidth, backgroundColor: '#F7F8F7', borderRightWidth: StyleSheet.hairlineWidth, borderColor: '#D6DBD9' },
  summary: { fontSize: 13, color: '#6B7271', paddingHorizontal: 6, paddingVertical: 8 },
  hint: { paddingVertical: 32, paddingHorizontal: 20 },
  hintText: { fontSize: 14, lineHeight: 19, color: '#6B7271', textAlign: 'center' },
  result: { backgroundColor: 'white', borderRadius: 12, padding: 12, marginBottom: 8 },
  current: { borderWidth: 1.5, borderColor: '#9DBDF0', padding: 10.5 },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  page: { fontSize: 13, fontWeight: '600', color: '#2A2F2E' },
  source: { fontSize: 12, color: '#8A908E' },
  snippet: { fontSize: 14, lineHeight: 19, color: '#3A3F3E' },
  match: { backgroundColor: '#FFE98F', color: '#151716', fontWeight: '600' },
});
