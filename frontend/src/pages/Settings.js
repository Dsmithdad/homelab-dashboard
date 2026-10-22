import React, { useState } from 'react';
import { Box, Tab, Tabs, Typography } from '@mui/material';
import SettingsGeneral from './SettingsGeneral';
import SettingsAppearance from './SettingsAppearance';
import SettingsAlerts from './SettingsAlerts';
import SettingsAccess from './SettingsAccess';

const TABS = [
  { label: 'General', Panel: SettingsGeneral },
  { label: 'Appearance', Panel: SettingsAppearance },
  { label: 'Alerts', Panel: SettingsAlerts },
  { label: 'Access & About', Panel: SettingsAccess },
];
const TAB_KEY = 'settingsTab';

const Settings = () => {
  const [tab, setTab] = useState(() => {
    try { const n = Number(sessionStorage.getItem(TAB_KEY)); return n >= 0 && n < TABS.length ? n : 0; } catch (e) { return 0; }
  });
  const onTab = (e, n) => {
    setTab(n);
    try { sessionStorage.setItem(TAB_KEY, String(n)); } catch (err) { /* ignore */ }
  };
  const { Panel } = TABS[tab];

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>Settings</Typography>
      <Tabs value={tab} onChange={onTab} variant="scrollable" allowScrollButtonsMobile sx={{ mt: 2 }}>
        {TABS.map((t) => <Tab key={t.label} label={t.label} />)}
      </Tabs>
      <Box sx={{ pt: 3 }}>
        <Panel />
      </Box>
    </Box>
  );
};

export default Settings;
