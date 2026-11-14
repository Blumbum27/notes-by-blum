import { Host, HStack, Image as NativeImage, Menu, Text as NativeText } from '@expo/ui/swift-ui';
import { disabled, font, tint, foregroundStyle, labelStyle, lineLimit, multilineTextAlignment } from '@expo/ui/swift-ui/modifiers';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { Link, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState, type ReactElement } from 'react';
import { PlatformColor, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import * as repository from '../../shared/documents/repository';
import type { LibraryItem } from '../../shared/documents/types';
import { linkMenu, NativeMenuItems, type MenuGroups } from './menus';

const pageAspect = 1 / Math.SQRT2;

export function formatDate(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return `Сегодня, ${date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`;
  return date.toLocaleDateString('ru', { day: 'numeric', month: 'short', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

function Preview({ item, width, height, selected }: { item: LibraryItem; width: number; height: number; selected?: boolean }) {
  const [aspect, setAspect] = useState(pageAspect);
  const thumbnail = item.kind === 'notebook' ? new File(repository.packageDirectory(item.id), 'thumbnails', 'cover.png') : null;
  const compact = height < 80;
  let shape: { width: number; height: number };
  let content: ReactElement;
  if (item.kind === 'folder') {
    shape = { width: width * 0.86, height: width * 0.86 * 0.8 };
    content = <SymbolView name="folder.fill" tintColor={item.cover} resizeMode="scaleAspectFill" style={[shape, styles.folder]} />;
  } else {
    shape = aspect > width / height ? { width, height: width / aspect } : { width: height * aspect, height };
    content = thumbnail?.exists
      ? <Image source={{ uri: thumbnail.uri }} style={[styles.page, shape]} contentFit="cover" onLoad={event => setAspect(event.source.width / event.source.height)} />
      : <View style={[styles.page, shape, { backgroundColor: item.cover }]}><View style={styles.spine} /></View>;
  }
  return <View style={[styles.previewBox, { width, height }, compact && styles.centered]}>
    <View style={shape}>
      {content}
      {item.favorite && !compact && <View style={[styles.star, item.kind === 'folder' && { top: shape.height * 0.24 }]}><SymbolView name="star.fill" size={12} tintColor="#F5A400" /></View>}
      {selected !== undefined && <Animated.View key={String(selected)} entering={ZoomIn.duration(160)} exiting={ZoomOut.duration(120)} style={styles.check}>
        {selected
          ? <SymbolView name="checkmark.circle.fill" size={compact ? 20 : 26} tintColor={PlatformColor('systemBlue')} style={styles.checkFill} />
          : <View style={[styles.ring, compact && styles.ringCompact]} />}
      </Animated.View>}
    </View>
  </View>;
}

type Props = { item: LibraryItem; width: number; list: boolean; selected?: boolean; href?: Href; zoom?: boolean; onPress?: () => void; menu: MenuGroups };

export function LibraryCell({ item, width, list, selected, href, zoom, onPress, menu }: Props) {
  const selecting = selected !== undefined;
  const wrap = (content: ReactElement) => href
    ? <Link href={href} asChild><Link.Trigger withAppleZoom={zoom}>{content}</Link.Trigger>{linkMenu(menu)}</Link>
    : content;
  if (list) return <View style={styles.row}>
    {wrap(<Pressable accessibilityRole="button" accessibilityLabel={item.title} accessibilityState={{ selected }} onPress={onPress} style={styles.rowMain}>
      <Preview item={item} width={44} height={56} selected={selected} />
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={styles.rowTitle}>{item.title}</Text>
        <Text numberOfLines={1} style={styles.date}>{formatDate(item.modifiedAt)}</Text>
      </View>
      {item.favorite && <SymbolView name="star.fill" size={14} tintColor="#F5A400" />}
      {item.kind === 'folder' && !selecting && <SymbolView name="chevron.right" size={14} weight="semibold" tintColor={PlatformColor('tertiaryLabel')} />}
    </Pressable>)}
    <Host style={styles.rowMenu}><Menu label="Действия" systemImage="ellipsis.circle" modifiers={[labelStyle('iconOnly'), disabled(selecting)]}><NativeMenuItems groups={menu} /></Menu></Host>
  </View>;
  const previewHeight = Math.round(width * 0.94);
  return <View style={{ width }}>
    {wrap(<Pressable accessibilityRole="button" accessibilityLabel={item.title} accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <Preview item={item} width={width} height={previewHeight} selected={selected} />
    </Pressable>)}
    <Host matchContents={{ vertical: true }} style={[styles.title, { width }]}>
      <Menu modifiers={[disabled(selecting), tint({ type: 'hierarchical', style: 'primary' })]} label={<HStack spacing={3}>
        <NativeText modifiers={[font({ textStyle: 'subheadline', weight: 'medium' }), foregroundStyle({ type: 'hierarchical', style: 'primary' }), lineLimit(2), multilineTextAlignment('center')]}>{item.title}</NativeText>
        <NativeImage systemName="chevron.down" size={9} color={PlatformColor('secondaryLabel')} />
      </HStack>}><NativeMenuItems groups={menu} /></Menu>
    </Host>
    <Text numberOfLines={1} style={[styles.date, styles.centered]}>{formatDate(item.modifiedAt)}</Text>
  </View>;
}

const styles = StyleSheet.create({
  previewBox: { alignItems: 'center', justifyContent: 'flex-end' },
  page: { borderRadius: 5, borderCurve: 'continuous', overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.12)', boxShadow: '0 1px 2px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.08)' },
  folder: { transform: [{ translateY: '7%' }] },
  spine: { position: 'absolute', left: '7%', top: 0, bottom: 0, width: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(0,0,0,0.18)' },
  star: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.94)', boxShadow: '0 1px 3px rgba(0,0,0,0.18)' },
  check: { position: 'absolute', right: 4, bottom: 4, borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.25)' },
  checkFill: { backgroundColor: '#FFFFFF', borderRadius: 14 },
  ring: { width: 24, height: 24, margin: 1, borderRadius: 12, borderWidth: 1.5, borderColor: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.18)' },
  ringCompact: { width: 18, height: 18, borderRadius: 9 },
  pressed: { opacity: 0.6 },
  title: { marginTop: 10 },
  date: { fontSize: 12, color: PlatformColor('secondaryLabel'), marginTop: 2 },
  centered: { textAlign: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: PlatformColor('separator') },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 10, paddingRight: 8 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '500', color: PlatformColor('label') },
  rowMenu: { width: 44, height: 44 },
});
