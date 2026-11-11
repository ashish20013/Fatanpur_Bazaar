import React from 'react';
import Svg, { Path, type NumberProp } from 'react-native-svg';
import type { StyleProp, ViewStyle } from 'react-native';
import { ICONS, type IconNode } from '../icons/icon-data';
import { PRODUCE_ICONS } from '../icons/icon-data-produce';
import { CATEGORY_ART } from '../icons/icon-data-category';
import { PRODUCT_ART } from '../icons/icon-data-product';
import { colors } from '../theme/tokens';

/**
 * The SAME icons as the website — the path data in ../icons is copied straight from
 * apps/web/src/components/icon-data*.ts, so a basket here is the basket there, to the pixel.
 *
 * The site inlines one cached SVG sprite and points at it with <use>. React Native has no
 * sprite and no <use>, so we draw the paths directly; the data, the 24-unit box and the stroke
 * weight are unchanged.
 */

const LINE: Record<string, IconNode> = { ...ICONS, ...PRODUCE_ICONS };

function renderNodes(nodes: IconNode, inheritColour: boolean, colour: string): React.JSX.Element[] {
  return nodes.map(([, attrs], i) => (
    <Path
      key={i}
      d={attrs.d}
      // Colour art carries its own fills; line icons inherit the current colour as a stroke.
      fill={attrs.fill === 'currentColor' ? colour : (attrs.fill ?? (inheritColour ? 'none' : undefined))}
      stroke={attrs.stroke === 'none' ? undefined : inheritColour ? colour : attrs.stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ));
}

/** Line icon (Tabler, MIT). Unknown names fall back to a neutral basket, exactly like the site. */
export function Icon({
  name,
  size = 22,
  color = colors.ink,
  stroke = 1.75,
  style,
}: {
  name: string;
  size?: NumberProp;
  color?: string;
  stroke?: number;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const nodes = LINE[name] ?? LINE.basket;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth={stroke} style={style}>
      {renderNodes(nodes as IconNode, true, color)}
    </Svg>
  );
}

/**
 * Coloured category / product art, drawn on a 64-unit box and carrying its own fills — so unlike
 * `Icon` this sets neither stroke nor fill on the wrapper, or an inherited stroke would outline
 * every shape. A name with no art falls back to the line icon, so a category the shopkeeper adds
 * later still shows up.
 */
export function ColourArt({
  name,
  fallback = 'basket',
  size = 44,
  color = colors.ink,
  style,
}: {
  name: string;
  fallback?: string;
  size?: NumberProp;
  color?: string;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const art = CATEGORY_ART[name] ?? PRODUCT_ART[name];
  if (!art) return <Icon name={fallback} size={size} color={color} style={style} />;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" style={style}>
      {renderNodes(art, false, color)}
    </Svg>
  );
}

export function hasColourArt(name: string): boolean {
  return Boolean(CATEGORY_ART[name] ?? PRODUCT_ART[name]);
}
