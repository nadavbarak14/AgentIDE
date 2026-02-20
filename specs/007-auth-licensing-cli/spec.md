# Feature Specification: Product Security, Licensing & CLI

**Feature Branch**: `007-auth-licensing-cli`
**Created**: 2026-02-20
**Status**: Draft
**Input**: User description: "we need this. i want the remote connection be with private key with SSH, is it possible?"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Local Developer Uses AgentIDE Without Friction (Priority: P1)

A developer installs AgentIDE globally, runs `agentide start`, and opens `localhost:3000` in their browser. The dashboard loads immediately with no license prompt or login screen. They create Claude sessions, edit files, and use all IDE features exactly as they do today. Authentication only activates when the hub is exposed to a network.

**Why this priority**: This is the most common use case. If local usage has friction, developers won't adopt the product. The default experience must remain seamless.

**Independent Test**: Install the package, run `agentide start`, open browser to `localhost:3000`, and verify the dashboard loads with all features available and no auth prompts.

**Acceptance Scenarios**:

1. **Given** a fresh install with no license key saved, **When** user runs `agentide start` (default localhost binding), **Then** the dashboard loads at `localhost:3000` without any license or auth prompt.
2. **Given** the hub is running on localhost, **When** user creates a session, opens files, and interacts with the terminal, **Then** all features work identically to the current behavior.
3. **Given** the hub is running on localhost, **When** any API request is made, **Then** no authentication headers or cookies are required.

---

### User Story 2 - License Key Activation and Gated Access (Priority: P1)

A user purchases a license and receives a license key string. They either activate it via CLI (`agentide activate <key>`) or enter it in the browser when accessing a remote hub. The key is cryptographically validated without needing to contact any external server. Once valid, a browser cookie is set and the user sees the dashboard. Invalid or expired keys are rejected with clear error messages.

**Why this priority**: The license system is the core monetization mechanism. Without it, there is no product to sell. It is tied with P1 because it must work alongside the local-first experience.

**Independent Test**: Generate a test license key, run `agentide activate <key>`, verify it's saved. Start the hub in remote mode, visit from browser, verify the license gate appears, enter the key, verify dashboard loads.

**Acceptance Scenarios**:

1. **Given** a valid license key, **When** user runs `agentide activate <key>`, **Then** the key is saved locally at `~/.agentide/license.key` and a confirmation message shows email, plan, and expiry date.
2. **Given** an invalid or tampered license key, **When** user attempts activation, **Then** a clear error message is shown and the key is not saved.
3. **Given** an expired license key, **When** user attempts activation, **Then** the error message indicates the key has expired and states the expiry date.
4. **Given** the hub is running in remote mode with no cookie, **When** a user visits the dashboard, **Then** a license key entry screen is displayed instead of the dashboard.
5. **Given** a valid license key entered in the browser, **When** the user submits it, **Then** a session cookie is set (30-day duration) and the dashboard loads.
6. **Given** a valid session cookie, **When** the user revisits the dashboard, **Then** the dashboard loads directly without re-entering the key.
7. **Given** an expired session cookie, **When** the user visits the dashboard, **Then** the license key entry screen is shown again.

---

### User Story 3 - Secure Remote Access From Any Device (Priority: P2)

A developer runs the hub on a VPS with a public IP. They access the dashboard from their phone, laptop, or tablet via HTTPS. The hub requires a valid license key (via browser cookie) for all access. All API endpoints and WebSocket connections are protected. Brute-force attempts to guess the license key are rate-limited.

**Why this priority**: Remote access unlocks the "access from anywhere" value proposition, but it requires the license system (P1) to exist first.

**Independent Test**: Start the hub with `agentide start --host 0.0.0.0 --tls --self-signed`, visit from a different device, verify HTTPS works, verify license gate appears, verify dashboard loads after entering key, verify WebSocket terminal streaming works over TLS.

**Acceptance Scenarios**:

1. **Given** the hub starts with `--host 0.0.0.0`, **When** any API request arrives without a valid cookie, **Then** the request is rejected with a 401 response.
2. **Given** the hub starts with `--tls --self-signed`, **When** a browser connects, **Then** the connection uses HTTPS (with a browser certificate warning for self-signed).
3. **Given** the hub starts with `--tls --cert <path> --key <path>`, **When** a browser connects with a trusted certificate, **Then** the connection uses HTTPS with no warnings.
4. **Given** a user attempts to connect a WebSocket without a valid cookie, **When** the upgrade request is sent, **Then** the connection is refused.
5. **Given** an attacker makes 5 failed license key attempts within 15 minutes, **When** they attempt a 6th, **Then** the request is rejected with a rate-limit error (HTTP 429).
6. **Given** a valid cookie is present, **When** the user accesses API endpoints and WebSocket connections, **Then** all requests succeed normally.

---

### User Story 4 - Easy Installation via CLI (Priority: P2)

A new user installs AgentIDE with a single command (`npm install -g agentide`). After installation, the `agentide` command is available globally. They can run `agentide start` to launch the hub, `agentide activate <key>` to activate a license, and `agentide --help` to see all available commands.

