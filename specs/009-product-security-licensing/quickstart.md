# Quickstart: Product Security & Licensing

**Feature**: 009-product-security-licensing
**Date**: 2026-02-20

## Scenario 1: Local Developer (Zero Friction)

```bash
# Install and start
npm install -g agentide
agentide start

# Output: AgentIDE Hub started on http://127.0.0.1:3000
# Output: Auth disabled (localhost mode)

# Open browser — dashboard loads immediately
open http://localhost:3000
```

**Verify**:
```bash
curl http://localhost:3000/api/auth/status
# → {"authRequired":false,"authenticated":true,"email":null,"plan":null,"licenseExpiresAt":null}

curl http://localhost:3000/api/sessions
# → 200 OK (no cookie needed)
```

## Scenario 2: Remote Access with License

```bash
# Activate license (one-time)
agentide activate "eyJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20i..."
# → License activated for user@example.com
# → Plan: pro | Max Sessions: 10
# → Expires: 2027-02-20T00:00:00.000Z

# Start with remote binding
agentide start --host 0.0.0.0 --port 3000
# Output: WARNING: Binding to a non-localhost address without TLS...
# Output: License validated
# Output: AgentIDE Hub started on http://0.0.0.0:3000
```

**Verify**:
```bash
# Without cookie — blocked
curl http://your-server:3000/api/sessions
# → 401 {"error":"Authentication required"}

# Auth status — accessible without cookie
curl http://your-server:3000/api/auth/status
# → {"authRequired":true,"authenticated":false,...}

# Activate via browser API — sets cookie
curl -c cookies.txt -X POST http://your-server:3000/api/auth/activate \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"eyJ..."}'
# → 200 {"email":"user@example.com","plan":"pro",...}

# With cookie — works
curl -b cookies.txt http://your-server:3000/api/sessions
# → 200 OK
```

## Scenario 3: SSH Tunnel (Recommended Remote Access)

```bash
# On your laptop — tunnel to remote server
ssh -L 3000:localhost:3000 user@your-server

# Open browser locally — full access, no license needed
open http://localhost:3000
# → Dashboard loads (localhost mode, zero auth)
```

## Scenario 4: HTTPS with Self-Signed Certificate

```bash
agentide start --host 0.0.0.0 --tls --self-signed
# Output: Self-signed TLS certificate generated
# Output: AgentIDE Hub started on https://0.0.0.0:3000

# Browser will show certificate warning — accept it
# Cookie will include Secure flag (HTTPS only)
```

## Scenario 5: Rate Limiting

```bash
# 5 failed attempts
for i in {1..5}; do
  curl -X POST http://server:3000/api/auth/activate \
    -H "Content-Type: application/json" \
    -d '{"licenseKey":"invalid"}'
done
# → 401 each time

# 6th attempt — blocked
curl -X POST http://server:3000/api/auth/activate \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"invalid"}'
# → 429 {"error":"Too many attempts. Try again later.","retryAfter":900}
```

## Scenario 6: SSH Worker with Key Validation

```bash
# Via dashboard API — add remote worker
curl -b cookies.txt -X POST http://server:3000/api/workers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GPU Server",
    "sshHost": "gpu.internal",
    "sshUser": "ubuntu",
    "sshKeyPath": "/home/user/.ssh/id_rsa"
  }'
# → 200 OK (key validated, connection attempted)

# With passphrase-protected key
curl -b cookies.txt -X POST http://server:3000/api/workers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GPU Server",
    "sshHost": "gpu.internal",
    "sshUser": "ubuntu",
    "sshKeyPath": "/home/user/.ssh/encrypted_key"
  }'
# → 400 {"error":"SSH key is passphrase-protected..."}
```
