import { execSync } from 'node:child_process';
// import { logger } from '../services/logger.js';

export interface DetectedPort {
  port: number;
  pid: number;
  process: string;
}

/**
 * Get all descendant PIDs of a given PID (including the PID itself).
 * For tmux client PIDs, also resolves the pane PIDs via `tmux list-panes`.
 */
export function getDescendantPids(rootPid: number): number[] {
  const pids = new Set<number>([rootPid]);

  try {
    // Check if this is a tmux client — if so, find the pane PIDs
    // tmux sessions created by adyx are named c3-<first-8-chars-of-session-id>
    const tmuxOutput = execSync('tmux list-panes -a -F "#{pane_pid}"', {
      encoding: 'utf-8',
      timeout: 3000,
    }).trim();

    if (tmuxOutput) {
      // Also try to find the pane PID associated with this tmux client
      // by checking all tmux sessions for this client PID
      try {
        const clientInfo = execSync(`tmux list-clients -F "#{client_pid} #{session_name}"`, {
          encoding: 'utf-8',
          timeout: 3000,
        }).trim();

        for (const line of clientInfo.split('\n')) {
          const [clientPid, sessionName] = line.trim().split(' ');
          if (parseInt(clientPid, 10) === rootPid && sessionName) {
            // Get pane PIDs for this session
            const panePids = execSync(`tmux list-panes -t "${sessionName}" -F "#{pane_pid}"`, {
              encoding: 'utf-8',
              timeout: 3000,
            }).trim();

            for (const paneLine of panePids.split('\n')) {
              const panePid = parseInt(paneLine.trim(), 10);
              if (panePid > 0) pids.add(panePid);
            }
          }
        }
      } catch {
        // tmux client lookup failed, continue with ps-based approach
      }
    }
  } catch {
    // tmux not available, continue with ps-based approach
  }

  // Walk /proc to find all descendants of collected PIDs
  try {
    const psOutput = execSync('ps -eo pid,ppid --no-headers', {
      encoding: 'utf-8',
      timeout: 3000,
    }).trim();

    // Build parent→children map
    const children = new Map<number, number[]>();
    for (const line of psOutput.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;
      const childPid = parseInt(parts[0], 10);
      const parentPid = parseInt(parts[1], 10);
      if (!children.has(parentPid)) children.set(parentPid, []);
      children.get(parentPid)!.push(childPid);
    }

    // BFS from all seed PIDs
    const queue = [...pids];
    while (queue.length > 0) {
      const current = queue.pop()!;
      const kids = children.get(current);
      if (kids) {
        for (const kid of kids) {
          if (!pids.has(kid)) {
            pids.add(kid);
            queue.push(kid);
          }
        }
      }
    }
  } catch {
    // ps failed, return what we have
  }

  return [...pids];
}

/**
 * Scan for listening TCP ports on the local machine.
 * Uses lsof to find processes listening on TCP ports.
 */
export function scanPorts(filterPids?: number[]): DetectedPort[] {
  try {
    // Expand filter PIDs to include all descendants (handles tmux process tree)
    let expandedPids: Set<number> | undefined;
    if (filterPids && filterPids.length > 0) {
      expandedPids = new Set<number>();
      for (const pid of filterPids) {
        for (const descendant of getDescendantPids(pid)) {
          expandedPids.add(descendant);
        }
      }
    }

    // WSL2: lsof works when installed (apt install lsof), graceful fallback on missing
    const output = execSync('lsof -i -P -n -sTCP:LISTEN', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    if (!output) return [];

    const lines = output.split('\n').slice(1); // skip header
    const ports: DetectedPort[] = [];
    const seen = new Set<number>();

    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 9) continue;

      const processName = parts[0];
      const pid = parseInt(parts[1], 10);
      const nameField = parts[8]; // e.g., *:5173 or 127.0.0.1:3000

      const portMatch = nameField.match(/:(\d+)$/);
      if (!portMatch) continue;

      const port = parseInt(portMatch[1], 10);

      // Skip well-known system ports
      if (port < 1024) continue;

      // Filter by PIDs if specified
      if (expandedPids && !expandedPids.has(pid)) continue;

      if (!seen.has(port)) {
        seen.add(port);
        ports.push({ port, pid, process: processName });
      }
    }

    return ports;
  } catch {
    // lsof not available or no ports found
    return [];
  }
}