**Why this priority**: Easy installation is essential for adoption but depends on the core features (auth, license) being implemented first so there is something meaningful to package.

**Independent Test**: Run `npm install -g agentide` in a clean environment, run `agentide --help`, verify output shows available commands, run `agentide start`, verify the hub starts.

**Acceptance Scenarios**:

1. **Given** a system with Node.js 20+ installed, **When** user runs `npm install -g agentide`, **Then** the package installs successfully and `agentide` is available as a global command.
2. **Given** the `agentide` command is installed, **When** user runs `agentide --help`, **Then** usage information is displayed showing all available subcommands.
3. **Given** the `agentide` command is installed, **When** user runs `agentide --version`, **Then** the current version number is displayed.
4. **Given** the `agentide` command is installed, **When** user runs `agentide start`, **Then** the hub server starts on the default port (3000) with the default host (localhost).
5. **Given** the `agentide` command is installed, **When** user runs `agentide start --port 8080 --host 0.0.0.0`, **Then** the hub starts on port 8080 bound to all network interfaces.

---

### User Story 5 - Remote Workers via SSH Private Key (Priority: P3)

A developer wants to distribute Claude sessions across multiple machines. From the AgentIDE dashboard, they add a remote worker by providing an SSH host, username, and private key path. The hub connects to the remote machine over SSH using the private key (no password). Sessions can then be assigned to run on the remote worker. All communication between hub and worker travels over the encrypted SSH tunnel.

**Why this priority**: Remote workers extend the product's capability but are not needed for the core single-machine experience. The SSH infrastructure already exists in the codebase and needs refinement rather than rebuilding.

**Independent Test**: Start the hub, add a remote worker via the dashboard providing SSH host, user, and private key path. Verify the connection succeeds. Create a session targeting the remote worker. Verify the session runs and terminal output streams back to the dashboard.

**Acceptance Scenarios**:

1. **Given** a remote machine accessible via SSH with key-based authentication, **When** the user adds it as a worker providing host, username, and private key file path, **Then** the hub connects over SSH and the worker status shows "connected".
2. **Given** a connected remote worker, **When** the user creates a session with that worker as target, **Then** the session runs on the remote machine and terminal output streams to the dashboard in real time.
3. **Given** an invalid SSH private key or unreachable host, **When** the user attempts to add the worker, **Then** a clear error message is shown (e.g., "Connection failed: authentication denied" or "Host unreachable").
4. **Given** a connected remote worker loses network connectivity, **When** the health check runs, **Then** the worker status updates to "error" and sessions are not assigned to it.
5. **Given** the private key file has a passphrase, **When** the user adds the worker, **Then** the system reports that passphrase-protected keys are not supported and suggests using an unprotected key or ssh-agent.

---

### Edge Cases

- What happens when the license key expires while the user is actively using the dashboard? The current session continues, but new API requests after cookie expiry show the license gate. Active terminal sessions are not interrupted mid-use.
- What happens when the hub restarts? The JWT secret persists in the database, so existing cookies remain valid. Active sessions are marked as completed (existing behavior) and can be continued.
- What happens when the license key file (`~/.agentide/license.key`) is deleted while the hub is running? Currently active cookies remain valid until they expire. New activations require a valid key.
- What happens when multiple users try to use the same license key from different devices? The license key can be used from multiple devices simultaneously. Each device gets its own cookie.
- What happens when the self-signed TLS certificate expires? Self-signed certificates are generated with a 1-year validity. On expiry, the hub logs a warning and the user must regenerate with `--self-signed` again or provide a real certificate.
- What happens when the SSH private key file is not readable (wrong permissions)? The hub shows a clear error message indicating the file cannot be read and suggests checking permissions.
- What happens when rate limiting blocks a legitimate user? The rate limit resets after 15 minutes. The error message includes the retry-after time.

## Requirements *(mandatory)*

### Functional Requirements

#### License System
- **FR-001**: System MUST validate license keys using cryptographic signatures without contacting any external server.
- **FR-002**: License keys MUST encode: email, plan name, maximum concurrent sessions allowed, expiry date, and issue date.
- **FR-003**: System MUST reject license keys that have been tampered with (signature mismatch).
- **FR-004**: System MUST reject license keys that have passed their expiry date.
- **FR-005**: Users MUST be able to activate a license key via the CLI command `agentide activate <key>`.
- **FR-006**: The license key MUST be stored locally with restricted file permissions (owner-only read/write).

#### Authentication
- **FR-010**: When the hub is bound to localhost (127.0.0.1), authentication MUST be disabled (no license check, no cookies required).
- **FR-011**: When the hub is bound to a non-localhost address (e.g., 0.0.0.0), authentication MUST be enforced on all API endpoints and WebSocket connections.
- **FR-012**: The license key MUST serve as the sole authentication credential (no separate username or password).
- **FR-013**: Upon successful license key validation via the browser, the system MUST set an HTTP-only, secure (when HTTPS), same-site cookie with a 30-day expiry.
- **FR-014**: All protected API endpoints MUST return HTTP 401 when accessed without a valid session cookie.
- **FR-015**: WebSocket upgrade requests MUST be rejected if no valid session cookie is present (when auth is enabled).
- **FR-016**: The license key validation endpoint MUST be rate-limited to 5 attempts per 15 minutes per IP address.
- **FR-017**: The system MUST provide an auth status endpoint that returns authentication state without triggering a 401 error (for frontend auth checks).

