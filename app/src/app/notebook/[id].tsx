import NotebookScreen from '../../features/editor/EditorScreen';
import { EditorShell } from '../../features/editor-shell/EditorShell';

export default function NotebookRoute() {
  return <NotebookScreen frame={EditorShell} />;
}
