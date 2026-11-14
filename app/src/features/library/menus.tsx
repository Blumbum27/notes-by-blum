import { Button, Divider, Menu } from '@expo/ui/swift-ui';
import { Link } from 'expo-router';
import { Fragment } from 'react';
import type { SFSymbol } from 'sf-symbols-typescript';

export type MenuAction = { title: string; icon?: SFSymbol; destructive?: boolean; isOn?: boolean; onPress?: () => void; children?: MenuAction[] };
export type MenuGroups = MenuAction[][];

function nativeActions(actions: MenuAction[]) {
  return actions.map(action => action.children
    ? <Menu key={action.title} label={action.title} systemImage={action.icon}>{nativeActions(action.children)}</Menu>
    : <Button key={action.title} label={action.title} systemImage={action.isOn ? 'checkmark' : action.icon} role={action.destructive ? 'destructive' : undefined} onPress={action.onPress} />);
}

export function NativeMenuItems({ groups }: { groups: MenuGroups }) {
  return groups.map((group, index) => <Fragment key={index}>{index > 0 && <Divider />}{nativeActions(group)}</Fragment>);
}

function linkActions(actions: MenuAction[]) {
  return actions.map(action => action.children
    ? <Link.Menu key={action.title} title={action.title} icon={action.icon}>{linkActions(action.children)}</Link.Menu>
    : <Link.MenuAction key={action.title} icon={action.icon} destructive={action.destructive} isOn={action.isOn} onPress={action.onPress}>{action.title}</Link.MenuAction>);
}

export function linkMenu(groups: MenuGroups) {
  return <Link.Menu>{groups.map((group, index) => <Link.Menu key={index} inline>{linkActions(group)}</Link.Menu>)}</Link.Menu>;
}
