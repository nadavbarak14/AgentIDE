# Research: Product Security & Licensing

**Feature**: 009-product-security-licensing
**Date**: 2026-02-20

## Decision 1: License Key Format — RSA-PSS Signed Base64url Tokens

**Decision**: Use `base64url(JSON payload).base64url(RSA-PSS-SHA256 signature)` format for license keys.

**Rationale**: Offline validation with no server dependency. RSA-PSS provides strong signature security (2048-bit key). Base64url encoding is URL-safe and easy to copy/paste. The two-part format (payload.signature) allows inspecting the payload without verifying, which aids debugging.

**Alternatives considered**:
- JWT (RFC 7519): Heavier standard, requires library for generation, includes headers. Overkill for a static license token.
- AES-encrypted blobs: Symmetric key must be embedded in the binary — if extracted, anyone can forge licenses. RSA asymmetric approach means only the private key (held by vendor) can sign.
- Online license server: Adds network dependency, complexity, and a single point of failure. Rejected per user requirement of offline-only operation.

## Decision 2: Session Token — HMAC-SHA256 JWT via `jose` Library

**Decision**: Use HS256 JWT tokens stored as httpOnly cookies for browser session management after license activation.

**Rationale**: JWTs are stateless (no session store needed), the `jose` library is well-maintained with native crypto, and httpOnly cookies prevent XSS token theft. The 30-day expiry matches the use case of "enter once, use for a month."

**Alternatives considered**:
- Server-side sessions with session ID cookie: Requires a session store (DB or memory). Adds complexity and state management for no benefit — the JWT payload is small (email, plan, expiry).
- Bearer token in Authorization header: Requires JavaScript to attach on every request and persist in localStorage (XSS-vulnerable). Cookie-based auth is automatic and more secure.

## Decision 3: CLI Framework — `commander`

**Decision**: Use `commander` for CLI argument parsing (`agentide start`, `agentide activate`).

**Rationale**: Already a project dependency. Mature, well-documented, zero-config for simple subcommands. Supports option parsing, help generation, and version display out of the box.

**Alternatives considered**:
- `yargs`: More features than needed, larger bundle. Commander is sufficient.
- Manual `process.argv` parsing: Error-prone, no auto-generated help.

## Decision 4: TLS — `selfsigned` for Auto-Generated Certificates

**Decision**: Use `selfsigned` library to generate self-signed TLS certificates on demand, stored in `~/.agentide/tls/`.

**Rationale**: Zero external dependencies (no openssl CLI needed). Reuses existing certificates if found. Acceptable for personal/development use where the user trusts the self-signed cert. Production users can supply their own cert/key via `--cert`/`--key` options.

**Alternatives considered**:
- `openssl` subprocess: Requires openssl installed on the system. Not guaranteed on Windows.
- Let's Encrypt / ACME: Requires a public domain, DNS setup, and periodic renewal. Overkill for a personal dev tool.

## Decision 5: Rate Limiting — `express-rate-limit`

**Decision**: Use `express-rate-limit` middleware on the `/api/auth/activate` endpoint (5 attempts per 15 minutes per IP).

**Rationale**: Already a project dependency. Simple configuration, works with Express middleware chain. `skipSuccessfulRequests: true` ensures valid activations don't count against the limit.

**Alternatives considered**:
- Custom rate limiter with SQLite: More control, but unnecessary complexity when the library handles in-memory counting well.
- Redis-backed rate limiting: Needed for multi-instance deployments, but AgentIDE is single-instance.

## Decision 6: Offline Licensing — Accept Sharing Risk

**Decision**: No phone-home, no revocation server, no online validation. License expiry dates are the only invalidation mechanism.

**Rationale**: User explicitly chose simplicity and reliability over anti-piracy measures. The Sublime Text model works for developer tools — users who pay, pay because they value the product, not because DRM forces them. Online checks add fragility (network issues, server downtime) that directly harms paying customers.

**Tradeoffs accepted**:
- License keys can be shared between users
- Revocation requires issuing a new key with a sooner expiry (no instant revocation)
- No usage telemetry or analytics

## Decision 7: SSRF Protection — DNS Resolution + Private IP Blocking

**Decision**: Resolve hostnames to IPs before proxying, block all RFC 1918, loopback, link-local, and IPv4-mapped IPv6 addresses.

**Rationale**: The URL proxy endpoint (`/api/sessions/:id/proxy-url/:encodedUrl`) can be used by an attacker to reach internal services (cloud metadata at 169.254.169.254, internal APIs). DNS resolution catches hostname-based bypasses (e.g., a domain resolving to 127.0.0.1).

**Implementation note**: Both IPv4 and IPv6 checks are needed. IPv4-mapped IPv6 addresses (::ffff:127.0.0.1) must also be blocked.

## Decision 8: Path Traversal — Double Defense

**Decision**: Two-layer path traversal prevention: (1) `sanitizePath()` rejects `..` and null bytes at the middleware level, (2) `path.resolve()` + `startsWith()` at the file-serving level.

**Rationale**: Defense in depth. The sanitize check catches obvious traversal attempts early. The resolve+startsWith check catches edge cases that might bypass string-level checks (URL encoding, unicode normalization, symlinks). Both are cheap operations.
