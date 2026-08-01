// Precompute Material 3 color schemes (same seeds as the Android app) -> themes.json
const { argbFromHex, themeFromSourceColor, hexFromArgb } = require('@material/material-color-utilities');
const fs = require('fs');
const path = require('path');

const SEEDS = [
  { id: 0, name: 'default', color: 0xFF6750A4 },   // M3 baseline purple (Android dynamic fallback)
  { id: 1, name: 'blue',    color: 0xFF3482FF },
  { id: 2, name: 'green',   color: 0xFF36D167 },
  { id: 3, name: 'violet',  color: 0xFF7C4DFF },
  { id: 4, name: 'yellow',  color: 0xFFFFB21D },
  { id: 5, name: 'orange',  color: 0xFFFF5722 },
  { id: 6, name: 'rose',    color: 0xFFE91E63 },
  { id: 7, name: 'cyan',    color: 0xFF00BCD4 },
];

const ROLES = [
  'primary','onPrimary','primaryContainer','onPrimaryContainer',
  'secondary','onSecondary','secondaryContainer','onSecondaryContainer',
  'tertiary','onTertiary','tertiaryContainer','onTertiaryContainer',
  'error','onError','errorContainer','onErrorContainer',
  'background','onBackground','surface','onSurface',
  'surfaceVariant','onSurfaceVariant','outline','outlineVariant',
  'shadow','scrim','inverseSurface','inverseOnSurface','inversePrimary',
  'surfaceDim','surfaceBright','surfaceContainerLowest','surfaceContainerLow',
  'surfaceContainer','surfaceContainerHigh','surfaceContainerHighest',
];

const out = {};
for (const seed of SEEDS) {
  const theme = themeFromSourceColor(seed.color);
  out[seed.id] = {
    name: seed.name,
    dark: {},
    light: {},
  };
  const neutral = theme.palettes.neutral;
  const neutralVariant = theme.palettes.neutralVariant;
  const containerTones = {
    dark: { surfaceDim: 6, surfaceBright: 24, surfaceContainerLowest: 4, surfaceContainerLow: 10, surfaceContainer: 12, surfaceContainerHigh: 17, surfaceContainerHighest: 22 },
    light: { surfaceDim: 87, surfaceBright: 98, surfaceContainerLowest: 100, surfaceContainerLow: 96, surfaceContainer: 94, surfaceContainerHigh: 92, surfaceContainerHighest: 90 },
  };
  for (const mode of ['dark','light']) {
    const s = theme.schemes[mode];
    for (const role of ROLES) {
      let v = s[role];
      if (v === undefined) {
        // container roles from neutral palette tones
        const tone = containerTones[mode][role];
        v = tone !== undefined ? neutral.tone(tone) : undefined;
      }
      if (v !== undefined) out[seed.id][mode][role] = hexFromArgb(v).replace('#','').toLowerCase();
    }
  }
}

fs.writeFileSync(path.join(__dirname, '..', 'renderer', 'js', 'themes.json'), 'window.THEMES = ' + JSON.stringify(out) + ';\n');
console.log('themes.json written, seeds:', Object.keys(out).length);
