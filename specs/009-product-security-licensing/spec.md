# Feature Specification: Product Security & Licensing

**Feature Branch**: `009-product-security-licensing`
**Created**: 2026-02-20
**Status**: Draft
**Input**: User description: "Re-spec the product security and licensing system for AgentIDE. SSH-first access model with offline RSA license validation."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Local Developer Uses AgentIDE Without Friction (Priority: P1)

A developer installs AgentIDE and runs it on their local machine. The hub binds to localhost by default. The developer opens their browser, navigates to the dashboard, and immediately begins working — no license prompt, no login screen, no configuration. SSH already authenticates them implicitly (they have shell access to the machine).

**Why this priority**: This is the default experience for every user. If local use has friction, the product fails at first impression. Zero-auth localhost is the foundation everything else builds on.

**Independent Test**: Install the product, run the start command with no arguments, open the dashboard in a browser — everything works immediately with no prompts or blockers.

**Acceptance Scenarios**:

1. **Given** a fresh install with no license key, **When** the user starts the hub with default settings, **Then** the dashboard loads in the browser without any authentication prompt
2. **Given** the hub running in local mode, **When** the user creates sessions, browses files, and uses terminal features, **Then** all functionality works without any credential
3. **Given** the hub running in local mode, **When** the auth status is checked, **Then** the system reports that authentication is not required

---

### User Story 2 — License Key Activation and Gated Remote Access (Priority: P1)

A developer runs AgentIDE on a VPS and wants to access it from their laptop or phone. They start the hub with remote binding enabled. The system requires a valid license key before granting access. The user enters their license key once in the browser, and the system remembers them for 30 days via a session cookie. If they access via SSH tunnel instead, no license is needed (localhost mode).

**Why this priority**: Remote access is the primary paid use case. License-gating this ensures revenue while keeping local use free.

**Independent Test**: Start the hub with remote binding, visit from a browser, verify a license gate appears, enter a valid key, verify the dashboard loads and the session persists across page reloads.

**Acceptance Scenarios**:

1. **Given** the hub running in remote mode, **When** a user visits the dashboard without a session, **Then** they see a license key entry screen
2. **Given** the license gate screen, **When** the user enters a valid, non-expired license key, **Then** the dashboard loads and a persistent session is created
3. **Given** a valid session, **When** the user refreshes the page or opens a new tab, **Then** they remain authenticated without re-entering the key
4. **Given** the license gate screen, **When** the user enters an invalid or expired key, **Then** a clear error message is shown and access is denied
5. **Given** a valid session, **When** the user logs out, **Then** the session is cleared and they must re-enter the key
6. **Given** the hub starting in remote mode, **When** a license key file exists on disk, **Then** the system validates the license at startup and logs the result
7. **Given** an authenticated session, **When** the underlying license expires (time passes), **Then** the next request is rejected and the user is prompted to re-activate

---

### User Story 3 — CLI Installation and Management (Priority: P2)

A developer installs AgentIDE globally and manages it entirely from the command line. They use a single command to start the hub with various configuration options (port, host binding, TLS). They use a separate command to activate their license key before starting in remote mode. Standard help and version commands work as expected.

**Why this priority**: The CLI is the user's primary interface for installation and configuration. Important for usability but secondary to the core auth/licensing behavior.

**Independent Test**: Install globally, run help/version commands, activate a license key via CLI, start the hub, verify it launches correctly.

**Acceptance Scenarios**:

1. **Given** a global installation, **When** the user runs the start command, **Then** the hub launches on the default port and host
2. **Given** the CLI, **When** the user runs the start command with port and host options, **Then** the hub binds to the specified address
3. **Given** the CLI, **When** the user runs the activate command with a valid license key, **Then** the key is saved to disk and the license details are displayed
4. **Given** the CLI, **When** the user runs the activate command with an invalid key, **Then** a clear error is shown and the process exits with a non-zero code
5. **Given** the CLI, **When** the user requests help or version information, **Then** accurate information is displayed

