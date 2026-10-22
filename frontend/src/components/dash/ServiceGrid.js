import React from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { alpha } from '@mui/material/styles';

const statusTone = (s) => {
  if (s.status !== 'running') return 'error';
  if (s.health === 'unhealthy') return 'error';
  if (s.port && s.reachable === false) return 'warning';
  return 'success';
};

const urlFor = (s) => `${s.scheme || 'http'}://${window.location.hostname}:${s.port}${s.path || ''}`;

const ServiceCard = ({ s }) => {
  const tone = statusTone(s);
  const clickable = !!s.port;
  const body = (
    <Box
      component={clickable ? 'a' : 'div'}
      {...(clickable ? { href: urlFor(s), target: '_blank', rel: 'noopener noreferrer' } : {})}
      sx={(theme) => ({
        display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, borderRadius: 2.5, textDecoration: 'none',
        color: 'text.primary', border: `1px solid ${alpha(theme.palette.text.secondary, 0.18)}`,
        bgcolor: alpha(theme.palette.background.default, 0.3), transition: 'all .15s',
        cursor: clickable ? 'pointer' : 'default',
        '&:hover': clickable ? { borderColor: theme.palette.primary.main, bgcolor: alpha(theme.palette.primary.main, 0.12), transform: 'translateY(-1px)' } : {},
      })}
    >
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, bgcolor: `${tone}.main`, boxShadow: (t) => `0 0 8px ${alpha(t.palette[tone].main, 0.8)}` }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{s.name}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap sx={(t) => ({ display: 'block', fontFamily: t.monoFont })}>
          {s.port ? `:${s.port}` : s.status}{s.latency_ms != null ? ` · ${Math.round(s.latency_ms)}ms` : ''}
        </Typography>
      </Box>
    </Box>
  );
  return <Tooltip title={`${s.container} · ${s.image}`} placement="top" enterDelay={600}>{body}</Tooltip>;
};

export default function ServiceGrid({ data, error }) {
  if (error && !data) {
    return <Typography color="warning.main" variant="body2">Can't reach /api/v1/services ({error}). Restart the backend: sudo systemctl restart homelab-dashboard-backend</Typography>;
  }
  if (!data) return <Typography color="text.secondary" variant="body2">Scanning containers…</Typography>;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {data.groups.map((g) => {
        const items = data.services.filter((s) => s.group === g.id);
        if (!items.length) return null;
        return (
          <Box key={g.id}>
            <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.12em' }}>{g.label} · {items.length}</Typography>
            <Box sx={{ display: 'grid', gap: 1, mt: 0.5, gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {items.map((s) => <ServiceCard key={s.id} s={s} />)}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
