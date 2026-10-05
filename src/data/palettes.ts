// Monochrome glitch ramps, darkest to lightest.
// Each ramp keeps the hue of one Figma colour and only changes lightness:
//   calastone  from #002dbf (navy)
//   bamboo     from #001c0c (green)
//   juicyway   from #1c0017 (purple)
//   neutral    from #121212 (Home and About)
export const palettes = {
  calastone: ['#030d29', '#0f2864', '#254ba4', '#4d7bdf', '#8ab0fe', '#d8e5ff'],
  bamboo: ['#001507', '#01381e', '#026338', '#09995a', '#6bc891', '#cbefd7'],
  juicyway: ['#1e0419', '#4d1042', '#812872', '#b855a5', '#e193cf', '#fbd9f2'],
  neutral: ['#121212', '#2e2e2e', '#525252', '#808080', '#b1b1b1', '#e4e4e4'],
} as const;

export type PaletteName = keyof typeof palettes;
