import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  InputAdornment,
  Paper,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  ContentCopy as CopyIcon,
  Check as CheckIcon,
  Search as SearchIcon
} from '@mui/icons-material';

const API_URL = process.env.REACT_APP_BACKEND_URL || (window.location.protocol === 'https:' ? '' : `http://${window.location.hostname}:8000`);
const API = `${API_URL}/api/v1/cheatsheets`;

const formatDate = (epochSeconds) =>
  new Date(epochSeconds * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    // clipboard API needs https or localhost; fall back for plain http on the LAN
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    document.body.removeChild(area);
  }
};

const CodeBlock = ({ children }) => {
  const [copied, setCopied] = useState(false);
  const text = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    await copyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Box sx={{ position: 'relative', my: 2 }}>
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 2,
          pr: 6,
          bgcolor: 'background.default', border: 1, borderColor: 'divider',
          color: 'text.primary',
          borderRadius: 1,
          overflowX: 'auto',
          fontSize: 14,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
        }}
      >
        <code>{text}</code>
      </Box>
      <Tooltip title={copied ? 'Copied!' : 'Copy'}>
        <IconButton
          size="small"
          onClick={handleCopy}
          aria-label="Copy code"
          sx={{ position: 'absolute', top: 6, right: 6, color: 'text.secondary' }}
        >
          {copied ? <CheckIcon fontSize="small" /> : <CopyIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Box>
  );
};

const markdownComponents = {
  pre: ({ children }) => <>{children}</>,
  code: ({ inline, children }) =>
    inline ? (
      <Box
        component="code"
        sx={{ bgcolor: 'action.hover', px: 0.6, py: 0.2, borderRadius: 0.5, fontSize: '0.9em', fontFamily: 'ui-monospace, Menlo, Consolas, monospace' }}
      >
        {children}
      </Box>
    ) : (
      <CodeBlock>{children}</CodeBlock>
    ),
  table: ({ children }) => (
    <Box sx={{ overflowX: 'auto', my: 2 }}>
      <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%' }}>
        {children}
      </Box>
    </Box>
  ),
  th: ({ children }) => (
    <Box component="th" sx={{ textAlign: 'left', p: 1, borderBottom: 2, borderColor: 'divider' }}>
      {children}
    </Box>
  ),
  td: ({ children }) => (
    <Box component="td" sx={{ p: 1, borderBottom: 1, borderColor: 'divider', verticalAlign: 'top' }}>
      {children}
    </Box>
  ),
  h1: ({ children }) => <Typography variant="h4" gutterBottom sx={{ mt: 1 }}>{children}</Typography>,
  h2: ({ children }) => <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>{children}</Typography>,
  h3: ({ children }) => <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>{children}</Typography>,
  p: ({ children }) => <Typography paragraph>{children}</Typography>,
  hr: () => <Box component="hr" sx={{ my: 3, border: 0, borderTop: 1, borderColor: 'divider' }} />,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
  )
};

const SheetList = () => {
  const [sheets, setSheets] = useState([]);
  const [directory, setDirectory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch(API)
      .then((r) => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setSheets(data.sheets);
        setDirectory(data.directory);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const q = query.trim().toLowerCase();
  const shown = sheets.filter((s) =>
    !q || [s.title, s.service, s.summary, s.slug].some((v) => v.toLowerCase().includes(q))
  );

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Cheat Sheets</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        One page per service. Add a new one by dropping a .md file into <code>{directory || '~/homelab/cheatsheets'}</code>.
      </Typography>

      <TextField
        fullWidth
        size="small"
        placeholder="Search cheat sheets…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        sx={{ mb: 3, maxWidth: 480 }}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
      />

      {loading && <CircularProgress />}
      {error && <Alert severity="error">Could not load cheat sheets: {error}</Alert>}
      {!loading && !error && shown.length === 0 && (
        <Alert severity="info">{sheets.length ? 'No matches.' : 'No cheat sheets yet.'}</Alert>
      )}

      <Grid container spacing={2}>
        {shown.map((s) => (
          <Grid item xs={12} sm={6} md={4} key={s.slug}>
            <Card sx={{ height: '100%' }}>
              <CardActionArea component={RouterLink} to={`/cheatsheets/${s.slug}`} sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6">{s.title}</Typography>
                  {s.service && <Chip size="small" label={s.service} sx={{ my: 0.5 }} />}
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{s.summary}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    Updated {formatDate(s.updated)}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

const SheetView = ({ slug }) => {
  const [sheet, setSheet] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setSheet(null);
    setError(null);
    fetch(`${API}/${encodeURIComponent(slug)}`)
      .then((r) => {
        if (r.status === 404) throw new Error('That cheat sheet does not exist.');
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        return r.json();
      })
      .then(setSheet)
      .catch((e) => setError(e.message));
  }, [slug]);

  return (
    <Box>
      <Button component={RouterLink} to="/cheatsheets" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>
        All cheat sheets
      </Button>
      {error && <Alert severity="error">{error}</Alert>}
      {!sheet && !error && <CircularProgress />}
      {sheet && (
        <Paper sx={{ p: { xs: 2, sm: 4 }, maxWidth: 960 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {sheet.content}
          </ReactMarkdown>
          <Typography variant="caption" color="text.secondary">
            Last edited {formatDate(sheet.updated)} · edit the file <code>{slug}.md</code> to change this page
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

const CheatSheets = () => {
  const { slug } = useParams();
  return slug ? <SheetView slug={slug} /> : <SheetList />;
};

export default CheatSheets;
