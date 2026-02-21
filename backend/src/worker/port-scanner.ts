import { execSync } from 'node:child_process';
// import { logger } from '../services/logger.js';

export interface DetectedPort {
  port: number;
  pid: number;
  process: string;
}

/**
 * Scan for listening TCP ports on the local machine.
 * Uses lsof to find processes listening on TCP ports.
 */
export function scanPorts(filterPids?: number[]): DetectedPort[] {
  try {
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
      if (filterPids && filterPids.length > 0 && !filterPids.includes(pid)) continue;

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
