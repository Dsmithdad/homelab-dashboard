import React, { useMemo, useState } from 'react';
import {
  Alert, Box, Button, ButtonBase, Card, CardContent, Chip, CircularProgress, Collapse, Divider, FormControl, IconButton,
  InputAdornment, InputLabel, MenuItem, Select, Table, TableBody, TableCell, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { ArrowRight, OpenInNew, Refresh, Search } from '@mui/icons-material';
import usePolling from '../hooks/usePolling';
import { Pill } from '../components/dash/viz';
import { chipTone } from '../utils/chipTone';

const API_URL = process.env.REACT_APP_BACKEND_URL || (window.location.protocol === 'https:' ? '' : `http://${window.location.hostname}:8000`);
const API = `${API_URL}/api/v1/homeassistant/`;
const LOOSE = 'loose'; // key of the "not tied to a device" group

const DOMAIN_TONE = { light: 'info', switch: 'success', climate: 'warning', sensor: 'error', cover: 'primary' };

const ago = (iso) => {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (!Number.isFinite(mins)) return '–';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

const SetupSteps = ({ url }) => (
  <Card>
    <CardContent>
      <Typography variant="h6" gutterBottom>Connect Home Assistant</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        This page shows real devices and sensors, read only, once the dashboard has a key to ask Home Assistant. It isn't connected yet.
      </Typography>
      <Box component="ol" sx={{ m: 0, pl: 2.5, '& li': { mb: 1 } }}>
        <li><Typography variant="body2">In Home Assistant, click your name (bottom left), open the <b>Security</b> tab, scroll to <b>Long-lived access tokens</b> and create one. Copy it now, it is only shown once.</Typography></li>
        <li>
          <Typography variant="body2">
            On the server, open <b>backend/.env (inside the dashboard folder)</b> and fill in the empty line (no spaces, no quotes):
          </Typography>
          <Box component="pre" sx={(t) => ({ m: 0, mt: 0.5, p: 1.25, borderRadius: 1, bgcolor: 'action.hover', fontFamily: t.monoFont || 'monospace', fontSize: 13, overflow: 'auto' })}>
            HOME_ASSISTANT_TOKEN=paste-your-token-here
          </Box>
        </li>
        <li>
          <Typography variant="body2">Restart the backend so it reads the file:</Typography>
          <Box component="pre" sx={(t) => ({ m: 0, mt: 0.5, p: 1.25, borderRadius: 1, bgcolor: 'action.hover', fontFamily: t.monoFont || 'monospace', fontSize: 13, overflow: 'auto' })}>
            sudo systemctl restart homelab-dashboard-backend
          </Box>
        </li>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
        The dashboard will look for Home Assistant at {url}. If it lives elsewhere, add a HOME_ASSISTANT_URL= line too.
      </Typography>
    </CardContent>
  </Card>
);

// One device (or the "no device" group): a clickable header with a small triangle, and its entities underneath.
const Group = ({ id, title, subtitle, entities, open, onToggle }) => (
  <Box>
    <ButtonBase
      onClick={() => onToggle(id)}
      aria-expanded={open}
      sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 1, textAlign: 'left', justifyContent: 'flex-start', '&:hover': { bgcolor: 'action.hover' } }}
    >
      <ArrowRight sx={{ transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'none', color: 'text.secondary' }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" fontWeight={600} noWrap>{title}</Typography>
        {subtitle && <Typography variant="caption" color="text.secondary" noWrap component="div">{subtitle}</Typography>}
      </Box>
      <Chip size="small" label={entities.length} sx={chipTone(null)} />
    </ButtonBase>
    <Collapse in={open} unmountOnExit>
      <Table size="small" aria-label={`${title} entities`} sx={{ bgcolor: 'action.hover' }}>
        <TableBody>
          {entities.map((e) => (
            <TableRow key={e.entity_id}>
              <TableCell sx={{ pl: 6, maxWidth: { xs: 150, sm: 340 } }}>
                <Typography variant="body2" noWrap>{e.name}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }} noWrap component="div">{e.entity_id}</Typography>
              </TableCell>
              <TableCell><Chip size="small" label={e.domain} sx={chipTone(DOMAIN_TONE[e.domain])} /></TableCell>
              <TableCell><Typography variant="body2">{e.state}{e.unit ? ` ${e.unit}` : ''}</Typography></TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><Typography variant="body2" color="text.secondary">{ago(e.changed)}</Typography></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Collapse>
  </Box>
);

const HomeAssistant = () => {
  const { data, error, refresh } = usePolling(API, 10000);
  const [searchTerm, setSearchTerm] = useState('');
  const [domainFilter, setDomainFilter] = useState('all');
  const [openIds, setOpenIds] = useState(() => new Set());

  const devices = useMemo(() => data?.devices || [], [data]);
  const loose = useMemo(() => data?.loose || [], [data]);
  const domains = useMemo(
    () => [...new Set([...devices.flatMap((d) => d.entities), ...loose].map((e) => e.domain))].sort(),
    [devices, loose],
  );
  // if the chosen type disappeared (an integration was removed) fall back to all
  const domainValue = domainFilter === 'all' || domains.includes(domainFilter) ? domainFilter : 'all';
  const filtering = searchTerm.trim() !== '' || domainValue !== 'all';

  // Keep only entities that match; a device whose own name matches the search keeps all of its entities.
  const groups = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const keep = (e, deviceHit) => (domainValue === 'all' || e.domain === domainValue) && (deviceHit || !q || `${e.name} ${e.entity_id}`.toLowerCase().includes(q));
    const out = devices.map((d) => {
      const deviceHit = q && `${d.name} ${d.manufacturer} ${d.model}`.toLowerCase().includes(q);
      return { id: d.id, title: d.name, subtitle: [d.manufacturer, d.model].filter(Boolean).join(' · '), entities: d.entities.filter((e) => keep(e, deviceHit)) };
    });
    out.push({ id: LOOSE, title: 'Not tied to a device', subtitle: 'Built-in and system entities', entities: loose.filter((e) => keep(e, false)) });
    return out.filter((g) => g.entities.length > 0);
  }, [devices, loose, searchTerm, domainValue]);

  const toggle = (id) => setOpenIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const expandAll = () => setOpenIds(new Set(groups.map((g) => g.id)));
  const collapseAll = () => setOpenIds(new Set());

  const haUrl = `http://${window.location.hostname}:8123/`;
  const live = data?.configured && data?.online;

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography variant="h4">Home Assistant</Typography>
          {live && <Pill label="version" value={data.version || '?'} tone="info" />}
          {live && <Pill label="devices" value={devices.length} tone="primary" />}
          {live && <Pill label="entities" value={`${data.shown}${data.hidden ? ` (+${data.hidden} hidden)` : ''}`} tone="primary" />}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title="Refresh now"><IconButton aria-label="refresh home assistant" onClick={refresh}><Refresh /></IconButton></Tooltip>
          <Button variant="outlined" size="small" component="a" href={haUrl} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNew fontSize="small" />}>
            Open Home Assistant
          </Button>
        </Box>
      </Box>

      {error && !data && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Can't load this page's data ({error}). If the backend was just updated, run: sudo systemctl restart homelab-dashboard-backend
        </Alert>
      )}
      {!data && !error && <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>}

      {data && !data.configured && <SetupSteps url={data.url} />}

      {data?.configured && !data.online && <Alert severity="error" sx={{ mb: 2 }}>{data.error || "Can't reach Home Assistant."}</Alert>}

      {live && (
        <>
          <Alert severity="info" sx={{ mb: 2 }}>
            View only{data.name ? ` for "${data.name}"` : ''}. Because this dashboard has no login, door locks, phone locations, cameras and alarm panels are never shown, and nothing here can switch a device.
          </Alert>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mb: 2 }}>
            <TextField
              size="small" placeholder="Search devices and entities" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
              sx={{ width: { xs: '100%', sm: 280 } }}
            />
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel id="ha-domain">Type</InputLabel>
              <Select labelId="ha-domain" label="Type" value={domainValue} onChange={(e) => setDomainFilter(e.target.value)}>
                <MenuItem value="all">All types</MenuItem>
                {domains.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
              </Select>
            </FormControl>
            {!filtering && (
              <>
                <Button size="small" onClick={expandAll}>Expand all</Button>
                <Button size="small" onClick={collapseAll}>Collapse all</Button>
              </>
            )}
          </Box>
          {data.truncated && <Alert severity="warning" sx={{ mb: 2 }}>Home Assistant has more entities than this page loads. Use Open Home Assistant for the full list.</Alert>}

          <Card>
            {groups.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>Nothing matches.</Typography>}
            {groups.map((g, i) => (
              <React.Fragment key={g.id}>
                {i > 0 && <Divider />}
                <Group {...g} open={filtering || openIds.has(g.id)} onToggle={toggle} />
              </React.Fragment>
            ))}
          </Card>
        </>
      )}
    </Box>
  );
};

export default HomeAssistant;
