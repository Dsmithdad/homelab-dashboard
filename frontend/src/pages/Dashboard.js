import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, Grid, Alert, Button } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import EditIcon from '@mui/icons-material/Edit';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import usePolling from '../hooks/usePolling';
import { Tile, RingGauge, GaugeRow, BarMeter, Sparkline, Pill, fmtBytes, fmtRate, fmtUptime, levelTone, tempTone } from '../components/dash/viz';
import ServiceGrid from '../components/dash/ServiceGrid';
import OllamaPanel from '../components/dash/OllamaPanel';
import MinecraftPanel from '../components/dash/MinecraftPanel';
import GodsEyePanel from '../components/dash/GodsEyePanel';
import DrivesPanel from '../components/dash/DrivesPanel';
import BackupPanel from '../components/dash/BackupPanel';
import SortableTile from '../components/dash/SortableTile';
import FansPanel from '../components/dash/FansPanel';

const API_URL = process.env.REACT_APP_BACKEND_URL || (window.location.protocol === 'https:' ? '' : `http://${window.location.hostname}:8000`);
const HISTORY = 40;

// Tile order on the page. New tiles added here later are appended to a saved layout automatically.
const DEFAULT_ORDER = ['cpu', 'memory', 'gpu', 'network', 'fans', 'ai', 'storage', 'drives', 'backup', 'tailscale', 'minecraft', 'godseye', 'services'];
const ORDER_KEY = 'homelab-overview-order';