---

### User Story 4 — Secure Remote Access via HTTPS (Priority: P2)

A developer exposing the hub to the network wants encrypted communication. They start the hub with TLS enabled, either using an auto-generated self-signed certificate or their own certificate files. The system warns if remote binding is used without TLS. Session cookies are marked as secure when TLS is active.

**Why this priority**: HTTPS prevents man-in-the-middle attacks on remote connections. Important for security but not blocking — SSH tunneling provides encryption as an alternative.

**Independent Test**: Start the hub with self-signed TLS enabled, visit via HTTPS, verify the connection is encrypted and the certificate is served.

**Acceptance Scenarios**:

1. **Given** the CLI with TLS and self-signed options, **When** the hub starts, **Then** it serves traffic over HTTPS with an auto-generated certificate
2. **Given** the CLI with TLS and user-provided certificate paths, **When** the hub starts, **Then** it serves traffic using the specified certificate
3. **Given** the hub running with TLS, **When** a license key is activated, **Then** the session cookie is marked as secure (only sent over encrypted connections)
4. **Given** the hub starting with remote binding but no TLS, **When** the hub launches, **Then** a clear warning is logged about unencrypted traffic

---

### User Story 5 — Security Hardening (Priority: P2)

The system applies defense-in-depth security measures to protect against common web vulnerabilities when the hub is exposed to the network.

**Why this priority**: These are essential protections for any web service exposed to the network, but are secondary to the core auth and licensing functionality.

**Independent Test**: Start the hub in remote mode, verify that internal-only endpoints reject external requests, proxy endpoints block private network access, security headers are present, and file-serving endpoints prevent directory traversal.

**Acceptance Scenarios**:

1. **Given** the hub running in remote mode, **When** an external caller attempts to reach the internal hook/callback endpoint, **Then** the request is rejected (only local processes can call this endpoint)
2. **Given** the hub running in any mode, **When** the URL proxy is asked to fetch a private/internal network address (loopback, link-local, RFC 1918), **Then** the request is blocked with a clear error
3. **Given** the hub running in any mode, **When** any response is served, **Then** it includes security headers that prevent content-type sniffing, clickjacking, and cross-site scripting
4. **Given** the hub running in any mode, **When** a file-serving request includes a crafted path, **Then** the system rejects any path that would escape the session's working directory
5. **Given** the hub running in remote mode, **When** more than 5 failed license activation attempts are made within 15 minutes from the same source, **Then** further attempts are temporarily blocked

---

### User Story 6 — SSH Remote Workers with Private Key Validation (Priority: P3)

An operator adds a remote worker machine to AgentIDE by providing SSH connection details and a private key file path. The system validates the key file before attempting connection — checking that it exists, is readable, and is not passphrase-protected (which would cause silent connection failures).

**Why this priority**: Remote workers extend the product's capability but are an advanced feature used by a subset of users.

**Independent Test**: Add a remote worker via the dashboard with an SSH private key path, verify the system validates the key and either connects or shows a clear error.

**Acceptance Scenarios**:

1. **Given** a valid, unencrypted SSH private key file, **When** the user adds a remote worker, **Then** the system validates the key and attempts the SSH connection
2. **Given** a non-existent key file path, **When** the user adds a remote worker, **Then** the system rejects the request with a "key file not found" error
3. **Given** a passphrase-protected key file, **When** the user adds a remote worker, **Then** the system rejects the request with a clear message explaining that passphrase-protected keys are not supported and suggesting how to generate an unprotected key
4. **Given** a file that is not a private key (e.g., a public key), **When** the user adds a remote worker, **Then** the system rejects the request with a "not a private key" error

---

### Edge Cases

