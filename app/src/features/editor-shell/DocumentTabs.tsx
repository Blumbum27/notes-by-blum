import { Button, Divider, Host, HStack, Popover, Spacer, Text, TextField, VStack, useNativeState } from '@expo/ui/swift-ui';
import { buttonStyle, font, foregroundStyle, frame, labelStyle, onDisappear, onSubmit, padding, textFieldStyle } from '@expo/ui/swift-ui/modifiers';
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
    <Popover.Trigger><Button label="Меню документа" systemImage="chevron.down" modifiers={[labelStyle('iconOnly'), buttonStyle('plain'), frame({ width: 24, height: 36 })]} onPress={() => setOpen(true)} /></Popover.Trigger>
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
    <Host style={{ width: 60, height: 36 }}><Button label="Домой" systemImage="house" modifiers={[labelStyle('iconOnly'), buttonStyle('plain'), frame({ width: 60, height: 36 })]} onPress={onHome} /></Host>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
      {tabs.map(tab => {
        const active = tab.id === notebook.id;
        return <GlassView key={tab.id} glassEffectStyle={active ? 'regular' : 'clear'} tintColor={active && !readOnly ? '#D7EBEB' : undefined} style={styles.tab}>
          <Pressable accessibilityRole="tab" accessibilityLabel={tab.title} accessibilityState={{ selected: active }} onPress={() => onSwitch(tab.id)} style={styles.title}>
            <RNText numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 14, color: active ? '#111313' : '#5A6464', fontWeight: active ? '600' : '400' }}>{tab.title}</RNText>
          </Pressable>
          {active && <Host style={{ width: 24, height: 36 }}><DocumentMenu notebook={notebook} activePage={activePage} onRename={onRename} onMove={onMove} onCloseOthers={onCloseOthers} /></Host>}
          <Host style={{ width: 36, height: 36 }}><Button label={`Закрыть вкладку ${tab.title}`} systemImage="xmark" modifiers={[labelStyle('iconOnly'), buttonStyle('plain'), frame({ width: 36, height: 36 })]} onPress={() => onClose(tab.id)} /></Host>
        </GlassView>;
      })}
    </ScrollView>
  </View>;
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', height: 36 },
  tab: { width: 196, height: 36, flexDirection: 'row', alignItems: 'center', borderRadius: 9 },
  title: { flex: 1, justifyContent: 'center', height: 36, paddingLeft: 12 },
});
