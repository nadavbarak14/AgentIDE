<!--
  Sync Impact Report
  ===================
  Version change: 1.1.0 → 1.1.1
  Modified principles:
    - V. CI/CD Pipeline & Autonomous Merge: added rebase-only merge
      strategy, main branch protection, PR-only workflow
  Modified sections:
    - Development Workflow: added rebase-only merge requirement
    - Added Repository section with GitHub URL
  Added sections: None
  Removed sections: None
  Templates requiring updates:
    - .specify/templates/plan-template.md ✅ no update needed
    - .specify/templates/spec-template.md ✅ no update needed
    - .specify/templates/tasks-template.md ✅ updated
      (merge task specifies rebase strategy)
  Follow-up TODOs: None
-->
# ClaudeQueue Constitution

**Repository**: https://github.com/nadavbarak14/AgentIDE

## Core Principles

### I. Comprehensive Testing (NON-NEGOTIABLE)

Every feature, module, and component MUST have both unit tests
and system tests. Tests MUST exercise REAL behavior, not just mocks.
If all tests pass, the software MUST work correctly.

- All code MUST have unit tests that verify individual functions,
  methods, and components in isolation
- All features MUST have system tests (end-to-end) that verify
  complete user workflows and integration points
- Tests MUST use real dependencies wherever feasible: real databases,
  real file systems, real HTTP calls to local services
- Mocks are permitted ONLY when the real dependency is genuinely
  unavailable in test environments (third-party paid APIs, external
  SaaS); every mock MUST be justified in a comment
- The test suite MUST be the source of truth: if all tests pass,
  the feature works; if a feature breaks without a test failing,
  the test suite has a gap that MUST be fixed immediately
- Tests MUST be written before or alongside implementation;
  no code ships without passing tests
- Test coverage MUST be maintained: new code MUST NOT decrease
  overall coverage
- Tests MUST be deterministic, fast (unit), and reliable (system)
- Flaky tests MUST be fixed or quarantined immediately, never
  ignored

**Rationale**: Tests are the ultimate proof that the software works.
Mocking everything creates a false sense of safety — tests pass but
the real system breaks. Real tests catch real bugs. When passing
tests genuinely guarantee working software, the team can move fast
with confidence.

### II. UX-First Design

Every feature MUST be designed from the user's perspective before
any implementation begins.

- User workflows MUST be mapped and validated before writing code
- Features MUST solve real user problems; no feature ships without
  a clear user benefit
- Interaction flows MUST minimize user effort (fewest clicks,
  clearest paths)
- Error states MUST provide actionable guidance, not technical
  jargon
- Performance MUST meet user expectations: interfaces MUST feel
  responsive and snappy
- Accessibility MUST be considered for all user-facing features

**Rationale**: Software exists to serve users. Technical elegance
means nothing if users struggle to accomplish their goals. UX
thinking prevents building the wrong thing well.

### III. UI Quality & Consistency

All user interfaces MUST be clean, polished, and visually
consistent.

- UI components MUST follow a consistent design language (spacing,
  typography, color, layout)
- Visual hierarchy MUST guide users naturally through content and
  actions
- Interactive elements MUST provide clear feedback (hover, active,
  disabled, loading states)
- Layouts MUST be responsive and adapt gracefully across supported
  screen sizes
- UI MUST not ship with visual regressions; changes to shared
  components MUST be verified across all usage points

**Rationale**: A consistent, polished UI builds user trust and
reduces cognitive load. Inconsistent interfaces erode confidence
and increase support burden.

### IV. Simplicity

Favor the simplest solution that meets requirements.
Complexity MUST be justified.

- YAGNI: Do not build for hypothetical future requirements
- Every abstraction MUST earn its place by solving a real,
  current problem
- Prefer fewer moving parts; every dependency and layer adds
  maintenance cost
- Code MUST be readable by someone unfamiliar with the project
- When in doubt, choose the approach that is easier to test and
  easier for users to understand

**Rationale**: Simplicity improves testability, reduces bugs, speeds
onboarding, and keeps UX intuitive. Complexity is the enemy of both
reliability and usability.

### V. CI/CD Pipeline & Autonomous Merge

All code changes MUST go through a CI pipeline before merging.
The agent MUST push, wait for CI, and merge autonomously.

- The `main` branch MUST be protected; direct pushes are forbidden
- All changes to `main` MUST go through pull requests — no
  exceptions
- Only rebase merges are permitted (no merge commits, no squash);
  this keeps a linear, readable commit history
- Every branch MUST have a CI pipeline that runs the full test
  suite (unit + system tests) on push
- Pull requests MUST NOT be merged until CI passes green
- The development agent MUST push changes to the remote, wait
  for CI results, and merge the branch autonomously upon success
- CI failures MUST be investigated and fixed before re-attempting
  merge; never bypass or skip CI checks
