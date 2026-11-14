import { useLocalSearchParams } from 'expo-router';
import LibraryScreen from '../../../../features/library/LibraryScreen';

export default function FolderRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LibraryScreen mode="documents" folderId={id} />;
}
