import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, IconButton, MenuItem, Select, TextField, Tooltip, Typography } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import StopIcon from '@mui/icons-material/Stop';
import MicIcon from '@mui/icons-material/Mic';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import ReactMarkdown from 'react-markdown';
import { Tile } from '../components/dash/viz';

const API_URL = process.env.REACT_APP_BACKEND_URL || (window.location.protocol === 'https:' ? '' : `http://${window.location.hostname}:8000`);
const DEFAULT_MODEL = 'qwen3:8b';
const SYSTEM_PROMPT = {
  role: 'system',
  content: 'You are a helpful assistant running locally on a homelab server. Your replies may be read aloud, so answer in one to three short sentences unless asked for more detail, and avoid tables, lists and symbols. '
    + 'You have tools for live data: server stats, GPU, containers, Minecraft, the current time, and the local weather. '
    + 'Call only the tools the question needs, and only state what the tools told you. To check whether anything is down or stopped, use get_container_status.',
};
// What to show while the assistant is waiting on one of its lookup tools.
const TOOL_LABELS = {
  get_system_stats: 'checking server stats…',
  get_gpu_stats: 'checking the GPU…',
  get_container_status: 'checking containers…',
  get_minecraft_status: 'checking Minecraft…',
  get_current_time: 'checking the time…',
  get_weather: 'checking the weather…',
};
const SPEAK_KEY = 'homelab-chat-speak';
const MIC_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']; // first one this browser can record

// localStorage can be blocked, so every access is wrapped.
const readSpeak = () => {
  try { return window.localStorage.getItem(SPEAK_KEY) === 'yes'; } catch (e) { return false; }
};
const saveSpeak = (on) => {
  try { window.localStorage.setItem(SPEAK_KEY, on ? 'yes' : 'no'); } catch (e) { /* ignore */ }
};

