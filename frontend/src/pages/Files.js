import React, { useMemo, useState } from 'react';
import {
  Alert, Box, Breadcrumbs, Button, Card, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  InputAdornment, Link, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, ToggleButton,
  ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import { Description, Folder, InsertDriveFile, Refresh, Search } from '@mui/icons-material';
import usePolling from '../hooks/usePolling';
import { fmtBytes } from '../components/dash/viz';

const API_URL = process.env.REACT_APP_BACKEND_URL || (window.location.protocol === 'https:' ? '' : `http://${window.location.hostname}:8000`);
const API = `${API_URL}/api/v1/files`;

const ago = (epoch) => {
  const mins = Math.max(0, Math.round((Date.now() / 1000 - epoch) / 60));
  if (!Number.isFinite(mins)) return '–';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
};

// Read only on purpose: this dashboard has no login, so it can look inside a few approved folders, nothing more.
const Files = () => {
  const { data: rootsData, error: rootsError } = usePolling(`${API}/roots`, 3600000);
  const [root, setRoot] = useState(0);
  const [path, setPath] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState(null); // { name, loading, error, file }

  const roots = rootsData?.roots || [];
  const { data, error, refresh } = usePolling(
    rootsData ? `${API}/list?root=${root}&path=${encodeURIComponent(path)}` : null,
    30000,
  );
  // a stale answer for the previous folder must not be shown under the new breadcrumb
  const current = data && data.root === root && data.path === path ? data : null;

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (current?.entries || []).filter((e) => !q || e.name.toLowerCase().includes(q));
  }, [current, query]);

  const crumbs = path ? path.split('/') : [];
  const go = (next) => { setPath(next); setQuery(''); };
  const pickRoot = (e, id) => { if (id !== null) { setRoot(id); go(''); } };

  const openFile = async (name) => {
    const rel = path ? `${path}/${name}` : name;
    setView({ name, loading: true, error: null, file: null });
    try {
      const res = await fetch(`${API}/read?root=${root}&path=${encodeURIComponent(rel)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
      setView({ name, loading: false, error: null, file: body });
    } catch (e) {
      setView({ name, loading: false, error: e.message, file: null });
    }
  };

  const onRow = (e) => (e.dir ? go(path ? `${path}/${e.name}` : e.name) : e.readable ? openFile(e.name) : null);

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
        <Typography variant="h4">Files</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField
            size="small" placeholder="Filter this folder" value={query} onChange={(e) => setQuery(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
            sx={{ width: { xs: '100%', sm: 240 } }}
          />
          <Tooltip title="Refresh now"><IconButton aria-label="refresh files" onClick={refresh}><Refresh /></IconButton></Tooltip>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        View only. This dashboard has no login, so you can browse a few approved folders and read small text files, but nothing can be uploaded, changed, deleted or downloaded.
        Hidden files (like .env), private keys and anything that looks like a password are never shown.
      </Alert>

      {rootsError && !rootsData && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Can't load the folder list ({rootsError}). If the backend was just updated, run: sudo systemctl restart homelab-dashboard-backend
        </Alert>
      )}
      {rootsData && roots.length === 0 && <Alert severity="warning" sx={{ mb: 2 }}>No folders are set up for browsing (FILES_ROOTS).</Alert>}

      {roots.length > 0 && (
        <>
          <ToggleButtonGroup size="small" exclusive value={root} onChange={pickRoot} sx={{ mb: 1.5, flexWrap: 'wrap' }} aria-label="folder">
            {roots.map((r) => <ToggleButton key={r.id} value={r.id} title={r.path}>{r.label}</ToggleButton>)}
          </ToggleButtonGroup>

          <Breadcrumbs sx={{ mb: 1.5, fontFamily: 'monospace', fontSize: 14 }}>
            <Link component="button" underline="hover" color={crumbs.length ? 'inherit' : 'text.primary'} onClick={() => go('')}>
              {roots.find((r) => r.id === root)?.label || ''}
            </Link>
            {crumbs.map((c, i) => (
              <Link key={i} component="button" underline="hover" color={i === crumbs.length - 1 ? 'text.primary' : 'inherit'} onClick={() => go(crumbs.slice(0, i + 1).join('/'))}>
                {c}
              </Link>
            ))}
          </Breadcrumbs>
        </>
      )}

      {error && !current && <Alert severity="warning" sx={{ mb: 2 }}>Can't open this folder ({error}).{path && <> <Button size="small" onClick={() => go('')}>Back to the top</Button></>}</Alert>}
      {roots.length > 0 && !current && !error && <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>}

      {current && (
        <Card>
          <TableContainer>
            <Table size="small" aria-label="files">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Size</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Changed</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {path && (
                  <TableRow hover sx={{ cursor: 'pointer' }} onClick={() => go(crumbs.slice(0, -1).join('/'))}>
                    <TableCell colSpan={3}><Typography variant="body2" color="text.secondary">.. (up one folder)</Typography></TableCell>
                  </TableRow>
                )}
                {entries.length === 0 && (
                  <TableRow><TableCell colSpan={3}><Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>{query ? 'Nothing matches.' : 'This folder is empty.'}</Typography></TableCell></TableRow>
                )}
                {entries.map((e) => {
                  const clickable = e.dir || e.readable;
                  const Icon = e.dir ? Folder : e.readable ? Description : InsertDriveFile;
                  return (
                    <TableRow key={e.name} hover={clickable} sx={{ cursor: clickable ? 'pointer' : 'default' }} onClick={() => onRow(e)}>
                      <TableCell sx={{ maxWidth: { xs: 220, sm: 480 } }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Icon fontSize="small" color={e.dir ? 'primary' : e.readable ? 'info' : 'disabled'} />
                          <Tooltip title={clickable || e.dir ? '' : 'Not previewable here (not a small text file, or it may hold secrets)'} placement="top-start">
                            <Typography variant="body2" fontWeight={e.dir ? 600 : 400} color={clickable ? 'text.primary' : 'text.secondary'} noWrap>{e.name}</Typography>
                          </Tooltip>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><Typography variant="body2" color="text.secondary">{e.dir ? '–' : fmtBytes(e.size)}</Typography></TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}><Typography variant="body2" color="text.secondary">{ago(e.modified)}</Typography></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          {current.truncated && <Alert severity="warning" sx={{ m: 1.5 }}>Only the first entries of this big folder are shown. Use the filter to narrow it down.</Alert>}
        </Card>
      )}

      <Dialog open={Boolean(view)} onClose={() => setView(null)} maxWidth="md" fullWidth>
        {view && (
          <>
            <DialogTitle sx={{ fontFamily: 'monospace' }}>{view.name}</DialogTitle>
            <DialogContent>
              {view.loading && <CircularProgress size={24} />}
              {view.error && <Alert severity="error">Could not open the file ({view.error})</Alert>}
              {view.file && (
                <>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    {fmtBytes(view.file.size)} · Anything that looks like a password or key is shown as [hidden].
                  </Typography>
                  <Box component="pre" sx={{ m: 0, p: 1.5, maxHeight: '60vh', overflow: 'auto', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', bgcolor: 'action.hover', borderRadius: 1 }}>
                    {view.file.text}
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

export default Files;
