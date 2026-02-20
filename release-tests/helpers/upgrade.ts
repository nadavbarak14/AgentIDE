import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { ReleaseEnvironment } from './environment.js';

const FIXTURES_DIR = path.resolve(import.meta.dirname, '../fixtures');

export function loadUpgradeFixture(
  env: ReleaseEnvironment,
  fixtureVersion: string,
): string {
  const fixturePath = path.join(FIXTURES_DIR, `${fixtureVersion}.db`);
  if (!fs.existsSync(fixturePath)) {
    throw new Error(
      `Upgrade fixture not found: ${fixturePath}. Available: ${fs.readdirSync(FIXTURES_DIR).join(', ')}`,
    );
  }

  const destPath = path.join(env.dataDir, 'c3.db');
  fs.copyFileSync(fixturePath, destPath);
  return destPath;
}

export interface IntegrityResult {
  tableName: string;
  expectedRows: number;
  actualRows: number;
  passed: boolean;
  details?: string;
}

export function verifyDatabaseIntegrity(
  dbPath: string,
  expectedCounts: Record<string, number>,
): IntegrityResult[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    const results: IntegrityResult[] = [];

    for (const [tableName, expectedRows] of Object.entries(expectedCounts)) {
      try {
        const row = db
          .prepare(`SELECT COUNT(*) as count FROM ${tableName}`)
          .get() as { count: number };
        const actualRows = row.count;
        results.push({
          tableName,
          expectedRows,
          actualRows,
          passed: actualRows === expectedRows,
          details:
            actualRows !== expectedRows
              ? `Expected ${expectedRows} rows, got ${actualRows}`
              : undefined,
        });
      } catch (err) {
        results.push({
          tableName,
          expectedRows,
          actualRows: -1,
          passed: false,
          details: `Error querying table: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    return results;
  } finally {
    db.close();
  }
}
