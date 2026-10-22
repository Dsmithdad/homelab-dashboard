import React, { useEffect, useRef, useState } from 'react';
import { AppBar, Box, Button, Divider, FormControlLabel, Slider, Switch, Toolbar, Typography, IconButton, Menu, MenuItem, ListItemText, Tooltip, ToggleButton, ToggleButtonGroup } from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import NotificationsIcon from '@mui/icons-material/Notifications';
import PaletteIcon from '@mui/icons-material/Palette';
import SearchIcon from '@mui/icons-material/Search';
import MenuIcon from '@mui/icons-material/Menu';
import { TOGGLE_SIDEBAR_EVENT } from './Sidebar';
import { OPEN_PALETTE_EVENT } from './CommandPalette';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { HOVER_JABS_KEY, HOVER_JABS_EVENT, hoverJabsEnabled } from './HoverJabs';
import CheckIcon from '@mui/icons-material/Check';
import TerminalIcon from '@mui/icons-material/Terminal';
import { useThemeMode } from '../contexts/ThemeModeContext';

// Four little squares that preview a theme in the picker.
const Swatches = ({ colors }) => (
  <Box sx={{ display: 'flex', mr: 1.5, borderRadius: 0.75, overflow: 'hidden', border: 1, borderColor: 'divider', flexShrink: 0 }}>
    {colors.map((color, i) => (
      <Box key={i} sx={{ width: 14, height: 22, bgcolor: color }} />
    ))}
  </Box>
);

