/**
 * Universal color palette swapper — single source for every swappable accent.
 *
 * HOW IT WORKS
 * - Each colorway defines the accent vars for light + dark mode.
 * - The store persists the active id (`jw2_colorway`) and writes the matching
 *   set onto `document.documentElement` via `style.setProperty`, so one switch
 *   repaints buttons, links, tabs, switches, chips, rings and the logo at once.
 * - Neutrals (paper/card/ink/muted/border) and semantics (success/warning/danger)
 *   are NOT swappable — they come from the `.dark` class in system.css.
 * - The graph ramp (pine/sage/mist/tan/fog) is shared by all colorways.
 *
 * TO ADD A COLORWAY: append one entry below (id, label, swatch, light, dark).
 * No other file needs editing — Settings renders the swatches automatically.
 */

export interface ColorwayVars {
  '--primary': string;
  '--primary-ink': string;
  '--info': string;
  '--ring': string;
}

export interface Colorway {
  id: string;
  label: string;
  /** swatch dot shown in Settings */
  swatch: string;
  light: ColorwayVars;
  dark: ColorwayVars;
}

export const COLORWAYS: Colorway[] = [
  {
    id: 'signal',
    label: 'Signal Deck',
    swatch: '#1a2333',
    light: { '--primary': '#1a2333', '--primary-ink': '#ffffff', '--info': '#2f5bff', '--ring': '#9aa5c0' },
    dark: { '--primary': '#dfe6f5', '--primary-ink': '#1a2333', '--info': '#8aa8ff', '--ring': '#55648a' },
  },
  {
    id: 'cobalt',
    label: 'Cobalt',
    swatch: '#2f5bff',
    light: { '--primary': '#2f5bff', '--primary-ink': '#ffffff', '--info': '#2f5bff', '--ring': '#7aa2ff' },
    dark: { '--primary': '#8aa8ff', '--primary-ink': '#0f1830', '--info': '#8aa8ff', '--ring': '#3d4f8f' },
  },
  {
    id: 'pine',
    label: 'Pine',
    swatch: '#2e4038',
    light: { '--primary': '#2e4038', '--primary-ink': '#ffffff', '--info': '#476355', '--ring': '#9db5a8' },
    dark: { '--primary': '#a9c3b4', '--primary-ink': '#1c2a23', '--info': '#7d9b8d', '--ring': '#3d554a' },
  },
  {
    id: 'clay',
    label: 'Clay',
    swatch: '#8a6d2f',
    light: { '--primary': '#8a6d2f', '--primary-ink': '#ffffff', '--info': '#b25000', '--ring': '#c4ad7f' },
    dark: { '--primary': '#d9bd84', '--primary-ink': '#2b2113', '--info': '#e09a5f', '--ring': '#6b5a35' },
  },
];

export const DEFAULT_COLORWAY = 'signal';

export function resolveColorway(id: string): Colorway {
  return COLORWAYS.find(c => c.id === id) ?? COLORWAYS[0];
}

/** Write a colorway's vars for the given mode onto <html>. */
export function applyColorway(id: string, dark: boolean) {
  const set = dark ? resolveColorway(id).dark : resolveColorway(id).light;
  const root = document.documentElement;
  (Object.entries(set) as [keyof ColorwayVars, string][]).forEach(([k, v]) => root.style.setProperty(k, v));
}
