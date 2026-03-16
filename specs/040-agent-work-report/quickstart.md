# Quickstart: Agent Work Report

## Prerequisites

- Node.js 20 LTS
- `gh` CLI authenticated (for GitHub export)
- `ffmpeg` installed (for WebM→mp4 conversion; optional)

## Development

```bash
# Start the dev server (frontend + backend)
npm run dev

# Run tests
npm test

# Lint
npm run lint
```

## Extension Structure

```
extensions/work-report/
├── manifest.json                    # Extension manifest
├── ui/
│   ├── index.html                   # Extension panel entry point
│   ├── styles.css                   # Panel styles
│   └── app.js                       # Panel logic (fetch + render report)
└── skills/
    ├── report.attach-screenshot/
    │   ├── SKILL.md
    │   └── scripts/report.attach-screenshot.sh
    ├── report.attach-video/
    │   ├── SKILL.md
    │   └── scripts/report.attach-video.sh
    ├── report.attach-diff/
    │   ├── SKILL.md
    │   └── scripts/report.attach-diff.sh
    └── report.export-github/
        ├── SKILL.md
        └── scripts/report.export-github.sh
```

## Manual Testing

### 1. Verify extension loads

1. Start dev server
2. Create a new session
3. Open the right panel → "Work Report" should appear in the extension picker
4. Panel shows empty state ("No report yet")

### 2. Test report rendering

1. In the session terminal, create a report:
   ```bash
   echo '<html><body><h1>Test Report</h1><p>It works!</p></body></html>' > report.html
   ```
2. Extension panel should auto-refresh and display the report

### 3. Test attachment skills

1. Take a screenshot: `/view.screenshot`
2. Attach it: `/report.attach-screenshot /path/to/screenshot.png`
3. Skill outputs a relative path like `.report-assets/1710576000000-screenshot.png`
4. Agent writes HTML referencing that path

### 4. Test GitHub export

1. Create a report with screenshots and text
2. Run `/report.export-github`
3. Verify output is valid markdown with GitHub-hosted image URLs
4. Paste into a PR description — images should render

## Key Decisions

- **No database**: Everything is files on disk
- **Agent writes HTML**: We provide attachment tools, not a template system
- **Session-scoped**: `report.html` + `.report-assets/` cleaned up on session end
- **4 skills total**: attach-screenshot, attach-video, attach-diff, export-github
