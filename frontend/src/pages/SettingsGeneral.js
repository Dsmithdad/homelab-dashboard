import React from 'react';
import { Box, Grid, Typography } from '@mui/material';
import usePolling from '../hooks/usePolling';
import { Tile, BarMeter, Pill, fmtBytes, fmtUptime, levelTone } from '../components/dash/viz';

const API_URL = process.env.REACT_APP_BACKEND_URL || (window.location.protocol === 'https:' ? '' : `http://${window.location.hostname}:8000`);
const API = `${API_URL}/api/v1`;

const Row = ({ label, children }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.5 }}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant="body2" sx={{ textAlign: 'right', wordBreak: 'break-all' }}>{children}</Typography>
  </Box>
);

const SettingsGeneral = () => {
  const { data: ov, error } = usePolling(`${API}/overview`, 10000);
  const { data: svc } = usePolling(`${API}/services`, 15000);
  const { data: mc } = usePolling(`${API}/minecraft/`, 10000);

  // only services with a web port can answer; background containers (databases, agents) and stopped ones have none
  const services = (svc?.services || []).filter((s) => s.port != null);
  const reachable = services.filter((s) => s.reachable).length;
  const ts = ov?.tailscale;
  const secure = window.location.protocol === 'https:';

  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6} lg={4}>
        <Tile title="This server">
          {!ov && <Typography variant="body2" color="text.secondary">{error ? `Can't reach the backend (${error}).` : '–'}</Typography>}
          {ov && (
            <>
              <Row label="Hostname">{ov.hostname}</Row>
              <Row label="Uptime">{fmtUptime(ov.uptime_s)}</Row>
              <Row label="Load (1/5/15 min)">{ov.load?.map((n) => n.toFixed(2)).join(' / ')}</Row>
              <Row label="Tailscale IP">{ts?.self?.ip || '–'}</Row>
              <Row label="You are on">{window.location.origin}</Row>
              <Box sx={{ mt: 1.5 }}>
                <Pill label="connection" value={secure ? 'https' : 'http (no mic)'} tone={secure ? 'primary' : 'warning'} />
              </Box>
            </>
          )}
        </Tile>
      </Grid>

      <Grid item xs={12} md={6} lg={4}>
        <Tile title="Connected services">
          {!ov && <Typography variant="body2" color="text.secondary">–</Typography>}
          {ov && (
            <>
              <Row label="Docker">{ov.containers.running} of {ov.containers.total} containers running</Row>
              <Row label="Web services answering">{svc ? `${reachable} of ${services.length}` : '–'}</Row>
              <Row label="Tailscale devices">{ts?.available ? `${ts.online} of ${ts.total} online` : 'not available'}</Row>
              <Row label="Minecraft">{mc ? (mc.online ? `online · ${mc.players.online}/${mc.players.max} players` : 'offline') : '–'}</Row>
              {ov.containers.problems?.length > 0 && (
                <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
                  Needs attention: {ov.containers.problems.join(', ')}
                </Typography>
              )}
            </>
          )}
        </Tile>
      </Grid>

      <Grid item xs={12} md={12} lg={4}>
        <Tile title="Storage">
          {!ov && <Typography variant="body2" color="text.secondary">–</Typography>}
          {ov?.disks?.map((d) => (
            <Box key={d.mount} sx={{ mb: 1.5 }}>
              <BarMeter
                pct={d.percent}
                tone={levelTone(d.percent)}
                text={`${d.mount} · ${d.percent.toFixed(0)}%`}
                caption={`${fmtBytes(d.used)} used of ${fmtBytes(d.total)} · ${fmtBytes(d.free)} free`}
              />
            </Box>
          ))}
        </Tile>
      </Grid>
    </Grid>
  );
};

export default SettingsGeneral;
