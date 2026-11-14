import { Button, Image } from '@expo/ui/swift-ui';
import { accessibilityLabel, background, buttonStyle, contentShape, font, frame, shapes } from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'expo-symbols';

/** Кнопка панели редактора: 18 pt символ в зоне касания 40×44, выбранное состояние — мягкая подложка. */
export function ToolbarButton({ label, symbol, onPress, selected = false, color = '#2A2F2E' }: {
  label: string; symbol: SFSymbol; onPress?: () => void; selected?: boolean; color?: string;
}) {
  return <Button onPress={onPress} modifiers={[buttonStyle('plain'), accessibilityLabel(label)]}>
    <Image systemName={symbol} size={18} color={selected ? '#1F6FE5' : color} modifiers={[
      font({ size: 18, weight: 'regular' }), frame({ width: 36, height: 32 }),
      ...(selected ? [background('#E6EFFD', shapes.roundedRectangle({ cornerRadius: 9 }))] : []),
      frame({ width: 40, height: 44 }), contentShape(shapes.rectangle()),
    ]} />
  </Button>;
}