- The CI pipeline MUST run linting, type checking, and security
  scans in addition to tests
- Branch protection rules MUST enforce: CI passage, PR approval,
  and rebase-only merge strategy

**Rationale**: CI is the automated gatekeeper that ensures only
working code reaches the main branch. Autonomous merge after green
CI removes manual bottlenecks while maintaining quality. If tests
are real (Principle I), a green CI run means the code truly works.
A protected main branch with rebase-only merges guarantees a clean,
linear history that is easy to bisect and reason about.

### VI. Frontend Plugin Quality

The frontend MUST use established, well-maintained plugins
and libraries.

- Frontend dependencies MUST be actively maintained (regular
  releases, responsive maintainers, healthy community)
- Plugins MUST be chosen for reliability and compatibility over
  feature count
- Every frontend plugin MUST be evaluated for: bundle size impact,
  accessibility support, browser compatibility, and license
- Prefer plugins with TypeScript support and strong documentation
- Avoid plugins with known security vulnerabilities; audit
  dependencies regularly
- Custom implementations are preferred over poorly-maintained
  plugins

**Rationale**: Frontend plugins directly impact user experience,
performance, and security. Poor plugin choices lead to broken UIs,
security vulnerabilities, and painful upgrade paths. Investing in
quality plugins upfront saves significant maintenance time.

### VII. Backend Security & Correctness

The backend MUST be secure by default and correct in all
operations.

- All user input MUST be validated and sanitized at system
  boundaries
- Authentication and authorization MUST be enforced on every
  endpoint
- OWASP Top 10 vulnerabilities MUST be addressed: injection,
  broken auth, data exposure, XXE, broken access control,
  misconfiguration, XSS, deserialization, vulnerable components,
  insufficient logging
- Data integrity MUST be guaranteed: transactions for multi-step
  operations, proper error rollback, no partial writes
- Secrets MUST never appear in code, logs, or error messages
- API responses MUST not leak internal implementation details or
  stack traces in production
- Dependencies MUST be scanned for known vulnerabilities regularly

**Rationale**: Security is not optional. A single vulnerability
can compromise user data, destroy trust, and have legal
consequences. Correctness prevents subtle data corruption that
erodes reliability over time.

### VIII. Observability & Logging

The system MUST have comprehensive logging that enables debugging
any issue from logs alone.

- All significant operations MUST be logged: requests, responses,
  state transitions, errors, and decisions
- Logs MUST include structured context: timestamp, correlation ID,
  user context, operation name, and relevant parameters
- Error logs MUST include sufficient context to reproduce the issue
  without accessing the running system
- Log levels MUST be used correctly: ERROR for failures requiring
  attention, WARN for degraded operation, INFO for significant
  events, DEBUG for diagnostic detail
- Sensitive data (passwords, tokens, PII) MUST never appear in logs
- Logs MUST be queryable and searchable in a centralized system
- Performance metrics MUST be captured for critical paths

**Rationale**: When something breaks in production, logs are the
first (and often only) tool for diagnosis. Comprehensive,
well-structured logging turns "it's broken, no idea why" into
"found it, here's the fix." Good observability is the difference
between a 5-minute fix and a 5-hour investigation.

## Quality Gates

- All pull requests MUST pass unit tests and system tests before
  merge
- CI pipeline MUST pass green before any branch is merged
- UI changes MUST include visual review (screenshot or live demo)
- New features MUST include user scenario documentation
- Test failures MUST block deployment; no exceptions without
  explicit sign-off
- UX review MUST be performed for any feature that changes
  user-facing behavior
- Security review MUST be performed for any feature that handles
  user data or authentication
- Log coverage MUST be verified: all error paths and critical
  operations MUST have appropriate log statements

## Development Workflow

- Feature development follows the SpecKit workflow:
  specify → clarify → plan → tasks → implement
- User stories MUST be defined with acceptance scenarios before
  implementation
- Testing and UX considerations MUST be addressed in the
  specification phase, not retrofitted
- Code reviews MUST verify adherence to all constitution principles
- Each completed user story MUST be independently testable and
  demonstrable
- After implementation, the agent MUST push the branch, wait for
  CI to pass, and merge autonomously via rebase
- All merges MUST target the `main` branch via pull request
- Merges MUST use rebase strategy only (no merge commits, no
  squash)

## Governance

- This constitution supersedes all other development practices
  and conventions
- Amendments require: (1) documented rationale, (2) team review,
  (3) version increment
- Version follows semantic versioning: MAJOR for principle changes,
  MINOR for additions, PATCH for clarifications
- All pull requests and code reviews MUST verify compliance with
  these principles
- Complexity beyond what principles allow MUST be justified in
  writing

**Version**: 1.1.1 | **Ratified**: 2026-02-16 | **Last Amended**: 2026-02-17
