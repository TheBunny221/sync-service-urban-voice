
import cron from 'node-cron';
import { runV2SyncJob } from './v2/syncJob.js';
import { getConfig } from './logic/configLoader.js';
import { getLogger } from './utils/logger.js';

export function startScheduler() {
    const config = getConfig();
    const logger = getLogger();

    logger.info(`Initializing Scheduler with schedule: ${config.service.schedule}`);

    // validate cron syntax
    if (!cron.validate(config.service.schedule)) {
        throw new Error(`Invalid cron schedule: ${config.service.schedule}`);
    }

    cron.schedule(config.service.schedule, async () => {
        logger.info('Triggering Scheduled Sync...');
        await runV2SyncJob();
    });

    logger.info('Scheduler started.');
}
