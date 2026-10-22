import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Box, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Tooltip, useMediaQuery, useTheme } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DashboardIcon from '@mui/icons-material/Dashboard';
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import DockerIcon from '@mui/icons-material/Inventory2';
import HomeIcon from '@mui/icons-material/Home';
import GamepadIcon from '@mui/icons-material/Gamepad';
import ServerIcon from '@mui/icons-material/Dns';
import FolderIcon from '@mui/icons-material/Folder';
import CodeIcon from '@mui/icons-material/Code';
import ArticleIcon from '@mui/icons-material/Article';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SettingsIcon from '@mui/icons-material/Settings';
import ChatIcon from '@mui/icons-material/ChatBubbleOutline';
import PublicIcon from '@mui/icons-material/Public';

const WIDTH = 240;
const COLLAPSED_WIDTH = 64; // icon-only rail
const COLLAPSED_KEY = 'homelab-sidebar-collapsed';
export const TOGGLE_SIDEBAR_EVENT = 'toggle-sidebar';

// localStorage can be blocked, so every access is wrapped.
const readCollapsed = () => {
  try { return window.localStorage.getItem(COLLAPSED_KEY) === 'yes'; } catch (e) { return false; }
};

// Each group is separated by a divider. Order here is the order on screen.
export const NAV_GROUPS = [
  [
    { to: '/', label: 'Overview', icon: DashboardIcon },
    { to: '/system', label: 'System', icon: MonitorHeartIcon },
    { to: '/containers', label: 'Containers', icon: DockerIcon },
    { to: '/home-assistant', label: 'Home Assistant', icon: HomeIcon },
    { to: '/minecraft', label: 'Minecraft', icon: GamepadIcon },
    { to: '/claude', label: 'Claude Code', icon: ServerIcon },
    { to: '/chat', label: 'AI Chat', icon: ChatIcon },
    // not a page of this app: it lives on its own port on this machine and opens in a new tab
    // httpsPort: tailscale serve port; the app needs a secure context (crypto.randomUUID) for camera video
    { external: { port: 4173, httpsPort: 4443 }, label: "God's Eye View", icon: PublicIcon },
  ],
  [
    { to: '/files', label: 'Files', icon: FolderIcon },
    { to: '/scripts', label: 'Scripts', icon: CodeIcon },
    { to: '/logs', label: 'Logs', icon: ArticleIcon },
    { to: '/cheatsheets', label: 'Cheat Sheets', icon: MenuBookIcon },
  ],
  [{ to: '/settings', label: 'Settings', icon: SettingsIcon }],
];

// Address of an item that lives on another port of this same machine (same host the page was opened on).
// On an https page, an item with an httpsPort is opened on that https port instead.
export const externalUrl = (external) =>
  window.location.protocol === 'https:' && external.httpsPort
    ? `https://${window.location.hostname}:${external.httpsPort}/`
    : `http://${window.location.hostname}:${external.port}/`;

const isActive = (pathname, to) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`));

const Sidebar = () => {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const rail = collapsed && !isMobile; // icon-only rail is a desktop feature
  const width = rail ? COLLAPSED_WIDTH : WIDTH;

  // On phones the sidebar is a slide-out drawer: close it after picking a page or when the screen grows.
  useEffect(() => { setMobileOpen(false); }, [pathname, isMobile]);

  const toggle = useCallback(() => {
    if (isMobile) { setMobileOpen((o) => !o); return; }
    setCollapsed((c) => {
      try { window.localStorage.setItem(COLLAPSED_KEY, c ? 'no' : 'yes'); } catch (e) { /* ignore */ }
      return !c;
    });
  }, [isMobile]);
  // The command palette toggles the sidebar by firing this event.
  useEffect(() => {
    window.addEventListener(TOGGLE_SIDEBAR_EVENT, toggle);
    return () => window.removeEventListener(TOGGLE_SIDEBAR_EVENT, toggle);
  }, [toggle]);

  return (
    <Drawer
      variant={isMobile ? 'temporary' : 'permanent'}
      open={isMobile ? mobileOpen : true}
      onClose={() => setMobileOpen(false)}
      ModalProps={{ keepMounted: true }}
      sx={{
        width, flexShrink: 0, transition: 'width 0.2s ease',
        '& .MuiDrawer-paper': { width, boxSizing: 'border-box', overflowX: 'hidden', transition: 'width 0.2s ease' },
      }}
    >
      <Toolbar /> {/* spacer so the list starts below the fixed top bar */}
      <Box sx={{ overflowY: 'auto', overflowX: 'hidden', py: 1, flexGrow: 1 }}>
        {NAV_GROUPS.map((group, g) => (
          <React.Fragment key={g}>
            {g > 0 && <Divider sx={{ my: 1 }} />}
            <List disablePadding sx={{ px: 1 }}>
              {group.map(({ to, external, label, icon: Icon }) => {
                const active = !external && isActive(pathname, to);
                const linkProps = external
                  ? { component: 'a', href: externalUrl(external), target: '_blank', rel: 'noopener noreferrer' }
                  : { component: Link, to };
                return (
                  <Tooltip key={to || label} title={rail ? label : ''} placement="right" arrow>
                  <ListItemButton
                    {...linkProps}
                    selected={active}
                    aria-label={rail ? label : undefined}
                    sx={{
                      borderRadius: 1.5,
                      mb: 0.25,
                      justifyContent: rail ? 'center' : 'flex-start',
                      px: rail ? 1 : 2,
                      borderLeft: 3,
                      borderColor: active ? 'primary.main' : 'transparent',
                      '&.Mui-selected': { bgcolor: 'action.selected' },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: rail ? 0 : 38, color: active ? 'primary.main' : 'text.secondary' }}>
                      <Icon fontSize="small" />
                    </ListItemIcon>
                    {!rail && (
                      <ListItemText
                        primary={label}
                        primaryTypographyProps={{
                          fontWeight: active ? 700 : 500, fontSize: theme.hud ? '0.75rem' : '0.9rem', noWrap: true,
                          fontFamily: theme.hud ? theme.hudFont : undefined, textTransform: theme.hud ? 'uppercase' : undefined,
                        }}
                      />
                    )}
                  </ListItemButton>
                  </Tooltip>
                );
              })}
            </List>
          </React.Fragment>
        ))}
      </Box>
      {!isMobile && <Divider />}
      {!isMobile && (
      <Box sx={{ display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end', p: 1 }}>
        <Tooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
          <IconButton size="small" onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}>
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        </Tooltip>
      </Box>
      )}
    </Drawer>
  );
};

export default Sidebar;
