import React from 'react';
import { Box, Typography } from '@mui/material';
import { Tile } from './viz';
import { SpinningFan, FanPatternPicker } from './FanModel';

// The software can't know which motherboard header is which fan, so these names come from the user (confirmed
// 2026-10-08: fan1 and fan2 are the CPU fans, fan5 is the 200mm case fan; fan3 and fan4 are empty headers).
// Entries are in header order (the first entry is the board's fan1).
const FAN_LABELS = ['CPU Fan 1', 'CPU Fan 2', 'Fan 3', 'Fan 4', '200mm Case Fan'];
const GPU_SPIN_RPM_PER_PERCENT = 20;   // the GPU reports a percentage; scale it to a plausible RPM for the animation

const Unit = ({ label, rpm, tempC, value, caption }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, width: 132 }}>
    <SpinningFan rpm={rpm} tempC={tempC} size={116} />
    <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: '100%' }}>{label}</Typography>
    <Typography variant="body1" sx={(t) => ({ fontFamily: t.monoFont, lineHeight: 1.1 })}>{value}</Typography>
    <Typography variant="caption" color="text.secondary">{caption}</Typography>
  </Box>
);

// One animated fan per motherboard header that has a fan plugged in, plus the GPU fan.
const FansPanel = ({ fans, gpu, cpuTemp }) => {
  const board = (fans || []).map((f, i) => ({ ...f, label: FAN_LABELS[i] || `Fan ${i + 1}` }));
  const running = board.filter((f) => f.rpm > 0);
  const empty = board.length - running.length;
  const gpuPct = gpu?.fan_percent;

  return (
    <Tile title="Fans" tone="secondary" right={<FanPatternPicker />}>
      {!fans && !gpu ? (
        <Typography variant="body2" color="text.secondary">No fan sensors detected.</Typography>
      ) : (
        <>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 2, py: 0.5 }}>
            {running.map((f) => (
              <Unit key={f.id} label={f.label} rpm={f.rpm} tempC={cpuTemp} value={`${f.rpm} RPM`} caption="running" />
            ))}
            {gpuPct != null && (
              <Unit label={`GPU fan${gpu?.name ? ` · ${gpu.name}` : ''}`} rpm={gpuPct * GPU_SPIN_RPM_PER_PERCENT} tempC={gpu?.temp_c}
                value={`${Math.round(gpuPct)}%`} caption={gpuPct > 0 ? 'running' : 'stopped (idle)'} />
            )}
          </Box>
          {empty > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {empty} motherboard fan header{empty > 1 ? 's' : ''} reading 0 RPM (empty or stopped)
            </Typography>
          )}
        </>
      )}
    </Tile>
  );
};

export default FansPanel;
