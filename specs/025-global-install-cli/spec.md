# Feature Specification: Global Install & CLI Commands

**Feature Branch**: `025-global-install-cli`
**Created**: 2026-03-06
**Status**: Draft
**Input**: User description: "Make sure there are easy commands to start the hub and remote agent, and installation makes it global. Also make sure install brings what we need (tmux, github cli) so everything works."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install Adyx Globally (Priority: P1)

A developer installs Adyx once and can run it from anywhere on their system using a single command. The installation process automatically checks for and installs required system dependencies (tmux, GitHub CLI) so the product works out of the box without manual setup steps.

**Why this priority**: Without a working installation, no other feature can be used. This is the entry point for every user.

**Independent Test**: Can be tested by running `npm install -g adyx-ide` on a fresh machine and verifying the `adyx` command is available globally and dependencies are present.

**Acceptance Scenarios**:

1. **Given** a machine with Node.js 20+ installed, **When** the user runs the global install command, **Then** the `adyx` command is available system-wide and all required dependencies are checked/installed.
2. **Given** a machine missing tmux, **When** the user runs the install or first launch, **Then** tmux is automatically installed or the user is given clear instructions to install it.
3. **Given** a machine missing GitHub CLI, **When** the user runs the install or first launch, **Then** GitHub CLI is automatically installed or the user is given clear instructions to install it.
4. **Given** a machine where all dependencies are already present, **When** the user installs Adyx, **Then** the installation completes quickly without reinstalling existing dependencies.

---

### User Story 2 - Start the Hub Server (Priority: P1)

A developer starts the Adyx hub server with a single, memorable command. The command should work immediately after global installation without needing to navigate to a specific directory.

**Why this priority**: Starting the hub is the primary action every user performs. It must be simple and reliable.

**Independent Test**: Can be tested by running `adyx start` from any directory and verifying the hub starts and is accessible in a browser.

**Acceptance Scenarios**:

1. **Given** Adyx is installed globally, **When** the user runs the hub start command from any directory, **Then** the hub server starts and displays the URL to access it.
2. **Given** the hub is already running on the default port, **When** the user tries to start another hub, **Then** the user is informed the port is in use and offered alternatives (different port or connect to existing).
3. **Given** the user wants to customize the port or host, **When** they pass options to the start command, **Then** the hub starts with the specified configuration.

---

### User Story 3 - Start the Remote Agent (Priority: P1)

A developer starts the remote agent on a worker machine with a single command. This is used on remote servers that host Claude Code sessions.

**Why this priority**: Remote agent is essential for the remote session workflow, which is a core product feature.

**Independent Test**: Can be tested by running the agent start command on a remote machine and verifying it listens for connections from the hub.

**Acceptance Scenarios**:

1. **Given** Adyx is installed on a remote machine, **When** the user runs the agent start command, **Then** the remote agent starts and listens for hub connections on the configured port.
2. **Given** the user wants to customize the agent port, **When** they pass a port option, **Then** the agent starts on the specified port.
3. **Given** the remote agent is already running, **When** the user tries to start another, **Then** the user is informed the port is in use.

---

### User Story 4 - Dependency Health Check (Priority: P2)

A developer can verify that all required dependencies are installed and working correctly, without starting any server.

**Why this priority**: Useful for troubleshooting but not required for basic operation.

**Independent Test**: Can be tested by running a doctor/check command and verifying it reports the status of each dependency.

**Acceptance Scenarios**:

1. **Given** Adyx is installed, **When** the user runs the health check command, **Then** the system reports the status of each required dependency (installed version or missing).
2. **Given** a dependency is missing, **When** the health check runs, **Then** it provides instructions or an option to install the missing dependency.

---

### Edge Cases

- What happens when the user doesn't have sudo/admin privileges needed to install system dependencies?
- What happens on unsupported operating systems (e.g., Windows without WSL)?
- What happens when npm global install path is not in the user's PATH?
- What happens when a dependency exists but is an incompatible version (e.g., very old tmux)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST be installable globally via npm (`npm install -g adyx-ide`) making the `adyx` command available system-wide.
- **FR-002**: The system MUST provide an `adyx start` command that starts the hub server with sensible defaults (port 3000, localhost binding).
- **FR-003**: The system MUST provide an `adyx agent` command that starts the remote agent with sensible defaults (port 4100).
- **FR-004**: Both `adyx start` and `adyx agent` MUST accept `--port` and `--host` options to override defaults.
- **FR-011**: The `adyx start` command MUST auto-open the browser to the hub URL by default, with a `--no-open` flag to disable this behavior.
- **FR-005**: The installation process MUST check for required system dependencies: tmux and GitHub CLI (gh).
- **FR-006**: When a required dependency is missing, the system MUST display clear, platform-specific copy-paste installation commands (no automatic sudo execution).
- **FR-007**: The system MUST provide an `adyx doctor` command that checks and reports the status of all required dependencies.
- **FR-008**: The system MUST support Linux (Ubuntu/Debian, RHEL/CentOS) and macOS for dependency auto-installation.
- **FR-009**: On Windows, the system MUST detect WSL and guide the user to run within WSL, since tmux requires a Unix environment.
- **FR-010**: The system MUST include a `postinstall` npm script that runs the dependency check automatically after `npm install -g`.
- **FR-012**: The `adyx start` and `adyx agent` commands MUST run a quick pre-flight dependency check before launching, warning the user if any required dependency is missing.

### Key Entities

- **System Dependency**: A required external tool (name, minimum version, install command per platform, verification command).
- **CLI Command**: A user-facing command (name, description, options, action).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can go from zero to a running hub in under 2 minutes on a machine with Node.js already installed.
- **SC-002**: The `adyx start` command launches the hub successfully from any working directory.
- **SC-003**: The `adyx agent` command launches the remote agent successfully from any working directory.
- **SC-004**: On a fresh Ubuntu/macOS machine, all required dependencies are resolved during installation without the user needing to search for manual instructions.
- **SC-005**: The `adyx doctor` command accurately reports the presence and version of all required dependencies within 5 seconds.

## Clarifications

### Session 2026-03-06

- Q: What flags should `adyx start` support beyond `--port` and `--host`? → A: `--port`, `--host`, and auto-open browser by default (with `--no-open` to disable).
- Q: What flags should `adyx agent` support beyond `--port` and `--host`? → A: Only `--port` and `--host` (no auth/allowlist flags).
- Q: Should dependency install be automatic (sudo) or print instructions? → A: Print platform-specific copy-paste commands (no auto-sudo). npm best practice — avoids hanging in CI and privilege surprises.
- Q: When should dependency checks run? → A: Both at postinstall and as a quick pre-flight at launch (`adyx start`/`adyx agent`).

## Assumptions

- Node.js 20+ and npm are already installed (prerequisite, not managed by Adyx).
- The user has internet access during installation for downloading dependencies.
- On Linux, the user has access to a package manager (apt, yum/dnf) and sufficient privileges (sudo) for installing system packages.
- On macOS, Homebrew is the assumed package manager. If not present, instructions are provided.
- The existing `adyx` CLI entry point (backend/src/cli.ts) and `bin` field in package.json will be extended, not replaced.
