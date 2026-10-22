import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Container,
  Typography
} from '@mui/material';

const API_URL = process.env.REACT_APP_BACKEND_URL || (window.location.protocol === 'https:' ? '' : `http://${window.location.hostname}:8000`);

const Row = ({ label, value }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
    <Typography color="text.secondary">{label}</Typography>
    <Typography>{value || '-'}</Typography>
  </Box>
);

const ago = (iso) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const ClaudeCode = () => {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [jabs, setJabs] = useState(null);
  const [jabError, setJabError] = useState(null);

  useEffect(() => {
    axios
      .get(`${API_URL}/api/v1/claude/status`)
      .then((res) => setStatus(res.data))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    const load = () => axios
      .get(`${API_URL}/api/v1/claude/jabs?limit=5`)
      .then((res) => { setJabs(res.data.jabs); setJabError(null); })
      .catch((err) => setJabError(err.message));
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Container maxWidth="md">
      <Typography variant="h4" gutterBottom>Claude Code</Typography>

      <Card sx={{ mb: 3 }}>
        <CardHeader
          title="Status"
          action={
            status && (
              <Chip
                label={!status.installed ? 'Not installed' : status.logged_in ? 'Logged in' : 'Logged out'}
                color={status.installed && status.logged_in ? 'success' : 'warning'}
              />
            )
          }
        />
        <CardContent>
          {error && <Typography color="error">Could not reach backend: {error}</Typography>}
          {!status && !error && <CircularProgress />}
          {status && (
            <>
              <Row label="Version" value={status.version} />
              <Row label="Path" value={status.path} />
              <Row label="Account" value={status.email} />
              <Row label="Organization" value={status.org_name} />
              <Row label="Plan" value={status.subscription} />
              <Row label="Login method" value={status.auth_method} />
              {status.error && <Typography color="error" sx={{ mt: 1 }}>{status.error}</Typography>}
            </>
          )}
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardHeader title="Recent jabs" subheader="The latest trash talk between you and Skeeter, picked out of our chats by keyword. Not perfect, just for fun." />
        <CardContent>
          {jabError && !jabs && <Typography color="text.secondary">Can't load jabs ({jabError}). If the backend was just updated, restart it.</Typography>}
          {!jabs && !jabError && <CircularProgress size={24} />}
          {jabs && jabs.length === 0 && <Typography color="text.secondary">No jabs found yet. Give it time. 😏</Typography>}
          {jabs && jabs.map((j, i) => (
            <Box key={i} sx={{ display: 'flex', justifyContent: j.who === 'you' ? 'flex-end' : 'flex-start', mb: 1.25 }}>
              <Box
                sx={{
                  maxWidth: '85%',
                  px: 1.5,
                  py: 1,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: j.who === 'you' ? 'primary.main' : 'secondary.main',
                  bgcolor: 'action.hover'
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {j.who === 'you' ? 'You' : 'Skeeter'} · {ago(j.timestamp)}
                </Typography>
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{j.text}</Typography>
              </Box>
            </Box>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Use it" />
        <CardContent>
          <Typography gutterBottom>
            Claude Code is a terminal app. SSH to the server and run <code>claude</code>
            {status && !status.logged_in && <>, then <code>/login</code> to sign in</>}.
          </Typography>
          <Button href="https://claude.ai/code" target="_blank" rel="noopener noreferrer" sx={{ mr: 1 }}>
            claude.ai/code
          </Button>
          <Button href="https://claude.ai" target="_blank" rel="noopener noreferrer">
            claude.ai
          </Button>
        </CardContent>
      </Card>
    </Container>
  );
};

export default ClaudeCode;
