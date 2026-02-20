# Contract: CLI Commands

**Feature**: 009-product-security-licensing
**Binary**: `agentide`

## agentide start

Start the AgentIDE hub server.

```
agentide start [options]
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| -p, --port \<port\> | number | 3000 | Port to listen on |
| -H, --host \<host\> | string | 127.0.0.1 | Host to bind to |
| --tls | flag | false | Enable HTTPS/TLS |
| --cert \<path\> | string | — | Path to TLS certificate file |
| --key \<path\> | string | — | Path to TLS private key file |
| --self-signed | flag | false | Generate and use self-signed certificate |
| --no-auth | flag | false | Disable auth even when remote |

### Behavior

| Scenario | Auth Required | TLS |
|----------|--------------|-----|
| Default (127.0.0.1) | No | No |
| `--host 0.0.0.0` | Yes | No (warning logged) |
| `--host 0.0.0.0 --no-auth` | No | No (warning logged) |
| `--host 0.0.0.0 --tls --self-signed` | Yes | Yes (self-signed) |
| `--host 0.0.0.0 --tls --cert x --key y` | Yes | Yes (user cert) |

### Startup License Check (when authRequired=true)

1. Load `~/.agentide/license.key`
2. If file exists: validate signature + expiry, log result
3. If valid: log email and plan, continue
4. If invalid: throw error, refuse to start
5. If file missing: warn, continue (users can activate via browser)

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Clean shutdown (SIGINT/SIGTERM) |
| 1 | Startup failure (invalid license, port in use, etc.) |

---

## agentide activate \<license-key\>

Validate and save a license key to disk.

```
agentide activate <license-key>
```

### Success Output

```
License activated for user@example.com
Plan: pro | Max Sessions: 10
Expires: 2027-02-20T00:00:00.000Z
```

### Error Output

```
Error: Invalid license key: signature verification failed
```

Exit code: 1

### Side Effects

- Saves license key to `~/.agentide/license.key` with permissions `0600`
- Creates `~/.agentide/` directory with permissions `0700` if needed

---

## agentide --version

Display version from package.json.

## agentide --help

Display auto-generated help text.
