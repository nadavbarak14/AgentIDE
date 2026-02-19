import { logger } from './logger.js';
import type { BoardCommand, BoardCommandType } from '../models/types.js';

// OSC escape sequence: ESC ] 1337 ; C3Cmd=<command> [;key=value...] BEL
const ESC = '\x1b';
const BEL = '\x07';
// eslint-disable-next-line no-control-regex
const OSC_PATTERN = new RegExp(`${ESC}\\]1337;C3Cmd=([^;${BEL}]+)((?:;[^${BEL}]*)?)${BEL}`, 'g');

/**
 * Parses OSC escape sequences from terminal output to extract board commands.
 * Handles buffering for sequences that may be split across data chunks.
 */
export class TerminalParser {
  private buffer = '';

  /**
   * Parse terminal data for board commands.
   * Returns any complete commands found and buffers incomplete sequences.
   */
  parse(data: string): BoardCommand[] {
    this.buffer += data;
    const commands: BoardCommand[] = [];

    // Find all complete OSC sequences
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    OSC_PATTERN.lastIndex = 0;
    while ((match = OSC_PATTERN.exec(this.buffer)) !== null) {
      const commandType = match[1] as BoardCommandType;
      const paramsStr = match[2]; // ;key=value;key2=value2 or empty
      const params: Record<string, string> = {};

      if (paramsStr) {
        // Split on ; and parse key=value pairs
        const parts = paramsStr.split(';').filter(Boolean);
        for (const part of parts) {
          const eqIdx = part.indexOf('=');
          if (eqIdx > 0) {
            params[part.substring(0, eqIdx)] = part.substring(eqIdx + 1);
          }
        }
      }

      commands.push({ type: commandType, params });
      lastIndex = match.index + match[0].length;
    }

    // Keep any potential incomplete sequence in buffer
    // Look for an incomplete OSC start (\x1b] or \x1b]1337;C3Cmd=...) at the end
    if (lastIndex > 0) {
      this.buffer = this.buffer.substring(lastIndex);
    }

    // Trim buffer if it's getting too long and has no partial sequence
    const escIdx = this.buffer.lastIndexOf('\x1b');
    if (escIdx === -1 && this.buffer.length > 1024) {
      this.buffer = '';
    } else if (escIdx >= 0 && escIdx < this.buffer.length - 256) {
      // Stale partial sequence — discard
      this.buffer = this.buffer.substring(escIdx);
    }

    if (commands.length > 0) {
      logger.info({ commandCount: commands.length, commands: commands.map((c) => c.type) }, 'parsed board commands');
    }

    return commands;
  }

  /** Reset the internal buffer */
  reset(): void {
    this.buffer = '';
  }
}

/**
 * Convenience function for one-shot parsing without maintaining state.
 */
export function parseTerminalOutput(
  data: string,
  existingBuffer = '',
): { commands: BoardCommand[]; remainingBuffer: string } {
  const parser = new TerminalParser();
  // Inject existing buffer
  if (existingBuffer) {
    parser.parse(existingBuffer);
  }
  const commands = parser.parse(data);
  return { commands, remainingBuffer: '' };
}
