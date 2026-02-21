import type { ExtensionManifest, LoadedExtension, ExtensionIndex } from './extension-types';

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function validateManifest(manifest: unknown, folderName: string): ExtensionManifest | null {
  if (!manifest || typeof manifest !== 'object') return null;
  const m = manifest as Record<string, unknown>;

  if (typeof m.name !== 'string' || !m.name) return null;
  if (typeof m.displayName !== 'string' || !m.displayName) return null;
  if (!NAME_PATTERN.test(m.name)) {
    console.warn(`[extensions] Invalid extension name "${m.name}" — must be lowercase alphanumeric + hyphens`);
    return null;
  }
  if (m.name !== folderName) {
    console.warn(`[extensions] Extension name "${m.name}" does not match folder "${folderName}"`);
    return null;
  }

  const result: ExtensionManifest = {
    name: m.name,
    displayName: m.displayName,
  };

  if (m.panel !== undefined) {
    if (typeof m.panel !== 'object' || !m.panel) return null;
    const p = m.panel as Record<string, unknown>;
    if (typeof p.entry !== 'string' || !p.entry) return null;
    if (p.defaultPosition !== 'left' && p.defaultPosition !== 'right') return null;
    if (typeof p.icon !== 'string' || !p.icon) return null;
    result.panel = {
      entry: p.entry,
      defaultPosition: p.defaultPosition,
      icon: p.icon,
    };
  }

  if (m.skills !== undefined) {
    if (!Array.isArray(m.skills)) return null;
    if (!m.skills.every((s: unknown) => typeof s === 'string' && s)) return null;
    result.skills = m.skills as string[];
  }

  if (m.boardCommands !== undefined) {
    if (!Array.isArray(m.boardCommands)) return null;
    if (!m.boardCommands.every((c: unknown) => typeof c === 'string' && c)) return null;
    result.boardCommands = m.boardCommands as string[];
  }

  return result;
}

function manifestToLoaded(manifest: ExtensionManifest): LoadedExtension {
  const panelUrl = manifest.panel
    ? `/extensions/${manifest.name}/${manifest.panel.entry}`
    : null;

  return {
    name: manifest.name,
    displayName: manifest.displayName,
    panelUrl,
    panelConfig: manifest.panel
      ? { defaultPosition: manifest.panel.defaultPosition, icon: manifest.panel.icon }
      : null,
    boardCommands: manifest.boardCommands ?? [],
    panelKey: `ext:${manifest.name}`,
  };
}

export async function loadExtensions(): Promise<LoadedExtension[]> {
  let extensionNames: string[];
  try {
    const res = await fetch('/extensions/index.json');
    if (!res.ok) {
      console.warn('[extensions] Could not fetch extensions/index.json — no extensions loaded');
      return [];
    }
    const index: ExtensionIndex = await res.json();
    extensionNames = index.extensions ?? [];
  } catch {
    console.warn('[extensions] Failed to load extensions index');
    return [];
  }

  const loaded: LoadedExtension[] = [];

  for (const name of extensionNames) {
    try {
      const res = await fetch(`/extensions/${name}/manifest.json`);
      if (!res.ok) {
        console.warn(`[extensions] Could not fetch manifest for "${name}"`);
        continue;
      }
      const raw = await res.json();
      const manifest = validateManifest(raw, name);
      if (!manifest) {
        console.warn(`[extensions] Invalid manifest for "${name}" — skipped`);
        continue;
      }
      loaded.push(manifestToLoaded(manifest));
      console.debug(`[extensions] Loaded extension "${name}"`);
    } catch {
      console.warn(`[extensions] Error loading extension "${name}"`);
    }
  }

  // Disambiguate duplicate display names
  const nameCount = new Map<string, number>();
  for (const ext of loaded) {
    const count = (nameCount.get(ext.displayName) ?? 0) + 1;
    nameCount.set(ext.displayName, count);
    if (count > 1) {
      console.warn(`[extensions] Duplicate displayName "${ext.displayName}" — disambiguating`);
      ext.displayName = `${ext.displayName} (${count})`;
    }
  }

  return loaded;
}

// Exported for testing
export { validateManifest, manifestToLoaded };
