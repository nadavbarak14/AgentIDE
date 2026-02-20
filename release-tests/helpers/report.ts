import fs from 'node:fs';

export interface TierResult {
  name: string;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failures: FailureDetail[];
}

export interface FailureDetail {
  testName: string;
  error: string;
  stack: string;
  duration: number;
}

export interface ReleaseReport {
  timestamp: string;
  version: string;
  nodeVersion: string;
  os: string;
  tiers: TierResult[];
  summary: {
    totalPassed: number;
    totalFailed: number;
    totalDuration: number;
    result: 'PASS' | 'FAIL';
  };
}

export function generateReport(
  vitestJsonPath: string,
  outputPath: string,
  version: string,
): ReleaseReport {
  const raw = JSON.parse(fs.readFileSync(vitestJsonPath, 'utf-8'));

  const tierMap = new Map<string, TierResult>();

  for (const file of raw.testResults || []) {
    // Extract tier name from file path (e.g., "smoke/critical-path.test.ts" → "smoke")
    const tierMatch = file.name?.match(/(?:release-tests\/)?(smoke|install|e2e|upgrade|config)\//);
    const tierName = tierMatch ? tierMatch[1] : 'unknown';

    if (!tierMap.has(tierName)) {
      tierMap.set(tierName, {
        name: tierName,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        failures: [],
      });
    }

    const tier = tierMap.get(tierName)!;
    tier.duration += file.duration || 0;

    for (const test of file.assertionResults || []) {
      if (test.status === 'passed') tier.passed++;
      else if (test.status === 'failed') {
        tier.failed++;
        tier.failures.push({
          testName: test.fullName || test.title,
          error: test.failureMessages?.join('\n') || 'Unknown error',
          stack: test.failureMessages?.join('\n') || '',
          duration: test.duration || 0,
        });
      } else tier.skipped++;
    }
  }

  const tiers = Array.from(tierMap.values());
  const totalPassed = tiers.reduce((sum, t) => sum + t.passed, 0);
  const totalFailed = tiers.reduce((sum, t) => sum + t.failed, 0);
  const totalDuration = tiers.reduce((sum, t) => sum + t.duration, 0);

  const report: ReleaseReport = {
    timestamp: new Date().toISOString(),
    version,
    nodeVersion: process.version,
    os: process.platform,
    tiers,
    summary: {
      totalPassed,
      totalFailed,
      totalDuration,
      result: totalFailed === 0 ? 'PASS' : 'FAIL',
    },
  };

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  return report;
}

export function printSummary(report: ReleaseReport): void {
  console.log('\n=== Release Test Report ===');
  console.log(`Version: ${report.version} | Node: ${report.nodeVersion} | OS: ${report.os}`);
  console.log('');
  console.log(
    'Tier'.padEnd(12) +
      'Passed'.padEnd(10) +
      'Failed'.padEnd(10) +
      'Duration'.padEnd(12),
  );
  console.log('-'.repeat(44));
  for (const tier of report.tiers) {
    console.log(
      tier.name.padEnd(12) +
        String(tier.passed).padEnd(10) +
        String(tier.failed).padEnd(10) +
        `${(tier.duration / 1000).toFixed(1)}s`.padEnd(12),
    );
  }
  console.log('-'.repeat(44));
  console.log(
    `TOTAL: ${report.summary.totalPassed} passed, ${report.summary.totalFailed} failed — ${report.summary.result}`,
  );
  console.log(`Duration: ${(report.summary.totalDuration / 1000).toFixed(1)}s`);
}
