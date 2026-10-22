import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ThemeProvider, alpha } from '@mui/material/styles';
import { Chart as ChartJS } from 'chart.js';
import { THEMES, DEFAULT_THEME_ID, buildTheme } from '../themes';
import { WALLPAPERS, DEFAULT_WALLPAPER_ID } from '../wallpapers';
import { loadCustomWallpaper, saveCustomWallpaper, clearCustomWallpaper } from '../utils/wallpaperStore';

const THEME_KEY = 'homelab-theme';
const GLASS_KEY = 'homelab-glass';
const WALLPAPER_KEY = 'homelab-wallpaper';
const DIM_KEY = 'homelab-wallpaper-dim';
const BLUR_KEY = 'homelab-wallpaper-blur';
const CUSTOM_ID = 'custom';
const GAUGE_KEY = 'homelab-gauge-style';
export const GAUGE_STYLES = ['ring', 'arc', 'bar'];
const ThemeModeContext = createContext(null);

// localStorage can be blocked (private windows etc.), so every access is wrapped.
const readSavedTheme = () => {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    return THEMES.some((t) => t.id === saved) ? saved : DEFAULT_THEME_ID;
  } catch (e) {
    return DEFAULT_THEME_ID;
  }
};
const readSavedGlass = () => {
  try { return window.localStorage.getItem(GLASS_KEY) !== 'off'; } catch (e) { return true; }
};

const readSavedWallpaper = () => {
  try {
    const saved = window.localStorage.getItem(WALLPAPER_KEY);
    return saved === CUSTOM_ID || WALLPAPERS.some((w) => w.id === saved) ? saved : DEFAULT_WALLPAPER_ID;
  } catch (e) {
    return DEFAULT_WALLPAPER_ID;
  }
};

// Reads a saved 0..max number setting, falling back to 0 when missing or out of range.
const readSavedNumber = (key, max) => () => {
  try {
    const n = Number(window.localStorage.getItem(key));
    return Number.isFinite(n) && n >= 0 && n <= max ? n : 0;
  } catch (e) {
    return 0;
  }
};

const readSavedGauge = () => {
  try {
    const saved = window.localStorage.getItem(GAUGE_KEY);
    return GAUGE_STYLES.includes(saved) ? saved : 'ring';
  } catch (e) {
    return 'ring';
  }
};

