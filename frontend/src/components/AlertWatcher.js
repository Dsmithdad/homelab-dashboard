import { useEffect } from 'react';

// Browser alerts for CPU / memory / disk. Off until switched on in Settings -> Alerts.
// Works only while a dashboard tab is open, and the browser only allows notifications on https or localhost.

export const ALERT_KEY = 'alertSettings';
export const ALERT_EVENT = 'alert-settings-changed';
export const ALERT_DEFAULTS = { enabled: false, cpu: 90, memory: 85, disk: 90, fires: true, fireKm: 75 };

export const loadAlertSettings = () => {
  try { return { ...ALERT_DEFAULTS, ...JSON.parse(localStorage.getItem(ALERT_KEY) || '{}') }; } catch (e) { return { ...ALERT_DEFAULTS }; }
};
export const saveAlertSettings = (s) => {
  try { localStorage.setItem(ALERT_KEY, JSON.stringify(s)); } catch (e) { /* storage blocked: applies until reload */ }
  window.dispatchEvent(new Event(ALERT_EVENT));
};

const API_URL = process.env.REACT_APP_BACKEND_URL || (window.location.protocol === 'https:' ? '' : `http://${window.location.hostname}:8000`);
const CHECK_MS = 30000;
const NEEDS_IN_A_ROW = 2;  // one spike is not an alert: it has to stay high for two checks (~1 minute)
const CLEAR_MARGIN = 5;    // must drop this far below the limit before it can alert again
const FIRE_CHECK_MS = 5 * 60 * 1000;  // God's Eye View data only changes every ~10-30 minutes
const FIRE_SEEN_KEY = 'gevFiresSeen';  // fires already announced, so a page reload doesn't repeat them
const FIRE_SEEN_MAX = 50;

const loadSeen = () => {
  try { const v = JSON.parse(localStorage.getItem(FIRE_SEEN_KEY)); return Array.isArray(v) ? v : []; } catch (e) { return []; }
};
const saveSeen = (list) => {
  try { localStorage.setItem(FIRE_SEEN_KEY, JSON.stringify(list.slice(-FIRE_SEEN_MAX))); } catch (e) { /* storage blocked: may repeat after a reload */ }
};

export const canNotify = () => typeof Notification !== 'undefined' && window.isSecureContext;

export default function AlertWatcher() {
  useEffect(() => {
    const streak = {};   // metric -> consecutive checks over the limit
    const alerted = {};  // metric -> already notified, waiting to drop back down
    let stopped = false;
    let timer;

    const check = async () => {
      const s = loadAlertSettings();
      if (s.enabled && canNotify() && Notification.permission === 'granted') {
        try {
          const res = await fetch(`${API_URL}/api/v1/overview`);
          const ov = await res.json();
          const worstDisk = (ov.disks || []).reduce((a, d) => (d.percent > (a?.percent ?? -1) ? d : a), null);
          const readings = [
            ['cpu', 'CPU', ov.cpu?.percent, s.cpu, ''],
            ['memory', 'Memory', ov.memory?.percent, s.memory, ''],
            ['disk', 'Disk', worstDisk?.percent, s.disk, worstDisk ? ` (${worstDisk.mount})` : ''],
          ];
          readings.forEach(([key, label, pct, limit, extra]) => {
            if (pct == null) return;
            if (pct >= limit) {
              streak[key] = (streak[key] || 0) + 1;
              if (streak[key] >= NEEDS_IN_A_ROW && !alerted[key]) {
                alerted[key] = true;
                new Notification(`${label} is high on ${ov.hostname}`, { body: `${label}${extra} is at ${pct.toFixed(0)}% (limit ${limit}%).`, tag: `homelab-${key}` });
              }
            } else {
              streak[key] = 0;
              if (pct < limit - CLEAR_MARGIN) alerted[key] = false;
            }
          });
        } catch (e) { /* backend unreachable: try again next time */ }
      }
      if (!stopped) timer = setTimeout(check, CHECK_MS);
    };
    timer = setTimeout(check, 5000);
    return () => { stopped = true; clearTimeout(timer); };
  }, []);

  // Wildfires: tell me when a significant satellite fire (see the backend's strong_nearest) is within the chosen distance of home.
  useEffect(() => {
    let stopped = false;
    let timer;

    const check = async () => {
      const s = loadAlertSettings();
      if (s.enabled && s.fires && canNotify() && Notification.permission === 'granted') {
        try {
          const res = await fetch(`${API_URL}/api/v1/godseye/`);
          const f = (await res.json())?.fires?.strong_nearest;
          if (f && f.km <= s.fireKm) {
            // the same fire shows up in every check until it burns out, so remember which ones were announced
            const id = `${f.lat},${f.lon},${f.date}`;
            const seen = loadSeen();
            if (!seen.includes(id)) {
              saveSeen([...seen, id]);
              new Notification('Wildfire near home', {
                body: `A ${Math.round(f.frp_mw)} MW fire was detected ${f.km} km ${f.dir} of you (${f.date}).`,
                tag: 'homelab-fire',
              });
            }
          }
        } catch (e) { /* backend or God's Eye View unreachable: try again next time */ }
      }
      if (!stopped) timer = setTimeout(check, FIRE_CHECK_MS);
    };
    timer = setTimeout(check, 15000);
    return () => { stopped = true; clearTimeout(timer); };
  }, []);
  return null;
}
