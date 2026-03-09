# Feature Specification: Mobile View Support & Secure VPS Access

**Feature Branch**: `029-mobile-secure-access`
**Created**: 2026-03-09
**Status**: Draft
**Input**: User description: "mobile view support so it can easily be used from phone. For accessing hub that is online from VPS you need a password, that is like a private key, we might have implemented some before, we need it the most secured"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Secure Auto-Generated Key Access to VPS-Hosted Hub (Priority: P1)

A developer runs Adyx on a VPS and needs to access it remotely from any device. On first startup, the system automatically generates a cryptographically strong access key (64+ character random string, like a private key — not a human-memorable password). The key is displayed once in the terminal output so the operator can copy it. It is stored securely hashed in the database — the plaintext is never persisted. When accessing the hub from a browser over the network, users paste the key into a login screen. Localhost connections bypass authentication entirely.

**Why this priority**: Without authentication, the hub is completely open to anyone who knows the VPS IP and port. This is the highest security risk and blocks all remote usage, including mobile access.

**Independent Test**: Can be fully tested by starting the hub, copying the generated key from terminal output, attempting to access it without the key (should be blocked), then pasting the correct key (should grant access). Delivers secure remote access as standalone value.

**Acceptance Scenarios**:

1. **Given** the hub is started for the first time (no key exists in database), **When** it starts up, **Then** it auto-generates a cryptographically random access key (minimum 256 bits of entropy, 64+ characters), displays it in the terminal output, and stores its hash in the database.
2. **Given** a key exists, **When** a user navigates to the hub URL from a non-localhost address without authenticating, **Then** they see only a login screen with a single input field labeled for pasting the access key — no hub content is visible.
3. **Given** a user pastes the correct access key on the login screen, **Then** they are granted access to the full hub dashboard and the session persists across browser restarts (30-day cookie).
4. **Given** the hub is accessed from localhost (127.0.0.1 or ::1), **When** the user navigates to the hub URL, **Then** they are granted immediate access without any authentication prompt.
5. **Given** a user has an active authenticated session, **When** they close the browser and reopen it within 30 days, **Then** they remain authenticated without re-entering the key.
6. **Given** a user enters an incorrect key 5 times within 15 minutes, **When** they attempt a 6th entry, **Then** they are temporarily locked out with a clear message indicating the cooldown period.
7. **Given** the hub restarts, **When** a previously authenticated user accesses the hub, **Then** their session remains valid (the key hash persists across restarts).

---

### User Story 2 - Mobile-Friendly Dashboard View (Priority: P2)

A developer accesses Adyx from their phone browser to monitor running sessions, check statuses, and perform quick actions (start/stop sessions, view output). The dashboard adapts to small screens: session cards stack vertically, navigation is thumb-friendly, and text is readable without zooming. This is the primary mobile use case — quick monitoring and lightweight management, not full IDE editing.

**Why this priority**: Once secure access exists (P1), users need a usable mobile experience. The dashboard is the entry point and the most common view for mobile users who want to check on their sessions.

**Independent Test**: Can be fully tested by accessing the dashboard on a phone-sized viewport (375px wide) and verifying cards stack, text is readable, and core actions (start, stop, view session) are accessible via touch.

**Acceptance Scenarios**:

1. **Given** a user accesses the dashboard on a phone (viewport < 640px), **When** the page loads, **Then** session cards display in a single-column vertical stack with all critical information visible (session name, status, duration).
2. **Given** a user accesses the dashboard on a phone, **When** they tap a session card, **Then** they can view session details and perform basic actions (stop, restart) via touch-friendly buttons (minimum 44x44px tap targets).
3. **Given** a user accesses the dashboard on a tablet (viewport 640px–1024px), **When** the page loads, **Then** session cards display in a 2-column grid layout.
4. **Given** a user is on the mobile dashboard, **When** they pull down or tap a refresh control, **Then** the session list updates with current statuses.
5. **Given** a user accesses the dashboard on a phone, **When** they view the navigation, **Then** all navigation elements are accessible without horizontal scrolling.

---

### User Story 3 - Mobile Session Viewer (Priority: P3)

A developer taps into a specific session from the mobile dashboard to view its terminal output (read-only scrollback), recent file changes, and git status. The view is optimized for reading — no inline code editing or terminal input on mobile. Users can scroll through terminal history, see which files changed, and read git diffs.

**Why this priority**: After monitoring sessions (P2), users often want to inspect what a session is doing. Read-only viewing is practical on mobile, while full editing requires a desktop.

**Independent Test**: Can be fully tested by tapping into a session on a phone, scrolling terminal output, and viewing file change summaries. Delivers session inspection value without requiring any editing capability.

**Acceptance Scenarios**:

1. **Given** a user taps a session card on mobile, **When** the session detail view opens, **Then** they see a read-only terminal output view that fills the screen width and is vertically scrollable.
2. **Given** a user is viewing a session on mobile, **When** they scroll through terminal output, **Then** the scrolling is smooth and performant (no janky rendering or excessive memory use).
3. **Given** a user is viewing a session on mobile, **When** they tap a "Files" tab, **Then** they see a list of recently changed files with change summaries.
4. **Given** a user is viewing a session on mobile, **When** they tap a changed file, **Then** they see a readable diff view that adapts to the narrow screen (unified diff, horizontal scroll for long lines).

---

### Edge Cases

