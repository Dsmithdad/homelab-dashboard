import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, FormControl, FormControlLabel, InputLabel, ListSubheader, MenuItem, Select, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import usePolling from '../hooks/usePolling';
import { Tile } from '../components/dash/viz';

const API_URL = process.env.REACT_APP_BACKEND_URL || (window.location.protocol === 'https:' ? '' : `http://${window.location.hostname}:8000`);
const API = `${API_URL}/api/v1/logs`;
const SOURCE_KEY = 'logsSource';
const DEFAULT_SOURCE = 'unit:homelab-dashboard-backend';

const RANK = { debug: 0, info: 1, warn: 2, error: 3 };
const LEVELS = [
  { value: 'all', label: 'All' },
  { value: 'warn', label: 'Warnings +' },
  { value: 'error', label: 'Errors' },
];
const COLORS = { error: 'error.main', warn: 'warning.main', info: 'text.primary', debug: 'text.secondary' };

const readSource = () => { try { return localStorage.getItem(SOURCE_KEY) || DEFAULT_SOURCE; } catch (e) { return DEFAULT_SOURCE; } };

const Logs = () => {
  const [source, setSource] = useState(readSource);
  const [count, setCount] = useState(200);
  const [level, setLevel] = useState('all');
  const [search, setSearch] = useState('');
  const [live, setLive] = useState(true);
  const viewer = useRef(null);

  const { data: srcData, error: srcError } = usePolling(`${API}/sources`, 60000);
  // live = refresh every 5 s; otherwise it only refreshes when the source or size changes or Refresh is pressed
  const { data, error, refresh } = usePolling(`${API}/read?source=${encodeURIComponent(source)}&lines=${count}`, live ? 5000 : 3600000);

  const sources = srcData?.sources || [];
  const known = sources.some((s) => s.id === source);
  const current = data && data.source === source ? data : null;

  const shown = useMemo(() => {
    if (!current) return [];
    const q = search.trim().toLowerCase();
    return current.lines.filter((l) => (level === 'all' || RANK[l.level] >= RANK[level]) && (!q || l.text.toLowerCase().includes(q)));
  }, [current, level, search]);

  // keep the newest line in view while Live is on
  useEffect(() => {
    if (live && viewer.current) viewer.current.scrollTop = viewer.current.scrollHeight;
  }, [shown, live]);

  const pickSource = (id) => {
    setSource(id);
    try { localStorage.setItem(SOURCE_KEY, id); } catch (e) { /* ignore */ }
  };
  const download = () => {
    const text = shown.map((l) => `${l.time} ${l.level.toUpperCase().padEnd(5)} ${l.text}`).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = `${source.replace(/[^a-z0-9._-]+/gi, '_')}.log`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const groups = ['Services', 'Containers'];

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>Logs</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Read-only. Only a fixed list of services, your containers and the Minecraft log can be viewed, and anything that looks like a password or token is hidden.
      </Typography>

      <Tile
        title="Log viewer"
        right={current ? <Typography variant="caption" color="text.secondary">{shown.length} of {current.count} lines</Typography> : null}
      >
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
          <FormControl size="small" sx={{ minWidth: 240 }}>
            <InputLabel id="log-source">Source</InputLabel>
            <Select labelId="log-source" label="Source" value={known ? source : ''} onChange={(e) => pickSource(e.target.value)} displayEmpty>
              {groups.flatMap((g) => {
                const items = sources.filter((s) => s.group === g);
                return items.length ? [<ListSubheader key={g}>{g}</ListSubheader>, ...items.map((s) => <MenuItem key={s.id} value={s.id}>{s.label}</MenuItem>)] : [];
              })}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 110 }}>
            <InputLabel id="log-lines">Lines</InputLabel>
            <Select labelId="log-lines" label="Lines" value={count} onChange={(e) => setCount(e.target.value)}>
              {[100, 200, 500, 1000].map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
            </Select>
          </FormControl>
          <ToggleButtonGroup exclusive size="small" value={level} onChange={(e, v) => v && setLevel(v)} aria-label="level filter">
            {LEVELS.map((l) => <ToggleButton key={l.value} value={l.value}>{l.label}</ToggleButton>)}
          </ToggleButtonGroup>
          <TextField size="small" label="Search" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 180 }} />
          <FormControlLabel control={<Switch checked={live} onChange={(e) => setLive(e.target.checked)} />} label="Live" />
          <Button size="small" variant="outlined" onClick={refresh}>Refresh</Button>
          <Button size="small" variant="outlined" onClick={download} disabled={!shown.length}>Download</Button>
        </Box>

        {(srcError || (error && !current)) && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {`Can't load logs (${srcError || error}). If the backend was just updated, run: sudo systemctl restart homelab-dashboard-backend`}
          </Typography>
        )}
        {error && current && <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1 }}>{`Last refresh failed (${error}). Showing the previous lines.`}</Typography>}

        <Box
          ref={viewer}
          role="log"
          aria-label="log output"
          sx={{
            height: 'calc(100vh - 420px)', minHeight: 280, overflow: 'auto', p: 1.5, borderRadius: 1,
            bgcolor: 'action.hover', fontFamily: 'monospace', fontSize: 12.5, lineHeight: 1.6,
          }}
        >
          {!current && !error && <Typography variant="body2" color="text.secondary">Loading...</Typography>}
          {current && shown.length === 0 && <Typography variant="body2" color="text.secondary">{current.count ? 'No lines match your filters.' : 'This log is empty.'}</Typography>}
          {shown.map((l, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1.5, color: COLORS[l.level], whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              <Box component="span" sx={{ flexShrink: 0, opacity: 0.6 }}>{l.time}</Box>
              <Box component="span">{l.text}</Box>
            </Box>
          ))}
        </Box>
      </Tile>
    </Box>
  );
};

export default Logs;