// localStorage can be blocked, so every access is wrapped.
const readOrder = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(ORDER_KEY));
    if (Array.isArray(saved)) {
      const known = [...new Set(saved.filter((id) => DEFAULT_ORDER.includes(id)))];
      return [...known, ...DEFAULT_ORDER.filter((id) => !known.includes(id))];
    }
  } catch (e) { /* fall through to the default */ }
  return DEFAULT_ORDER;
};
const saveOrder = (order) => {
  try { window.localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch (e) { /* ignore */ }
};

const greeting = (d) => {
  const h = d.getHours();
  return h < 5 ? 'Burning the midnight oil' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

// Keep a rolling window of recent values for the sparklines.
const useHistory = (value) => {
  const ref = useRef([]);
  const lastSeen = useRef(null);
  // only append when a new sample arrives, not on every 1s clock re-render
  if (value != null && lastSeen.current !== value) {
    lastSeen.current = value;
    ref.current = [...ref.current, value].slice(-HISTORY);
  }
  return ref.current;
};

const Dashboard = () => {
  const { data: ov, error: ovError } = usePolling(`${API_URL}/api/v1/overview`, 3000);
  const { data: svc, error: svcError } = usePolling(`${API_URL}/api/v1/services`, 10000);
  const { data: ai, error: aiError } = usePolling(`${API_URL}/api/v1/ollama/`, 3000);
  const { data: mc, error: mcError } = usePolling(`${API_URL}/api/v1/minecraft/`, 5000);
  const { data: gev, error: gevError } = usePolling(`${API_URL}/api/v1/godseye/`, 60000);
  const { data: drv, error: drvError } = usePolling(`${API_URL}/api/v1/drives/`, 60000);
  const { data: bkp, error: bkpError } = usePolling(`${API_URL}/api/v1/backup/`, 60000);
  const [now, setNow] = useState(new Date());
  const [order, setOrder] = useState(readOrder);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const next = arrayMove(order, order.indexOf(active.id), order.indexOf(over.id));
    setOrder(next);
    saveOrder(next);
  };
  const resetOrder = () => {
    setOrder(DEFAULT_ORDER);
    saveOrder(DEFAULT_ORDER);
  };

  const cpuHist = useHistory(ov?.cpu?.percent);
  const vramHist = useHistory(ai?.gpu?.mem_total_mb ? (ai.gpu.mem_used_mb / ai.gpu.mem_total_mb) * 100 : null);
  const netHist = useHistory(ov ? ov.network.rx_bps + ov.network.tx_bps : null);

  const ts = ov?.tailscale;
  const problems = ov?.containers?.problems || [];

  // Totals across every drive in the Storage tile. Percent is used / (used + free), the same way `df` and each disk's own bar count it.
  const disks = ov?.disks || [];
  const totalUsed = disks.reduce((sum, d) => sum + d.used, 0);
  const totalFree = disks.reduce((sum, d) => sum + (d.free ?? d.total - d.used), 0);
  const totalSize = disks.reduce((sum, d) => sum + d.total, 0);
  const totalPct = totalUsed + totalFree > 0 ? (totalUsed / (totalUsed + totalFree)) * 100 : 0;

  // Every tile: its drag-handle label, its grid size, and its content. Rendered in `order`.
  const tiles = {
    cpu: {
      label: 'CPU', grid: { xs: 12, sm: 6, lg: 3 },
      node: (
        <Tile title="CPU" tone={levelTone(ov?.cpu?.percent)} right={<Typography variant="caption" color="text.secondary">{ov?.cpu?.cores} cores</Typography>}>
          <GaugeRow>
            <RingGauge value={ov?.cpu?.percent} size={92} sub="load" />
            <RingGauge value={ov?.cpu?.temp_c} size={92} label="°C" sub="temp" tone={tempTone(ov?.cpu?.temp_c)} />
          </GaugeRow>
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">load avg {ov?.load?.map((l) => l.toFixed(1)).join(' ') || '–'}</Typography>
            <Sparkline values={cpuHist} max={100} tone={levelTone(ov?.cpu?.percent)} height={36} />
          </Box>
        </Tile>
      ),
    },
    memory: {
      label: 'Memory', grid: { xs: 12, sm: 6, lg: 3 },
      node: (
        <Tile title="Memory" tone={levelTone(ov?.memory?.percent)} right={<Typography variant="caption" color="text.secondary">swap {ov ? Math.round(ov.memory.swap_percent) : '–'}%</Typography>}>
          <GaugeRow sx={{ justifyContent: 'flex-start', gap: 2 }}>
            <RingGauge value={ov?.memory?.percent} />
            <Typography variant="body2" color="text.secondary" sx={(t) => ({ fontFamily: t.monoFont })}>
              {ov ? `${fmtBytes(ov.memory.used)} / ${fmtBytes(ov.memory.total)}` : '–'}
            </Typography>
          </GaugeRow>
        </Tile>
      ),
    },
    gpu: {
      label: 'GPU', grid: { xs: 12, sm: 6, lg: 3 },
      node: (
        <Tile title="GPU" tone={levelTone(ov?.gpu?.percent)} right={<Typography variant="caption" color="text.secondary" noWrap>{ov?.gpu?.name || 'none detected'}</Typography>}>
          {ov?.gpu ? (
            <>
              <GaugeRow>
                <RingGauge value={ov.gpu.percent} size={92} sub="load" />
                <RingGauge value={ov.gpu.temp_c} size={92} label="°C" sub="temp" tone={tempTone(ov.gpu.temp_c)} />
              </GaugeRow>
              <Typography variant="caption" color="text.secondary" sx={(t) => ({ fontFamily: t.monoFont, display: 'block', mt: 1 })}>
                {ov.gpu.mem_used_mb != null ? `${Math.round(ov.gpu.mem_used_mb)}/${Math.round(ov.gpu.mem_total_mb)} MB` : ''}
                {ov.gpu.power_w != null ? ` · ${Math.round(ov.gpu.power_w)} W` : ''}
              </Typography>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">No GPU stats available.</Typography>
          )}
        </Tile>
      ),
    },
    network: {
      label: 'Network', grid: { xs: 12, sm: 6, lg: 3 },
      node: (
        <Tile title="Network" tone="secondary">
          <Typography sx={(t) => ({ fontFamily: t.monoFont })} variant="body2">↓ {ov ? fmtRate(ov.network.rx_bps) : '–'}</Typography>
          <Typography sx={(t) => ({ fontFamily: t.monoFont })} variant="body2">↑ {ov ? fmtRate(ov.network.tx_bps) : '–'}</Typography>
          <Box sx={{ mt: 1 }}><Sparkline values={netHist} tone="secondary" height={48} /></Box>
        </Tile>
      ),
    },
    fans: {
      label: 'Fans', grid: { xs: 12, lg: 6 },
      node: <FansPanel fans={ov?.fans} gpu={ov?.gpu} cpuTemp={ov?.cpu?.temp_c} />,
    },
    ai: {
      label: 'AI · Ollama', grid: { xs: 12, md: 6 },
      node: <OllamaPanel data={ai} error={aiError} vramHistory={vramHist} />,
    },
    storage: {
      label: 'Storage', grid: { xs: 12, md: 6, lg: 3 },
      node: (
        <Tile title="Storage" tone="info" right={<Typography variant="caption" color="text.secondary">{disks.length ? `${fmtBytes(totalSize)} total` : ''}</Typography>}>
          {disks.length > 0 && (
            <Box sx={(t) => ({ mb: 1.5, pb: 1.5, borderBottom: `1px solid ${t.palette.divider}` })} title={`${fmtBytes(totalUsed)} used of ${fmtBytes(totalSize)} across ${disks.length} drives`}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.25 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>All drives ({disks.length})</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1, flexShrink: 0 }}>{Math.round(totalPct)}% used</Typography>
              </Box>
              <BarMeter pct={totalPct} text={`${fmtBytes(totalUsed)} used · ${fmtBytes(totalFree)} free`} tone={levelTone(totalPct)} />
            </Box>
          )}
          {disks.map((d) => (
            <Box key={d.mount} sx={{ mb: 1.25 }} title={`${fmtBytes(d.used)} used of ${fmtBytes(d.total)}`}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.25 }}>
                <Typography variant="body2" noWrap sx={(t) => ({ fontFamily: t.monoFont })}>{d.mount}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1, flexShrink: 0 }}>{Math.round(d.percent)}% used</Typography>
              </Box>
              {/* free = what `df` calls Avail; the bar fills as the disk fills. Falls back to total-used until the backend sends `free`. */}
              <BarMeter pct={d.percent} text={`${fmtBytes(d.free ?? d.total - d.used)} free`} tone={levelTone(d.percent)} />
            </Box>
          ))}
          {!ov && <Typography variant="body2" color="text.secondary">–</Typography>}
        </Tile>
      ),
    },
    tailscale: {
      label: 'Tailscale', grid: { xs: 12, md: 6, lg: 3 },
      node: (
        <Tile title="Tailscale" tone="secondary" right={<Typography variant="caption" color="text.secondary">{ts?.available ? `${ts.online}/${ts.total} online` : ''}</Typography>}>
          {ts && !ts.available && <Typography variant="body2" color="text.secondary">Tailscale status unavailable.</Typography>}
          {(ts?.peers || []).map((p) => (
            <Box key={p.name} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.4 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: p.online ? 'success.main' : 'text.disabled' }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap>{p.name}</Typography>
                <Typography variant="caption" color="text.secondary" sx={(t) => ({ fontFamily: t.monoFont, display: 'block' })} noWrap>{p.os} · {p.ip}</Typography>
              </Box>
            </Box>
          ))}
        </Tile>
      ),
    },
    minecraft: {
      label: 'Minecraft', grid: { xs: 12, md: 6 },
      node: <MinecraftPanel data={mc} error={mcError} />,
    },
    drives: {
      label: 'Drive health', grid: { xs: 12, md: 6 },
      node: <DrivesPanel data={drv} error={drvError} />,
    },
    backup: {
      label: 'Immich backup', grid: { xs: 12, md: 6 },
      node: <BackupPanel data={bkp} error={bkpError} />,
    },
    godseye: {
      label: "God's Eye View", grid: { xs: 12, md: 6 },
      node: <GodsEyePanel data={gev} error={gevError} />,
    },
    services: {
      label: 'Services', grid: { xs: 12 },
      node: (
        <Tile title="Services" tone="primary" sx={{ pb: 3 }}>
          <ServiceGrid data={svc} error={svcError} />
        </Tile>
      ),
    },
  };

  return (
    <Box>
      {/* header */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, mb: 3 }}>
        <Box>
          <Typography variant="h3" sx={(t) => ({ fontFamily: t.monoFont, fontWeight: 700, lineHeight: 1 })}>
            {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Typography>
          <Typography color="text.secondary" sx={(t) => ({ mt: 0.5, fontFamily: t.hud ? t.hudFont : undefined, textTransform: t.hud ? 'uppercase' : undefined })}>
            {greeting(now)} · {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          <Pill label="host" value={ov?.hostname || '–'} tone="primary" />
          <Pill label="up" value={fmtUptime(ov?.uptime_s)} tone="info" />
          <Pill label="containers" value={ov ? `${ov.containers.running}/${ov.containers.total}` : '–'} tone={problems.length ? 'warning' : 'success'} />
          <Pill label="tailnet" value={ts?.available ? `${ts.online}/${ts.total}` : 'n/a'} tone={ts?.available ? 'secondary' : 'warning'} />
          <Button
            size="small"
            variant={editing ? 'contained' : 'outlined'}
            startIcon={editing ? <CheckIcon /> : <EditIcon />}
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? 'Done' : 'Edit layout'}
          </Button>
          {editing && (
            <Button size="small" color="inherit" onClick={resetOrder} disabled={order.every((id, i) => id === DEFAULT_ORDER[i])}>
              Reset
            </Button>
          )}
        </Box>
      </Box>

      {editing && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Drag a tile by its handle bar to move it. Your layout is saved in this browser. Tap Done when you're finished.
        </Alert>
      )}
      {ovError && !ov && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Can't load live stats ({ovError}). If the backend was just updated, run: sudo systemctl restart homelab-dashboard-backend
        </Alert>
      )}
      {problems.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>Needs attention: {problems.map((p) => (typeof p === 'string' ? p : `${p.name} (${p.health || p.status})`)).join(', ')}</Alert>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <Grid container spacing={2}>
            {order.map((id) => (
              <SortableTile key={id} id={id} label={tiles[id].label} grid={tiles[id].grid} editing={editing}>
                {tiles[id].node}
              </SortableTile>
            ))}
          </Grid>
        </SortableContext>
      </DndContext>
    </Box>
  );
};

export default Dashboard;