const Navbar = () => {
  const {
    themes, themeId, setThemeId, glass, setGlass, wallpapers, wallpaperId, setWallpaperId,
    customUrl, uploadWallpaper, removeUploadedWallpaper, dim, setDim, blur, setBlur, gaugeStyle, setGaugeStyle,
  } = useThemeMode();
  const fileInputRef = useRef(null);
  const [uploadError, setUploadError] = useState('');
  const onPickFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // lets the same file be picked again later
    if (!file) return;
    setUploadError('');
    try {
      await uploadWallpaper(file);
    } catch (err) {
      setUploadError(err.message || 'Upload failed.');
    }
  };
  const showAdjust = wallpaperId !== 'theme' && wallpaperId !== 'none' && (wallpaperId !== 'custom' || Boolean(customUrl));
  const [accountAnchor, setAccountAnchor] = useState(null);
  const [themeAnchor, setThemeAnchor] = useState(null);
  const [jabsOn, setJabsOn] = useState(hoverJabsEnabled);
  // keep the icon in sync when the switch on the Settings page changes it
  useEffect(() => {
    const sync = () => setJabsOn(hoverJabsEnabled());
    window.addEventListener(HOVER_JABS_EVENT, sync);
    return () => window.removeEventListener(HOVER_JABS_EVENT, sync);
  }, []);
  const toggleJabs = () => {
    const next = !jabsOn;
    setJabsOn(next);
    try { localStorage.setItem(HOVER_JABS_KEY, String(next)); } catch (e) { /* private mode: still works for this visit */ }
    window.dispatchEvent(new Event(HOVER_JABS_EVENT));
  };

  return (
    <AppBar position="fixed">
      <Toolbar>
        <IconButton
          aria-label="toggle navigation"
          color="inherit"
          edge="start"
          onClick={() => window.dispatchEvent(new Event(TOGGLE_SIDEBAR_EVENT))}
          sx={{ mr: 1, display: { xs: 'inline-flex', md: 'none' } }}
        >
          <MenuIcon />
        </IconButton>
        <TerminalIcon color="primary" sx={{ mr: 1.5, display: { xs: 'none', sm: 'block' } }} />
        <Typography variant="h6" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
          homelab<Box component="span" sx={{ color: 'primary.main' }}>/</Box>dashboard
        </Typography>

        <Tooltip title="Search & commands (Ctrl+K)">
          <IconButton aria-label="open command palette" color="inherit" onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))} sx={{ mr: 1 }}>
            <SearchIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Change theme">
          <IconButton aria-label="change theme" color="inherit" onClick={(e) => setThemeAnchor(e.currentTarget)} sx={{ mr: 1 }}>
            <PaletteIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={jabsOn ? 'Skeeter jabs on (click to mute)' : 'Skeeter jabs off (click to unmute)'}>
          <IconButton aria-label="toggle skeeter hover jabs" color="inherit" onClick={toggleJabs} sx={{ mr: 1, display: { xs: 'none', sm: 'inline-flex' } }}>
            {jabsOn ? <ChatBubbleIcon /> : <ChatBubbleOutlineIcon />}
          </IconButton>
        </Tooltip>
        <IconButton aria-label="notifications" color="inherit" sx={{ mr: 1, display: { xs: 'none', sm: 'inline-flex' } }}>
          <NotificationsIcon />
        </IconButton>
        <IconButton aria-label="account of current user" color="inherit" onClick={(e) => setAccountAnchor(e.currentTarget)}>
          <AccountCircleIcon />
        </IconButton>

        <Menu
          anchorEl={themeAnchor}
          open={Boolean(themeAnchor)}
          onClose={() => setThemeAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          {themes.map((t) => (
            <MenuItem
              key={t.id}
              selected={t.id === themeId}
              onClick={() => { setThemeId(t.id); setThemeAnchor(null); }}
              sx={{ minWidth: 230 }}
            >
              <Swatches colors={[t.c.bg, t.c.accent, t.c.accent2, t.c.success]} />
              <ListItemText primary={t.name} secondary={t.mode} primaryTypographyProps={{ fontFamily: 'inherit' }} />
              {t.id === themeId && <CheckIcon fontSize="small" color="primary" sx={{ ml: 1 }} />}
            </MenuItem>
          ))}
          <Divider sx={{ my: 0.5 }} />
          <Box sx={{ px: 2, py: 0.5 }}>
            <FormControlLabel
              control={<Switch size="small" checked={glass} onChange={(e) => setGlass(e.target.checked)} />}
              label="Glass & ambient background"
              componentsProps={{ typography: { variant: 'body2' } }}
            />
          </Box>
          <Divider sx={{ my: 0.5 }} />
          <Box sx={{ px: 2, py: 1, maxWidth: 260 }}>
            <Typography variant="caption" color="text.secondary">Gauges</Typography>
            <ToggleButtonGroup
              exclusive fullWidth size="small" value={gaugeStyle} sx={{ mt: 0.5 }}
              onChange={(e, v) => { if (v) setGaugeStyle(v); }}
              aria-label="Gauge style"
            >
              <ToggleButton value="ring">Rings</ToggleButton>
              <ToggleButton value="arc">Half</ToggleButton>
              <ToggleButton value="bar">Bars</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Divider sx={{ my: 0.5 }} />
          <Box sx={{ px: 2, py: 1, maxWidth: 260 }}>
            <Typography variant="caption" color="text.secondary">Wallpaper</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, mt: 0.5 }}>
              {wallpapers.map((w) => (
                <Tooltip key={w.id} title={w.name}>
                  <Box
                    role="button"
                    tabIndex={0}
                    aria-label={`Wallpaper: ${w.name}`}
                    aria-pressed={w.id === wallpaperId}
                    onClick={() => setWallpaperId(w.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setWallpaperId(w.id); }}
                    sx={{
                      height: 34, borderRadius: 1, cursor: 'pointer',
                      background: w.css || 'transparent',
                      border: '2px solid',
                      borderColor: w.id === wallpaperId ? 'primary.main' : 'divider',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, color: 'text.secondary',
                    }}
                  >
                    {!w.css && (w.id === 'none' ? 'plain' : 'auto')}
                  </Box>
                </Tooltip>
              ))}
              {customUrl && (
                <Tooltip title="Your upload">
                  <Box
                    role="button"
                    tabIndex={0}
                    aria-label="Wallpaper: your upload"
                    aria-pressed={wallpaperId === 'custom'}
                    onClick={() => setWallpaperId('custom')}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setWallpaperId('custom'); }}
                    sx={{
                      height: 34, borderRadius: 1, cursor: 'pointer',
                      background: `url("${customUrl}") center / cover no-repeat`,
                      border: '2px solid',
                      borderColor: wallpaperId === 'custom' ? 'primary.main' : 'divider',
                    }}
                  />
                </Tooltip>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Button size="small" variant="outlined" onClick={() => fileInputRef.current && fileInputRef.current.click()}>
                {customUrl ? 'Replace image' : 'Upload image'}
              </Button>
              {customUrl && (
                <Button size="small" color="inherit" onClick={removeUploadedWallpaper}>Remove</Button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onPickFile} />
            </Box>
            {uploadError && <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5 }}>{uploadError}</Typography>}
            {showAdjust && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary">Dim {dim}%</Typography>
                <Slider size="small" min={0} max={95} step={5} value={dim} onChange={(e, v) => setDim(v)} aria-label="Wallpaper dim" />
                <Typography variant="caption" color="text.secondary">Blur {blur}px</Typography>
                <Slider size="small" min={0} max={20} step={1} value={blur} onChange={(e, v) => setBlur(v)} aria-label="Wallpaper blur" />
              </Box>
            )}
          </Box>
        </Menu>

        <Menu
          anchorEl={accountAnchor}
          open={Boolean(accountAnchor)}
          onClose={() => setAccountAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <MenuItem onClick={() => setAccountAnchor(null)}>Profile</MenuItem>
          <MenuItem onClick={() => setAccountAnchor(null)}>Settings</MenuItem>
          <MenuItem onClick={() => setAccountAnchor(null)}>Logout</MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;
