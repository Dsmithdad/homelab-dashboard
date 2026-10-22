# Set this up with Claude

If you use [Claude Code](https://claude.com/claude-code), it can install the dashboard for you and explain each step.

1. On the server, install Claude Code and start it in your home folder: `claude`
2. Copy everything in the box below and paste it in as your first message.
3. Answer its questions. It asks before anything that needs `sudo` or changes a running service.

---

```text
Please help me install the Homelab Dashboard from https://github.com/Dsmithdad/homelab-dashboard on this Linux server.
I'm still learning, so explain each step in plain words, do one phase at a time, and check with me before moving on.

Ground rules:
- Ask me before running anything with sudo; show me the exact command and let me run it myself.
- Never print secrets (tokens, passwords) back to me, and never commit or upload my backend/.env.
- This dashboard has no login. Keep it on my LAN or Tailscale only and do not open router ports.

Phase 1 - Check the machine
- Detect: OS version, Python 3.10+, Node.js 18+, git, Docker (and whether my user can use it without sudo),
  NVIDIA GPU + driver, and whether these are running: Ollama, Scrutiny, Home Assistant, a Minecraft server, Tailscale.
- Show me a short table of what's present and what's missing. Install only the required pieces (Python, Node, git),
  and only after I say yes. Everything else is optional.

Phase 2 - Get the code
- Ask me where to install it (suggest /opt/homelab-dashboard or ~/homelab-dashboard) and clone the repo there.

Phase 3 - Backend
- Create backend/.venv and install backend/requirements.txt.
- Copy backend/.env.example to backend/.env. Go through it section by section. Fill in values from what you detected
  in Phase 1 (for example OLLAMA_URL, SCRUTINY_URL, Minecraft paths). Ask me for my town for WEATHER_* (look up its
  latitude, longitude and timezone yourself). Replace every YOUR_USER with my username. Leave settings for things I
  don't have at their defaults.
- If I want Home Assistant, tell me how to make a long-lived token and have me paste it into .env myself.
- Start the backend on port 8000 and check that http://127.0.0.1:8000/health answers.

Phase 4 - Frontend
- In frontend/: npm install, then CI=false npm run build, then serve the build on port 3001.
- Tell me the URL to open from another device on my network, and ask me to confirm the Overview page loads.

Phase 5 - Start at boot
- Edit the two files in deploy/ for my username and install path. Show me the sudo commands to install and enable
  them, then confirm both services are active.

Phase 6 - Optional extras (ask about each one)
- HTTPS with Tailscale Serve (needed for the microphone and browser alerts); see the README.
- Voice input: docker compose -f voice/docker-compose.yml up -d (needs an NVIDIA GPU).
- An Ollama model for AI Chat (suggest one that fits my GPU's VRAM).
- data/services.json overrides for any service tile that links to the wrong port.

Finish with a short cheat sheet: the URLs, how to restart each part, where the settings live, and how to update
(git pull, then rebuild the frontend and restart the backend).
```
