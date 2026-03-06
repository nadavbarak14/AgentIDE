# Quickstart: Global Install & CLI Commands

**Feature**: 025-global-install-cli

## Installation

```bash
npm install -g adyx-ide
```

The postinstall script will check for required dependencies (tmux, gh) and print install instructions if any are missing.

## Commands

### Start the Hub

```bash
adyx start                    # Start on default port 3000, opens browser
adyx start --port 8080        # Custom port
adyx start --host 0.0.0.0     # Bind to all interfaces (remote access)
adyx start --no-open           # Don't auto-open browser
```

### Start the Remote Agent

Run this on the remote worker machine:

```bash
adyx agent                    # Start on default port 4100
adyx agent --port 5000        # Custom port
adyx agent --host 0.0.0.0     # Bind to all interfaces
```

### Check Dependencies

```bash
adyx doctor                   # Check all required dependencies
```

Example output:
```
Adyx Dependency Check
=====================
  tmux ........... v3.4 (ok)
  gh ............. v2.40.1 (ok)
  node ........... v20.20.0 (ok)

All dependencies satisfied!
```

Example output (missing dependency):
```
Adyx Dependency Check
=====================
  tmux ........... MISSING
  gh ............. v2.40.1 (ok)
  node ........... v20.20.0 (ok)

Missing dependencies:
  tmux: sudo apt install tmux
```

## Development

```bash
# Run CLI in development (without global install)
npx tsx backend/src/cli.ts start
npx tsx backend/src/cli.ts agent
npx tsx backend/src/cli.ts doctor

# Run tests
npm run test:backend
```
