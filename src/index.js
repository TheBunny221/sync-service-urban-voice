
import cron from 'node-cron';
import { StateManager } from './stateManager.js';
import { RuleEngine } from './ruleEngine.js';
import { v2Logger, logV2Payload } from './logger.js';
import { loadConfig, getConfig } from './config/configLoader.js';
import { connectToSourceDb } from './db/mssql.js';

// V2 Imports
import prisma from './prismaClient.js';
import { mapToCmsPayload } from './cmsMapper.js';
import { payloadLogger } from './payloadLogger.js';

// Load Env
loadConfig();
const config = getConfig();

const stateManager = new StateManager();
const ruleEngine = new RuleEngine();

let isRunning = false;

// Retrieve schedule from ENV or Config, default to 5 min
const SCHEDULE_CRON = process.env.SYNC_INTERVAL_MIN ? `*/${process.env.SYNC_INTERVAL_MIN} * * * *` : (config.service.schedule || '*/5 * * * *');
const IS_DEV = process.env.IS_DEVELOPMENT === 'true' || config.service.isDevelopment;

async function runSync() {
    if (isRunning) {
        v2Logger.warn('Sync Job skipped - Previous run still in progress.');
        return;
    }
    isRunning = true;

    try {
        v2Logger.info('--- Starting V2 Sync Job ---');

        // 1. Get Since Date
        const sinceDate = await stateManager.getLastSyncTime();
        v2Logger.info(`Sync Window Start: ${sinceDate.toISOString()}`);

        // 2. Run Rule Engine
        const faults = await ruleEngine.run(sinceDate);

        // 3. Process Faults -> CMS Payloads
        v2Logger.info(`Generated ${faults.length} actionable complaints.`); // faults are the raw objects from rule engine

        for (const fault of faults) {
            logV2Payload(fault); // Keep internal logging

            if (IS_DEV) {
                // DEV MODE: Log to File
                // Pass 'prisma' client as tx to allow read-only lookups for ID generation
                try {
                    const cmsPayload = await mapToCmsPayload(fault, prisma);
                    payloadLogger.log(cmsPayload);
                    v2Logger.info(`[DEV] Logged Payload for RTU ${fault.rtuNumber} to file.`);
                } catch (err) {
                    v2Logger.error(`[DEV] Failed to map payload for RTU ${fault.rtuNumber}`, err);
                }
            } else {
                // PROD MODE: Insert into DB
                await persistToDatabase(fault);
            }
        }

        // 4. Update State
        await stateManager.updateLastSyncTime(new Date());

        v2Logger.info('--- V2 Sync Job Completed ---');

    } catch (error) {
        v2Logger.error('Sync Job Failed', error);
    } finally {
        isRunning = false;
    }
}

async function persistToDatabase(fault) {
    try {
        // Transaction: FaultSync -> Complaint
        await prisma.$transaction(async (tx) => {
            // 1. Check Previous Active Complaint (Smart Loop)
            const existing = await tx.complaint.findFirst({
                where: {
                    tags: { contains: `"rtuId":${fault.rtuNumber}` },
                    status: { notIn: ['RESOLVED', 'CLOSED'] }
                }
            });

            if (existing) {
                v2Logger.warn(`Skipping Complaint for RTU ${fault.rtuNumber}: Active complaint ${existing.complaintId} exists.`);
                return;
            }

            // 2. Insert FaultSync
            const faultRecord = await tx.faultSync.create({
                data: {
                    rtuNumber: BigInt(fault.rtuNumber),
                    tagNo: fault.tag,
                    tagValue: String(fault.value || fault.val || 0), // Handle value/val mismatch if any
                    eventTime: new Date(fault.detectedAt || fault.time),
                    sourceType: 'V2_SYNC_SERVICE',
                }
            });

            // 3. Generate Payload INSIDE Transaction (to get compliant ID locked in tx if needed)
            const cmsPayload = await mapToCmsPayload(fault, tx);

            // 4. Insert Complaint
            await tx.complaint.create({
                data: {
                    ...cmsPayload, // Spread mapped fields
                    slmsRef: faultRecord.id, // Link to FaultSync
                    meta: undefined, // Remove convenience field
                    source: undefined,
                }
            });

            v2Logger.info(`Persisted Complaint for RTU ${fault.rtuNumber} [ID: ${cmsPayload.complaintId}]`);
        });

    } catch (e) {
        v2Logger.error(`DB Insert Failed for RTU ${fault.rtuNumber}`, e);
    }
}


(async () => {
    try {
        await connectToSourceDb();

        if (IS_DEV || process.env.FORCE_RUN === 'true') {
            v2Logger.info(`Mode: ${IS_DEV ? 'DEV' : 'PROD (Forced Run)'}. Running immediately.`);
            await runSync();
        } else {
            v2Logger.info(`Starting Scheduler: ${SCHEDULE_CRON}`);
            cron.schedule(SCHEDULE_CRON, async () => {
                await runSync();
            });
        }
    } catch (e) {
        v2Logger.error('Startup Error', e);
        process.exit(1);
    }
})();
