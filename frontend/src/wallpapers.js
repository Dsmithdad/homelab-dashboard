// Built-in wallpapers. Pure data: `css` is dropped straight into a CSS `background` value.
// 'theme' follows the active theme's accent colors (see ThemeModeContext), 'none' shows only the plain theme background.

export const DEFAULT_WALLPAPER_ID = 'theme';

export const WALLPAPERS = [
  { id: 'theme', name: 'Theme default', css: null },
  { id: 'none', name: 'Plain', css: null },
  {
    id: 'neon-dusk', name: 'Neon Dusk',
    css: 'linear-gradient(135deg, #1b1035 0%, #3a1c71 35%, #d76d77 75%, #ffaf7b 100%)',
  },
  {
    id: 'cyber-grid', name: 'Cyber Grid',
    css: 'linear-gradient(160deg, #05010f 0%, #12004a 45%, #00e5ff 130%)',
  },
  {
    id: 'rose-dawn', name: 'Rose Dawn',
    css: 'linear-gradient(145deg, #191724 0%, #403d52 40%, #eb6f92 100%)',
  },
  {
    id: 'midnight-city', name: 'Midnight City',
    css: 'linear-gradient(150deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  },
  {
    id: 'aurora', name: 'Aurora',
    css: 'radial-gradient(900px 600px at 15% 20%, #00ffa3 0%, transparent 60%), radial-gradient(900px 700px at 85% 80%, #7b2ff7 0%, transparent 60%), #0b0f1a',
  },
  {
    id: 'ember', name: 'Ember',
    css: 'linear-gradient(160deg, #1a0b0b 0%, #5c1a1a 50%, #ff7b00 140%)',
  },

  // Images (1920x1080 JPGs in public/wallpapers)
];
