# Research: Product Security, Licensing & CLI

**Branch**: `007-auth-licensing-cli` | **Date**: 2026-02-20

## Decisions

### 1. RSA License Key Signing

**Decision**: Use Node.js built-in `node:crypto` with RSA-PSS + SHA-256.

**Rationale**: No external dependencies. Node.js 20 has mature RSA support. RSA-PSS padding is more secure than PKCS#1 v1.5. 2048-bit keys provide sufficient security for license validation.

**Key format**: `base64url(JSON payload) + "." + base64url(RSA-PSS signature)`

**Alternatives considered**:
- ECDSA/Ed25519: Smaller keys, faster, but RSA is more universally understood for license distribution
- External libraries (node-forge, jose for JWK): Unnecessary dependency when node:crypto has everything needed

---

### 2. JWT Implementation

**Decision**: Use `jose` library (v5.x).

**Rationale**: Actively maintained, full ESM support, proper TypeScript types, spec-compliant. `jsonwebtoken` has slowed development and predates modern JS standards.

**Alternatives considered**:
- `jsonwebtoken`: Still works but older, no ESM, slower maintenance cadence
- Manual JWT with node:crypto: Possible but error-prone for edge cases (claims validation, clock skew)

---

### 3. Cookie Parsing

**Decision**: Use `cookie-parser` middleware for Express requests. Manual cookie parsing for WebSocket upgrade requests.

**Rationale**: Express middleware doesn't run on WebSocket upgrades, so the upgrade handler must parse cookies directly from `request.headers.cookie`. The `cookie` package (which `cookie-parser` depends on) can be used for both.

**WebSocket cookie parsing approach**:
```typescript
// In upgrade handler, parse raw cookie header
const cookies = cookie.parse(request.headers.cookie || '');
const token = cookies['agentide_session'];
```

---

### 4. Rate Limiting

**Decision**: Use `express-rate-limit` (v7.x).

**Rationale**: Simple API, zero additional infrastructure, battle-tested (10M+ weekly downloads). In-memory store is sufficient for single-server deployment. Only the `/api/auth/activate` endpoint needs rate limiting.

**Alternatives considered**:
- `rate-limiter-flexible`: More powerful but overkill for a single endpoint
- Manual implementation: Would reinvent existing, well-tested logic

---

### 5. CLI Framework

**Decision**: Use `commander` (v12.x).

**Rationale**: Industry standard, excellent TypeScript support, subcommands feel native, extensive documentation. Lightest footprint among major CLI frameworks.

**Alternatives considered**:
- `yargs`: Larger bundle, more declarative style, overkill for simple subcommands
- `citty` (unjs): Newer, less ecosystem maturity, less documentation

---

### 6. Self-Signed Certificate Generation

**Decision**: Use `selfsigned` (v2.x).

**Rationale**: Lighter than node-forge, simple API, cross-platform. Node.js 20's built-in crypto lacks X.509 certificate creation helpers.

**Alternatives considered**:
- `node-forge`: Heavier, more verbose API
- Shelling out to `openssl`: Fragile, requires openssl installed, platform-dependent

---

### 7. License Key Hash Storage

**Decision**: Use `node:crypto.createHash('sha256')` for storing a hash of the license key.

**Rationale**: The license key hash is NOT for password protection — it's for identifying which key was activated (comparison only). SHA-256 is sufficient. Password-grade hashing (argon2/bcrypt) adds unnecessary complexity and dependency for this use case. The license key itself has high entropy (it's a base64-encoded RSA signature), making brute-force infeasible even with SHA-256.

**Alternatives considered**:
- argon2: OWASP-recommended for passwords, but license keys aren't passwords (they're high-entropy tokens). Adds a native dependency.
- bcrypt: Same argument — unnecessary for high-entropy tokens

---

## Risks & Mitigations

### node-pty in Global npm Installs
**Risk**: `node-pty` requires native compilation. Global installs may fail without build tools.
**Mitigation**: Document Node.js + build tools requirement. The package already has `node-pty` as a dependency, so this is an existing constraint, not a new one.

### TypeScript Shebang
**Risk**: `#!/usr/bin/env node` must survive TypeScript compilation.
**Mitigation**: TypeScript 5.x preserves shebangs by default. Add shebang as first line in `cli.ts`. Set `chmod +x` in build script.

### WebSocket Cookie Access
**Risk**: Express middleware doesn't run on WebSocket upgrades.
**Mitigation**: Parse cookies manually in the upgrade handler using the `cookie` package.

### JWT Secret Persistence
**Risk**: If JWT secret changes, all existing cookies are invalidated.
**Mitigation**: Store JWT secret in SQLite `auth_config` table. Generated once on first run, persists across restarts.
