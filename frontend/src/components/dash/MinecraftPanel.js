import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Map as MapIcon } from '@mui/icons-material';
import { BLUEMAP_URL } from '../../pages/Minecraft';
import { Tile, BarMeter, Pill, fmtUptime, levelTone } from './viz';

// data = /api/v1/minecraft
const MinecraftPanel = ({ data, error }) => {
  const server = data?.server;
  const players = data?.players;
  const memPct = server?.heap_max_mb ? (server.memory_mb / server.heap_max_mb) * 100 : null;
  const right = (
    <Typography variant="caption" color="text.secondary" noWrap>
      {data?.online ? `${data.version} · ${data.latency_ms} ms` : data ? 'offline' : ''}
    </Typography>
  );

  return (
    <Tile title="Minecraft" tone={data?.online ? 'primary' : 'warning'} right={right}>
      {!data && (
        <Typography variant="body2" color="text.secondary">
          {error ? `Can't load Minecraft stats (${error}). If the backend was just updated, run: sudo systemctl restart homelab-dashboard-backend` : '–'}
        </Typography>
      )}

      {data && !data.online && (
        <Typography variant="body2" color="text.secondary">
          The server isn't answering on its port. Start it from Crafty (port 8111).
        </Typography>
      )}

      {data?.online && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontSize: 34, lineHeight: 1, fontWeight: 700 }}>{players.online}</Typography>
            <Typography variant="body2" color="text.secondary">/ {players.max} players</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, minHeight: 20 }} noWrap>
            {players.names.length ? players.names.join(', ') : players.online ? 'Players online' : 'Nobody online'}
          </Typography>
          {data.motd && <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{data.motd}</Typography>}

          {server ? (
            <Box sx={{ mt: 1.5 }}>
              <BarMeter
                caption="Server memory"
                pct={memPct}
                tone={levelTone(memPct)}
                text={`${(server.memory_mb / 1024).toFixed(1)}${server.heap_max_mb ? ` / ${(server.heap_max_mb / 1024).toFixed(1)}` : ''} GB`}
              />
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                <Pill label="up" value={fmtUptime(server.uptime_s)} tone="info" />
                <Pill label="cpu" value={`${Math.round(server.cpu_percent)}%`} tone={levelTone(server.cpu_percent)} />
              </Box>
            </Box>
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              Memory and CPU unavailable: the server's java process wasn't found.
            </Typography>
          )}

          <Typography variant="caption" color="text.secondary" sx={(t) => ({ display: 'block', mt: 1.25, fontFamily: t.monoFont })} noWrap>
            join: {data.address}
          </Typography>
          <Button size="small" startIcon={<MapIcon />} href={BLUEMAP_URL} target="_blank" rel="noreferrer" sx={{ mt: 0.75, ml: -0.75 }}>
            Live map
          </Button>
        </>
      )}
    </Tile>
  );
};

export default MinecraftPanel;
