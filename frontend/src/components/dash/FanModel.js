import React, { useEffect, useRef, useState } from 'react';
import { Box, MenuItem, Select } from '@mui/material';

// A simulated Lian Li SL Infinity-style 120 mm fan: dark square frame with glowing corner accents, a thick
// "infinity mirror" ring of RGB segments, nine blades and a dark hub. It spins at a speed proportional to the
// real RPM, and its lighting pattern is picked from FanPatternPicker (saved in this browser, shared by all fans).

const LEDS = 36;            // segments around the ring
const DEPTHS = 3;           // mirror echoes: each is smaller, thinner, dimmer and a little behind in time
const RADII = [50, 45, 40.5];
const WIDTHS = [4.6, 3.8, 3];
const BLADES = 9;
const SPIN_SCALE = 0.08;    // real fans turn far too fast to draw; 750 RPM looks like about one turn a second
const LED_FPS = 30;

export const FAN_PATTERNS = [
  { id: 'rainbow', label: 'Rainbow wave' },
  { id: 'breathing', label: 'Breathing' },
  { id: 'comet', label: 'Comet' },
  { id: 'temperature', label: 'Temperature' },
  { id: 'static', label: 'Static cyan' },
  { id: 'off', label: 'Lights off' },
];

// ---------------------------------------------------------------- pattern choice (localStorage, synced across fans)
const STORE_KEY = 'fanRgbPattern';
const EVENT = 'fanRgbPatternChange';
const readPattern = () => {
  try {
    const v = window.localStorage.getItem(STORE_KEY);
    return FAN_PATTERNS.some((p) => p.id === v) ? v : 'rainbow';
  } catch (e) {
    return 'rainbow';
  }
};

