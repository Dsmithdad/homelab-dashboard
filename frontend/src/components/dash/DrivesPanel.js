import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Tile, Pill, fmtBytes, tempTone } from './viz';
import { externalUrl } from '../Sidebar';

const STATUS_TONE = { passed: 'success', warning: 'warning', failed: 'error' };
const STATUS_TEXT = { passed: 'healthy', warning: 'watch', failed: 'failing' };

// "WDC WD10EZEX-00BN5A0" -> shorter name for a narrow tile
const shortModel = (m) => (m || 'unknown').replace(/\s+(with Heatsink|FFS G1)\b.*$/i, '').slice(0, 30);

const DriveRow = ({ d }) => {
  const tone = STATUS_TONE[d.status] || 'primary';
  return (
    <Box sx={{ py: 0.8 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: `${tone}.main` }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" noWrap>{shortModel(d.model)}</Typography>
          <Typography variant="caption" color="text.secondary" sx={(t) => ({ fontFamily: t.monoFont, display: 'block' })} noWrap>
            {d.name} · {d.capacity ? fmtBytes(d.capacity) : '?'}{d.mount ? ` · ${d.mount}` : ''}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography variant="body2" color={d.temp_c != null ? `${tempTone(d.temp_c)}.main` : 'text.secondary'}>
            {d.temp_c != null ? `${d.temp_c}°C` : '–'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {d.hours != null ? `${Math.round(d.hours / 24).toLocaleString()} days on` : ''}
          </Typography>
        </Box>
      </Box>
      {d.nvme && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', pl: 2.5 }}>
          wear {d.nvme.wear_pct ?? '–'}% · spare {d.nvme.spare_pct ?? '–'}% · unsafe shutdowns {d.nvme.unsafe_shutdowns ?? '–'}
          {d.nvme.media_errors ? ` · media errors ${d.nvme.media_errors}` : ''}
        </Typography>
      )}
      {d.status !== 'passed' && d.problems?.length > 0 && (
        <Typography variant="caption" color={`${tone}.main`} sx={{ display: 'block', pl: 2.5 }}>
          {STATUS_TEXT[d.status]}: {d.problems.map((p) => p.name).join(', ')}
        </Typography>
      )}
    </Box>
  );
};

// data = /api/v1/drives
const DrivesPanel = ({ data, error }) => {
  const drives = data?.drives || [];
  const bad = drives.filter((d) => d.status !== 'passed');
  const failing = drives.some((d) => d.status === 'failed');
  const tone = !data || !data.online ? 'warning' : failing ? 'error' : bad.length ? 'warning' : 'primary';
  // Scrutiny listens on its own port on this machine; on https pages it is reached through Tailscale Serve
  const href = externalUrl({ port: data?.port || 8085, httpsPort: 8443 });

  const right = (
    <Typography variant="caption" color="text.secondary" noWrap>
      {data?.online ? `${drives.length - bad.length}/${drives.length} healthy` : data ? 'offline' : ''}
    </Typography>
  );

  return (
    <Tile title="Drive health" tone={tone} right={right}>
      {!data && (
        <Typography variant="body2" color="text.secondary">
          {error ? `Can't load drive data (${error}). If the backend was just updated, run: sudo systemctl restart homelab-dashboard-backend` : '–'}
        </Typography>
      )}

      {data && !data.online && (
        <Typography variant="body2" color="text.secondary">
          Scrutiny isn't answering. Check it with: docker ps --filter name=scrutiny
        </Typography>
      )}

      {data?.online && (
        <>
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {drives.map((d) => <DriveRow key={d.name} d={d} />)}
          </Box>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5, alignItems: 'center' }}>
            <Pill label="drives" value={drives.length} tone="info" />
            <Pill label="flagged" value={bad.length} tone={failing ? 'error' : bad.length ? 'warning' : 'success'} />
          </Box>

          <Button
            component="a"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            size="small"
            variant="outlined"
            endIcon={<OpenInNewIcon fontSize="small" />}
            sx={{ mt: 2 }}
          >
            Open Scrutiny
          </Button>
        </>
      )}
    </Tile>
  );
};

export default DrivesPanel;
