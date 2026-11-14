import type { PropsWithChildren, ReactNode } from 'react';
import { View } from 'react-native';

/** C владеет оболочкой; центральные инструменты и ленту передаёт B. */
export function EditorShell({ children, toolbar }: PropsWithChildren<{ toolbar?: ReactNode }>) {
  return <View style={{ flex: 1 }}>{toolbar}{children}</View>;
}
