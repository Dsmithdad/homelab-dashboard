import { alpha } from '@mui/material/styles';

// Solid status chip: bright palette color with the theme's *contrast* text
// (dark text on light colors, light text on dark ones), so it is always readable.
export const chipTone = (key) =>
  key
    ? { bgcolor: `${key}.main`, color: `${key}.contrastText`, fontWeight: 700, '& .MuiChip-label': { px: 1.25 } }
    : { bgcolor: 'action.selected', color: 'text.primary', fontWeight: 600 };

// Tinted row background with a colored edge, for log lines.
export const rowTone = (key) => (theme) => {
  const main = key ? theme.palette[key].main : theme.palette.divider;
  return {
    bgcolor: alpha(main, key ? 0.14 : 0.06),
    borderLeft: `3px solid ${main}`,
    color: theme.palette.text.primary,
  };
};
