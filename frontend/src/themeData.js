// Color palettes for the dashboard themes. Pure data (no imports) so it is easy to edit and test.
//
// Inspired by the theme lineup that ships with Omarchy. Each palette is based on the
// published colors of the upstream scheme; a few semantic colors (success/warning/info)
// are tuned so every theme has a readable green / amber / red / blue.
//
// Fields:
//   bg       page background          surface   sidebar + top bar
//   surface2 cards and panels         border    thin lines
//   text     main text                muted     secondary text
//   accent   primary color            accent2   secondary color
//   success / warning / error / info  status colors

export const DEFAULT_THEME_ID = 'rose-pine';

export const THEMES = [
  {
    id: 'tokyo-night', name: 'Tokyo Night', mode: 'dark',
    c: { bg: '#1a1b26', surface: '#16161e', surface2: '#1f2335', border: '#3b4261', text: '#c0caf5', muted: '#a9b1d6',
         accent: '#7aa2f7', accent2: '#bb9af7', success: '#9ece6a', warning: '#e0af68', error: '#f7768e', info: '#7dcfff' },
  },
  {
    id: 'catppuccin', name: 'Catppuccin', mode: 'dark',
    c: { bg: '#1e1e2e', surface: '#181825', surface2: '#313244', border: '#45475a', text: '#cdd6f4', muted: '#a6adc8',
         accent: '#89b4fa', accent2: '#cba6f7', success: '#a6e3a1', warning: '#f9e2af', error: '#f38ba8', info: '#89dceb' },
  },
  {
    id: 'catppuccin-latte', name: 'Catppuccin Latte', mode: 'light',
    c: { bg: '#eff1f5', surface: '#e6e9ef', surface2: '#ffffff', border: '#bcc0cc', text: '#4c4f69', muted: '#5c5f77',
         accent: '#1e66f5', accent2: '#8839ef', success: '#40a02b', warning: '#bf7408', error: '#d20f39', info: '#0987b8' },
  },
  {
    id: 'gruvbox', name: 'Gruvbox', mode: 'dark',
    c: { bg: '#282828', surface: '#1d2021', surface2: '#3c3836', border: '#504945', text: '#ebdbb2', muted: '#b8a995',
         accent: '#fabd2f', accent2: '#d3869b', success: '#b8bb26', warning: '#fe8019', error: '#fb4934', info: '#83a598' },
  },
  {
    id: 'nord', name: 'Nord', mode: 'dark',
    c: { bg: '#2e3440', surface: '#272c36', surface2: '#3b4252', border: '#4c566a', text: '#e5e9f0', muted: '#aeb8c9',
         accent: '#88c0d0', accent2: '#b48ead', success: '#a3be8c', warning: '#ebcb8b', error: '#d97b85', info: '#81a1c1' },
  },
  {
    id: 'rose-pine', name: 'Rosé Pine', mode: 'dark',
    c: { bg: '#191724', surface: '#16141f', surface2: '#26233a', border: '#403d52', text: '#e0def4', muted: '#9a96b4',
         accent: '#c4a7e7', accent2: '#ebbcba', success: '#8fbf9f', warning: '#f6c177', error: '#eb6f92', info: '#9ccfd8' },
  },
  {
    id: 'everforest', name: 'Everforest', mode: 'dark',
    c: { bg: '#2d353b', surface: '#232a2e', surface2: '#343f44', border: '#475258', text: '#d3c6aa', muted: '#adb9b0',
         accent: '#83c092', accent2: '#d699b6', success: '#a7c080', warning: '#dbbc7f', error: '#e67e80', info: '#7fbbb3' },
  },
  {
    id: 'kanagawa', name: 'Kanagawa', mode: 'dark',
    c: { bg: '#1f1f28', surface: '#16161d', surface2: '#2a2a37', border: '#363646', text: '#dcd7ba', muted: '#a6a69c',
         accent: '#7e9cd8', accent2: '#957fb8', success: '#98bb6c', warning: '#e6c384', error: '#e46876', info: '#7fb4ca' },
  },
  {
    id: 'ristretto', name: 'Ristretto', mode: 'dark',
    c: { bg: '#2c2525', surface: '#211c1c', surface2: '#403e41', border: '#5b595c', text: '#fff1f3', muted: '#c3b7b8',
         accent: '#f9cc6c', accent2: '#a8a9eb', success: '#adda78', warning: '#f38d70', error: '#fd6883', info: '#85dacc' },
  },
  {
    id: 'matte-black', name: 'Matte Black', mode: 'dark',
    c: { bg: '#121212', surface: '#0b0b0b', surface2: '#1e1e1e', border: '#333333', text: '#d8d8d8', muted: '#9a9a9a',
         accent: '#e68e0d', accent2: '#8a9bb0', success: '#8fb573', warning: '#e6b450', error: '#e06c75', info: '#6cb6d9' },
  },
  {
    id: 'cyberpunk', name: 'Cyberpunk', mode: 'dark', neon: true, bgStyle: 'grid',
    c: { bg: '#0b0b14', surface: '#07070d', surface2: '#15152a', border: '#3a3a5c', text: '#f2f2ff', muted: '#a7aacb',
         accent: '#fcee0a', accent2: '#00f0ff', success: '#00ff9f', warning: '#ff9f1c', error: '#ff2a6d', info: '#05d9e8' },
  },
  {
    id: 'synthwave-84', name: "Synthwave '84", mode: 'dark', neon: true, bgStyle: 'grid',
    c: { bg: '#262335', surface: '#1b1829', surface2: '#34294f', border: '#5a4a8a', text: '#f4f1ff', muted: '#c2b8e0',
         accent: '#ff7edb', accent2: '#36f9f6', success: '#72f1b8', warning: '#fede5d', error: '#fe4450', info: '#2ee2fa' },
  },
  {
    id: 'neon-tokyo', name: 'Neon Tokyo', mode: 'dark', neon: true, bgStyle: 'grid',
    c: { bg: '#14141f', surface: '#0d0d17', surface2: '#1e1f33', border: '#3b3f66', text: '#c9d1ff', muted: '#a3acd9',
         accent: '#ff5dc8', accent2: '#00e5ff', success: '#39ff88', warning: '#ffd23f', error: '#ff4d7d', info: '#4cc9ff' },
  },
  {
    // Matches the user's own monitoring panel: cyan + purple neon, chamfered frames, LED lettering.
    // hud: true switches on the LED font, chamfered tiles and glowing frames (see themes.js and viz.js).
    id: 'neon-hud', name: 'Neon HUD', mode: 'dark', neon: true, hud: true,
    c: { bg: '#06030f', surface: '#0b0620', surface2: '#130b33', border: '#4b2a9a', text: '#ffffff', muted: '#bfaef5',
         accent: '#00f5ff', accent2: '#c13cff', success: '#00ffa6', warning: '#ffd84d', error: '#ff3d81', info: '#3fa9ff' },
  },
];
