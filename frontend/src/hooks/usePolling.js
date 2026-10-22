import { useCallback, useEffect, useState } from 'react';

// Settings -> Appearance -> Refresh speed. 1 = as coded, 0.5 = twice as fast, 2 = half as often.
export const REFRESH_SPEED_KEY = 'refreshSpeed';
const refreshSpeed = () => {
  try {
    const n = Number(localStorage.getItem(REFRESH_SPEED_KEY));
    return n >= 0.25 && n <= 8 ? n : 1;
  } catch (e) { return 1; }
};

// Fetch a JSON endpoint now and then every `intervalMs`. Keeps the last good data if a refresh fails.
// `refresh()` fetches again right away (e.g. after the user clicks an action button).
export default function usePolling(url, intervalMs = 3000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!url) return undefined; // no URL = stay idle (used for tabs that are not open)
    let stopped = false;
    let timer;
    const controller = new AbortController();

    const tick = async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!stopped) { setData(json); setError(null); }
      } catch (e) {
        if (!stopped && e.name !== 'AbortError') setError(e.message || 'request failed');
      } finally {
        if (!stopped) timer = setTimeout(tick, intervalMs * refreshSpeed());
      }
    };
    tick();

    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [url, intervalMs, nonce]);

  return { data, error, refresh };
}
