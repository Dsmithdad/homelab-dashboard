import React from 'react';
import { Box, Card, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useThemeMode } from '../../contexts/ThemeModeContext';

// ---------------------------------------------------------------- formatting helpers
export const fmtBytes = (n) => {
  if (n == null) return '–';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
};
export const fmtRate = (bps) => `${fmtBytes(bps)}/s`;
export const fmtUptime = (s) => {
  if (s == null) return '–';
  const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};

// green-ish below 70, amber below 90, red above (as palette keys)
export const levelTone = (pct) => (pct == null ? 'primary' : pct < 70 ? 'primary' : pct < 90 ? 'warning' : 'error');
// temperature rings: calm below 65°C, amber below 80°C, red above
export const tempTone = (c) => (c == null ? 'primary' : c < 65 ? 'primary' : c < 80 ? 'warning' : 'error');

// ---------------------------------------------------------------- Tile: a glass card with a colored accent line
// Corner-cut ("chamfered") rectangle used by the Neon HUD theme.
const chamfer = (c) => `polygon(${c}px 0, 100% 0, 100% calc(100% - ${c}px), calc(100% - ${c}px) 100%, 0 100%, 0 ${c}px)`;

export const Tile = ({ title, tone = 'primary', right, children, sx }) => {
  const theme = useTheme();
  const hud = Boolean(theme.hud);
  const card = (
    <Card
      sx={[
        (t) => ({
          position: 'relative', p: 2, pb: 2.5, height: '100%',
          '&::after': {
            content: '""', position: 'absolute', left: 16, right: 16, bottom: 0, height: 3, borderRadius: 3,
            background: `linear-gradient(90deg, ${t.palette[tone].main}, ${alpha(t.palette[tone].main, 0)})`,
          },
        }),
        hud && { clipPath: chamfer(12), border: 'none', borderRadius: 0, boxShadow: 'none' },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {(title || right) && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: hud ? '0.08em' : '0.12em', lineHeight: 1.2 }}>{title}</Typography>
          {right}
        </Box>
      )}
      {children}
    </Card>
  );
  if (!hud) return card;
  // HUD frame: a cyan-to-purple gradient shows as a 2px border around the clipped card, and the glow
  // sits on an outer wrapper (a glow on the clipped element itself would be cut off by the corners).
  return (
    <Box sx={{ height: '100%', filter: `drop-shadow(0 0 5px ${alpha(theme.palette.secondary.main, 0.75)})` }}>
      <Box sx={{ height: '100%', p: '2px', clipPath: chamfer(14), background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})` }}>
        {card}
      </Box>
    </Box>
  );
};

// ---------------------------------------------------------------- RingGauge
const FullRing = ({ value, size = 104, stroke = 9, label, sub, tone }) => {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(100, value ?? 0));
  const color = theme.palette[tone || levelTone(value)].main;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={alpha(theme.palette.text.secondary, 0.18)} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.3s', filter: `drop-shadow(0 0 5px ${alpha(color, 0.55)})` }}
        />
      </svg>
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ fontFamily: theme.hud ? theme.hudFont : 'monospace', fontWeight: theme.hud ? 400 : 700, fontSize: size * (theme.hud ? 0.19 : 0.24), lineHeight: 1 }}>
          {value == null ? '–' : `${Math.round(pct)}${label ?? '%'}`}
        </Typography>
        {sub && <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, lineHeight: 1 }}>{sub}</Typography>}
      </Box>
    </Box>
  );
};

// Shared by the gauge looks: the value text, e.g. "49°C" (label replaces the % sign).
const gaugeText = (value, pct, label) => (value == null ? '–' : `${Math.round(pct)}${label ?? '%'}`);

// Half-circle gauge: the arc opens downward, the value sits inside it and `sub` goes underneath.
const ArcGauge = ({ value, size = 104, stroke = 9, label, sub, tone }) => {
  const theme = useTheme();
  const pct = Math.max(0, Math.min(100, value ?? 0));
  const color = theme.palette[tone || levelTone(value)].main;
  const r = (size - stroke) / 2;
  const height = r + stroke / 2 + 2;
  const d = `M ${stroke / 2} ${r + stroke / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${r + stroke / 2}`;
  return (
    <Box sx={{ position: 'relative', width: size, flexShrink: 0, textAlign: 'center' }}>
      <svg width={size} height={height} viewBox={`0 0 ${size} ${height}`} style={{ display: 'block' }}>
        <path d={d} fill="none" stroke={alpha(theme.palette.text.secondary, 0.18)} strokeWidth={stroke} strokeLinecap="round" />
        <path
          d={d} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" pathLength="100" strokeDasharray={`${pct} 100`}
          style={{ transition: 'stroke-dasharray 0.6s ease, stroke 0.3s', filter: `drop-shadow(0 0 5px ${alpha(color, 0.55)})` }}
        />
      </svg>
      <Typography
        sx={{
          position: 'absolute', left: 0, right: 0, top: height - size * 0.27,
          fontFamily: theme.hud ? theme.hudFont : 'monospace', fontWeight: theme.hud ? 400 : 700, fontSize: size * (theme.hud ? 0.19 : 0.24), lineHeight: 1,
        }}
      >
        {gaugeText(value, pct, label)}
      </Typography>
      {sub && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2, mt: 0.25 }}>{sub}</Typography>}
    </Box>
  );
};

// A full-width bar with text inside it. Used by the bar gauges and by Storage ("379 GB free").
// pct = how full the bar is (0-100), text = what to print inside, caption = small label above (optional).
export const BarMeter = ({ pct, text, caption, tone = 'primary' }) => {
  const theme = useTheme();
  const fill = Math.max(0, Math.min(100, pct ?? 0));
  const color = theme.palette[tone].main;
  return (
    <Box sx={{ flex: 1, width: '100%', minWidth: 120 }}>
      {caption && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3, mb: 0.25, fontFamily: theme.hud ? theme.hudFont : undefined }}>
          {caption}
        </Typography>
      )}
      <Box
        sx={{
          position: 'relative', height: 24, overflow: 'hidden', borderRadius: theme.hud ? 1 : 3,
          bgcolor: alpha(theme.palette.text.secondary, 0.18), border: `1px solid ${alpha(color, 0.45)}`,
        }}
      >
        <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${fill}%`, bgcolor: color, boxShadow: `0 0 10px ${alpha(color, 0.6)}`, transition: 'width 0.6s ease, background-color 0.3s' }} />
        <Typography
          noWrap
          sx={{
            position: 'relative', textAlign: 'center', lineHeight: '22px', px: 1, color: '#fff', textShadow: '0 0 3px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.6)',
            fontFamily: theme.hud ? theme.hudFont : 'monospace', fontWeight: theme.hud ? 400 : 700, fontSize: theme.hud ? 15 : 13,
          }}
        >
          {text}
        </Typography>
      </Box>
    </Box>
  );
};

