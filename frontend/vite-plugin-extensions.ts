import { Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Vite plugin that serves extension static files and generates an index.json
 * listing all valid extensions. In dev mode, serves /extensions/* from the
 * extensions/ directory. At build time, copies extension UI files to dist/.
 */
export function extensionsPlugin(): Plugin {
  const extensionsDir = path.resolve(__dirname, '..', 'extensions');

  function scanExtensions(): string[] {
    if (!fs.existsSync(extensionsDir)) return [];
    const entries = fs.readdirSync(extensionsDir, { withFileTypes: true });
    const names: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(extensionsDir, entry.name, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        names.push(entry.name);
      }
    }
    return names.sort();
  }

  function writeIndex(): void {
    const names = scanExtensions();
    const indexPath = path.join(extensionsDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify({ extensions: names }, null, 2) + '\n');
  }

  return {
    name: 'vite-plugin-extensions',

    configureServer(server) {
      // Generate index.json on dev server start
      writeIndex();

      // Serve extension files at /extensions/*
      server.middlewares.use('/extensions', (req, res, next) => {
        if (!req.url) return next();
        const filePath = path.join(extensionsDir, req.url);
        // Prevent path traversal
        if (!filePath.startsWith(extensionsDir)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const mimeTypes: Record<string, string> = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.svg': 'image/svg+xml',
          };
          res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
          fs.createReadStream(filePath).pipe(res);
        } else {
          next();
        }
      });
    },

    buildStart() {
      // Regenerate index.json at build time
      writeIndex();
    },

    generateBundle() {
      // Copy extension UI files to dist/extensions/
      const names = scanExtensions();
      for (const name of names) {
        const extDir = path.join(extensionsDir, name);

        // Copy index.json
        const indexContent = JSON.stringify({ extensions: names }, null, 2) + '\n';
        this.emitFile({
          type: 'asset',
          fileName: 'extensions/index.json',
          source: indexContent,
        });

        // Copy manifest.json
        const manifestPath = path.join(extDir, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          this.emitFile({
            type: 'asset',
            fileName: `extensions/${name}/manifest.json`,
            source: fs.readFileSync(manifestPath, 'utf-8'),
          });
        }

        // Copy ui/ directory
        const uiDir = path.join(extDir, 'ui');
        if (fs.existsSync(uiDir)) {
          copyDirToBundle(this, uiDir, `extensions/${name}/ui`);
        }
      }
    },
  };
}

function copyDirToBundle(ctx: { emitFile: (file: { type: 'asset'; fileName: string; source: string | Uint8Array }) => void }, dir: string, prefix: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const outPath = `${prefix}/${entry.name}`;
    if (entry.isFile()) {
      ctx.emitFile({
        type: 'asset',
        fileName: outPath,
        source: fs.readFileSync(fullPath),
      });
    } else if (entry.isDirectory()) {
      copyDirToBundle(ctx, fullPath, outPath);
    }
  }
}
