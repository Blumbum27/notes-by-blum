import { Button, Form, Host, HStack, Section, Spacer, Text, TextField } from '@expo/ui/swift-ui';
import { buttonStyle, font, labelStyle, padding } from '@expo/ui/swift-ui/modifiers';
import { useEffect, useState } from 'react';
import { Modal, View } from 'react-native';
import * as repository from '../../shared/documents/repository';
import type { LibraryItem } from '../../shared/documents/types';

/** App folders are notebook metadata, not filesystem directories: use a native Form sheet. */
export function FolderSheet({ parentId, onCancel, onSelect }: { parentId: string | null; onCancel: () => void; onSelect: (id: string | null) => Promise<void> }) {
  const [folders, setFolders] = useState<LibraryItem[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    let current = true;
    repository.listItems().then(items => { if (current) setFolders(items.filter(item => item.kind === 'folder' && !repository.isInTrash(item, items))); }).catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, []);
  return <Modal presentationStyle="formSheet" animationType="slide" onRequestClose={onCancel}>
    <View style={{ flex: 1, backgroundColor: '#F2F2F7' }}>
      <Host style={{ height: 68 }}><HStack modifiers={[padding({ all: 16 })]}>
        <Button label="Отменить перемещение" systemImage="xmark" modifiers={[labelStyle('iconOnly'), buttonStyle('glass')]} onPress={onCancel} /><Spacer />
        <Text modifiers={[font({ textStyle: 'headline' })]}>Выбор папки</Text><Spacer />
      </HStack></Host>
      <Host style={{ flex: 1 }}><Form>
        <Section><TextField placeholder="Поиск папки" onTextChange={setSearch} /></Section>
        <Section title="Расположение">
          <Button label="Документы" systemImage={parentId === null ? 'checkmark' : 'folder'} onPress={() => { void onSelect(null); }} />
          {folders.filter(folder => folder.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(folder => <Button key={folder.id} label={folder.title} systemImage={parentId === folder.id ? 'checkmark' : 'folder'} onPress={() => { void onSelect(folder.id); }} />)}
          {error && <Text>Не удалось загрузить папки. Закройте окно и попробуйте ещё раз.</Text>}
        </Section>
      </Form></Host>
    </View>
  </Modal>;
}
