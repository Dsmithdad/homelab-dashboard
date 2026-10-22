import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { CssBaseline } from '@mui/material';
import { AppThemeProvider } from './contexts/ThemeModeContext';
import Navbar from './components/Navbar';
import CommandPalette from './components/CommandPalette';
import HoverJabs from './components/HoverJabs';
import AlertWatcher from './components/AlertWatcher';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import System from './pages/System';
import Containers from './pages/Containers';
import HomeAssistant from './pages/HomeAssistant';
import Minecraft from './pages/Minecraft';
import ClaudeCode from './pages/ClaudeCode';
import Chat from './pages/Chat';
import Files from './pages/Files';
import Scripts from './pages/Scripts';
import Logs from './pages/Logs';
import CheatSheets from './pages/CheatSheets';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';

function App() {
  return (
    <AppThemeProvider>
      <CssBaseline />
      <Router>
        <CommandPalette />
        <HoverJabs />
        <AlertWatcher />
        <div className="app">
          <Navbar />
          <div className="app-content">
            <Sidebar />
            <main className="app-main">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/system" element={<System />} />
                <Route path="/containers" element={<Containers />} />
                <Route path="/home-assistant" element={<HomeAssistant />} />
                <Route path="/minecraft" element={<Minecraft />} />
                <Route path="/claude" element={<ClaudeCode />} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/files" element={<Files />} />
                <Route path="/scripts" element={<Scripts />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/cheatsheets" element={<CheatSheets />} />
                <Route path="/cheatsheets/:slug" element={<CheatSheets />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
          </div>
        </div>
      </Router>
    </AppThemeProvider>
  );
}

export default App;