export const useFanPattern = () => {
  const [pattern, setPattern] = useState(readPattern);
  useEffect(() => {
    const sync = () => setPattern(readPattern());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  const choose = (id) => {
    try { window.localStorage.setItem(STORE_KEY, id); } catch (e) { /* storage blocked: the page still switches below */ }
    window.dispatchEvent(new Event(EVENT));
  };
  return [pattern, choose];
};

export const FanPatternPicker = () => {
  const [pattern, choose] = useFanPattern();
  return (
    <Select size="small" value={pattern} onChange={(e) => choose(e.target.value)} variant="outlined"
      inputProps={{ 'aria-label': 'Fan lighting pattern' }} sx={{ fontSize: 13, height: 30, minWidth: 140 }}>
      {FAN_PATTERNS.map((p) => <MenuItem key={p.id} value={p.id}>{p.label}</MenuItem>)}
    </Select>
  );
};

// ---------------------------------------------------------------- LED colour per pattern: returns [hue, lightness%]
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ledColor = (pattern, i, depth, t, tempC) => {
  const tt = t - depth * 0.09;                     // echoes lag, which is what sells the "tunnel"
  const dir = depth % 2 ? -1 : 1;                  // alternate echoes run the other way
  switch (pattern) {
    case 'rainbow': return [(((i / LEDS) * 360 * dir) + tt * 70 + 3600) % 360, 55];
    case 'breathing': return [200, 22 + 38 * (0.5 + 0.5 * Math.sin((tt * 2 * Math.PI) / 4))];
    case 'comet': {
      const head = ((tt * 0.55) % 1) * LEDS;
      const d = (((head - i) * dir) % LEDS + LEDS) % LEDS;
      const tail = LEDS * 0.5;
      return [(tt * 25 + 260) % 360, d < tail ? 8 + 52 * (1 - d / tail) : 8];
    }
    case 'temperature': {
      const k = clamp(((tempC ?? 40) - 30) / 55, 0, 1);   // 30 C cold blue .. 85 C red
      return [220 * (1 - k), 38 + 14 * (0.5 + 0.5 * Math.sin(tt * 2.2))];
    }
    case 'static': return [200, 52];
    default: return [0, 0];
  }
};

// ---------------------------------------------------------------- geometry (viewBox 0 0 120 120, centre 60,60)
const BLADE_PATH = 'M 0,-13 C 13,-20 26,-31 21,-45 C 13,-40 5,-30 -4,-15 Z';
const SEG = (2 * Math.PI) / LEDS;
const arcPath = (r, i) => {
  const a0 = i * SEG - Math.PI / 2 + SEG * 0.07;
  const a1 = (i + 1) * SEG - Math.PI / 2 - SEG * 0.07;
  const p = (a) => `${(60 + r * Math.cos(a)).toFixed(2)} ${(60 + r * Math.sin(a)).toFixed(2)}`;
  return `M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}`;
};
const RING_PATHS = RADII.map((r) => Array.from({ length: LEDS }, (_, i) => arcPath(r, i)));
// Four glowing diagonal bars in the frame corners; each borrows the colour of the ring segment nearest to it.
const CORNERS = [
  { d: 'M 102 8 L 112 18', led: Math.round(LEDS * 0.125) },
  { d: 'M 112 102 L 102 112', led: Math.round(LEDS * 0.375) },
  { d: 'M 18 112 L 8 102', led: Math.round(LEDS * 0.625) },
  { d: 'M 8 18 L 18 8', led: Math.round(LEDS * 0.875) },
];

const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
};

// rpm: current speed (0 or null = stopped). tempC: only used by the "temperature" pattern.
export const SpinningFan = ({ rpm, tempC, size = 120, sx }) => {
  const [pattern] = useFanPattern();
  const bladesRef = useRef(null);
  const ledRefs = useRef([]);
  const cornerRefs = useRef([]);
  const live = useRef({ rpm: 0, tempC: null, pattern });
  live.current.rpm = rpm || 0;                      // the animation loop reads these, so a new poll never restarts it
  live.current.tempC = tempC;
  live.current.pattern = pattern;

  useEffect(() => {
    const still = reducedMotion();
    let raf;
    let last = performance.now();
    let angle = 0;
    let shown = live.current.rpm;                  // displayed speed eases toward the real one
    let ledClock = 0;
    const paint = (el, [h, l], opacity) => {
      if (!el) return;
      const c = `hsl(${h.toFixed(0)} 100% ${l.toFixed(0)}%)`;
      el.setAttribute('stroke', c);
      el.setAttribute('opacity', opacity);
    };
    const frame = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!still) {
        shown += (live.current.rpm - shown) * Math.min(1, dt * 1.2);
        if (Math.abs(live.current.rpm - shown) < 0.5) shown = live.current.rpm;
        angle = (angle + (shown / 60) * 360 * SPIN_SCALE * dt) % 360;
        if (bladesRef.current) bladesRef.current.setAttribute('transform', `rotate(${angle.toFixed(2)} 60 60)`);
      }
      ledClock += dt;
      if (ledClock >= 1 / LED_FPS || still) {
        ledClock = 0;
        const t = still ? 0 : now / 1000;
        const { pattern: p, tempC: temp } = live.current;
        for (let depth = 0; depth < DEPTHS; depth += 1) {
          for (let i = 0; i < LEDS; i += 1) {
            paint(ledRefs.current[depth * LEDS + i], ledColor(p, i, depth, t, temp), (1 - depth * 0.28).toFixed(2));
          }
        }
        CORNERS.forEach((c, k) => paint(cornerRefs.current[k], ledColor(p, c.led, 0, t, temp), 1));
      }
      if (!still) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <Box aria-hidden sx={{ width: size, height: size, color: 'text.primary', flexShrink: 0, ...sx }}>
      <svg viewBox="0 0 120 120" width="100%" height="100%">
        <rect x="3" y="3" width="114" height="114" rx="13" fill="currentColor" fillOpacity="0.07" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.6" />
        {CORNERS.map((c, k) => (
          <path key={c.d} ref={(el) => { cornerRefs.current[k] = el; }} d={c.d} fill="none" strokeWidth="3.2" strokeLinecap="round" stroke="hsl(0 0% 0%)" />
        ))}
        <circle cx="60" cy="60" r="38" fill="currentColor" fillOpacity="0.05" />
        <g ref={bladesRef}>
          {Array.from({ length: BLADES }, (_, b) => (
            <path key={b} d={BLADE_PATH} fill="#000" fillOpacity="0.92" transform={`translate(60 60) rotate(${(b * 360) / BLADES}) scale(0.8)`} />
          ))}
        </g>
        <circle cx="60" cy="60" r="16" fill="#000" fillOpacity="1" />
        <circle cx="60" cy="60" r="14" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1" />
        {RING_PATHS.map((ring, depth) => ring.map((d, i) => (
          <path key={`${depth}-${i}`} ref={(el) => { ledRefs.current[depth * LEDS + i] = el; }}
            d={d} fill="none" strokeWidth={WIDTHS[depth]} strokeLinecap="butt" stroke="hsl(0 0% 0%)" />
        )))}
      </svg>
    </Box>
  );
};