#### HTTPS/TLS
- **FR-020**: System MUST support HTTPS when started with a TLS flag.
- **FR-021**: System MUST accept user-provided TLS certificates via cert and key file paths.
- **FR-022**: System MUST be able to auto-generate a self-signed TLS certificate when requested, stored locally.
- **FR-023**: When HTTPS is enabled, session cookies MUST be marked as "secure" (transmitted only over HTTPS).

#### CLI
- **FR-030**: The package MUST install a global `agentide` CLI command.
- **FR-031**: `agentide start` MUST start the hub server with configurable port, host, and TLS options.
- **FR-032**: `agentide activate <key>` MUST validate and store a license key locally.
- **FR-033**: `agentide --help` MUST display all available commands and their options.
- **FR-034**: `agentide --version` MUST display the current version number.

#### Remote Workers (SSH)
- **FR-040**: Users MUST be able to add remote workers by providing SSH host, username, and path to a private key file.
- **FR-041**: The hub MUST connect to remote workers using SSH key-based authentication (no password authentication).
- **FR-042**: All communication between hub and remote workers MUST travel over the encrypted SSH connection.
- **FR-043**: The hub MUST perform periodic health checks on remote workers and update their status accordingly.
- **FR-044**: Sessions MUST be assignable to specific workers (local or remote) at creation time.
- **FR-045**: Terminal output from remote worker sessions MUST stream to the dashboard in real time via the existing WebSocket infrastructure.

#### Frontend
- **FR-050**: When authentication is enabled and no valid cookie exists, the frontend MUST display a license key entry screen instead of the dashboard.
- **FR-051**: Upon receiving a 401 response from any API call, the frontend MUST redirect the user to the license key entry screen.
- **FR-052**: The license key entry screen MUST display clear error messages for invalid keys, expired keys, and rate-limit blocks.

### Key Entities

- **License Key**: A cryptographically signed token encoding customer email, plan tier, maximum concurrent sessions, expiry date, and issue date. Validated offline using an embedded public key.
- **Auth Config**: A singleton record storing the JWT signing secret (generated on first run) and a hash of the activated license key. Persisted in the local database.
- **Session Cookie**: An HTTP-only token issued after license validation, encoding user email, plan, and license expiry. Valid for 30 days.
- **Remote Worker**: A machine accessible via SSH that runs Claude sessions on behalf of the hub. Identified by SSH host, username, and private key path.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Local users can install and start using AgentIDE in under 2 minutes (install + first dashboard load) with no configuration required.
- **SC-002**: Users accessing the hub remotely are always prompted for a license key before seeing any dashboard content or data.
- **SC-003**: An attacker without a valid license key cannot access any API endpoint, WebSocket connection, or dashboard content when the hub is in remote mode.
- **SC-004**: Brute-force license key guessing is blocked after 5 attempts within 15 minutes, with no impact on legitimate users after the cooldown period.
- **SC-005**: HTTPS connections work correctly with both user-provided and self-signed certificates.
- **SC-006**: Remote workers connected via SSH private key can run Claude sessions with terminal output streaming at the same responsiveness as local sessions.
- **SC-007**: The license validation process completes in under 1 second (offline, no network calls).
- **SC-008**: The CLI provides clear help text and error messages, allowing users to self-serve without documentation for basic operations.

## Assumptions

- Users have Node.js 20 LTS or later installed on their machine.
- The `claude` CLI (Claude Code) is installed and available in PATH on any machine that will run sessions (local or remote).
- SSH private keys used for remote workers are in OpenSSH format and are not passphrase-protected (passphrase support is out of scope for initial release).
- The signing keypair for license generation is managed by the product owner outside this system. Only the public key is embedded in the shipped product.
- One license key = one admin user. Multi-user/team access is out of scope for this feature.
- The product will be distributed via npm registry. Other distribution channels (Docker, Homebrew, curl installer) are out of scope for this feature.

## Scope Boundaries

### In Scope
- Cryptographically signed license key validation (offline)
- License key as sole auth credential (cookie-based sessions)
- HTTPS with self-signed or user-provided certificates
- CLI entry point (`agentide start`, `agentide activate`)
- Auth middleware for API and WebSocket
- Rate limiting on license validation endpoint
- Frontend license gate page
- Remote workers via SSH private key (existing infrastructure refinement)

### Out of Scope
- Multi-user/team management and roles
- OAuth, SSO, or third-party auth providers
- Payment processing or subscription management
- Auto-renewal of licenses
- Automatic certificate provisioning (e.g., Let's Encrypt)
- Docker/Homebrew/curl distribution
- VPN or tunneling solutions
- License revocation server
- Passphrase-protected SSH keys
