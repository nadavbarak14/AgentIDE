import pino from 'pino';
import { v4 as uuid } from 'uuid';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

export function createSessionLogger(sessionId: string) {
  return logger.child({ sessionId, correlationId: uuid() });
}

export function createWorkerLogger(workerId: string) {
  return logger.child({ workerId, correlationId: uuid() });
}
