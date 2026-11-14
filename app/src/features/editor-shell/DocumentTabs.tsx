import { Button, Divider, Host, HStack, Image as Symbol, Popover, Spacer, Text, TextField, VStack, useNativeState } from '@expo/ui/swift-ui';
import { accessibilityLabel, buttonStyle, font, foregroundStyle, frame, onDisappear, onSubmit, padding, textFieldStyle } from '@expo/ui/swift-ui/modifiers';
import { File, Paths } from 'expo-file-system';
import { memo, useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { GlassView } from 'expo-glass-effect';
import type { NotebookManifest } from '../../shared/documents/types';
import { readSettings } from '../../shared/settings';
import * as repository from '../../shared/documents/repository';

const tabsFile = new File(Paths.document, 'open-documents.json');
let openDocuments: { id: string; title: string }[] = tabsFile.exists ? JSON.parse(tabsFile.textSync()) : [];
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function publishTabs(value: typeof openDocuments) {
  const temporary = new File(Paths.document, 'open-documents.json.tmp');
  temporary.write(JSON.stringify(value));
  temporary.move(tabsFile, { overwrite: true });
  openDocuments = value;
  listeners.forEach(listener => listener());
}
export const getOpenTabs = () => openDocuments;

function DocumentMenu({ notebook, activePage, onRename, onMove, onCloseOthers }: {
  notebook: NotebookManifest; activePage: number;
  onRename: (title: string) => Promise<void>; onMove: () => void; onCloseOthers: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'move' | 'closeOthers'>();
  const afterDismiss = () => {
    setPendingAction(undefined);
    if (pendingAction === 'move') onMove();
    if (pendingAction === 'closeOthers') onCloseOthers();
  };
  const [location, setLocation] = useState('Документы');
  const title = useNativeState(notebook.title);
  useEffect(() => { title.set(notebook.title); }, [notebook.title, title]);
  useEffect(() => {
    if (!open) return;
    let current = true;
    repository.listItems().then(items => {
      if (current) setLocation(notebook.parentId ? items.find(item => item.id === notebook.parentId)?.title ?? 'Папка' : 'Документы');
    }).catch(() => { if (current) setLocation('Не удалось загрузить'); });
    return () => { current = false; };
  }, [open, notebook.parentId]);
  const commit = () => {
    const next = title.get().trim();
    if (next && next !== notebook.title) return onRename(next);
    else if (!next) title.set(notebook.title);
  };
  return <Popover isPresented={open} onIsPresentedChange={value => { if (!value) commit(); setOpen(value); }}>
    <Popover.Trigger><Button onPress={() => setOpen(true)} modifiers={[buttonStyle('plain'), accessibilityLabel('Меню документа')]}><Symbol systemName="chevron.down" size={10} color="#3E4645" modifiers={[font({ size: 10, weight: 'bold' }), frame({ width: 22, height: 34 })]} /></Button></Popover.Trigger>
    <Popover.Content><VStack alignment="leading" spacing={16} modifiers={[padding({ all: 16 }), frame({ width: 340 }), onDisappear(afterDismiss)]}>
      <TextField text={title} placeholder="Название блокнота" onFocusChange={focused => { if (!focused) commit(); }} modifiers={[textFieldStyle('roundedBorder'), font({ textStyle: 'headline' }), frame({ height: 56 }), onSubmit(commit)]} />
      <VStack spacing={0}>
        <Property label="Расположение" value={location} /><Divider />
        <Property label="Последнее изменение" value={new Date(notebook.modifiedAt).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} /><Divider />
        <Property label="Стр." value={`${activePage + 1} из ${notebook.pages.length}`} />
      </VStack>
      <Button label="Переместить в другую папку" modifiers={[frame({ minHeight: 44 })]} onPress={async () => { await commit(); setPendingAction('move'); setOpen(false); }} />
      <Divider />
      <Button label="Закрыть другие вкладки" role="destructive" modifiers={[frame({ minHeight: 44 })]} onPress={async () => { await commit(); setPendingAction('closeOthers'); setOpen(false); }} />
    </VStack></Popover.Content>
  </Popover>;
}

function Property({ label, value }: { label: string; value: string }) {
  return <HStack modifiers={[frame({ minHeight: 50 })]}>
    <Text modifiers={[font({ size: 14 }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>{label}</Text><Spacer />
    <Text modifiers={[font({ size: 14 })]}>{value}</Text>
  </HStack>;
}

export const DocumentTabs = memo(function DocumentTabs({ notebook, activePage, readOnly, onHome, onSwitch, onClose, onRename, onMove, onCloseOthers }: {
  notebook: NotebookManifest; activePage: number; readOnly: boolean;
  onHome: () => void; onSwitch: (id: string) => void; onClose: (id: string) => void;
  onRename: (title: string) => Promise<void>; onMove: () => void; onCloseOthers: () => void;
}) {
  const tabs = useSyncExternalStore(subscribe, getOpenTabs);
  useEffect(() => {
    if (openDocuments.some(tab => tab.id === notebook.id && tab.title === notebook.title)) return;
    const existing = openDocuments.findIndex(tab => tab.id === notebook.id);
    if (existing >= 0) publishTabs(openDocuments.map(tab => tab.id === notebook.id ? { ...tab, title: notebook.title } : tab));
    else publishTabs([...(readSettings().newTabs ? openDocuments : []), { id: notebook.id, title: notebook.title }]);
  }, [notebook.id, notebook.title]);
  return <View style={styles.row}>
    <Host style={{ width: 52, height: 34 }}><Button onPress={onHome} modifiers={[buttonStyle('plain'), accessibilityLabel('Домой')]}><Symbol systemName="house" size={16} color="#2A2F2E" modifiers={[font({ size: 16, weight: 'regular' }), frame({ width: 52, height: 34 })]} /></Button></Host>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
      {tabs.map(tab => {
        const active = tab.id === notebook.id;
        return <GlassView key={tab.id} glassEffectStyle={active ? 'regular' : 'clear'} tintColor={active && !readOnly ? '#D7EBEB' : undefined} style={styles.tab}>
          <Pressable accessibilityRole="tab" accessibilityLabel={tab.title} accessibilityState={{ selected: active }} onPress={() => onSwitch(tab.id)} style={styles.title}>
            <RNText numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 13, color: active ? '#151716' : '#5A6464', fontWeight: active ? '600' : '400' }}>{tab.title}</RNText>
          </Pressable>
          {active && <Host style={{ width: 22, height: 34 }}><DocumentMenu notebook={notebook} activePage={activePage} onRename={onRename} onMove={onMove} onCloseOthers={onCloseOthers} /></Host>}
          <Host style={{ width: 30, height: 34 }}><Button onPress={() => onClose(tab.id)} modifiers={[buttonStyle('plain'), accessibilityLabel(`Закрыть вкладку ${tab.title}`)]}><Symbol systemName="xmark" size={9} color={active ? '#4A5251' : '#7D8584'} modifiers={[font({ size: 9, weight: 'bold' }), frame({ width: 30, height: 34 })]} /></Button></Host>
        </GlassView>;
      })}
    </ScrollView>
  </View>;
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', height: 34, marginBottom: 4 },
  tab: { width: 184, height: 34, flexDirection: 'row', alignItems: 'center', borderRadius: 10 },
  title: { flex: 1, justifyContent: 'center', height: 34, paddingLeft: 12 },
});
