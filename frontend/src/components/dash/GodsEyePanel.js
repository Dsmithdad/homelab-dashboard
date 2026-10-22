import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Tile, Pill } from './viz';
import { externalUrl } from '../Sidebar';

const nf = new Intl.NumberFormat();

const Stat = ({ value, label, sub }) => (
  <Box sx={{ minWidth: 0 }}>
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
      <Typography sx={{ fontSize: 34, lineHeight: 1, fontWeight: 700 }}>{value}</Typography>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
    </Box>
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, minHeight: 18 }} noWrap>{sub}</Typography>
  </Box>
);

// data = /api/v1/godseye
const GodsEyePanel = ({ data, error }) => {
  const ships = data?.ships;
  const fires = data?.fires;
  const shipsOk = ships && !ships.error;
  const firesOk = fires && !fires.error;
  // the app listens on its own port on this same machine, so link to this page's host
  const href = externalUrl({ port: data?.port || 4173, httpsPort: 4443 });

  const right = (
    <Typography variant="caption" color="text.secondary" noWrap>
      {data ? (data.online ? 'live' : 'offline') : ''}
    </Typography>
  );

  return (
    <Tile title="God's Eye View" tone={data && !data.online ? 'warning' : 'primary'} right={right}>
      {!data && (
        <Typography variant="body2" color="text.secondary">
          {error ? `Can't load God's Eye View data (${error}). If the backend was just updated, run: sudo systemctl restart homelab-dashboard-backend` : '–'}
        </Typography>
      )}

      {data && !data.online && (
        <Typography variant="body2" color="text.secondary">
          The app isn't answering on port {data.port}. Check it with: systemctl status gods-eye-view
        </Typography>
      )}

      {data?.online && (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 2 }}>
            <Stat
              value={shipsOk ? `${nf.format(ships.count)}${ships.capped ? '+' : ''}` : '–'}
              label="ships tracked"
              sub={shipsOk
                ? (ships.nearest ? `Nearest: ${ships.nearest.name}, ${nf.format(ships.nearest.km)} km` : 'None in range')
                : ships ? 'Ship feed unavailable' : ''}
            />
            <Stat
              value={firesOk ? nf.format(fires.near_count) : '–'}
              label={`fires within ${fires?.near_km ?? 300} km`}
              sub={firesOk
                ? (fires.nearest_km != null ? `Closest: ${nf.format(fires.nearest_km)} km away` : '')
                : fires ? 'Fire feed unavailable' : ''}
            />
          </Box>

          {firesOk && fires.strongest && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }} noWrap>
              Hottest on Earth: {nf.format(Math.round(fires.strongest.frp_mw))} MW at {fires.strongest.lat}, {fires.strongest.lon}
            </Typography>
          )}

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5, alignItems: 'center' }}>
            {firesOk && <Pill label="fires worldwide" value={nf.format(fires.count)} tone={fires.stale ? 'warning' : 'info'} />}
            {firesOk && <Pill label="satellites" value={`${fires.satellites_ok}/${fires.satellites_total}`} tone={fires.satellites_ok === fires.satellites_total ? 'primary' : 'warning'} />}
            {shipsOk && ships.feed_status && <Pill label="ship feed" value={ships.feed_status} tone={ships.feed_status === 'live' ? 'primary' : 'warning'} />}
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
            Open God's Eye View
          </Button>
        </>
      )}
    </Tile>
  );
};

export default GodsEyePanel;
