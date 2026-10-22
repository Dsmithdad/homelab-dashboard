import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Chip, Grid, Link, MenuItem, Select, TextField, Tooltip, Typography } from '@mui/material';
import { Check, ContentCopy, Download, Map as MapIcon, OpenInNew } from '@mui/icons-material';
import usePolling from '../hooks/usePolling';
import { Tile, BarMeter, Pill, fmtBytes, fmtUptime, levelTone } from '../components/dash/viz';

const API_URL = process.env.REACT_APP_BACKEND_URL || (window.location.protocol === 'https:' ? '' : `http://${window.location.hostname}:8000`);
const CRAFTY_URL = `https://${window.location.hostname}:8111`;
// BlueMap web server (inside the Crafty container, published port); plain http, Opera only upgrades port 80
export const BLUEMAP_URL = `http://${window.location.hostname}:25580`;
const MC_API = `${API_URL}/api/v1/minecraft`;

const LEVEL_COLOR = { ERROR: 'error.main', WARN: 'warning.main', INFO: 'text.primary' };
const EVENT_LABEL = { join: ['joined', 'success'], leave: ['left', 'default'], advancement: ['advancement', 'info'], death: ['died', 'error'] };

const ago = (ts) => {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round(Date.now() / 1000 - ts));
  if (s < 60) return 'just now';
  return `${fmtUptime(s)} ago`;
};
const clock = (ts) => new Date(ts * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const ModRow = ({ mod }) => {
  const mr = mod.modrinth;
  return (
    <Box sx={{ display: 'flex', gap: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider', alignItems: 'flex-start' }}>
      <Box sx={{ width: 40, height: 40, flexShrink: 0, borderRadius: 1, overflow: 'hidden', bgcolor: 'action.hover' }}>
        {mod.has_icon && mod.id && (
          <img src={`${MC_API}/mods/icon/${encodeURIComponent(mod.id)}`} alt="" loading="lazy" width={40} height={40} style={{ display: 'block', objectFit: 'cover' }} />
        )}
      </Box>
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body1" sx={{ fontWeight: 600 }}>{mod.name}</Typography>
          {mod.version && <Typography variant="caption" color="text.secondary">{mod.version}</Typography>}
          {mod.authors.length > 0 && <Typography variant="caption" color="text.secondary">by {mod.authors.join(', ')}</Typography>}
        </Box>
        {mod.description && <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{mod.description}</Typography>}
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 0.5, alignItems: 'center' }}>
          {mr?.download && (
            <Button size="small" variant="outlined" startIcon={<Download />} href={mr.download} target="_blank" rel="noreferrer noopener">
              Download {mr.version || ''}
            </Button>
          )}
          {mr?.page && <Link href={mr.page} target="_blank" rel="noreferrer noopener" variant="caption">Modrinth</Link>}
          {mod.homepage && <Link href={mod.homepage} target="_blank" rel="noreferrer noopener" variant="caption">Homepage</Link>}
          {mod.sources && <Link href={mod.sources} target="_blank" rel="noreferrer noopener" variant="caption">Source</Link>}
        </Box>
      </Box>
    </Box>
  );
};

const Minecraft = () => {
  const { data: mc, error: mcError } = usePolling(`${MC_API}/`, 5000);
  const { data: logs, error: logError } = usePolling(`${MC_API}/logs?lines=400`, 5000);
  const { data: act } = usePolling(`${MC_API}/activity`, 10000);
  const { data: info } = usePolling(`${MC_API}/info`, 30000);
  const [modsEvery, setModsEvery] = useState(3000);
  const { data: modData, error: modError } = usePolling(`${MC_API}/mods`, modsEvery);
  const [level, setLevel] = useState('ALL');
  const [search, setSearch] = useState('');
  const [modSearch, setModSearch] = useState('');

  // While Modrinth is still being asked, check back quickly; once it's done, only occasionally.
  const lookupState = modData?.lookup?.state;
  useEffect(() => { setModsEvery(lookupState === 'running' || !modData ? 3000 : 60000); }, [lookupState, modData]);

  const mods = useMemo(() => {
    const needle = modSearch.trim().toLowerCase();
    return (modData?.mods || [])
      .filter((m) => !needle || `${m.name} ${m.id} ${m.description} ${m.authors.join(' ')}`.toLowerCase().includes(needle))
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }, [modData, modSearch]);
  const [copied, setCopied] = useState(false);
  const logBox = useRef(null);
  const stickToBottom = useRef(true);

  const server = mc?.server;
  const players = mc?.players;
  const memPct = server?.heap_max_mb ? (server.memory_mb / server.heap_max_mb) * 100 : null;

  const entries = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (logs?.entries || []).filter((e) =>
      (level === 'ALL' || e.level === level) && (!needle || e.message.toLowerCase().includes(needle)));
  }, [logs, level, search]);

  // navigator.clipboard only exists on https/localhost; plain http falls back to a hidden textarea.
  const copyAddress = async (text) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (!ok) return;
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      // copy blocked by the browser: leave the button as it was
    }
  };

  // Follow the newest line, unless the user scrolled up to read something.
  useEffect(() => {
    const box = logBox.current;
    if (box && stickToBottom.current) box.scrollTop = box.scrollHeight;
  }, [entries]);

  const onLogScroll = () => {
    const box = logBox.current;
    if (box) stickToBottom.current = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <Typography variant="h4">Minecraft</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Button variant="contained" startIcon={<MapIcon />} href={BLUEMAP_URL} target="_blank" rel="noreferrer">
            Live map
          </Button>
          <Button variant="outlined" startIcon={<OpenInNew />} href={CRAFTY_URL} target="_blank" rel="noreferrer">
            Open Crafty (start / stop / restart)
          </Button>
        </Box>
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6} lg={4}>
          <Tile
            title="Server"
            tone={mc?.online ? 'primary' : 'warning'}
            right={<Typography variant="caption" color="text.secondary" noWrap>{mc?.online ? `${mc.version} · ${mc.latency_ms} ms` : mc ? 'offline' : ''}</Typography>}
          >
            {!mc && (
              <Typography variant="body2" color="text.secondary">
                {mcError ? `Can't load Minecraft stats (${mcError}).` : 'Loading…'}
              </Typography>
            )}
            {mc && !mc.online && (
              <Typography variant="body2" color="text.secondary">
                The server isn't answering on its port. Start it from Crafty.
              </Typography>
            )}
            {mc?.online && (
              <>
                {mc.motd && <Typography variant="body1" sx={{ mb: 1 }}>{mc.motd}</Typography>}
                <Tooltip title={copied ? 'Copied!' : 'Click to copy the join address'} arrow>
                  <Button
                    size="small"
                    variant="outlined"
                    color={copied ? 'success' : 'primary'}
                    startIcon={copied ? <Check /> : <ContentCopy />}
                    onClick={() => copyAddress(mc.address)}
                    sx={(t) => ({ fontFamily: t.monoFont, textTransform: 'none' })}
                  >
                    {copied ? 'Copied!' : mc.address}
                  </Button>
                </Tooltip>
                {server && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
                    <Pill label="up" value={fmtUptime(server.uptime_s)} tone="info" />
                    <Pill label="cpu" value={`${Math.round(server.cpu_percent)}%`} tone={levelTone(server.cpu_percent)} />
                  </Box>
                )}
              </>
            )}
          </Tile>
        </Grid>

        <Grid item xs={12} md={6} lg={4}>
          <Tile title="Players" tone="primary">
            {mc?.online ? (
              <>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                  <Typography sx={{ fontSize: 34, lineHeight: 1, fontWeight: 700 }}>{players.online}</Typography>
                  <Typography variant="body2" color="text.secondary">/ {players.max} players</Typography>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1.5, minHeight: 28 }}>
                  {players.names.map((n) => <Chip key={n} label={n} size="small" />)}
                  {players.online === 0 && <Typography variant="body2" color="text.secondary">Nobody online</Typography>}
                  {players.online > players.names.length && players.names.length > 0 && (
                    <Typography variant="caption" color="text.secondary">+{players.online - players.names.length} more</Typography>
                  )}
                </Box>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">{mc ? 'Server is offline.' : '–'}</Typography>
            )}
          </Tile>
        </Grid>

        <Grid item xs={12} md={12} lg={4}>
          <Tile title="Resources" tone={levelTone(memPct)}>
            {server ? (
              <BarMeter
                caption="Server memory"
                pct={memPct}
                tone={levelTone(memPct)}
                text={`${(server.memory_mb / 1024).toFixed(1)}${server.heap_max_mb ? ` / ${(server.heap_max_mb / 1024).toFixed(1)}` : ''} GB`}
              />
            ) : (
              <Typography variant="body2" color="text.secondary">
                {mc ? "Memory and CPU unavailable: the server's java process wasn't found." : '–'}
              </Typography>
            )}
          </Tile>
        </Grid>

        <Grid item xs={12} lg={6}>
          <Tile title="Recent activity" right={<Typography variant="caption" color="text.secondary">joins, advancements, deaths</Typography>}>
            {!act && <Typography variant="body2" color="text.secondary">Loading…</Typography>}
            {act && act.events.length === 0 && <Typography variant="body2" color="text.secondary">Nothing in the logs yet.</Typography>}
            {act && act.events.length > 0 && (
              <Box sx={{ maxHeight: 320, overflowY: 'auto' }}>
                {act.events.slice(0, 40).map((e, i) => {
                  const [label, color] = EVENT_LABEL[e.kind] || [e.kind, 'default'];
                  return (
                    <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center', py: 0.5, flexWrap: 'wrap' }}>
                      <Tooltip title={clock(e.ts)} arrow><Typography variant="caption" color="text.secondary" sx={{ width: 74, flexShrink: 0 }}>{ago(e.ts)}</Typography></Tooltip>
                      <Chip size="small" label={label} color={color} variant="outlined" sx={{ minWidth: 96 }} />
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{e.player}</Typography>
                      {e.text && <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{e.text}</Typography>}
                    </Box>
                  );
                })}
              </Box>
            )}
          </Tile>
        </Grid>

        <Grid item xs={12} lg={6}>
          <Tile title="Player history">
            {!act && <Typography variant="body2" color="text.secondary">Loading…</Typography>}
            {act && act.players.length === 0 && <Typography variant="body2" color="text.secondary">Nobody has joined in the logs I can read.</Typography>}
            {act && act.players.map((p) => (
              <Box key={p.name} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.75, flexWrap: 'wrap' }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: p.online ? 'success.main' : 'text.disabled', flexShrink: 0 }} />
                <Typography variant="body1" sx={{ fontWeight: 600, minWidth: 120 }}>{p.name}</Typography>
                <Pill label="last seen" value={p.online ? 'online now' : ago(p.last_seen)} tone={p.online ? 'primary' : 'info'} />
                <Pill label="sessions" value={String(p.sessions)} tone="info" />
                <Pill label="played" value={fmtUptime(p.playtime_s)} tone="info" />
              </Box>
            ))}
            {act && act.players.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Counted from the server log and its last few rotated logs, not from the whole history of the world.
              </Typography>
            )}
          </Tile>
        </Grid>

        <Grid item xs={12} md={6}>
          <Tile title="Storage" tone={levelTone(info?.disk ? (info.disk.used / info.disk.total) * 100 : null)}>
            {!info && <Typography variant="body2" color="text.secondary">Loading…</Typography>}
            {info && (
              <>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                  <Pill label="world" value={fmtBytes(info.sizes.world)} tone="info" />
                  <Pill label="mods" value={fmtBytes(info.sizes.mods)} tone="info" />
                  <Pill label="logs" value={fmtBytes(info.sizes.logs)} tone="info" />
                </Box>
                {info.disk && (
                  <BarMeter
                    caption="Disk this server lives on"
                    pct={(info.disk.used / info.disk.total) * 100}
                    tone={levelTone((info.disk.used / info.disk.total) * 100)}
                    text={`${fmtBytes(info.disk.used)} / ${fmtBytes(info.disk.total)} (${fmtBytes(info.disk.free)} free)`}
                  />
                )}
              </>
            )}
          </Tile>
        </Grid>

        <Grid item xs={12} md={6}>
          <Tile title="World rules" right={<Typography variant="caption" color="text.secondary">from server.properties</Typography>}>
            {!info && <Typography variant="body2" color="text.secondary">Loading…</Typography>}
            {info && (
              <>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {Object.entries(info.settings).filter(([k]) => k !== 'motd').map(([k, v]) => <Pill key={k} label={k} value={v} tone="info" />)}
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  ops: {info.ops.length ? info.ops.join(', ') : 'none'} · whitelist: {info.whitelist.enabled ? `on (${info.whitelist.names.length})` : 'off'} · banned: {info.banned.players} players, {info.banned.ips} IPs
                </Typography>
              </>
            )}
          </Tile>
        </Grid>

        <Grid item xs={12}>
          <Tile
            title="Mods"
            right={<Typography variant="caption" color="text.secondary">{modData ? `${mods.length} of ${modData.mods.length}` : ''}</Typography>}
          >
            <TextField size="small" fullWidth label="Search mods" value={modSearch} onChange={(e) => setModSearch(e.target.value)} sx={{ mb: 1 }} />
            {modError && !modData && <Typography variant="body2" color="text.secondary">Can't load the mod list ({modError}). If the backend was just updated, restart it.</Typography>}
            {!modData && !modError && <Typography variant="body2" color="text.secondary">Reading mod files…</Typography>}
            {modData && (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  {lookupState === 'running' && 'Looking up download links on Modrinth by file hash… '}
                  {lookupState === 'error' && `Modrinth lookup failed (${modData.lookup.error}); showing links from the mod files only. `}
                  {lookupState === 'done' && `${modData.lookup.matched} of ${modData.lookup.total} mods matched on Modrinth by file hash, so Download gets the exact version you run. `}
                  {modData.disabled.length > 0 && `Disabled: ${modData.disabled.join(', ')}`}
                </Typography>
                <Box sx={{ maxHeight: 560, overflowY: 'auto' }}>
                  {mods.length === 0 && <Typography variant="body2" color="text.secondary">No mods match.</Typography>}
                  {mods.map((m) => <ModRow key={m.file} mod={m} />)}
                </Box>
              </>
            )}
          </Tile>
        </Grid>

        <Grid item xs={12}>
          <Tile
            title="Server log"
            tone={entries.some((e) => e.level === 'ERROR') ? 'warning' : 'primary'}
            right={<Typography variant="caption" color="text.secondary">{logs ? `${entries.length} shown` : ''}</Typography>}
          >
            {info?.log_health && (
              <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip size="small" color="error" variant="outlined" label={`${info.log_health.errors} errors`} onClick={() => setLevel('ERROR')} />
                <Chip size="small" color="warning" variant="outlined" label={`${info.log_health.warnings} warnings`} onClick={() => setLevel('WARN')} />
                <Typography variant="caption" color="text.secondary">in this log. Click to filter; mods often cause harmless ones.</Typography>
              </Box>
            )}
            <Box sx={{ display: 'flex', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
              <TextField
                size="small"
                label="Search logs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ flexGrow: 1, minWidth: 200 }}
              />
              <Select size="small" value={level} onChange={(e) => setLevel(e.target.value)}>
                <MenuItem value="ALL">All levels</MenuItem>
                <MenuItem value="INFO">Info</MenuItem>
                <MenuItem value="WARN">Warnings</MenuItem>
                <MenuItem value="ERROR">Errors</MenuItem>
              </Select>
            </Box>

            {logError && !logs && (
              <Typography variant="body2" color="text.secondary">
                Can't load the log ({logError}). If the backend was just updated, run: sudo systemctl restart homelab-dashboard-backend
              </Typography>
            )}
            {logs && !logs.available && (
              <Typography variant="body2" color="text.secondary">
                The backend can't read the server's latest.log. Check MC_LOG_PATH.
              </Typography>
            )}
            {logs?.available && (
              <Box
                ref={logBox}
                onScroll={onLogScroll}
                sx={(t) => ({ height: 420, overflowY: 'auto', fontFamily: t.monoFont, fontSize: 12.5, lineHeight: 1.55 })}
              >
                {entries.length === 0 && <Typography variant="body2" color="text.secondary">No log lines match.</Typography>}
                {entries.map((e, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    <Box component="span" sx={{ color: 'text.secondary', flexShrink: 0 }}>{e.time}</Box>
                    <Box component="span" sx={{ color: LEVEL_COLOR[e.level] || 'text.primary', width: 44, flexShrink: 0, fontWeight: e.level === 'INFO' ? 400 : 600 }}>{e.level}</Box>
                    <Box component="span" sx={{ color: LEVEL_COLOR[e.level] || 'text.primary', minWidth: 0 }}>{e.message}</Box>
                  </Box>
                ))}
              </Box>
            )}
          </Tile>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Minecraft;
