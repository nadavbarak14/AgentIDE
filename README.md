# Adyx

Multi-session Claude Code command center. Run multiple Claude AI sessions side-by-side in a browser-based IDE with file trees, git diffs, live previews, and terminal access.

## Quick Start

```bash
npm install -g adyx
adyx start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Remote Server Setup

Install and run on any remote machine, then access from your local browser:

```bash
# SSH into your server
ssh user@your-server

# Install Node.js 20+ (if not already installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install build tools for native modules
sudo apt-get install -y build-essential python3

# Install Adyx
npm install -g adyx

# Start with remote access enabled
adyx start --host 0.0.0.0 --port 8080
```

Open `http://your-server-ip:8080` from your local browser.

## Usage Examples

**Start on a custom port:**

```bash
adyx start --port 4000
```

**Start with remote access on default port:**

```bash
adyx start --host 0.0.0.0
```

**Create a session via API:**

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"workingDirectory": "/path/to/project", "title": "My Session"}'
```

**Run in the background:**

```bash
nohup adyx start --host 0.0.0.0 --port 8080 > adyx.log 2>&1 &
```

## Configuration

| Flag | Env Var | Default | Description |
|------|---------|---------|-------------|
| `--port`, `-p` | `PORT` | `3000` | Port to listen on |
| `--host`, `-H` | `HOST` | `127.0.0.1` | Host to bind to (use `0.0.0.0` for remote access) |

## Prerequisites

- **Node.js 20+** ([download](https://nodejs.org/))
- **Build tools** for native modules (better-sqlite3, node-pty):

| Platform | Install command |
|----------|----------------|
| Ubuntu/Debian | `sudo apt-get install -y build-essential python3` |
| macOS | `xcode-select --install` |
| Windows | Use [WSL2](docs/wsl2-setup.md) — see below |

### Windows (WSL2)

Adyx supports Windows via WSL2:

```bash
sudo apt-get update && sudo apt-get install -y build-essential python3 curl lsof git
```

See [docs/wsl2-setup.md](docs/wsl2-setup.md) for the full setup guide.

## Features

- **Multi-session management** — Run multiple Claude Code sessions simultaneously
- **Browser-based IDE** — File explorer, Monaco editor, git diff viewer
- **Live terminal** — Full xterm.js terminal with session I/O
- **Git integration** — View diffs, stage changes, browse history
- **Web preview** — Live preview panel for web development
- **Session zoom** — Tmux-like zoom to focus on a single session (Ctrl+. Z)
- **Keyboard shortcuts** — Chord-based navigation (Ctrl+. prefix)
- **Extensions** — Plugin system for custom UI panels and skills
- **Remote workers** — Connect to remote machines via SSH

## Keyboard Shortcuts

Press `Ctrl+.` to arm the chord, then press a key:

| Key | Action |
|-----|--------|
| `E` | Toggle file explorer |
| `G` | Toggle git panel |
| `V` | Toggle web preview |
| `I` | Toggle issues panel |
| `Z` | Zoom / unzoom session |
| `K` | Kill / remove session |
| `Tab` | Switch to next session |
| `Shift+Tab` | Switch to previous session |
| `?` | Show all shortcuts |

## Troubleshooting

**Port already in use:**

```bash
# Find what's using the port
lsof -i :3000

# Use a different port
adyx start --port 3001
```

**Native module compilation fails:**

```bash
# Make sure build tools are installed
sudo apt-get install -y build-essential python3  # Linux
xcode-select --install                           # macOS

# Rebuild native modules
npm rebuild
```

**Permission errors on global install:**

```bash
# Option 1: Use npx (no global install needed)
npx adyx start

# Option 2: Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
npm install -g adyx
```

**Cannot access from remote browser:**

Make sure you started with `--host 0.0.0.0` and the port is open in your firewall:

```bash
# Start with remote access
adyx start --host 0.0.0.0 --port 8080

# Open firewall (Ubuntu)
sudo ufw allow 8080
```

## Development

```bash
git clone https://github.com/nadavbarak14/AgentIDE.git
cd AgentIDE
npm install
npm run dev:backend   # Backend on port 3005
npm run dev:frontend  # Frontend on port 5173 (proxies to backend)
```

Run tests:

```bash
npm test              # All tests
npm run test:backend  # Backend only
npm run test:frontend # Frontend only
npm run lint          # Lint + typecheck
```

## License

MIT
