import React, { useEffect, useRef, useState } from 'react';
import { Box, Grid, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import usePolling from '../hooks/usePolling';
import { Tile, BarMeter, Pill, Sparkline, fmtBytes, fmtRate, fmtUptime, levelTone, tempTone } from '../components/dash/viz';

const API_URL = process.env.REACT_APP_BACKEND_URL || (window.location.protocol === 'https:' ? '' : `http://${window.location.hostname}:8000`);
const API = `${API_URL}/api/v1`;
const HISTORY = 60; // points kept per chart (about 3 minutes at 3 s)

// Keeps the last HISTORY readings of whatever `pick(data)` returns, adding one per new server reading.
const useHistory = (data, pick) => {
  const [hist, setHist] = useState({});
  const last = useRef(null);
  useEffect(() => {
    if (!data || data.time === last.current) return;
    last.current = data.time;
    const now = pick(data);
    setHist((h) => {
      const next = {};
      Object.keys(now).forEach((k) => { next[k] = [...(h[k] || []), now[k] ?? 0].slice(-HISTORY); });
      return next;
    });
  }, [data, pick]);
  return hist;
};

const pickAll = (d) => ({
  cpu: d.cpu?.percent, mem: d.memory?.percent, gpu: d.gpu?.percent, vram: d.gpu?.mem_total_mb ? (d.gpu.mem_used_mb / d.gpu.mem_total_mb) * 100 : 0,
  rx: d.network?.rx_bps, tx: d.network?.tx_bps, load: d.load?.[0], cpuTemp: d.cpu?.temp_c, gpuTemp: d.gpu?.temp_c,
});

const Big = ({ children, sub }) => (
  <>
    <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{children}</Typography>
    {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
  </>
);
const Row = ({ label, children }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.5 }}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant="body2" sx={{ textAlign: 'right', wordBreak: 'break-all' }}>{children}</Typography>
  </Box>
);
const Chart = ({ title, values, tone, max, now }) => (
  <Tile title={title} tone={tone} right={<Typography variant="caption" color="text.secondary">{now}</Typography>}>
    <Sparkline values={values} tone={tone} max={max} height={70} />
    <Typography variant="caption" color="text.secondary">last few minutes</Typography>
  </Tile>
);

// interfaces worth showing: skip loopback and the many Docker bridges / veth pairs
const realInterfaces = (ifaces) => Object.entries(ifaces || {})
  .filter(([name]) => name !== 'lo' && !/^(veth|br-|docker)/.test(name))
  .map(([name, v]) => ({
    name,
    ip: v.addresses?.find((a) => a.family === 2)?.address || '–',
    up: v.stats?.isup,
    speed: v.stats?.speed,
  }));

