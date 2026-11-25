import pino, { type DestinationStream, type Logger } from 'pino';
import { config } from './config.js';

export function createLogger(
  level: string = config.logLevel,
  destination?: DestinationStream
): Logger {
  const options: pino.LoggerOptions = {
    level,
    base: { service: 'store-ops-console' },
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers["x-csrf-token"]',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
        'req.body.password',
        'req.body.currentPassword',
        'req.body.newPassword',
        'req.body.customerPhone',
        '*.customerPhone',
      ],
      censor: '[REDACTED]',
    },
  };

  return destination ? pino(options, destination) : pino(options);
}

export const logger = createLogger();
