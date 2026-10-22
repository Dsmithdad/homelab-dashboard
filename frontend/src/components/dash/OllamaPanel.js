import React from 'react';
import { Box, Typography } from '@mui/material';
import { Tile, RingGauge, Sparkline, Pill, fmtBytes, levelTone, tempTone } from './viz';

// "unloads in 4m" / "stays loaded" from Ollama's expires_at timestamp.
const unloadText = (expiresAt) => {
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return '';
  const mins = Math.round((t - Date.now()) / 60000);
  if (mins > 24 * 60) return 'stays loaded';
  return mins <= 0 ? 'unloading…' : `unloads in ${mins}m`;
};

const Section = ({ title, children }) => (
  <Box sx={{ mt: 1.5 }}>
    <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</Typography>
    <Box sx={{ mt: 0.5 }}>{children}</Box>
  </Box>
);

// data = /api/v1/ollama, vramHistory = recent VRAM percentages for the sparkline.
const OllamaPanel = ({ data, error, vramHistory }) => {
  const gpu = data?.gpu;
  const vramPct = gpu?.mem_total_mb ? (gpu.mem_used_mb / gpu.mem_total_mb) * 100 : null;
  const tone = levelTone(vramPct);
  const right = (
    <Typography variant="caption" color="text.secondary" noWrap>
      {data?.available ? `ollama ${data.version}` : data ? 'ollama offline' : ''}
    </Typography>
  );

  return (
    <Tile title="AI · Ollama" tone={tone} right={right}>
      {!data && (
        <Typography variant="body2" color="text.secondary">
          {error ? `Can't load AI stats (${error}). If the backend was just updated, run: sudo systemctl restart homelab-dashboard-backend` : '–'}
        </Typography>
      )}

      {data && (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2.5, flexWrap: 'wrap' }}>
            <RingGauge value={vramPct} sub="VRAM" tone={tone} />
            {gpu?.temp_c != null && <RingGauge value={gpu.temp_c} label="°C" sub="temp" tone={tempTone(gpu.temp_c)} />}
            <Box sx={{ flex: 1, minWidth: 180 }}>
              <Typography sx={(t) => ({ fontFamily: t.monoFont, fontSize: 13 })}>
                {gpu ? `${(gpu.mem_used_mb / 1024).toFixed(1)} / ${(gpu.mem_total_mb / 1024).toFixed(1)} GB` : 'no GPU stats'}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, my: 0.75 }}>
                {gpu?.percent != null && <Pill label="gpu" value={`${Math.round(gpu.percent)}%`} tone={levelTone(gpu.percent)} />}
                {gpu?.power_w != null && <Pill label="power" value={`${Math.round(gpu.power_w)} W`} tone="secondary" />}
              </Box>
              <Sparkline values={vramHistory} max={100} tone={tone} height={36} />
            </Box>
          </Box>

          {data.available ? (
            <>
              <Section title="Loaded in VRAM">
                {data.loaded.length === 0 && (
                  <Typography variant="body2" color="text.secondary">Nothing loaded. The GPU is idle until a model is used.</Typography>
                )}
                {data.loaded.map((m) => (
                  <Box key={m.name} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.4, flexWrap: 'wrap' }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: m.gpu_percent === 100 ? 'success.main' : 'warning.main' }} />
                    <Typography variant="body2" sx={(t) => ({ fontFamily: t.monoFont, fontWeight: 700 })}>{m.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {m.gpu_percent === 100 ? '100% on GPU' : `${m.gpu_percent}% GPU, rest on CPU (slow)`} · {fmtBytes(m.size)}
                      {unloadText(m.expires_at) ? ` · ${unloadText(m.expires_at)}` : ''}
                    </Typography>
                  </Box>
                ))}
              </Section>

              <Section title={`Installed (${data.models.length})`}>
                {data.models.length === 0 && (
                  <Typography variant="body2" color="text.secondary">No models yet. Pull one with: docker exec big-bear-ollama-nvidia ollama pull qwen3:8b</Typography>
                )}
                {data.models.map((m) => (
                  <Box key={m.name} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, py: 0.3 }}>
                    <Typography variant="body2" sx={(t) => ({ fontFamily: t.monoFont })} noWrap>{m.name}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {[m.params, m.quant, fmtBytes(m.size)].filter(Boolean).join(' · ')}
                    </Typography>
                  </Box>
                ))}
              </Section>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
              Ollama isn't answering on port 11434. Check the big-bear-ollama-nvidia container.
            </Typography>
          )}
        </>
      )}
    </Tile>
  );
};

export default OllamaPanel;
