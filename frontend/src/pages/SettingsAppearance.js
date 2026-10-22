import React, { useState } from 'react';
import { Box, Button, FormControlLabel, Grid, Switch, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Tile } from '../components/dash/viz';
import { REFRESH_SPEED_KEY } from '../hooks/usePolling';
import { HOVER_JABS_KEY, HOVER_JABS_EVENT, hoverJabsEnabled } from '../components/HoverJabs';
import { useThemeMode } from '../contexts/ThemeModeContext';

const ORDER_KEY = 'homelab-overview-order'; // same key the Overview page saves its tile order under

const SPEEDS = [
  { value: '0.5', label: 'Fast', hint: 'twice as often' },
  { value: '1', label: 'Normal', hint: 'as designed' },
  { value: '2', label: 'Relaxed', hint: 'half as often' },
  { value: '4', label: 'Slow', hint: 'a quarter as often' },
];

const read = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch (e) { return fallback; } };

const SettingsAppearance = () => {
  const { themes, themeId } = useThemeMode();
  const [speed, setSpeed] = useState(() => read(REFRESH_SPEED_KEY, '1'));
  const [jabs, setJabs] = useState(hoverJabsEnabled);
  const [orderReset, setOrderReset] = useState(false);

  const pickSpeed = (e, v) => {
    if (!v) return;
    setSpeed(v);
    try { localStorage.setItem(REFRESH_SPEED_KEY, v); } catch (err) { /* applies until reload */ }
  };
  const toggleJabs = (e) => {
    setJabs(e.target.checked);
    try { localStorage.setItem(HOVER_JABS_KEY, String(e.target.checked)); } catch (err) { /* ignore */ }
    window.dispatchEvent(new Event(HOVER_JABS_EVENT));
  };
  const resetOrder = () => {
    try { localStorage.removeItem(ORDER_KEY); } catch (err) { /* ignore */ }
    setOrderReset(true);
  };
  const themeName = (themes || []).find((t) => t.id === themeId)?.name || themeId;

  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <Tile title="Refresh speed">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            How often tiles ask the server for fresh numbers. Slower saves a little battery and network; faster feels more live. Applies from each tile's next refresh.
          </Typography>
          <ToggleButtonGroup exclusive size="small" value={speed} onChange={pickSpeed} aria-label="refresh speed" sx={{ flexWrap: 'wrap' }}>
            {SPEEDS.map((s) => <ToggleButton key={s.value} value={s.value}>{s.label}</ToggleButton>)}
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            {SPEEDS.find((s) => s.value === speed)?.hint || 'custom'}. Saved in this browser only.
          </Typography>
        </Tile>
      </Grid>

      <Grid item xs={12} md={6}>
        <Tile title="Look & feel">
          <Typography variant="body2" sx={{ mb: 1 }}>
            Current theme: <b>{themeName}</b>
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Themes, wallpapers, glass and gauge style live in the palette icon in the top bar.
          </Typography>
          <FormControlLabel
            control={<Switch checked={jabs} onChange={toggleJabs} color="primary" />}
            label="Skeeter hover jabs (hover on desktop only)"
          />
        </Tile>
      </Grid>

      <Grid item xs={12} md={6}>
        <Tile title="Layout">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Overview tile order is saved in this browser. Reset it to go back to the default order.
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Button variant="outlined" color="warning" onClick={resetOrder}>Reset tile order</Button>
            {orderReset && <Typography variant="caption" color="text.secondary">Done. Open Overview to see it.</Typography>}
          </Box>
        </Tile>
      </Grid>
    </Grid>
  );
};

export default SettingsAppearance;