// Markdown symbols read badly out loud ("asterisk asterisk bold").
const cleanForSpeech = (t) => t
  .replace(/```[\s\S]*?```/g, ' code block. ')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[*_`#>~]/g, '')
  .trim();

// Speech comes from the browser, so it plays on the device you are browsing from.
const speakText = (t) => {
  const s = cleanForSpeech(t);
  if (s && window.speechSynthesis) window.speechSynthesis.speak(new SpeechSynthesisUtterance(s));
};
const stopSpeaking = () => { if (window.speechSynthesis) window.speechSynthesis.cancel(); };

const Bubble = ({ role, content, pending }) => {
  const mine = role === 'user';
  return (
    <Box sx={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', mb: 1.25 }}>
      <Box
        sx={(t) => ({
          maxWidth: { xs: '92%', md: '75%' }, px: 1.75, py: 1, borderRadius: 2,
          bgcolor: mine ? 'primary.main' : 'action.hover',
          color: mine ? 'primary.contrastText' : 'text.primary',
          fontSize: 14.5, lineHeight: 1.55, wordBreak: 'break-word',
          '& p': { m: 0 }, '& p + p': { mt: 1 },
          '& pre': { m: '8px 0', p: 1, overflowX: 'auto', borderRadius: 1, bgcolor: 'rgba(0,0,0,0.35)', fontFamily: t.monoFont, fontSize: 13 },
          '& code': { fontFamily: t.monoFont, fontSize: 13 },
        })}
      >
        {mine ? (
          <span style={{ whiteSpace: 'pre-wrap' }}>{content}</span>
        ) : content ? (
          <ReactMarkdown>{content}</ReactMarkdown>
        ) : (
          pending && <Typography variant="body2" color="text.secondary">{pending}</Typography>
        )}
      </Box>
    </Box>
  );
};

const Chat = () => {
  const [messages, setMessages] = useState([]); // [{role, content}], system prompt is added on send
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [speak, setSpeak] = useState(readSpeak);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [activity, setActivity] = useState(null); // e.g. "checking the weather…" while a lookup runs
  const abortRef = useRef(null);
  const endRef = useRef(null);
  const recorderRef = useRef(null);
  const sendRef = useRef(null); // always the latest send(), so a recording that ends later doesn't use stale chat history

  useEffect(() => {
    fetch(`${API_URL}/api/v1/ollama/`)
      .then((r) => r.json())
      .then((d) => {
        const names = (d.models || []).map((m) => m.name);
        setModels(names);
        if (names.length && !names.includes(DEFAULT_MODEL)) setModel(names[0]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages]);
  useEffect(() => () => {
    abortRef.current?.abort();
    stopSpeaking();
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null;
      rec.stop();
      rec.stream.getTracks().forEach((t) => t.stop());
    }
  }, []);

  // Add a piece of streamed text to the assistant message currently being written (the last one).
  const appendToLast = useCallback((piece) => {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      next[next.length - 1] = { ...last, content: last.content + piece };
      return next;
    });
  }, []);

  // viaVoice: the message was spoken, so the reply is read aloud even if the speaker button is off.
  const send = async (override, viaVoice = false) => {
    const text = (typeof override === 'string' ? override : input).trim();
    if (!text || streaming) return;
    const history = [...messages, { role: 'user', content: text }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setError(null);
    setStreaming(true);
    stopSpeaking();

    const readAloud = speak || viaVoice;
    let speechBuf = '';
    // Speak whole sentences while the rest is still being written, so talking starts almost at once.
    const flushSpeech = (final) => {
      if (!readAloud) return;
      const cut = final
        ? speechBuf.length
        : Math.max(speechBuf.lastIndexOf('. '), speechBuf.lastIndexOf('! '), speechBuf.lastIndexOf('? '), speechBuf.lastIndexOf('\n')) + 1;
      if (cut > 0) {
        speakText(speechBuf.slice(0, cut));
        speechBuf = speechBuf.slice(cut);
      }
    };

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`${API_URL}/api/v1/ollama/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [SYSTEM_PROMPT, ...history] }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      // Ollama streams one JSON object per line; a network chunk can end mid-line, so keep the tail.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line);
          if (chunk.error) throw new Error(chunk.error);
          if (chunk.tool_call) setActivity(TOOL_LABELS[chunk.tool_call] || 'looking something up…');
          if (chunk.message?.content) {
            setActivity(null);
            appendToLast(chunk.message.content);
            speechBuf += chunk.message.content;
            flushSpeech(false);
          }
        }
      }
      flushSpeech(true);
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'request failed');
    } finally {
      setStreaming(false);
      setActivity(null);
      abortRef.current = null;
    }
  };
  sendRef.current = send;

  const transcribeAndSend = async (blob) => {
    if (blob.size < 1000) { setError('No audio was recorded. Check which microphone your system is using.'); return; }
    setTranscribing(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/voice/transcribe`, { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
      if (!body.text) setError("Didn't catch that. Try again a little closer to the microphone.");
      else sendRef.current(body.text, true);
    } catch (e) {
      setError(e.message || 'transcription failed');
    } finally {
      setTranscribing(false);
    }
  };

  const startRecording = async () => {
    setError(null);
    stopSpeaking();
    // Browsers only hand out the microphone to secure pages, which is why voice needs the https:// address.
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('The microphone needs a secure page. Open the dashboard at the https:// address.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MIC_TYPES.find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop()); // releases the mic, so the browser's recording light goes off
        setRecording(false);
        transcribeAndSend(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }));
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch (e) {
      setError(e.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Allow it from the icon in the address bar, then try again.'
        : `Could not start the microphone (${e.message}).`);
    }
  };
  const stopRecording = () => recorderRef.current?.stop();

  const toggleSpeak = () => {
    const next = !speak;
    setSpeak(next);
    saveSpeak(next);
    if (!next) stopSpeaking();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const clear = () => { abortRef.current?.abort(); stopSpeaking(); setMessages([]); setError(null); };

  const right = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Select size="small" value={models.includes(model) || !models.length ? model : ''} onChange={(e) => setModel(e.target.value)}
        sx={{ fontSize: 13, height: 30 }} inputProps={{ 'aria-label': 'Model' }}>
        {(models.length ? models : [model]).map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
      </Select>
      <Tooltip title={speak ? 'Reading replies aloud (click to turn off)' : 'Read replies aloud. Replies to voice messages are always read.'}>
        <IconButton size="small" onClick={toggleSpeak} color={speak ? 'primary' : 'default'} aria-label="Read replies aloud" aria-pressed={speak}>
          {speak ? <VolumeUpIcon fontSize="small" /> : <VolumeOffIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      <Tooltip title="New chat">
        <span><IconButton size="small" onClick={clear} disabled={!messages.length && !streaming} aria-label="New chat"><DeleteSweepIcon fontSize="small" /></IconButton></span>
      </Tooltip>
    </Box>
  );

  return (
    <Box sx={{ height: { xs: 'calc(100vh - 110px)', md: 'calc(100vh - 120px)' }, minHeight: 360 }}>
      <Tile title="AI · Chat" right={right}>
        <Box sx={{ display: 'flex', flexDirection: 'column', height: { xs: 'calc(100vh - 215px)', md: 'calc(100vh - 225px)' }, minHeight: 260 }}>
          <Box sx={{ flex: 1, overflowY: 'auto', pr: 0.5 }}>
            {!messages.length && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Chatting with {model} on your own GPU. Your messages and voice stay on this server; only the weather lookup
                contacts the internet (Open-Meteo, sent just the city's coordinates). Ask about the server, the GPU, containers,
                Minecraft, the time or the weather. Enter sends, Shift+Enter adds a new line. Click the microphone to talk,
                and click it again when you are done.
              </Typography>
            )}
            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} content={m.content} pending={streaming && i === messages.length - 1 ? (activity || 'thinking…') : null} />
            ))}
            {error && <Typography variant="body2" color="error" sx={{ my: 1 }}>{error}</Typography>}
            <div ref={endRef} />
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end', pt: 1.5 }}>
            <TextField
              fullWidth multiline maxRows={6} size="small"
              placeholder={recording ? 'Listening…' : transcribing ? 'Transcribing…' : 'Message qwen…'}
              value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown}
              inputProps={{ 'aria-label': 'Message' }}
            />
            {transcribing ? (
              <Box sx={{ p: 1, display: 'flex' }}><CircularProgress size={24} aria-label="Transcribing" /></Box>
            ) : recording ? (
              <Tooltip title="Stop and send">
                <IconButton color="error" onClick={stopRecording} aria-label="Stop recording"
                  sx={{ animation: 'micpulse 1.2s ease-in-out infinite', '@keyframes micpulse': { '50%': { opacity: 0.45 } } }}>
                  <StopCircleIcon />
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip title="Talk to qwen">
                <span><IconButton onClick={startRecording} disabled={streaming} aria-label="Start recording"><MicIcon /></IconButton></span>
              </Tooltip>
            )}
            {streaming ? (
              <Tooltip title="Stop">
                <IconButton color="error" onClick={() => { abortRef.current?.abort(); stopSpeaking(); }} aria-label="Stop"><StopIcon /></IconButton>
              </Tooltip>
            ) : (
              <Tooltip title="Send">
                <span><IconButton color="primary" onClick={() => send()} disabled={!input.trim() || recording || transcribing} aria-label="Send"><SendIcon /></IconButton></span>
              </Tooltip>
            )}
          </Box>
        </Box>
      </Tile>
    </Box>
  );
};

export default Chat;