- What happens when a session cookie is presented after the server restarts with a new secret? The cookie is rejected and the user is prompted to re-activate.
- What happens when the license key file on disk is corrupted or truncated? Startup validation reports the error clearly and the hub continues (users can activate via browser).
- What happens when the self-signed TLS certificate already exists from a previous run? The existing certificate is reused rather than generating a new one.
- What happens when the hub is started with remote binding but the license activation endpoint has no TLS? The endpoint still works (the warning is advisory, not blocking).
- What happens when an SSH worker's key file becomes unreadable after the worker is already connected? The next reconnection attempt will fail with a clear error; the existing connection continues until dropped.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST bind to localhost by default, providing full functionality without any authentication or license check
- **FR-002**: The system MUST require a valid license key when binding to a non-localhost address, gating all protected features behind license activation
- **FR-003**: The system MUST validate license keys offline using embedded cryptographic signature verification and expiry checking
- **FR-004**: The system MUST issue a persistent session (30 days) after successful license activation so users do not re-enter keys on every visit
- **FR-005**: The system MUST validate any saved license key at startup when authentication is required, logging the result
- **FR-006**: The system MUST protect all data and control endpoints with authentication when in remote mode, while keeping the activation and status-check endpoints accessible
- **FR-007**: The system MUST protect real-time communication channels (terminal streaming) with the same authentication as regular endpoints
- **FR-008**: The system MUST restrict internal callback endpoints to localhost-only callers when in remote mode
- **FR-009**: The system MUST block the URL proxy from accessing private, internal, and link-local network addresses
- **FR-010**: The system MUST apply defense-in-depth path traversal prevention on all file-serving endpoints
- **FR-011**: The system MUST include standard security response headers (content-type sniffing prevention, clickjacking prevention, content security policy)
- **FR-012**: The system MUST rate-limit failed license activation attempts (5 per 15 minutes per source)
- **FR-013**: The system MUST support HTTPS via self-signed or user-provided certificates, and warn when remote binding is used without TLS
- **FR-014**: The system MUST set the cookie secure flag when operating over TLS
- **FR-015**: The system MUST provide a CLI with start (configurable port, host, TLS options) and activate (validate and save license key) commands
- **FR-016**: The system MUST validate SSH private key files before worker connection attempts — checking existence, readability, passphrase protection, and key format
- **FR-017**: The system MUST use offline-only license validation with no phone-home, no revocation server, and no internet dependency — license expiry dates handle invalidation

### Key Entities

- **License Key**: A cryptographically signed credential containing the holder's identity (email), plan level, session limit, and expiry date. Validated offline against an embedded public key.
- **Session**: A browser session created after successful license activation, persisting for 30 days. Allows the browser to access all features without re-entering the key.
- **Auth Configuration**: Server-side state tracking whether auth is required, the session signing secret, and stored license metadata.
- **Worker**: A local or remote machine that runs AI coding sessions. Remote workers connect via SSH with a private key.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Local users (default mode) can start the product and begin working in under 10 seconds with zero prompts or configuration
- **SC-002**: Remote users can activate their license key and access the dashboard in under 30 seconds
- **SC-003**: 100% of protected endpoints reject unauthenticated requests in remote mode
- **SC-004**: 100% of auth/status endpoints remain accessible without credentials (no lockout scenarios)
- **SC-005**: The system blocks 100% of proxy requests targeting private/internal network addresses
- **SC-006**: Failed activation attempts beyond the rate limit threshold are blocked within 1 second
- **SC-007**: All security hardening measures pass with zero test failures across unit, integration, and system tests

### Assumptions

- License keys are distributed out-of-band (email, purchase portal) — the product does not handle key generation or distribution
- The RSA keypair for signing licenses is managed by the product vendor, not the end user
- SSH tunnel is the recommended primary access method for remote use; direct browser access with license key is the secondary/convenience method
- Offline licensing means license sharing is technically possible — this is an accepted tradeoff for simplicity and reliability
- Self-signed TLS certificates are acceptable for personal/development use; production deployments may use proper certificates
