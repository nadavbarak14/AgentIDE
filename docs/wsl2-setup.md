# WSL2 Setup Guide

AgentIDE runs on Windows via WSL2 (Windows Subsystem for Linux 2). WSL2 provides a real Linux kernel, so all features work as they do on native Linux.

> **WSL1 is not supported.** AgentIDE detects WSL1 at startup and displays a warning. Upgrade with: `wsl --set-version <distro> 2`

## Prerequisites

- Windows 10 build 19041+ or Windows 11
- WSL2 enabled with an Ubuntu 22.04+ distribution
- A Windows browser (Chrome, Edge, Firefox) for the dashboard UI

### Enable WSL2

If WSL2 is not yet enabled:

```powershell
wsl --install -d Ubuntu-22.04
```

Restart your machine if prompted, then open the Ubuntu terminal.

## Install System Dependencies

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3 curl lsof git
```

- **build-essential** is required to compile native Node.js modules (`node-pty`, `better-sqlite3`)
- **python3** and **curl** are used by the hook script
- **lsof** enables port detection
- **git** for version control

## Install Node.js

### Option A: via nvm (recommended)

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

### Option B: via apt

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

## Clone and Build

```bash
git clone <repository-url>
cd AgentIDE
npm ci
npm run build
```

## Start the Server

```bash
npm start
```

AgentIDE will check for required tools at startup and warn about any missing dependencies.

## Accessing from Windows

WSL2 automatically forwards `localhost` ports to the Windows host. Open your Windows browser and navigate to:

```
http://localhost:<port>
```

The port number is shown in the terminal output when the server starts.

### Older WSL2 Setups

If localhost forwarding does not work (some older WSL2 configurations), get the WSL2 IP address:

```bash
wsl hostname -I
```

Then connect directly using the IP address shown.

## Known Limitations

| Area | Limitation | Workaround |
|------|-----------|------------|
| WSL1 | Not supported | Upgrade: `wsl --set-version <distro> 2` |
| `/mnt/c/` filesystem | Slow performance, delayed file-watching events | Keep projects on the WSL2 native filesystem (`~/projects/`) |
| Port detection | `lsof` must be installed separately | `sudo apt-get install -y lsof` |
| Native modules | Require `build-essential` for compilation | `sudo apt-get install -y build-essential` |

## Troubleshooting

### Native module compilation fails

```
Error: Could not locate the bindings file
```

Install build tools:

```bash
sudo apt-get install -y build-essential
```

Then rebuild:

```bash
npm ci
```

### Missing tools warning at startup

AgentIDE checks for `grep`, `lsof`, `curl`, and `python3` at startup. Install any missing tools:

```bash
sudo apt-get install -y grep lsof curl python3
```

### File watching not detecting changes

If file changes are not detected, ensure your project is on the WSL2 native filesystem, not on `/mnt/c/`. The Windows filesystem has limited inotify support.

```bash
# Move project to WSL2 filesystem
mv /mnt/c/projects/AgentIDE ~/projects/AgentIDE
```

### "WSL1 detected" warning

Upgrade your distribution to WSL2:

```powershell
# In PowerShell (as Administrator)
wsl --set-version Ubuntu-22.04 2
```

### Hook script warnings

If you see `WARN [c3-hook]: Required tool 'python3' not found`, install the missing tool:

```bash
sudo apt-get install -y python3 curl
```
