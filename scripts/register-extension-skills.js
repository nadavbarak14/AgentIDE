#!/usr/bin/env node
/**
 * Register extension skills: auto-generates skills for extensions with panels
 * and symlinks custom skills declared in manifests.
 *
 * Usage: node scripts/register-extension-skills.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTENSIONS_DIR = path.resolve(__dirname, '..', 'extensions');
const SKILLS_DIR = path.resolve(__dirname, '..', '.claude-skills', 'skills');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readManifests() {
  if (!fs.existsSync(EXTENSIONS_DIR)) return [];
  const entries = fs.readdirSync(EXTENSIONS_DIR, { withFileTypes: true });
  const manifests = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(EXTENSIONS_DIR, entry.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (raw.name === entry.name) {
        manifests.push(raw);
      } else {
        console.warn(`[register] Skipping "${entry.name}" — name mismatch`);
      }
    } catch (err) {
      console.warn(`[register] Failed to parse manifest for "${entry.name}": ${err.message}`);
    }
  }
  return manifests;
}

function generateAutoSkill(name, displayName, action, skillMd, scriptContent) {
  const skillDir = path.join(SKILLS_DIR, `${name}.${action}`);
  ensureDir(skillDir);
  ensureDir(path.join(skillDir, 'scripts'));
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMd);
  const scriptPath = path.join(skillDir, 'scripts', `${name}.${action}.sh`);
  fs.writeFileSync(scriptPath, scriptContent);
  fs.chmodSync(scriptPath, '755');
}

function generateAutoSkills(manifest) {
  if (!manifest.panel) return;
  const name = manifest.name;
  const displayName = manifest.displayName;

  // open
  generateAutoSkill(name, displayName, 'open',
    `---\nname: ${name}.open\ndescription: Open the ${displayName} extension panel\n---\n\n# ${name}.open\n\nOpens the ${displayName} panel.\n\n## Usage\n\n\`\`\`bash\n./scripts/${name}.open.sh\n\`\`\`\n`,
    `#!/bin/bash\ncurl -s "http://localhost:\${C3_HUB_PORT}/api/sessions/\${C3_SESSION_ID}/board-command" \\\n  -H 'Content-Type: application/json' \\\n  -d '{"command":"show_panel","params":{"panel":"ext:${name}"}}' > /dev/null\necho "Opened ${displayName} panel"\n`
  );

  // comment
  generateAutoSkill(name, displayName, 'comment',
    `---\nname: ${name}.comment\ndescription: Ask the user for feedback on the ${displayName} extension\n---\n\n# ${name}.comment\n\nOpens ${displayName} and enables inspect mode.\n\n## Usage\n\n\`\`\`bash\n./scripts/${name}.comment.sh [screen-name]\n\`\`\`\n`,
    `#!/bin/bash\nSCREEN="\${1:-}"\nPARAMS='{"extension":"${name}"}'\nif [ -n "$SCREEN" ]; then\n  PARAMS='{"extension":"${name}","screen":"'"$SCREEN"'"}'\nfi\ncurl -s "http://localhost:\${C3_HUB_PORT}/api/sessions/\${C3_SESSION_ID}/board-command" \\\n  -H 'Content-Type: application/json' \\\n  -d '{"command":"ext.comment","params":'"$PARAMS"'}' > /dev/null\necho "Requested feedback on ${displayName}"\n`
  );

  // select-text
  generateAutoSkill(name, displayName, 'select-text',
    `---\nname: ${name}.select-text\ndescription: Enable text selection in ${displayName}\n---\n\n# ${name}.select-text\n\nEnables text selection mode.\n\n## Usage\n\n\`\`\`bash\n./scripts/${name}.select-text.sh\n\`\`\`\n`,
    `#!/bin/bash\ncurl -s "http://localhost:\${C3_HUB_PORT}/api/sessions/\${C3_SESSION_ID}/board-command" \\\n  -H 'Content-Type: application/json' \\\n  -d '{"command":"ext.select_text","params":{"extension":"${name}"}}' > /dev/null\necho "Text selection enabled on ${displayName}"\n`
  );

  console.info(`[register] Auto-skills: ${name}.open, ${name}.comment, ${name}.select-text`);
}

function symlinkCustomSkills(manifest) {
  if (!manifest.skills || manifest.skills.length === 0) return;
  const autoSuffixes = ['.open', '.comment', '.select-text'];

  for (const skillPath of manifest.skills) {
    const skillName = path.basename(skillPath);
    const target = path.join(SKILLS_DIR, skillName);

    // Check for conflict with built-in or auto-generated skills
    if (fs.existsSync(target)) {
      const isAutoSkill = autoSuffixes.some(s => skillName.endsWith(s));
      const isSymlink = fs.lstatSync(target).isSymbolicLink();
      if (!isSymlink || isAutoSkill) {
        console.warn(`[register] Skipping custom skill "${skillName}" — conflicts with ${isAutoSkill ? 'auto-skill' : 'built-in skill'}`);
        continue;
      }
    }

    const source = path.resolve(EXTENSIONS_DIR, manifest.name, skillPath);
    if (!fs.existsSync(source)) {
      console.warn(`[register] Skill source not found: ${source}`);
      continue;
    }

    // Create symlink
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    fs.symlinkSync(source, target, 'dir');
    console.info(`[register] Custom skill: ${skillName} → ${source}`);
  }
}

function cleanupStaleSkills(activeExtensions) {
  if (!fs.existsSync(SKILLS_DIR)) return;
  const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(SKILLS_DIR, entry.name);

    // Check if it's a symlink pointing into extensions/
    try {
      if (fs.lstatSync(fullPath).isSymbolicLink()) {
        const target = fs.readlinkSync(fullPath);
        if (target.includes('extensions/')) {
          const match = target.match(/extensions\/([^/]+)/);
          if (match && !activeExtensions.includes(match[1])) {
            fs.rmSync(fullPath, { force: true });
            console.info(`[register] Cleaned stale symlink: ${entry.name}`);
          }
        }
      }
    } catch { /* ignore */ }

    // Check auto-skills
    const autoSuffixes = ['.open', '.comment', '.select-text'];
    const isAutoSkill = autoSuffixes.some(s => entry.name.endsWith(s));
    if (isAutoSkill) {
      const extName = autoSuffixes.reduce((n, s) => n.replace(new RegExp(s.replace('.', '\\.') + '$'), ''), entry.name);
      if (!activeExtensions.includes(extName)) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.info(`[register] Cleaned stale auto-skill: ${entry.name}`);
      }
    }
  }
}

// Main
const manifests = readManifests();
const activeNames = manifests.map(m => m.name);

ensureDir(SKILLS_DIR);

// Clean stale skills first
cleanupStaleSkills(activeNames);

// Generate auto-skills and register custom skills
for (const manifest of manifests) {
  generateAutoSkills(manifest);
  symlinkCustomSkills(manifest);
}

console.info(`[register] Done. ${manifests.length} extension(s) processed.`);
