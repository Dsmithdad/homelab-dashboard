import React, { useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  InputAdornment, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { Code, Refresh, Search } from '@mui/icons-material';
import usePolling from '../hooks/usePolling';
import { Pill, fmtBytes } from '../components/dash/viz';
import { chipTone } from '../utils/chipTone';

const API_URL = process.env.REACT_APP_BACKEND_URL || (window.location.protocol === 'https:' ? '' : `http://${window.location.hostname}:8000`);
const API = `${API_URL}/api/v1/scripts`;

const ago = (epoch) => {
  const mins = Math.max(0, Math.round((Date.now() / 1000 - epoch) / 60));
  if (!Number.isFinite(mins)) return '–';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

// Read only on purpose: this dashboard has no login, so it can show what a script does but never run, edit or upload one.
const Scripts = () => {
  const { data, error, refresh } = usePolling(`${API}/`, 30000);
  const [query, setQuery] = useState('');
  const [view, setView] = useState(null); // { name, loading, error, script }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.scripts || []).filter((s) => !q || `${s.name} ${s.description}`.toLowerCase().includes(q));
  }, [data, query]);

  const open = async (name) => {
    setView({ name, loading: true, error: null, script: null });
    try {
      const res = await fetch(`${API}/view?name=${encodeURIComponent(name)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
      setView({ name, loading: false, error: null, script: body });
    } catch (e) {
      setView({ name, loading: false, error: e.message, script: null });
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography variant="h4">Scripts</Typography>
          {data?.available && <Pill label="scripts" value={data.scripts.length} tone="primary" />}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField
            size="small" placeholder="Search name or description" value={query} onChange={(e) => setQuery(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
            sx={{ width: { xs: '100%', sm: 260 } }}
          />
          <Tooltip title="Refresh now"><IconButton aria-label="refresh scripts" onClick={refresh}><Refresh /></IconButton></Tooltip>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        View only. This dashboard has no login, so it can show what a script does but never run, edit or upload one. Run scripts from a terminal.
        {data?.dir && <> Folder: <b>{data.dir}</b></>}
      </Alert>

      {error && !data && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Can't load scripts ({error}). If the backend was just updated, run: sudo systemctl restart homelab-dashboard-backend
        </Alert>
      )}
      {data && !data.available && <Alert severity="warning" sx={{ mb: 2 }}>Can't read the scripts folder ({data.dir}).</Alert>}
      {!data && !error && <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>}

      {data?.available && (
        <Card>
          <TableContainer>
            <Table size="small" aria-label="scripts">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Description</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Size</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Changed</TableCell>
                  <TableCell align="right">View</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>No scripts match.</Typography></TableCell></TableRow>
                )}
                {rows.map((s) => (
                  <TableRow key={s.name} hover>
                    <TableCell sx={{ maxWidth: { xs: 180, sm: 280 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" fontWeight={600} noWrap sx={{ fontFamily: 'monospace' }}>{s.name}</Typography>
                        {!s.executable && <Chip size="small" label="not executable" sx={chipTone('warning')} />}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, maxWidth: 380 }}>
                      <Typography variant="body2" color="text.secondary" noWrap>{s.description || '–'}</Typography>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><Typography variant="body2" color="text.secondary">{fmtBytes(s.size)}</Typography></TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><Typography variant="body2" color="text.secondary">{ago(s.modified)}</Typography></TableCell>
                    <TableCell align="right">
                      <Tooltip title="Read this script">
                        <IconButton size="small" color="info" onClick={() => open(s.name)} aria-label={`view ${s.name}`}><Code /></IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <Dialog open={Boolean(view)} onClose={() => setView(null)} maxWidth="md" fullWidth>
        {view && (
          <>
            <DialogTitle sx={{ fontFamily: 'monospace' }}>{view.name}</DialogTitle>
            <DialogContent>
              {view.loading && <CircularProgress size={24} />}
              {view.error && <Alert severity="error">Could not load the script ({view.error})</Alert>}
              {view.script && (
                <>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    To run it, use a terminal: <b>{view.script.executable ? view.script.path : `bash ${view.script.path}`}</b>
                    {' '}· Anything that looks like a password or key is shown as [hidden].
                  </Typography>
                  {view.script.truncated && <Alert severity="warning" sx={{ mb: 1 }}>Long script: showing only the first part.</Alert>}
                  <Box component="pre" sx={{ m: 0, p: 1.5, maxHeight: '55vh', overflow: 'auto', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', bgcolor: 'action.hover', borderRadius: 1 }}>
                    {view.script.text}
                  </Box>
                </>
              )}
            </DialogContent>
            <DialogActions><Button onClick={() => setView(null)}>Close</Button></DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default Scripts;