- What happens when the browser has an expired authentication cookie? User is redirected to the login screen with a clear "session expired" message.
- What happens when the server restarts while a user is authenticated? The key hash persists in the database, so existing cookies remain valid.
- What happens when multiple users access the hub simultaneously with the same key? All users share the same access — the key is a shared secret, not per-user.
- What happens when a mobile user rotates their phone from portrait to landscape? The layout adapts fluidly — dashboard switches between 1 and 2 columns; session viewer adjusts width.
- What happens when a user on a very slow mobile connection loads the dashboard? The dashboard renders progressively — session list appears first, then status updates stream in via WebSocket.
- What happens when the user accesses the hub via a reverse proxy (nginx, Cloudflare)? Authentication still works because the key is validated via cookie, not IP address. The localhost bypass checks the request's actual origin.

## Requirements *(mandatory)*

### Functional Requirements

**Authentication & Security**

- **FR-001**: System MUST auto-generate a cryptographically random access key (minimum 256 bits of entropy, 64+ characters, base64url-encoded) on first startup when no key exists in the database.
- **FR-002**: System MUST display the generated access key in the terminal output at startup, clearly labeled and easy to copy.
- **FR-003**: System MUST store the access key as a secure hash (using a slow, salted hashing algorithm with high work factor) — the plaintext key MUST never be persisted.
- **FR-004**: System MUST present a login screen to unauthenticated users accessing from non-localhost addresses, with a paste-friendly input field for the access key.
- **FR-005**: System MUST bypass authentication entirely for requests originating from localhost (127.0.0.1, ::1, or via the loopback interface).
- **FR-006**: System MUST issue a secure, HttpOnly, SameSite=Strict authentication cookie upon successful key entry, valid for 30 days.
- **FR-007**: System MUST validate the authentication cookie on every non-localhost request to protected routes, redirecting to the login screen if invalid or expired.
- **FR-008**: System MUST rate-limit failed authentication attempts to 5 per 15 minutes per IP address, responding with a clear lockout message after exceeding the limit.
- **FR-009**: System MUST block access to all API endpoints and WebSocket connections for unauthenticated non-localhost requests.
- **FR-010**: System MUST serve the login page and its static assets without requiring authentication.

**Mobile View — Dashboard**

- **FR-011**: Dashboard MUST display session cards in a single-column layout on viewports narrower than 640px.
- **FR-012**: Dashboard MUST display session cards in a 2-column layout on viewports between 640px and 1024px.
- **FR-013**: Dashboard MUST maintain the existing multi-column layout on viewports wider than 1024px.
- **FR-014**: All interactive elements on mobile MUST have a minimum tap target size of 44x44 pixels per accessibility guidelines.
- **FR-015**: Dashboard navigation MUST be fully usable without horizontal scrolling on any supported viewport width.
- **FR-016**: Session cards on mobile MUST display session name, status indicator, and duration without truncation.

**Mobile View — Session Detail**

- **FR-017**: Session detail view on mobile MUST show terminal output as a read-only, vertically scrollable view (no interactive terminal input).
- **FR-018**: Session detail view on mobile MUST provide tab-based navigation between terminal output, file changes, and git diff views.
- **FR-019**: File diff view on mobile MUST use a unified diff format with horizontal scrolling for long lines.
- **FR-020**: Session detail view on mobile MUST support pull-to-refresh or a visible refresh button for updating session status.

### Key Entities

- **Access Key**: An auto-generated, cryptographically random string (256+ bits, 64+ characters). Generated once on first startup, displayed in terminal, stored only as a secure salted hash. Acts like a private key — too long to guess, meant to be copied and pasted.
- **Authentication Session**: A signed, HttpOnly cookie binding a browser to a validated access key. Expires after 30 days.
- **Viewport Breakpoint**: Three tiers — mobile (< 640px), tablet (640px–1024px), desktop (> 1024px) — determining layout behavior.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users accessing the hub from a non-localhost address cannot view any hub content without entering the correct access key.
- **SC-002**: Users accessing from localhost experience zero authentication friction — no login screen, no key entry.
- **SC-003**: Authenticated sessions persist for 30 days without requiring re-authentication, including across server restarts.
- **SC-004**: Users on a phone-sized screen (375px wide) can view all active sessions, check statuses, and start/stop sessions without zooming or horizontal scrolling.
- **SC-005**: Users on a phone can view terminal output of any session with smooth scrolling and readable text.
- **SC-006**: Failed login attempts are rate-limited, with lockout occurring after 5 incorrect attempts within 15 minutes.
- **SC-007**: All mobile interactive elements meet the 44x44px minimum tap target accessibility standard.

## Assumptions

- The access key is a shared secret — there is no per-user account system. Anyone with the key has full access. This aligns with the single-operator nature of a personal dev tool hosted on a VPS.
- The existing `isLocalhost` detection in `hub-entry.ts` provides the foundation for localhost bypass logic.
- Mobile users primarily need monitoring and read-only inspection. Full IDE features (Monaco editor, interactive terminal input, file tree browsing) are desktop-only experiences.
- The authentication cookie uses a server-side secret for signing, ensuring cookies cannot be forged.
- The existing database schema will be extended with an `auth_config` table to persist the key hash and related settings.
- Rate limiting is per-IP, using in-memory tracking (no database writes for rate-limit state).
- The login page is a simple, self-contained page that loads without any of the main hub's JavaScript bundles.
