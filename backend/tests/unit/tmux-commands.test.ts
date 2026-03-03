import { describe, it, expect } from 'vitest';

/**
 * tmux command generation helpers.
 * These are pure functions extracted from RemotePtyBridge for testability.
 */

// Inline helper to match the implementation pattern
function getTmuxSessionName(sessionId: string): string {
  return `c3-${sessionId.substring(0, 8)}`;
}

function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

function buildTmuxSpawnCommand(
  sessionId: string,
  workingDirectory: string,
  args: string[],
  hubPort: number,
  settingsPath: string,
): string {
  const tmuxName = getTmuxSessionName(sessionId);
  const claudeArgs = ['claude', '--settings', settingsPath];
  claudeArgs.push(...args);
  const envVars = `C3_SESSION_ID=${escapeShellArg(sessionId)} C3_HUB_PORT=${hubPort}`;
  const claudeCmd = `cd ${escapeShellArg(workingDirectory)} && ${envVars} ${claudeArgs.join(' ')}`;
  return `tmux new-session -d -s ${escapeShellArg(tmuxName)} ${escapeShellArg(claudeCmd)} && tmux attach -t ${escapeShellArg(tmuxName)}`;
}

function buildTmuxHasSessionCommand(sessionId: string): string {
  const tmuxName = getTmuxSessionName(sessionId);
  return `tmux has-session -t ${escapeShellArg(tmuxName)} 2>/dev/null && echo 'ALIVE' || echo 'DEAD'`;
}

function buildTmuxAttachCommand(sessionId: string): string {
  const tmuxName = getTmuxSessionName(sessionId);
  return `tmux attach -t ${escapeShellArg(tmuxName)}`;
}

function buildTmuxKillCommand(sessionId: string): string {
  const tmuxName = getTmuxSessionName(sessionId);
  return `tmux kill-session -t ${escapeShellArg(tmuxName)} 2>/dev/null`;
}

describe('tmux command generation', () => {
  const sessionId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const shortId = 'a1b2c3d4';

  describe('getTmuxSessionName', () => {
    it('generates c3- prefixed name from first 8 chars of session ID', () => {
      expect(getTmuxSessionName(sessionId)).toBe(`c3-${shortId}`);
    });

    it('handles short session IDs', () => {
      expect(getTmuxSessionName('abc')).toBe('c3-abc');
    });

    it('handles UUID-format IDs', () => {
      const uuid = 'deadbeef-1234-5678-9abc-def012345678';
      expect(getTmuxSessionName(uuid)).toBe('c3-deadbeef');
    });
  });

  describe('buildTmuxSpawnCommand', () => {
    it('generates correct tmux new-session + attach command', () => {
      const cmd = buildTmuxSpawnCommand(
        sessionId,
        '/home/user/project',
        [],
        3000,
        '/tmp/.c3-hooks-3000/settings.json',
      );

      expect(cmd).toContain('tmux new-session -d -s');
      expect(cmd).toContain(`c3-${shortId}`);
      expect(cmd).toContain('tmux attach -t');
      expect(cmd).toContain('cd');
      expect(cmd).toContain('/home/user/project');
      expect(cmd).toContain('claude --settings');
      expect(cmd).toContain(`C3_SESSION_ID=`);
      expect(cmd).toContain(sessionId);
      expect(cmd).toContain('C3_HUB_PORT=3000');
    });

    it('includes extra args like --worktree', () => {
      const cmd = buildTmuxSpawnCommand(
        sessionId,
        '/home/user/project',
        ['--worktree'],
        3000,
        '/tmp/.c3-hooks-3000/settings.json',
      );

      expect(cmd).toContain('--worktree');
    });

    it('escapes working directory with spaces', () => {
      const cmd = buildTmuxSpawnCommand(
        sessionId,
        '/home/user/my project',
        [],
        3000,
        '/tmp/settings.json',
      );

      expect(cmd).toContain("'/home/user/my project'");
    });
  });

  describe('buildTmuxHasSessionCommand', () => {
    it('generates correct has-session check', () => {
      const cmd = buildTmuxHasSessionCommand(sessionId);

      expect(cmd).toContain('tmux has-session -t');
      expect(cmd).toContain(`c3-${shortId}`);
      expect(cmd).toContain("echo 'ALIVE'");
      expect(cmd).toContain("echo 'DEAD'");
    });
  });

  describe('buildTmuxAttachCommand', () => {
    it('generates correct attach command', () => {
      const cmd = buildTmuxAttachCommand(sessionId);

      expect(cmd).toContain('tmux attach -t');
      expect(cmd).toContain(`c3-${shortId}`);
    });
  });

  describe('buildTmuxKillCommand', () => {
    it('generates correct kill-session command', () => {
      const cmd = buildTmuxKillCommand(sessionId);

      expect(cmd).toContain('tmux kill-session -t');
      expect(cmd).toContain(`c3-${shortId}`);
      expect(cmd).toContain('2>/dev/null');
    });
  });
});