export function AppThemeProvider({ children }) {
  const [themeId, setThemeIdState] = useState(readSavedTheme);
  const [glass, setGlassState] = useState(readSavedGlass);
  const [wallpaperId, setWallpaperIdState] = useState(readSavedWallpaper);
  const [gaugeStyle, setGaugeStyleState] = useState(readSavedGauge);
  const setGaugeStyle = useCallback((style) => {
    setGaugeStyleState(style);
    try { window.localStorage.setItem(GAUGE_KEY, style); } catch (e) { /* ignore */ }
  }, []);
  const [customUrl, setCustomUrl] = useState(null);
  const [dim, setDimState] = useState(readSavedNumber(DIM_KEY, 95));
  const [blur, setBlurState] = useState(readSavedNumber(BLUR_KEY, 20));
  const current = THEMES.find((t) => t.id === themeId) || THEMES[0];
  const theme = useMemo(() => buildTheme(current, { glass }), [current, glass]);

  const setThemeId = useCallback((id) => {
    setThemeIdState(id);
    try { window.localStorage.setItem(THEME_KEY, id); } catch (e) { /* ignore */ }
  }, []);
  const setGlass = useCallback((on) => {
    setGlassState(on);
    try { window.localStorage.setItem(GLASS_KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ }
  }, []);

  const setWallpaperId = useCallback((id) => {
    setWallpaperIdState(id);
    try { window.localStorage.setItem(WALLPAPER_KEY, id); } catch (e) { /* ignore */ }
  }, []);

  const setDim = useCallback((n) => {
    setDimState(n);
    try { window.localStorage.setItem(DIM_KEY, String(n)); } catch (e) { /* ignore */ }
  }, []);
  const setBlur = useCallback((n) => {
    setBlurState(n);
    try { window.localStorage.setItem(BLUR_KEY, String(n)); } catch (e) { /* ignore */ }
  }, []);

  // Load the uploaded image (if any) once, and free its object URL when it is replaced or the app unmounts.
  const customUrlRef = useRef(null);
  const showBlob = useCallback((blob) => {
    if (customUrlRef.current) URL.revokeObjectURL(customUrlRef.current);
    customUrlRef.current = blob ? URL.createObjectURL(blob) : null;
    setCustomUrl(customUrlRef.current);
  }, []);
  useEffect(() => {
    let alive = true;
    loadCustomWallpaper().then((blob) => { if (alive && blob) showBlob(blob); });
    return () => {
      alive = false;
      if (customUrlRef.current) URL.revokeObjectURL(customUrlRef.current);
    };
  }, [showBlob]);

  const uploadWallpaper = useCallback(async (file) => {
    const blob = await saveCustomWallpaper(file);
    showBlob(blob);
    setWallpaperId(CUSTOM_ID);
  }, [showBlob, setWallpaperId]);
  const removeUploadedWallpaper = useCallback(async () => {
    await clearCustomWallpaper();
    showBlob(null);
    setWallpaperIdState((prev) => (prev === CUSTOM_ID ? DEFAULT_WALLPAPER_ID : prev));
    try {
      if (window.localStorage.getItem(WALLPAPER_KEY) === CUSTOM_ID) window.localStorage.setItem(WALLPAPER_KEY, DEFAULT_WALLPAPER_ID);
    } catch (e) { /* ignore */ }
  }, [showBlob]);

  useEffect(() => {
    const root = document.documentElement;
    const c = current.c;
    const vars = {
      bg: c.bg, surface: c.surface, surface2: c.surface2, border: c.border, text: c.text, muted: c.muted, accent: c.accent,
      // Soft color blobs for the ambient background (see index.css).
      glow1: alpha(c.accent, current.mode === 'dark' ? 0.2 : 0.16),
      glow2: alpha(c.accent2, current.mode === 'dark' ? 0.17 : 0.14),
      glow3: alpha(c.accent2, current.mode === 'dark' ? 0.12 : 0.1),
      grid: alpha(c.accent, current.neon ? 0.09 : 0.05),
    };
    Object.entries(vars).forEach(([name, value]) => root.style.setProperty(`--${name}`, value));
    root.style.colorScheme = current.mode;
    root.dataset.glass = glass ? 'on' : 'off';
    root.dataset.bg = current.bgStyle || 'mesh';
    const wallpaper = wallpaperId === CUSTOM_ID
      ? { css: customUrl ? `url("${customUrl}") center / cover no-repeat` : null }
      : WALLPAPERS.find((w) => w.id === wallpaperId);
    root.style.setProperty('--wp-dim', String(dim / 100));
    root.style.setProperty('--wp-blur', `${blur}px`);
    if (wallpaper && wallpaper.css) {
      root.style.setProperty('--wallpaper', wallpaper.css);
      root.dataset.wallpaper = 'on';
    } else {
      root.style.removeProperty('--wallpaper');
      root.dataset.wallpaper = wallpaperId === 'none' ? 'plain' : 'off';
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', c.surface);
    // Make charts readable on every theme (applies to charts created after a switch).
    ChartJS.defaults.color = c.muted;
    ChartJS.defaults.borderColor = alpha(c.muted, 0.25);
  }, [current, glass, wallpaperId, customUrl, dim, blur]);

  const value = useMemo(
    () => ({ themeId, setThemeId, themes: THEMES, current, glass, setGlass, wallpaperId, setWallpaperId, wallpapers: WALLPAPERS,
      customUrl, uploadWallpaper, removeUploadedWallpaper, dim, setDim, blur, setBlur, gaugeStyle, setGaugeStyle }),
    [themeId, setThemeId, current, glass, setGlass, wallpaperId, setWallpaperId, customUrl, uploadWallpaper, removeUploadedWallpaper, dim, setDim, blur, setBlur, gaugeStyle, setGaugeStyle]
  );

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export const useThemeMode = () => useContext(ThemeModeContext);
