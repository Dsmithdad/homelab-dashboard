import React from 'react';
import { Box, Typography } from '@mui/material';
import { Tile, Pill, BarMeter, fmtBytes } from './viz';

const STATUS_TONE = { ok: 'success', late: 'warning', problem: 'error' };
const STATUS_TEXT = { ok: 'healthy', late: 'late', problem: 'problem' };

const fmtAge = (h) => {
  if (h == null) return '–';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`;
  if (h < 48) return `${h.toFixed(1)} h ago`;
  return `${Math.round(h / 24)} days ago`;
};

const Row = ({ label, value, sub }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2, py: 0.4 }}>
    <Typography variant="body2" color="text.secondary" noWrap>{label}</Typography>
    <Box sx={{ textAlign: 'right', minWidth: 0 }}>
      <Typography variant="body2" noWrap>{value}</Typography>
      {sub && <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>{sub}</Typography>}
    </Box>
  </Box>
);

// data = /api/v1/backup
const BackupPanel = ({ data, error }) => {
  const tone = data ? STATUS_TONE[data.status] || 'warning' : 'primary';
  const disk = data?.disk;
  const usedPct = disk ? (disk.used / disk.total) * 100 : null;

  const right = (
    <Typography variant="caption" color="text.secondary" noWrap>
      {data ? STATUS_TEXT[data.status] || '' : ''}
    </Typography>
  );

  return (
    <Tile title="Immich backup" tone={tone} right={right}>
      {!data && (
        <Typography variant="body2" color="text.secondary">
          {error ? `Can't load backup data (${error}). If the backend was just updated, run: sudo systemctl restart homelab-dashboard-backend` : '–'}
        </Typography>
      )}

      {data?.error && (
        <Typography variant="body2" color="text.secondary">Couldn't read the backup status ({data.error}).</Typography>
      )}

      {data && !data.error && (
        <>
          {!data.mounted && (
            <Typography variant="body2" color="error.main" sx={{ mb: 1 }}>
              {data.mount} is not mounted. Nothing is being backed up until the drive is back.
            </Typography>
          )}
          {data.last_fail && (
            <Typography variant="body2" color="error.main" sx={{ mb: 1 }} noWrap title={data.last_fail}>
              Last run failed: {data.last_fail}
            </Typography>
          )}

          <Row
            label="Last good backup"
            value={data.last_ok ? fmtAge(data.age_h) : 'never'}
            sub={data.last_ok ? new Date(data.last_ok.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : null}
          />
          <Row
            label="Photo library"
            value={data.last_ok ? data.last_ok.library : '–'}
            sub="copied, deletions never removed"
          />
          <Row
            label="Database dumps"
            value={data.dump_count}
            sub={data.newest_dump ? `newest ${fmtBytes(data.newest_dump.bytes)}` : null}
          />

          {disk && (
            <Box sx={{ mt: 1.5 }}>
              <BarMeter
                pct={usedPct}
                text={`${fmtBytes(disk.used)} of ${fmtBytes(disk.total)} used`}
                caption={`${fmtBytes(disk.free)} free on ${data.mount}`}
                tone={usedPct >= 90 ? 'error' : usedPct >= 70 ? 'warning' : 'primary'}
              />
            </Box>
          )}

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5, alignItems: 'center' }}>
            <Pill label="drive" value={data.mounted ? 'mounted' : 'missing'} tone={data.mounted ? 'success' : 'error'} />
            <Pill label="08:00 check" value={data.check && /\bok$/.test(data.check) ? 'ok' : data.check ? 'alert' : 'n/a'} tone={data.check && /\bok$/.test(data.check) ? 'success' : data.check ? 'warning' : 'info'} />
            <Pill label="offsite copy" value="none" tone="warning" />
          </Box>
        </>
      )}
    </Tile>
  );
};

export default BackupPanel;