const System = () => {
  const [tab, setTab] = useState(0);
  const { data: d, error } = usePolling(`${API}/overview`, 3000);
  const { data: net } = usePolling(`${API}/system/network`, 30000);
  const h = useHistory(d, pickAll);
  const [procSort, setProcSort] = useState('by_cpu');
  // only poll the process list while its tab is open
  const { data: procs, error: procError } = usePolling(tab === 6 ? `${API}/system/processes?limit=20` : null, 5000);

  if (!d) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>System</Typography>
        <Typography color="text.secondary">{error ? `Can't reach the backend (${error}).` : 'Loading...'}</Typography>
      </Box>
    );
  }

  const memUsed = d.memory.used;
  const memTotal = d.memory.total;
  const gpuMemPct = d.gpu?.mem_total_mb ? (d.gpu.mem_used_mb / d.gpu.mem_total_mb) * 100 : null;
  const cores = d.cpu.cores;
  const ifaces = realInterfaces(net?.interfaces);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>System</Typography>
      <Typography variant="body2" color="text.secondary">{d.hostname} · up {fmtUptime(d.uptime_s)} · updates every few seconds</Typography>

      <Tabs value={tab} onChange={(e, n) => setTab(n)} variant="scrollable" allowScrollButtonsMobile sx={{ mt: 2, mb: 3 }}>
        {['Overview', 'CPU', 'Memory', 'Disk', 'Network', 'GPU', 'Processes'].map((t) => <Tab key={t} label={t} />)}
      </Tabs>

      {tab === 0 && (
        <Grid container spacing={3}>
          <Grid item xs={6} md={3}><Tile title="Uptime"><Big sub={`${d.hostname}`}>{fmtUptime(d.uptime_s)}</Big></Tile></Grid>
          <Grid item xs={6} md={3}>
            <Tile title="Load average" tone={levelTone((d.load[0] / cores) * 100)}>
              <Big sub={`1 / 5 / 15 min · ${cores} cores`}>{d.load[0].toFixed(2)}</Big>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{d.load.map((n) => n.toFixed(2)).join(' / ')}</Typography>
            </Tile>
          </Grid>
          <Grid item xs={6} md={3}>
            <Tile title="Containers" tone={d.containers.problems?.length ? 'warning' : 'primary'}>
              <Big sub="running">{d.containers.running} of {d.containers.total}</Big>
              {d.containers.problems?.length > 0 && <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>Needs attention: {d.containers.problems.join(', ')}</Typography>}
            </Tile>
          </Grid>
          <Grid item xs={6} md={3}>
            <Tile title="Tailscale"><Big sub="devices online">{d.tailscale?.available ? `${d.tailscale.online} of ${d.tailscale.total}` : '–'}</Big></Tile>
          </Grid>
          <Grid item xs={12} md={6} lg={3}><Chart title="CPU" values={h.cpu} max={100} tone={levelTone(d.cpu.percent)} now={`${d.cpu.percent.toFixed(0)}%`} /></Grid>
          <Grid item xs={12} md={6} lg={3}><Chart title="Memory" values={h.mem} max={100} tone={levelTone(d.memory.percent)} now={`${d.memory.percent.toFixed(0)}%`} /></Grid>
          <Grid item xs={12} md={6} lg={3}><Chart title="GPU" values={h.gpu} max={100} tone="secondary" now={d.gpu ? `${d.gpu.percent.toFixed(0)}%` : '–'} /></Grid>
          <Grid item xs={12} md={6} lg={3}><Chart title="Network in" values={h.rx} tone="primary" now={fmtRate(d.network.rx_bps)} /></Grid>
        </Grid>
      )}

      {tab === 1 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Tile title="CPU" tone={levelTone(d.cpu.percent)}>
              <BarMeter pct={d.cpu.percent} tone={levelTone(d.cpu.percent)} text={`${d.cpu.percent.toFixed(1)}%`} caption="Usage across all cores" />
              <Box sx={{ mt: 2 }}>
                <Row label="Cores">{cores}</Row>
                <Row label="Clock speed">{d.cpu.freq_mhz ? `${Math.round(d.cpu.freq_mhz)} MHz` : '–'}</Row>
                <Row label="Temperature">{d.cpu.temp_c != null ? `${d.cpu.temp_c.toFixed(0)} °C` : '–'}</Row>
                <Row label="Load (1/5/15 min)">{d.load.map((n) => n.toFixed(2)).join(' / ')}</Row>
              </Box>
              <Box sx={{ mt: 1 }}><Pill label="temp" value={d.cpu.temp_c != null ? `${d.cpu.temp_c.toFixed(0)}°C` : '–'} tone={tempTone(d.cpu.temp_c)} /></Box>
            </Tile>
          </Grid>
          <Grid item xs={12} md={8}>
            <Chart title="CPU usage" values={h.cpu} max={100} tone={levelTone(d.cpu.percent)} now={`${d.cpu.percent.toFixed(0)}%`} />
            <Box sx={{ mt: 3 }}><Chart title="CPU temperature (°C)" values={h.cpuTemp} max={100} tone={tempTone(d.cpu.temp_c)} now={d.cpu.temp_c != null ? `${d.cpu.temp_c.toFixed(0)} °C` : '–'} /></Box>
          </Grid>
        </Grid>
      )}

      {tab === 2 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Tile title="Memory" tone={levelTone(d.memory.percent)}>
              <BarMeter pct={d.memory.percent} tone={levelTone(d.memory.percent)} text={`${d.memory.percent.toFixed(0)}%`} caption={`${fmtBytes(memUsed)} used of ${fmtBytes(memTotal)}`} />
              <Box sx={{ mt: 2 }}>
                <Row label="Free">{fmtBytes(memTotal - memUsed)}</Row>
                <Row label="Swap in use">{d.memory.swap_percent.toFixed(1)}%</Row>
              </Box>
            </Tile>
          </Grid>
          <Grid item xs={12} md={8}><Chart title="Memory usage" values={h.mem} max={100} tone={levelTone(d.memory.percent)} now={`${d.memory.percent.toFixed(0)}%`} /></Grid>
        </Grid>
      )}

      {tab === 3 && (
        <Grid container spacing={3}>
          {d.disks.map((disk) => (
            <Grid item xs={12} md={6} key={disk.mount}>
              <Tile title={`Disk ${disk.mount}`} tone={levelTone(disk.percent)}>
                <BarMeter pct={disk.percent} tone={levelTone(disk.percent)} text={`${disk.percent.toFixed(0)}%`} caption={`${fmtBytes(disk.used)} used of ${fmtBytes(disk.total)}`} />
                <Box sx={{ mt: 2 }}>
                  <Row label="Free">{fmtBytes(disk.free)}</Row>
                  <Row label="Device">{disk.device}</Row>
                </Box>
              </Tile>
            </Grid>
          ))}
        </Grid>
      )}

      {tab === 4 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}><Chart title="Download" values={h.rx} tone="primary" now={fmtRate(d.network.rx_bps)} /></Grid>
          <Grid item xs={12} md={6}><Chart title="Upload" values={h.tx} tone="secondary" now={fmtRate(d.network.tx_bps)} /></Grid>
          <Grid item xs={12}>
            <Tile title="Network interfaces" right={<Typography variant="caption" color="text.secondary">Docker bridges hidden</Typography>}>
              {!net && <Typography variant="body2" color="text.secondary">–</Typography>}
              {ifaces.map((i) => (
                <Box key={i.name} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, py: 0.5 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{i.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{i.ip}{i.speed > 0 ? ` · ${i.speed} Mbit/s` : ''}</Typography>
                  <Pill label="" value={i.up ? 'up' : 'down'} tone={i.up ? 'primary' : 'warning'} />
                </Box>
              ))}
            </Tile>
          </Grid>
        </Grid>
      )}

      {tab === 5 && (
        <Grid container spacing={3}>
          {!d.gpu && <Grid item xs={12}><Typography color="text.secondary">No GPU reported by the server.</Typography></Grid>}
          {d.gpu && (
            <>
              <Grid item xs={12} md={4}>
                <Tile title={d.gpu.name} tone="secondary">
                  <BarMeter pct={d.gpu.percent} tone={levelTone(d.gpu.percent)} text={`${d.gpu.percent.toFixed(0)}%`} caption="GPU usage" />
                  <Box sx={{ mt: 1.5 }}>
                    <BarMeter pct={gpuMemPct} tone={levelTone(gpuMemPct)} text={`${Math.round(d.gpu.mem_used_mb)} MB`} caption={`VRAM of ${Math.round(d.gpu.mem_total_mb)} MB`} />
                  </Box>
                  <Box sx={{ mt: 2 }}>
                    <Row label="Temperature">{d.gpu.temp_c != null ? `${d.gpu.temp_c.toFixed(0)} °C` : '–'}</Row>
                    <Row label="Power draw">{d.gpu.power_w != null ? `${d.gpu.power_w.toFixed(0)} W` : '–'}</Row>
                  </Box>
                </Tile>
              </Grid>
              <Grid item xs={12} md={8}>
                <Chart title="GPU usage" values={h.gpu} max={100} tone="secondary" now={`${d.gpu.percent.toFixed(0)}%`} />
                <Box sx={{ mt: 3 }}><Chart title="VRAM used" values={h.vram} max={100} tone={levelTone(gpuMemPct)} now={`${Math.round(d.gpu.mem_used_mb)} MB`} /></Box>
              </Grid>
            </>
          )}
        </Grid>
      )}

      {tab === 6 && (
        <Tile
          title="Top processes"
          right={procs ? <Typography variant="caption" color="text.secondary">{procs.total} running on this server</Typography> : null}
        >
          {!procs && (
            <Typography variant="body2" color="text.secondary">
              {procError ? `Can't load processes (${procError}). If the backend was just updated, run: sudo systemctl restart homelab-dashboard-backend` : 'Loading...'}
            </Typography>
          )}
          {procs && (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 1.5 }}>
                <ToggleButtonGroup exclusive size="small" value={procSort} onChange={(e, v) => v && setProcSort(v)} aria-label="sort processes">
                  <ToggleButton value="by_cpu">Busiest (CPU)</ToggleButton>
                  <ToggleButton value="by_memory">Biggest (memory)</ToggleButton>
                </ToggleButtonGroup>
                <Typography variant="caption" color="text.secondary">
                  {Object.entries(procs.by_status).map(([k, v]) => `${v} ${k}`).join(' · ')}
                </Typography>
              </Box>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" aria-label="top processes">
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell align="right">PID</TableCell>
                      <TableCell>User</TableCell>
                      <TableCell align="right">CPU</TableCell>
                      <TableCell align="right">Memory</TableCell>
                      <TableCell align="right">Threads</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {procs[procSort].map((p) => (
                      <TableRow key={p.pid} hover>
                        <TableCell sx={{ fontFamily: 'monospace' }}>{p.name}</TableCell>
                        <TableCell align="right">{p.pid}</TableCell>
                        <TableCell>{p.user}</TableCell>
                        <TableCell align="right">{p.cpu.toFixed(1)}%</TableCell>
                        <TableCell align="right">{fmtBytes(p.mem_bytes)} · {p.mem_percent.toFixed(1)}%</TableCell>
                        <TableCell align="right">{p.threads}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                CPU is measured like the `top` command: 100% means one full core, so a busy multi-threaded program can show more than 100% (this server has {procs.cores} cores).
                Command lines are hidden on purpose because they can contain passwords.
              </Typography>
            </>
          )}
        </Tile>
      )}
    </Box>
  );
};

export default System;
