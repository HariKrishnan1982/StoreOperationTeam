import { createApp } from './app.js';
import { config } from './config.js';
import { createDatabase } from './db/connection.js';
import { seedDatabase } from './db/seed.js';
import { logger } from './logger.js';
import { assertProductionSafety, cleanupExpiredRecords } from './services/authService.js';

const db = createDatabase(config.databasePath);
seedDatabase(db, { reset: false, includeSampleOrders: true });
assertProductionSafety(db, config);

const initialCleanup = cleanupExpiredRecords(db);
logger.info(initialCleanup, 'Ran startup cleanup of expired sessions and idempotency keys');

const cleanupInterval = setInterval(
  () => {
    try {
      const result = cleanupExpiredRecords(db);
      logger.info(result, 'Ran hourly cleanup of expired sessions and idempotency keys');
    } catch (err) {
      logger.error({ err }, 'Hourly cleanup failed');
    }
  },
  60 * 60 * 1000
);
cleanupInterval.unref();

const app = createApp(db);
const server = app.listen(config.port, () => {
  logger.info(
    { port: config.port, dbPath: config.databasePath },
    'Store Ops Console API listening'
  );
});

function shutdown() {
  logger.info('Shutting down Store Ops Console API');
  clearInterval(cleanupInterval);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
