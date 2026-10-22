import { createTheme, alpha } from '@mui/material/styles';
import { THEMES, DEFAULT_THEME_ID } from './themeData';

export { THEMES, DEFAULT_THEME_ID };

const MONO = '"JetBrains Mono","JetBrainsMono Nerd Font","Fira Code","Cascadia Code",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
// 14-segment LED font (bundled in public/fonts), used only by the Neon HUD theme. Falls back to mono for glyphs it lacks (arrows, dots).
const LED = '"DSEG14 Classic",' + MONO;
const SANS = 'Inter,"Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif';

// Turn one palette from themeData.js into a full MUI theme.
// glass = frosted, translucent panels with a blurred backdrop (Apple-style); false = solid panels.
export function buildTheme(def, { glass = true } = {}) {
  const c = def.c;
  const dark = def.mode === 'dark';
  const hud = Boolean(def.hud);
  const heading = hud
    ? { fontFamily: LED, fontWeight: 400, letterSpacing: '0.02em', textTransform: 'uppercase' }
    : { fontFamily: MONO, fontWeight: 600, letterSpacing: '-0.01em' };

  // Panel look. Alpha stays high enough that text contrast holds over the ambient background.
  const panelAlpha = glass ? (hud ? 0.84 : dark ? 0.62 : 0.66) : 1;
  const panelBg = alpha(c.surface2, panelAlpha);
  const sideAlpha = glass ? (dark ? 0.55 : 0.6) : 1;
  const blur = glass ? 'blur(20px) saturate(170%)' : 'none';
  const edge = hud ? alpha(c.accent2, 0.65) : glass ? alpha(dark ? '#ffffff' : '#000000', dark ? 0.12 : 0.1) : c.border;
  const lift = hud
    ? `0 0 14px ${alpha(c.accent2, 0.35)}, inset 0 0 18px ${alpha(c.accent, 0.06)}`
    : glass
    ? `inset 0 1px 0 ${alpha('#ffffff', dark ? 0.07 : 0.6)}, 0 10px 30px ${alpha('#000000', dark ? 0.32 : 0.08)}`
    : 'none';
  const noBlurFallback = { '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))': { backgroundColor: c.surface2 } };
  const glow = def.neon ? `0 0 14px ${alpha(c.accent, 0.5)}` : 'none';

  return createTheme({
    hud, // read by components (Tile, RingGauge, Pill) to switch layout and fonts
    hudFont: LED,
    monoFont: hud ? LED : 'monospace', // for numbers and short data labels (not long text)
    palette: {
      mode: def.mode,
      contrastThreshold: 4.5,
      primary: { main: c.accent },
      secondary: { main: c.accent2 },
      success: { main: c.success },
      warning: { main: c.warning },
      error: { main: c.error },
      info: { main: c.info },
      background: { default: c.bg, paper: c.surface2 },
      text: { primary: c.text, secondary: c.muted },
      divider: c.border,
      action: { hover: alpha(c.accent, 0.1), selected: alpha(c.accent, 0.2) },
    },
    shape: { borderRadius: hud ? 6 : 12 },
    typography: {
      fontFamily: SANS,
      h1: heading, h2: heading, h3: heading, h4: heading, h5: heading, h6: heading,
      subtitle1: { fontFamily: MONO }, overline: { fontFamily: hud ? LED : MONO },
      button: hud
        ? { fontFamily: LED, textTransform: 'uppercase', fontWeight: 400, letterSpacing: '0.04em' }
        : { fontFamily: MONO, textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: c.bg, color: c.text },
          '::selection': { backgroundColor: alpha(c.accent, 0.35) },
          '*::-webkit-scrollbar': { width: 10, height: 10 },
          '*::-webkit-scrollbar-track': { background: 'transparent' },
          '*::-webkit-scrollbar-thumb': { background: alpha(c.muted, 0.35), borderRadius: 6, border: '2px solid transparent', backgroundClip: 'content-box' },
          '*::-webkit-scrollbar-thumb:hover': { background: alpha(c.muted, 0.6), backgroundClip: 'content-box' },
          a: { color: c.accent },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: panelBg,
            backdropFilter: blur, WebkitBackdropFilter: blur,
            border: `1px solid ${edge}`,
            boxShadow: lift,
            ...(glass ? noBlurFallback : {}),
          },
        },
      },
      MuiCard: { defaultProps: { elevation: 0 }, styleOverrides: { root: { borderRadius: hud ? 6 : 16 } } },
      MuiAppBar: {
        defaultProps: { elevation: 0, color: 'inherit' },
        styleOverrides: {
          root: ({ theme }) => ({
            zIndex: theme.zIndex.drawer + 1,
            backgroundColor: alpha(c.surface, sideAlpha), color: c.text, backgroundImage: 'none',
            border: 'none', borderBottom: `1px solid ${edge}`, borderRadius: 0,
            boxShadow: def.neon ? `0 1px 18px ${alpha(c.accent, 0.25)}` : 'none',
          }),
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: alpha(c.surface, sideAlpha), backgroundImage: 'none', borderRadius: 0,
            border: 'none', borderRight: `1px solid ${edge}`, boxShadow: 'none',
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            backgroundColor: alpha(c.surface2, glass ? 0.86 : 1),
            backdropFilter: glass ? 'blur(28px) saturate(180%)' : 'none',
            WebkitBackdropFilter: glass ? 'blur(28px) saturate(180%)' : 'none',
            borderRadius: 14,
          },
        },
      },
      MuiDialog: { styleOverrides: { paper: { backgroundColor: alpha(c.surface2, glass ? 0.9 : 1), borderRadius: 18 } } },
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: hud ? 4 : 10 },
          containedPrimary: { boxShadow: glow, '&:hover': { boxShadow: glow } },
        },
      },
      MuiChip: { styleOverrides: { root: { fontFamily: MONO, borderRadius: 8 } } },
      MuiTab: { styleOverrides: { root: { fontFamily: MONO, textTransform: 'none' } } },
      MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: 2, boxShadow: glow } } },
      MuiTableCell: {
        styleOverrides: {
          root: { borderBottom: `1px solid ${alpha(c.border, 0.7)}` },
          head: {
            fontFamily: MONO, color: c.muted, textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.06em',
            backgroundColor: alpha(c.surface, glass ? 0.5 : 1),
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { backgroundColor: alpha(c.bg, glass ? 0.35 : 0), borderRadius: 10 },
          notchedOutline: { borderColor: alpha(c.muted, 0.35) },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { backgroundColor: alpha(c.surface, 0.95), color: c.text, border: `1px solid ${c.border}`, fontFamily: MONO, fontSize: '0.75rem' },
        },
      },
    },
  });
}
