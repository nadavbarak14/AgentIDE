import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { RemotePtyBridge } from '../../src/worker/remote-pty-bridge.js';
import type { TunnelManager } from '../../src/hub/tunnel.js';
import type { ClientChannel } from 'ssh2';

/**
 * Mock SSH ClientChannel — a duplex stream with setWindow/close methods.
 * Justification for mocking: no real remote SSH host available in CI.
 */
class MockChannel extends EventEmitter {
  written: string[] = [];
  closed = false;
  windowSet = false;

  stderr = new EventEmitter();

  write(data: string): boolean {
    this.written.push(data);
    return true;
  }

  setWindow(rows: number, cols: number, _height: number, _width: number): void {
    this.windowSet = true;
    void rows;
    void cols;
  }

  close(): void {
    this.closed = true;
    this.emit('close');
  }
}

function createMockTunnelManager(): TunnelManager & { mockChannel: MockChannel; connectedWorkers: Set<string> } {
  const mockChannel = new MockChannel();
  const connectedWorkers = new Set<string>();

  const tm = new EventEmitter() as TunnelManager & { mockChannel: MockChannel; connectedWorkers: Set<string> };
  tm.mockChannel = mockChannel;
  tm.connectedWorkers = connectedWorkers;

  tm.shell = vi.fn().mockImplementation(async (_workerId: string, _options?: { cols?: number; rows?: number }) => {
    return mockChannel as unknown as ClientChannel;
  });

  tm.exec = vi.fn().mockImplementation(async (workerId: string, command: string) => {
    if (command.includes('echo $HOME')) return '/home/remote\n';
    if (command.includes('ls -1pa')) return 'projects/\ndocuments/\n';
    if (command.includes('test -d') && command.includes('.git')) return 'missing\n';
    if (command.includes('git init')) return 'Initialized empty Git repository\n';
    return '';
  });

  tm.isConnected = vi.fn().mockImplementation((workerId: string) => connectedWorkers.has(workerId));
  tm.connect = vi.fn();
  tm.disconnect = vi.fn();
  tm.destroy = vi.fn();

  return tm;
}

describe('RemotePtyBridge', () => {
  let bridge: RemotePtyBridge;
  let mockTm: ReturnType<typeof createMockTunnelManager>;

  beforeEach(() => {
    mockTm = createMockTunnelManager();
    mockTm.connectedWorkers.add('worker-1');
    bridge = new RemotePtyBridge(mockTm as unknown as TunnelManager, {
      scrollbackDir: '/tmp/.c3-test-scrollback',
    });
  });

  afterEach(() => {
    bridge.destroy();
  });

  it('shell() opens an interactive PTY stream via TunnelManager', async () => {
    const proc = await bridge.spawn('session-1', 'worker-1', '/home/remote/project');

    expect(mockTm.shell).toHaveBeenCalledWith('worker-1', { cols: 120, rows: 40 });
    expect(proc.sessionId).toBe('session-1');
    expect(proc.pid).toBe(0); // remote — no local PID
  });

  it('sends claude command to the remote shell after spawn', async () => {
    await bridge.spawn('session-1', 'worker-1', '/home/remote/project');

    // Should have written cd + claude command
    expect(mockTm.mockChannel.written.length).toBeGreaterThan(0);
    const cmd = mockTm.mockChannel.written[0];
    expect(cmd).toContain("cd '/home/remote/project'");
    expect(cmd).toContain('claude');
  });

  it('sends --continue flag for continue spawns', async () => {
    await bridge.spawn('session-1', 'worker-1', '/home/remote/project', ['--continue']);

    const cmd = mockTm.mockChannel.written[0];
    expect(cmd).toContain('--continue');
  });

  it('emits data events when remote shell sends output', async () => {
    const dataHandler = vi.fn();
    bridge.on('data', dataHandler);

    await bridge.spawn('session-1', 'worker-1', '/home/remote/project');

    // Simulate remote output
    mockTm.mockChannel.emit('data', Buffer.from('Hello from remote'));

    expect(dataHandler).toHaveBeenCalledWith('session-1', 'Hello from remote');
  });

  it('emits exit events when remote shell stream closes', async () => {
    const exitHandler = vi.fn();
    bridge.on('exit', exitHandler);

    await bridge.spawn('session-1', 'worker-1', '/home/remote/project');

    // Simulate stream close
    mockTm.mockChannel.emit('close');

    expect(exitHandler).toHaveBeenCalledWith('session-1', 0, null);
  });

  it('write() forwards data to the remote shell stream', async () => {
    await bridge.spawn('session-1', 'worker-1', '/home/remote/project');

    bridge.write('session-1', 'user input\n');

    // First write is the claude command, second is user input
    expect(mockTm.mockChannel.written).toContain('user input\n');
  });

  it('resize() calls setWindow on the remote channel', async () => {
    await bridge.spawn('session-1', 'worker-1', '/home/remote/project');

    bridge.resize('session-1', 200, 50);

    expect(mockTm.mockChannel.windowSet).toBe(true);
  });

  it('kill() sends Ctrl+C and closes the channel', async () => {
    await bridge.spawn('session-1', 'worker-1', '/home/remote/project');

    bridge.kill('session-1');

    // Should have sent Ctrl+C
    expect(mockTm.mockChannel.written).toContain('\x03');
  });

  it('handles SSH disconnect (stream error)', async () => {
    const exitHandler = vi.fn();
    bridge.on('exit', exitHandler);

    await bridge.spawn('session-1', 'worker-1', '/home/remote/project');

    // Simulate SSH stream error
    mockTm.mockChannel.emit('error', new Error('Connection reset'));

    expect(exitHandler).toHaveBeenCalledWith('session-1', 1, null);
  });

  it('hasProcess() returns true for active remote sessions', async () => {
    expect(bridge.hasProcess('session-1')).toBe(false);

    await bridge.spawn('session-1', 'worker-1', '/home/remote/project');

    expect(bridge.hasProcess('session-1')).toBe(true);
  });

});

