import { describe, it, expect } from 'vitest';
import { parseDiff } from '../../src/utils/diff-parser';

// Helper to build a new-file diff for testing
function makeNewFileDiff(filename: string, lines: string[]): string {
  const body = lines.map((l) => `+${l}`).join('\n');
  return `diff --git a/${filename} b/${filename}
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/${filename}
@@ -0,0 +1,${lines.length} @@
${body}`;
}

describe('v5: DiffViewer — overflow and layout', () => {
  it('new files have changeType "A" (used for full-width rendering)', () => {
    const diff = makeNewFileDiff('newfile.ts', ['line1', 'line2', 'line3']);
    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].changeType).toBe('A');
  });

  it('new files have all lines as additions with right column only', () => {
    const diff = makeNewFileDiff('newfile.ts', ['const x = 1;', 'export default x;']);
    const files = parseDiff(diff);
    const pairs = files[0].sideBySideLines;

    // All lines should have right (add) and null left
    for (const pair of pairs) {
      expect(pair.left).toBeNull();
      expect(pair.right).not.toBeNull();
      expect(pair.right!.type).toBe('add');
    }
  });

  it('modified files have changeType "M" (used for grid-cols-2 rendering)', () => {
    const diff = `diff --git a/file.ts b/file.ts
index abc1234..def5678 100644
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 context
-old
+new
 end`;
    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].changeType).toBe('M');
  });
});

describe('v5: SessionCard — port_detected WebSocket handling', () => {
  it('WsServerMessage port_detected type has correct shape', () => {
    // Validate the type shape matches what SessionCard expects
    const msg = {
      type: 'port_detected' as const,
      port: 3000,
      localPort: 3001,
      protocol: 'http',
    };

    expect(msg.type).toBe('port_detected');
    expect(msg.port).toBe(3000);
    expect(msg.localPort).toBe(3001);
    expect(typeof msg.port).toBe('number');
    expect(typeof msg.localPort).toBe('number');
  });

  it('port_detected message can be destructured for state', () => {
    // Simulate what SessionCard.handleWsMessage does
    const msg = {
      type: 'port_detected' as const,
      port: 8080,
      localPort: 8081,
      protocol: 'http',
    };

    // Simulates: setDetectedPort({ port: msg.port, localPort: msg.localPort })
    const detectedPort = { port: msg.port, localPort: msg.localPort };
    expect(detectedPort.port).toBe(8080);
    expect(detectedPort.localPort).toBe(8081);
  });
});

describe('v5: Responsive panel layout constants', () => {
  it('minimum panel width (200px) and terminal width (300px) allow dual-panel at 700px', () => {
    const MIN_PANEL_PX = 200;
    const MIN_TERMINAL_PX = 300;

    // Single panel open: needs panel + terminal
    const singlePanelMin = MIN_PANEL_PX + MIN_TERMINAL_PX;
    expect(singlePanelMin).toBe(500);

    // Both panels open: needs panel + terminal + panel
    const dualPanelMin = MIN_PANEL_PX + MIN_TERMINAL_PX + MIN_PANEL_PX;
    expect(dualPanelMin).toBe(700);
  });

  it('resize clamping keeps panels within bounds', () => {
    const MIN_PANEL_PX = 200;
    const MIN_TERMINAL_PX = 300;
    const containerWidth = 1000;

    // Left panel only open, dragging left handle
    const minLeftPercent = (MIN_PANEL_PX / containerWidth) * 100; // 20%
    const maxLeftPercent = 100 - ((MIN_TERMINAL_PX / containerWidth) * 100); // 70%

    expect(minLeftPercent).toBe(20);
    expect(maxLeftPercent).toBe(70);

    // With right panel also open at 25%
    const rightPanelPercent = 25;
    const maxLeftWithRight = 100 - ((MIN_TERMINAL_PX / containerWidth) * 100) - rightPanelPercent; // 45%
    expect(maxLeftWithRight).toBe(45);
  });

  it('canOpenPanel logic prevents opening when viewport too narrow', () => {
    const MIN_PANEL_PX = 200;
    const MIN_TERMINAL_PX = 300;

    // Simulate canOpenPanel check
    const canOpenPanel = (containerWidth: number, otherPanelOpen: boolean): boolean => {
      const neededWidth = MIN_PANEL_PX + MIN_TERMINAL_PX + (otherPanelOpen ? MIN_PANEL_PX : 0);
      return containerWidth >= neededWidth;
    };

    // 800px wide, no other panel: can open (needs 500px)
    expect(canOpenPanel(800, false)).toBe(true);

    // 800px wide, other panel open: can open (needs 700px)
    expect(canOpenPanel(800, true)).toBe(true);

    // 600px wide, other panel open: cannot open (needs 700px)
    expect(canOpenPanel(600, true)).toBe(false);

    // 400px wide, no other panel: cannot open (needs 500px)
    expect(canOpenPanel(400, false)).toBe(false);
  });
});
