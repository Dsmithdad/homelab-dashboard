import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Card, CircularProgress, FormControlLabel, IconButton, InputAdornment, Switch, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { Refresh, Search, Terminal } from '@mui/icons-material';
import usePolling from '../hooks/usePolling';
import { Pill } from '../components/dash/viz';

const API_URL = process.env.REACT_APP_BACKEND_URL || (window.location.protocol === 'https:' ? '' : `http://${window.location.hostname}:8000`);
const API = `${API_URL}/api/v1/containers`;
const LOGS_SOURCE_KEY = 'logsSource'; // the Logs page remembers its last source here

// The backend sends ports like {"8084/tcp": [{"HostPort": "8084"}], "3306/tcp": null}; turn that into "8084→80/tcp" labels.
const formatPorts = (ports) => {
  const out = new Set();
  Object.entries(ports || {}).forEach(([containerPort, bindings]) => {
    (bindings || []).forEach((b) => out.add(`${b.HostPort}→${containerPort}`));
  });
  return [...out];
};

const age = (iso) => {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (!Number.isFinite(mins)) return '–';
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
};

const stateColor = (status) => (status === 'running' ? 'success.main' : status === 'exited' || status === 'created' ? 'text.disabled' : 'warning.main');

// Read-only on purpose: this dashboard has no login, so it can look at containers but not start, stop or delete them.
const Containers = () => {
  const navigate = useNavigate();
  const { data, error, refresh } = usePolling(`${API}?all=true`, 5000);
  const [query, setQuery] = useState('');
  const [showStopped, setShowStopped] = useState(true);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data || [])
      .filter((c) => (showStopped || c.status === 'running') && (!q || `${c.name} ${c.image} ${c.id}`.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running') || a.name.localeCompare(b.name));
  }, [data, query, showStopped]);

  const running = (data || []).filter((c) => c.status === 'running').length;

  // Logs live on the Logs page (secrets scrubbed there): preselect this container, then go.
  const openLogs = (c) => {
    try { localStorage.setItem(LOGS_SOURCE_KEY, `docker:${c.name}`); } catch (e) { /* storage blocked: Logs opens on its default source */ }
    navigate('/logs');
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography variant="h4">Containers</Typography>
          <Pill label="running" value={data ? `${running}/${data.length}` : '–'} tone="success" />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="Search name, image or ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
            sx={{ width: { xs: '100%', sm: 260 } }}
          />
          <FormControlLabel
            control={<Switch size="small" checked={showStopped} onChange={(e) => setShowStopped(e.target.checked)} />}
            label="Show stopped"
            componentsProps={{ typography: { variant: 'body2' } }}
          />
          <Tooltip title="Refresh now">
            <IconButton aria-label="refresh containers" onClick={refresh}><Refresh /></IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        View only. This dashboard has no login, so it can't start, stop or remove containers. Use Portainer or the terminal for that.
      </Alert>

      {error && !data && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Can't load containers ({error}). Is the backend running? sudo systemctl restart homelab-dashboard-backend
        </Alert>
      )}
      {error && data && <Alert severity="warning" sx={{ mb: 2 }}>Showing the last good data. Refresh failed: {error}</Alert>}

      {!data && !error && <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>}

      {data && (
        <Card>
          <TableContainer>
            <Table size="small" aria-label="containers">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Ports</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Age</TableCell>
                  <TableCell align="right">Logs</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>No containers match.</Typography></TableCell></TableRow>
                )}
                {rows.map((c) => {
                  const ports = formatPorts(c.ports);
                  return (
                    <TableRow key={c.id} hover>
                      <TableCell sx={{ maxWidth: { xs: 150, sm: 320 } }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{c.name}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }} noWrap component="div">{c.image}</Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: stateColor(c.status) }} />
                          <Typography variant="body2">{c.status}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                        {ports.length ? ports.map((p) => (
                          <Typography key={p} variant="caption" sx={{ fontFamily: 'monospace', display: 'block' }}>{p}</Typography>
                        )) : <Typography variant="caption" color="text.secondary">–</Typography>}
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><Typography variant="body2" color="text.secondary">{age(c.created)}</Typography></TableCell>
                      <TableCell align="right">
                        <Tooltip title="Open this container's logs">
                          <IconButton size="small" color="info" onClick={() => openLogs(c)} aria-label={`logs for ${c.name}`}><Terminal /></IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </Box>
  );
};

export default Containers;
