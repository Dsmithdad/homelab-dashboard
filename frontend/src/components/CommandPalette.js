import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Dialog, InputBase, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import PaletteIcon from '@mui/icons-material/Palette';
import WallpaperIcon from '@mui/icons-material/Wallpaper';
import BlurOnIcon from '@mui/icons-material/BlurOn';
import DonutLargeIcon from '@mui/icons-material/DonutLarge';
import { NAV_GROUPS, TOGGLE_SIDEBAR_EVENT, externalUrl } from './Sidebar';
import { useThemeMode } from '../contexts/ThemeModeContext';

export const OPEN_PALETTE_EVENT = 'open-command-palette';

const API_URL = process.env.REACT_APP_BACKEND_URL || (window.location.protocol === 'https:' ? '' : `http://${window.location.hostname}:8000`);

// Every word typed must appear somewhere in the label; commands starting with the query sort first.
const filterCommands = (commands, query) => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return commands;
  const q = query.trim().toLowerCase();
  return commands
    .filter((c) => words.every((w) => `${c.group} ${c.label}`.toLowerCase().includes(w)))
    .sort((a, b) => Number(b.label.toLowerCase().startsWith(q)) - Number(a.label.toLowerCase().startsWith(q)));
};

const CommandPalette = () => {
  const navigate = useNavigate();
  const { themes, setThemeId, wallpapers, setWallpaperId, customUrl, glass, setGlass, setGaugeStyle } = useThemeMode();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [sheets, setSheets] = useState([]);
  const listRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  // Ctrl+K / Cmd+K toggles; the top-bar search button fires a custom event instead.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  // Refresh the cheat sheet list each time the palette opens, so new .md files appear without a rebuild.
  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setIndex(0);
    let alive = true;
    fetch(`${API_URL}/api/v1/cheatsheets`)
      .then((r) => (r.ok ? r.json() : { sheets: [] }))
      .then((data) => { if (alive) setSheets(data.sheets || []); })
      .catch(() => { /* backend down: the palette still works without sheets */ });
    return () => { alive = false; };
  }, [open]);

  const commands = useMemo(() => {
    const list = [];
    NAV_GROUPS.flat().forEach(({ to, external, label, icon }) => {
      if (external) {
        list.push({ id: `go:${label}`, group: 'Open', label, icon, run: () => window.open(externalUrl(external), '_blank', 'noopener,noreferrer') });
      } else {
        list.push({ id: `go:${to}`, group: 'Go to', label, icon, run: () => navigate(to) });
      }
    });
    sheets.forEach((sh) => {
      list.push({ id: `sheet:${sh.slug}`, group: 'Cheat sheet', label: sh.title, icon: MenuBookIcon, run: () => navigate(`/cheatsheets/${sh.slug}`) });
    });
    themes.forEach((t) => {
      list.push({ id: `theme:${t.id}`, group: 'Theme', label: t.name, icon: PaletteIcon, run: () => setThemeId(t.id) });
    });
    wallpapers.forEach((w) => {
      list.push({ id: `wp:${w.id}`, group: 'Wallpaper', label: w.name, icon: WallpaperIcon, run: () => setWallpaperId(w.id) });
    });
    if (customUrl) {
      list.push({ id: 'wp:custom', group: 'Wallpaper', label: 'Your upload', icon: WallpaperIcon, run: () => setWallpaperId('custom') });
    }
    [['ring', 'Rings'], ['arc', 'Half-circle'], ['bar', 'Bars']].forEach(([id, name]) => {
      list.push({ id: `gauge:${id}`, group: 'Gauges', label: `Gauges: ${name}`, icon: DonutLargeIcon, run: () => setGaugeStyle(id) });
    });
    list.push({
      id: 'sidebar', group: 'Action', label: 'Collapse / expand sidebar', icon: BlurOnIcon,
      run: () => window.dispatchEvent(new Event(TOGGLE_SIDEBAR_EVENT)),
    });
    list.push({
      id: 'glass', group: 'Action', label: glass ? 'Turn glass & ambient background off' : 'Turn glass & ambient background on',
      icon: BlurOnIcon, run: () => setGlass(!glass),
    });
    return list;
  }, [navigate, sheets, themes, setThemeId, wallpapers, setWallpaperId, customUrl, glass, setGlass, setGaugeStyle]);

  const results = useMemo(() => filterCommands(commands, query), [commands, query]);

  // Keep the highlighted row inside the list when the query shrinks the results.
  const active = Math.min(index, Math.max(results.length - 1, 0));
  useEffect(() => {
    const el = listRef.current && listRef.current.querySelector('[data-active="true"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
  }, [active, results]);

  const runCommand = (cmd) => {
    if (!cmd) return;
    close();
    cmd.run();
  };

  const onInputKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(Math.min(active + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(Math.max(active - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); runCommand(results[active]); }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { position: 'absolute', top: '12vh', m: 0, width: 'calc(100% - 32px)', maxWidth: 560 } }}
      aria-label="Command palette"
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider' }}>
        <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
        <InputBase
          autoFocus
          fullWidth
          placeholder="Search pages, themes, wallpapers…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
          onKeyDown={onInputKey}
          inputProps={{ 'aria-label': 'Search commands' }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>Esc</Typography>
      </Box>
      <List ref={listRef} dense disablePadding sx={{ maxHeight: '50vh', overflowY: 'auto', p: 0.5 }}>
        {results.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 2 }}>No matches. Try a page, theme or wallpaper name.</Typography>
        )}
        {results.map((cmd, i) => {
          const Icon = cmd.icon;
          return (
            <ListItemButton
              key={cmd.id}
              selected={i === active}
              data-active={i === active}
              onClick={() => runCommand(cmd)}
              onMouseMove={() => i !== active && setIndex(i)}
              sx={{ borderRadius: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 34, color: i === active ? 'primary.main' : 'text.secondary' }}>
                <Icon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={cmd.label} primaryTypographyProps={{ fontFamily: 'inherit' }} />
              <Typography variant="caption" color="text.secondary">{cmd.group}</Typography>
            </ListItemButton>
          );
        })}
      </List>
    </Dialog>
  );
};

export default CommandPalette;