// Bar look of the load/temp gauges. Ignores `size`.
const BarGauge = ({ value, label, sub, tone }) => {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  return <BarMeter pct={pct} text={gaugeText(value, pct, label)} caption={sub} tone={tone || levelTone(value)} />;
};

// The gauge every tile uses; its look (ring / half-circle / bar) is a user setting in the theme menu.
export const RingGauge = (props) => {
  const { gaugeStyle } = useThemeMode();
  if (gaugeStyle === 'bar') return <BarGauge {...props} />;
  if (gaugeStyle === 'arc') return <ArcGauge {...props} />;
  return <FullRing {...props} />;
};

// Lays gauges out side by side (rings, arcs) or stacked (bars).
export const GaugeRow = ({ children, sx }) => {
  const { gaugeStyle } = useThemeMode();
  const bar = gaugeStyle === 'bar';
  return (
    <Box sx={[{ display: 'flex', flexDirection: bar ? 'column' : 'row', alignItems: bar ? 'stretch' : 'center', justifyContent: bar ? 'flex-start' : 'space-around', gap: bar ? 1.25 : 1 }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {children}
    </Box>
  );
};

// ---------------------------------------------------------------- Sparkline
export const Sparkline = ({ values = [], tone = 'primary', height = 40, max, min = 0 }) => {
  const theme = useTheme();
  const color = theme.palette[tone].main;
  const w = 200;
  if (values.length < 2) return <Box sx={{ height }} />;
  const hi = max ?? Math.max(...values, 1);
  const lo = min;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, height - 3 - ((v - lo) / (hi - lo || 1)) * (height - 6)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const gid = `spark-${tone}-${height}`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" width="100%" height={height} style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${w},${height} L0,${height} Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

// ---------------------------------------------------------------- Pill (header status chips)
export const Pill = ({ label, value, tone = 'primary' }) => (
  <Box
    sx={(theme) => ({
      display: 'inline-flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.6, borderRadius: 99,
      border: `1px solid ${alpha(theme.palette[tone].main, 0.45)}`, bgcolor: alpha(theme.palette[tone].main, 0.1),
    })}
  >
    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: `${tone}.main`, boxShadow: (t) => `0 0 8px ${alpha(t.palette[tone].main, 0.8)}` }} />
    <Typography variant="caption" color="text.secondary" sx={(t) => ({ fontFamily: t.hud ? t.hudFont : 'monospace' })}>{label}</Typography>
    <Typography variant="caption" sx={(t) => ({ fontFamily: t.hud ? t.hudFont : 'monospace', fontWeight: t.hud ? 400 : 700 })}>{value}</Typography>
  </Box>
);
