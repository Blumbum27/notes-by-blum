import { useLocalSearchParams } from 'expo-router';
import LibraryScreen from '../../../features/library/LibraryScreen';

export default function LibraryIndex() {
  const { mode } = useLocalSearchParams<{ mode: 'documents' | 'favorites' | 'search' }>();
  return <LibraryScreen mode={mode ?? 'documents'} />;
}
