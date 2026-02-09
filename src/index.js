
import { loadConfig, getConfig } from './logic/configLoader.js';
import { initLogger, getLogger } from './utils/logger.js';
import { startScheduler } from './scheduler.js';
import { connectToSourceDb } from './db/mssql.js';
import { getPrismaClient, disconnectPrisma } from './db/prisma.js';

async function main() {
    // 1. Load Config
    loadConfig();

    // 2. Init Logger
    const logger = initLogger();

    logger.info('Starting AlarmToComplaintSyncAgent...');

    // 3. Test Connections (Optional fail-fast)
    try {
        await connectToSourceDb();

        // Check Prisma connection
        const prisma = getPrismaClient();
        // Simple check (won't work if DB doesn't exist yet, but client connects lazily usually)
        // await prisma.$connect(); 

        logger.info('Database connections initialized.');
    } catch (err) {
        logger.error('Startup connectivity check failed', err);
        // decide if we exit or keep retrying. 
        // process.exit(1); 
    }

    // 4. Start Scheduler
    startScheduler();

    // In Dev Mode, run immediately to allow verification without waiting for Cron
    if (loadConfig().service.isDevelopment) {
        logger.info('Dev Mode detected. Running Sync Job immediately...');
        const { runV2SyncJob } = await import('./v2/syncJob.js');
        await runV2SyncJob();
    }

    // Handle graceful shutdown
    const shutdown = async () => {
        logger.info('Shutting down...');
        await disconnectPrisma();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch(err => {
    console.error('Fatal startup error:', err);
    process.exit(1);
});