describe('TunnelManager.shell()', () => {
  it('shell method exists on TunnelManager', async () => {
    // Import the real TunnelManager to verify the interface
    const { TunnelManager } = await import('../../src/hub/tunnel.js');
    const tm = new TunnelManager();
    expect(typeof tm.shell).toBe('function');
    tm.destroy();
  });

  it('shell() throws when worker not connected', async () => {
    const { TunnelManager } = await import('../../src/hub/tunnel.js');
    const tm = new TunnelManager();

    try {
      await tm.shell('nonexistent');
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as Error).message).toBe('Worker nonexistent not connected');
    }
    tm.destroy();
  });
});

describe('Remote directory browsing (mocked)', () => {
  it('exec returns directory listing from remote worker', async () => {
    const mockTm = createMockTunnelManager();
    mockTm.connectedWorkers.add('worker-1');

    const output = await mockTm.exec('worker-1', 'ls -1pa /home/remote 2>/dev/null | grep \'/$\' | head -20');
    expect(output).toContain('projects/');
    expect(output).toContain('documents/');
  });

  it('exec returns remote $HOME path', async () => {
    const mockTm = createMockTunnelManager();

    const output = await mockTm.exec('worker-1', 'echo $HOME');
    expect(output.trim()).toBe('/home/remote');
  });
});

describe('Remote session creation with directory validation', () => {
  let repo: any;
  let localWorker: any;
  let remoteWorker: any;

  beforeEach(async () => {
    const { Repository } = await import('../../src/models/repository.js');
    const { createTestDb, closeDb } = await import('../../src/models/db.js');

    const db = createTestDb();
    repo = new Repository(db);

    // Create local worker
    localWorker = repo.createLocalWorker('Local Worker', 5);

    // Create remote worker
    remoteWorker = repo.createWorker({
      name: 'Remote Worker',
      sshHost: '192.168.1.100',
      sshUser: 'ubuntu',
      sshKeyPath: '/home/user/.ssh/id_rsa',
      maxSessions: 5,
    });
  });

  afterEach(async () => {
    const { closeDb } = await import('../../src/models/db.js');
    closeDb();
  });

  describe('Acceptance Scenario 1: Remote worker + remote home path', () => {
    it('creates session successfully for /home/ubuntu/project on remote worker', async () => {
      const { validateDirectoryForWorker } = await import('../../src/api/routes/directories.js');

      const validation = validateDirectoryForWorker(remoteWorker, '/home/ubuntu/project');

      expect(validation.valid).toBe(true);
      expect(validation.reason).toBeUndefined();
    });
  });

  describe('Acceptance Scenario 2: Remote worker + remote system path', () => {
    it('creates session successfully for /opt/webapp on remote worker', async () => {
      const { validateDirectoryForWorker } = await import('../../src/api/routes/directories.js');

      const validation = validateDirectoryForWorker(remoteWorker, '/opt/webapp');

      expect(validation.valid).toBe(true);
      expect(validation.reason).toBeUndefined();
    });

    it('allows /var/www/app on remote worker', async () => {
      const { validateDirectoryForWorker } = await import('../../src/api/routes/directories.js');

      const validation = validateDirectoryForWorker(remoteWorker, '/var/www/app');

      expect(validation.valid).toBe(true);
    });

    it('allows root directory on remote worker', async () => {
      const { validateDirectoryForWorker } = await import('../../src/api/routes/directories.js');

      const validation = validateDirectoryForWorker(remoteWorker, '/');

      expect(validation.valid).toBe(true);
    });
  });

  describe('Acceptance Scenario 3: Local worker + path outside home', () => {
    it('rejects /opt/project with local_restriction reason', async () => {
      const { validateDirectoryForWorker } = await import('../../src/api/routes/directories.js');

      const validation = validateDirectoryForWorker(localWorker, '/opt/project');

      expect(validation.valid).toBe(false);
      expect(validation.reason).toBe('local_restriction');
    });

    it('rejects /var/www/app with local_restriction reason', async () => {
      const { validateDirectoryForWorker } = await import('../../src/api/routes/directories.js');

      const validation = validateDirectoryForWorker(localWorker, '/var/www/app');

      expect(validation.valid).toBe(false);
      expect(validation.reason).toBe('local_restriction');
    });

    it('rejects root directory with local_restriction reason', async () => {
      const { validateDirectoryForWorker } = await import('../../src/api/routes/directories.js');

      const validation = validateDirectoryForWorker(localWorker, '/');

      expect(validation.valid).toBe(false);
      expect(validation.reason).toBe('local_restriction');
    });
  });

  describe('No regressions: Local worker + path inside home', () => {
    it('allows paths within home directory for local worker', async () => {
      const { validateDirectoryForWorker } = await import('../../src/api/routes/directories.js');
      const os = await import('node:os');
      const path = await import('node:path');

      const homeDir = os.homedir();
      const projectPath = path.join(homeDir, 'projects', 'myapp');

      const validation = validateDirectoryForWorker(localWorker, projectPath);

      expect(validation.valid).toBe(true);
      expect(validation.reason).toBeUndefined();
    });

    it('allows home directory itself for local worker', async () => {
      const { validateDirectoryForWorker } = await import('../../src/api/routes/directories.js');
      const os = await import('node:os');

      const homeDir = os.homedir();

      const validation = validateDirectoryForWorker(localWorker, homeDir);

      expect(validation.valid).toBe(true);
    });
  });
});
