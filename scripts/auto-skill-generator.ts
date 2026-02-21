/**
 * Auto-skill generator for extensions.
 * Generates 3 skills per extension with a panel:
 *   <ext-name>.open    — opens the extension panel
 *   <ext-name>.comment — prompts user for feedback (inspect mode)
 *   <ext-name>.select-text — enables text selection feedback
 *
 * This is a Node build-time script (writes to disk), NOT a frontend module.
 */

import * as fs from 'fs';
import * as path from 'path';

interface ManifestPanel {
  entry: string;
  defaultPosition: string;
  icon: string;
}

interface Manifest {
  name: string;
  displayName: string;
  panel?: ManifestPanel;
}

const SKILLS_DIR = path.resolve(process.cwd(), '.claude-skills', 'skills');

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeSkill(skillDir: string, skillMd: string, scriptName: string, scriptContent: string): void {
  ensureDir(skillDir);
  ensureDir(path.join(skillDir, 'scripts'));
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd);
  const scriptPath = path.join(skillDir, 'scripts', scriptName);
  fs.writeFileSync(scriptPath, scriptContent);
  fs.chmodSync(scriptPath, '755');
}

export function generateAutoSkills(manifest: Manifest): void {
  if (!manifest.panel) return;

  const name = manifest.name;
  const displayName = manifest.displayName;

  // <ext-name>.open
  writeSkill(
    path.join(SKILLS_DIR, `${name}.open`),
    `---
name: ${name}.open
description: Open the ${displayName} extension panel
---

# ${name}.open

Opens the ${displayName} panel in the IDE.

## Usage

\`\`\`bash
./scripts/${name}.open.sh
\`\`\`
`,
    `${name}.open.sh`,
    `#!/bin/bash
# Auto-generated skill: open ${displayName} panel
curl -s "http://localhost:\${C3_HUB_PORT}/api/sessions/\${C3_SESSION_ID}/board-command" \\
  -H 'Content-Type: application/json' \\
  -d '{"command":"show_panel","params":{"panel":"ext:${name}"}}' > /dev/null

echo "Opened ${displayName} panel"
`,
  );

  // <ext-name>.comment
  writeSkill(
    path.join(SKILLS_DIR, `${name}.comment`),
    `---
name: ${name}.comment
description: Ask the user for feedback on the ${displayName} extension
---

# ${name}.comment

Opens the ${displayName} panel and enables inspect mode so the user can select an element and comment.

## Usage

\`\`\`bash
./scripts/${name}.comment.sh [screen-name]
\`\`\`

## Parameters

- \`screen-name\` (optional): Navigate to a specific screen before enabling inspect mode.
`,
    `${name}.comment.sh`,
    `#!/bin/bash
# Auto-generated skill: prompt user for feedback on ${displayName}
SCREEN="\${1:-}"
PARAMS='{"extension":"${name}"}'
if [ -n "$SCREEN" ]; then
  PARAMS='{"extension":"${name}","screen":"'"$SCREEN"'"}'
fi

curl -s "http://localhost:\${C3_HUB_PORT}/api/sessions/\${C3_SESSION_ID}/board-command" \\
  -H 'Content-Type: application/json' \\
  -d '{"command":"ext.comment","params":'"$PARAMS"'}' > /dev/null

echo "Requested feedback on ${displayName}"
`,
  );

  // <ext-name>.select-text
  writeSkill(
    path.join(SKILLS_DIR, `${name}.select-text`),
    `---
name: ${name}.select-text
description: Enable text selection mode in the ${displayName} extension
---

# ${name}.select-text

Opens the ${displayName} panel and enables text selection mode. The user can select text and send it as a comment with context.

## Usage

\`\`\`bash
./scripts/${name}.select-text.sh
\`\`\`
`,
    `${name}.select-text.sh`,
    `#!/bin/bash
# Auto-generated skill: enable text selection on ${displayName}
curl -s "http://localhost:\${C3_HUB_PORT}/api/sessions/\${C3_SESSION_ID}/board-command" \\
  -H 'Content-Type: application/json' \\
  -d '{"command":"ext.select_text","params":{"extension":"${name}"}}' > /dev/null

echo "Text selection enabled on ${displayName}"
`,
  );

  console.info(`[auto-skills] Generated 3 skills for "${name}": ${name}.open, ${name}.comment, ${name}.select-text`);
}

export function cleanupAutoSkills(activeExtensions: string[]): void {
  if (!fs.existsSync(SKILLS_DIR)) return;

  const autoSuffixes = ['.open', '.comment', '.select-text'];
  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const isAutoSkill = autoSuffixes.some((s) => entry.name.endsWith(s));
    if (!isAutoSkill) continue;

    // Extract extension name
    const extName = autoSuffixes.reduce((n, s) => n.replace(new RegExp(s.replace('.', '\\.') + '$'), ''), entry.name);
    if (!activeExtensions.includes(extName)) {
      const skillPath = path.join(SKILLS_DIR, entry.name);
      fs.rmSync(skillPath, { recursive: true, force: true });
      console.info(`[auto-skills] Cleaned up stale skill "${entry.name}"`);
    }
  }
}
