import React, { useEffect, useState } from 'react';
import { Box, Button, Grid, Typography } from '@mui/material';
import usePolling from '../hooks/usePolling';
import { Tile, Pill } from '../components/dash/viz';

const API_URL = process.env.REACT_APP_BACKEND_URL || (window.location.protocol === 'https:' ? '' : `http://${window.location.hostname}:8000`);
const API = `${API_URL}/api/v1`;

const Row = ({ label, children }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.5 }}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant="body2" sx={{ textAlign: 'right', wordBreak: 'break-all' }}>{children}</Typography>
  </Box>
);

const ageText = (iso) => {
  const t = Date.parse(iso);
  if (!t || t < 86400000) return '';
  const h = (Date.now() - t) / 3600000;
  return h < 1 ? 'seen minutes ago' : h < 48 ? `seen ${Math.round(h)}h ago` : `seen ${Math.round(h / 24)}d ago`;
};

const SettingsAccess = () => {
  const { data: ov } = usePolling(`${API}/overview`, 15000);
  const [latency, setLatency] = useState(null);
  const [exportMsg, setExportMsg] = useState('');
  const ts = ov?.tailscale;
  const secure = window.location.protocol === 'https:';
  const bundle = (Array.from(document.scripts).map((s) => s.src).find((u) => /main\.[a-z0-9]+\.js/.test(u)) || '').match(/main\.([a-z0-9]+)\.js/)?.[1];

  useEffect(() => {
    let off = false;
    const t0 = performance.now();
    fetch(`${API}/overview`).then(() => { if (!off) setLatency(Math.round(performance.now() - t0)); }).catch(() => {});
    return () => { off = true; };
  }, []);

  const exportSettings = () => {
    const dump = {};
    try { for (let i = 0; i < localStorage.length; i += 1) { const k = localStorage.key(i); dump[k] = localStorage.getItem(k); } } catch (e) { /* blocked */ }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'homelab-dashboard-settings.json';
    a.click();
    URL.revokeObjectURL(a.href);
    setExportMsg(`Saved ${Object.keys(dump).length} settings.`);
  };
  const importSettings = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.size > 1000000) throw new Error('file too big');
      const obj = JSON.parse(await file.text());
      if (!obj || typeof obj !== 'object' || Array.isArray(obj) || !Object.values(obj).every((v) => typeof v === 'string')) throw new Error('not a settings file');
      Object.entries(obj).forEach(([k, v]) => localStorage.setItem(k, v));
      setExportMsg(`Loaded ${Object.keys(obj).length} settings. Reloading...`);
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setExportMsg(`Couldn't import: ${err.message}`);
    }
  };
  const resetAll = () => {
    if (!window.confirm('Reset theme, wallpaper settings, tile order and every other saved choice in this browser?')) return;
    try { localStorage.clear(); } catch (e) { /* blocked */ }
    window.location.reload();
  };

  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <Tile title="How this dashboard is protected" tone="warning">
          <Typography variant="body2" sx={{ mb: 1 }}>
            The dashboard has <b>no login of its own</b>. Anyone who can reach it can use it, so the network is the lock.
          </Typography>
          <Row label="https address">only on your Tailscale network</Row>
          <Row label="http ports 3001 and 8000">open to everyone on your home network</Row>
          <Row label="From the internet">not reachable (no port forwarding)</Row>
          <Box sx={{ mt: 1.5 }}>
            <Pill label="this page" value={secure ? 'https (tailnet)' : 'http'} tone={secure ? 'primary' : 'warning'} />
          </Box>
        </Tile>
      </Grid>

      <Grid item xs={12} md={6}>
        <Tile title="Tailscale devices" right={ts?.available ? <Typography variant="caption" color="text.secondary">{ts.online} of {ts.total} online</Typography> : null}>
          {!ts && <Typography variant="body2" color="text.secondary">–</Typography>}
          {ts && !ts.available && <Typography variant="body2" color="text.secondary">Tailscale status isn't available.</Typography>}
          {ts?.available && ts.peers.map((p) => (
            <Box key={p.ip} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, py: 0.5 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" noWrap>{p.name}</Typography>
                <Typography variant="caption" color="text.secondary">{p.os}{!p.online && ageText(p.last_seen) ? ` · ${ageText(p.last_seen)}` : ''}</Typography>
              </Box>
              <Pill label="" value={p.online ? 'online' : 'offline'} tone={p.online ? 'primary' : 'warning'} />
            </Box>
          ))}
        </Tile>
      </Grid>

      <Grid item xs={12} md={6}>
        <Tile title="About">
          <Row label="Backend">{ov ? `${ov.hostname} · answers in ${latency ?? '–'} ms` : '–'}</Row>
          <Row label="Frontend build">{bundle || '–'}</Row>
          <Row label="This browser's address">{window.location.origin}</Row>
          {API_URL && (
            <Row label="API docs"><a href={`${API_URL}/docs`} target="_blank" rel="noopener noreferrer">{`${API_URL}/docs`}</a></Row>
          )}
        </Tile>
      </Grid>

      <Grid item xs={12} md={6}>
        <Tile title="Back up your settings">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Theme, tile order, alert limits and the rest are saved in this browser, not on the server. Export them to move to another browser or keep a copy.
            An uploaded custom wallpaper isn't included.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button variant="outlined" onClick={exportSettings}>Export</Button>
            <Button variant="outlined" component="label">
              Import
              <input hidden type="file" accept="application/json,.json" onChange={importSettings} />
            </Button>
            <Button variant="outlined" color="warning" onClick={resetAll}>Reset everything</Button>
          </Box>
          {exportMsg && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{exportMsg}</Typography>}
        </Tile>
      </Grid>
    </Grid>
  );
};

export default SettingsAccess;
