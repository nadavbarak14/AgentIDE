# Quickstart: E2E Release Tests

**Branch**: `019-e2e-release-tests` | **Date**: 2026-02-23

## Prerequisites

- Node.js 20 LTS
- npm (comes with Node.js)
- Git

## Setup

```bash
# Install Playwright (dev dependency)
npm install -D @playwright/test

# Install browser binaries (Chromium only)
npx playwright install chromium
```

## Running Tests

```bash
# Run all browser E2E tests (headless)
npm run test:release:browser

# Run with visible browser (for debugging)
npx playwright test --config release-tests/browser/playwright.config.ts --headed

# Run a specific test file
npx playwright test --config release-tests/browser/playwright.config.ts session-lifecycle

# Run with trace viewer on failure
npx playwright test --config release-tests/browser/playwright.config.ts --trace on

# View last test report
npx playwright show-report
```

## Running Full Release Suite (API + Browser)

```bash
# Run everything
npm run test:release:all

# Which runs:
# 1. npm run test:release          (Vitest: smoke, install, e2e, upgrade, config)
# 2. npm run test:release:browser  (Playwright: browser E2E tests)
```

## Test File Structure

```
release-tests/browser/
├── playwright.config.ts        # Playwright configuration
├── global-setup.ts             # Server startup (runs once)
├── global-teardown.ts          # Server shutdown (runs once)
├── fixtures.ts                 # Shared Playwright fixtures (git repos, cleanup)
├── session-lifecycle.spec.ts   # P1: Session create/queue/activate/kill
├── file-browser.spec.ts        # P1: Files panel, file tree, editor
├── git-diff.spec.ts            # P2: Git panel, diff rendering
├── zoom-shortcuts.spec.ts      # P2: Zoom controls, keyboard chords
├── panel-persistence.spec.ts   # P3: Panel state across session switches
└── diff-comments.spec.ts       # P3: Comment add/edit/delete workflow
```

## Debugging Failed Tests

```bash
# Screenshots saved automatically on failure to:
# release-tests/browser/test-results/

# View trace file interactively:
npx playwright show-trace release-tests/browser/test-results/<test-name>/trace.zip

# Keep temp server running for manual inspection:
RELEASE_KEEP_TEMP=true npm run test:release:browser
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RELEASE_KEEP_TEMP` | `false` | Keep temp dirs and server after tests |
| `RELEASE_TARBALL` | (none) | Use pre-built tarball instead of `npm pack` |
| `HEADED` | `false` | Run with visible browser window |
