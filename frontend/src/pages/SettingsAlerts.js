import React, { useState } from 'react';
import { Alert, Box, Button, FormControlLabel, Grid, Slider, Switch, Typography } from '@mui/material';
import { Tile } from '../components/dash/viz';
import { canNotify, loadAlertSettings, saveAlertSettings } from '../components/AlertWatcher';

const LIMITS = [
  { key: 'cpu', label: 'CPU usage' },
  { key: 'memory', label: 'Memory usage' },
  { key: 'disk', label: 'Disk usage (fullest disk)' },
];

const SettingsAlerts = () => {
  const [s, setS] = useState(loadAlertSettings);
  const [perm, setPerm] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'));
  const [testMsg, setTestMsg] = useState('');
  const supported = canNotify();

  const update = (patch) => {
    const next = { ...s, ...patch };
    setS(next);
    saveAlertSettings(next);
  };
  const allow = async () => {
    if (typeof Notification === 'undefined') return;
    setPerm(await Notification.requestPermission());
  };
  const test = () => {
    setTestMsg('Sending...');
    let shown = false;
    try {
      const n = new Notification('Skeeter says hi', { body: 'Notifications work. Try not to break anything.', tag: `homelab-test-${Date.now()}` });
      n.onshow = () => { shown = true; setTestMsg('The browser says it showed the notification. If you can\'t see it, check your computer\'s notification settings and Focus / Do Not Disturb.'); };
      n.onerror = () => { shown = true; setTestMsg('The browser reported an error showing it.'); };
      setTimeout(() => {
        if (!shown) setTestMsg('The browser accepted it but never reported showing it. That usually means the computer is hiding it: check the browser\'s entry in your OS notification settings and Focus / Do Not Disturb.');
      }, 3000);
    } catch (e) {
      setTestMsg(`The browser refused: ${e.message}. (Some mobile browsers only allow notifications from an installed app.)`);
    }
  };

  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={8} lg={6}>
        <Tile title="Browser alerts">
          {!supported && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Browsers only allow notifications on https. Open the dashboard over https (for example with Tailscale Serve) to use this.
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Pops a notification when a number stays above its limit for about a minute. It only works while a dashboard tab is open in this browser.
          </Typography>

          <FormControlLabel
            control={<Switch checked={s.enabled} onChange={(e) => update({ enabled: e.target.checked })} color="primary" disabled={!supported} />}
            label="Send alerts"
          />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', my: 1.5 }}>
            <Typography variant="body2">
              Permission: <b>{perm === 'granted' ? 'allowed' : perm === 'denied' ? 'blocked in browser settings' : perm === 'unsupported' ? 'not supported here' : 'not asked yet'}</b>
            </Typography>
            {supported && perm === 'default' && <Button size="small" variant="outlined" onClick={allow}>Allow notifications</Button>}
            {supported && perm === 'granted' && <Button size="small" variant="outlined" onClick={test}>Send a test</Button>}
          </Box>
          {testMsg && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>{testMsg}</Typography>}
          {perm === 'denied' && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              To undo a block, click the lock icon next to the address and set Notifications to Allow.
            </Typography>
          )}

          {LIMITS.map(({ key, label }) => (
            <Box key={key} sx={{ mt: 2 }}>
              <Typography variant="body2">{label}: alert at <b>{s[key]}%</b></Typography>
              <Slider
                value={s[key]} min={50} max={100} step={5} valueLabelDisplay="auto"
                onChange={(e, v) => setS((prev) => ({ ...prev, [key]: v }))}
                onChangeCommitted={(e, v) => update({ [key]: v })}
                aria-label={`${label} limit`}
              />
            </Box>
          ))}

          <Box sx={{ mt: 3 }}>
            <FormControlLabel
              control={<Switch checked={!!s.fires} onChange={(e) => update({ fires: e.target.checked })} color="primary" />}
              label="Wildfires near home (from God's Eye View)"
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Only significant fires count (20 MW or more, not low-confidence), because most detections near home are small burns. Checked every 5 minutes; each fire is announced once.
            </Typography>
            <Box sx={{ mt: 1, opacity: s.fires ? 1 : 0.5 }}>
              <Typography variant="body2">Alert when one is within <b>{s.fireKm} km</b></Typography>
              <Slider
                value={s.fireKm} min={10} max={300} step={5} valueLabelDisplay="auto" disabled={!s.fires}
                onChange={(e, v) => setS((prev) => ({ ...prev, fireKm: v }))}
                onChangeCommitted={(e, v) => update({ fireKm: v })}
                aria-label="Wildfire alert distance"
              />
            </Box>
          </Box>
        </Tile>
      </Grid>
    </Grid>
  );
};

export default SettingsAlerts;
