import { getPrismaClient } from './db/prisma.js';
import { isDuplicate } from './logic/dedupEngine.js';
import { getSystemUserId } from './logic/userResolver.js';
import { generateComplaintId, resolveComplaintType } from './logic/cmsIntegration.js';
import { mapToComplaint } from './logic/mapper.js';
import { getConfig } from './logic/configLoader.js';
import { getLogger, logRawData, logDevelopmentData } from './utils/logger.js';
import { checkFaultDuration } from './logic/masterRuleEngine.js';
import { stateStore } from './logic/stateStore.js';
import { fetchJoinedDataStream } from './db/lglAdapter.js';

let isJobRunning = false;

// Lightweight Sync Job Runner (V2 Style)
export async function runSyncJob() {
    const logger = getLogger();
    const config = getConfig();
    const prisma = getPrismaClient();

    if (isJobRunning) {
        logger.warn('Sync Job already in progress. Skipping.');
        return;
    }
    isJobRunning = true;

    try {
        const systemUserId = await getSystemUserId(config.service.systemUserEmail);
        logger.info(`Starting Lightweight V2 Sync. Tiers: 1.Power > 2.Comm > 3.AI/DI.`);

        const stats = { processed: 0, skipped: 0, errors: 0 };
        const mainBatchSet = new Set();
        let latestTime = null;

        // 1. Preparation: Get Last Sync Time (Incremental Sync)
        const lastSyncKey = `LAST_SYNC_TIME_D_A_${config.syncRules.clientId}`;
        const lastSyncState = await prisma.systemConfig.findUnique({ where: { key: lastSyncKey } });

        // Define sinceDate: use stored state or fallback to lookback
        let sinceDate = lastSyncState
            ? new Date(lastSyncState.value)
            : new Date(Date.now() - config.syncRules.lookbackHours * 60 * 60 * 1000);

        // Safety: Ensure sinceDate is not in the future
        if (sinceDate > new Date()) {
            sinceDate = new Date(Date.now() - config.syncRules.lookbackHours * 60 * 60 * 1000);
        }

        // Rule Map
        const ruleMap = {};
        const allRules = [
            ...(config.syncRules.masterRules || []),
            ...(config.syncRules.ruleSets.diRules?.rules || []),
            ...(config.syncRules.ruleSets.aiRules?.rules || [])
        ];
        allRules.forEach(r => {
            if (!r.enabled) return;
            if (!ruleMap[r.tag]) ruleMap[r.tag] = [];
            ruleMap[r.tag].push(r);
        });

        const masterRules = (config.syncRules.masterRules || []).filter(r => r.enabled);

        // 2. Stream Collection per RTU
        let currentRtuId = null;
        let rtuFaults = [];

        const flushRtu = async () => {
            if (!currentRtuId || rtuFaults.length === 0) return;

            // Winner-take-all tiered logic
            const p1 = rtuFaults.filter(f => f.rule.priority === 1);
            const p2 = rtuFaults.filter(f => f.rule.priority === 2);
            const others = rtuFaults.filter(f => !f.rule.priority || f.rule.priority > 2);

            let winners = [];
            if (p1.length > 0) winners = [p1[p1.length - 1]]; // Latest Power Fail
            else if (p2.length > 0) winners = [p2[p2.length - 1]]; // Latest Comm Fail
            else winners = others; // All active AI/DI detections

            for (const fault of winners) {
                await fastProcessFault(currentRtuId, fault.rule.tag, fault.val, fault.time, fault.rule, prisma, systemUserId, mainBatchSet, stats);
            }
            rtuFaults = [];
        };

        const request = await fetchJoinedDataStream(sinceDate, {
            onRow: async (row) => {
                request.pause();
                try {
                    const rtuId = String(row.RTUNumber);
                    const eventTime = new Date(row.DateTimeField);
                    if (!latestTime || eventTime > latestTime) latestTime = eventTime;

                    if (config.service.isDevelopment) logRawData('LGL', row);

                    if (rtuId !== currentRtuId) {
                        await flushRtu();
                        currentRtuId = rtuId;
                    }

                    // Collect potential faults for this row
                    for (const tag of Object.keys(ruleMap)) {
                        const val = row[tag] ?? row[`Analog${tag}`];
                        if (val === undefined || val === null) continue;

                        for (const rule of ruleMap[tag]) {
                            if (checkCondition(val, rule.condition, rule.value)) {
                                if (await checkFaultDuration(rtuId, tag, val, rule.duration, eventTime)) {
                                    rtuFaults.push({ rule, val, time: eventTime });
                                }
                            } else stateStore.clearCondition(rtuId, tag, val);
                        }
                    }
                } catch (e) { logger.error('Row process error', e.message); }
                finally { request.resume(); }
            },
            onEnd: async () => { await flushRtu(); }
        });

        await new Promise(res => {
            request.on('done', res);
            request.on('error', res);
        });

        // 3. Finalize: Update Sync State
        if (latestTime) {
            const timeStr = latestTime.toISOString();
            await prisma.systemConfig.upsert({
                where: { key: lastSyncKey },
                update: { value: timeStr },
                create: { key: lastSyncKey, value: timeStr, type: 'SYNC_STATE' }
            });
            // Update legacy keys for backward compatibility
            const legacyKeys = [
                `LAST_SYNC_TIME_DIGITAL_${config.syncRules.clientId}`,
                `LAST_SYNC_TIME_ANALOG_${config.syncRules.clientId}`
            ];
            for (const key of legacyKeys) {
                await prisma.systemConfig.upsert({
                    where: { key },
                    update: { value: timeStr },
                    create: { key, value: timeStr, type: 'SYNC_STATE' }
                });
            }
        }

        logger.info(`V2 Sync Complete. Processed: ${stats.processed}, Skipped: ${stats.skipped}`);
    } catch (err) {
        logger.error('V2 Critical Failure', err);
    } finally {
        isJobRunning = false;
    }
}

async function fastProcessFault(rtuId, tag, val, time, rule, prisma, userId, mainSet, stats) {
    const key = `${rtuId}-${tag}`;
    if (mainSet.has(key)) return;
    mainSet.add(key);

    const logger = getLogger();
    const config = getConfig();

    try {
        if (await isDuplicate({ rtuId, tag, value: val, eventTime: time })) {
            stats.skipped++; return;
        }
    } catch (e) { logger.warn('Dup fail', e.message); }

    if (config.service.isDevelopment || config.service.dryRun) {
        logger.info(`[V2-FAULT] RTU ${rtuId} Tag ${tag}: ${rule.description}`);
        logDevelopmentData({ rtuId, tag, val, description: rule.description });
    } else {
        try {
            const complaintData = mapToComplaint({ rtuId, tag, value: val, eventTime: time, sourceType: 'UNIFIED' }, rule, { submittedById: userId });

            await prisma.$transaction(async (tx) => {
                const fault = await tx.faultSync.create({
                    data: {
                        rtuNumber: BigInt(rtuId),
                        tagNo: tag,
                        tagValue: String(val),
                        eventTime: time,
                        sourceType: 'UNIFIED'
                    }
                });

                const resolvedType = await resolveComplaintType(tx, complaintData.type || 'Street Lighting');
                const complaintId = await generateComplaintId(tx);

                const complaint = await tx.complaint.create({
                    data: {
                        ...complaintData,
                        slmsRef: fault.id,
                        complaintId: complaintId,
                        complaintTypeId: resolvedType?.id,
                        type: resolvedType?.name || complaintData.type,
                        deadline: resolvedType?.slaHours
                            ? new Date(Date.now() + resolvedType.slaHours * 60 * 60 * 1000)
                            : complaintData.deadline
                    }
                });

                await tx.statusLog.create({
                    data: {
                        complaintId: complaint.id,
                        userId: userId,
                        toStatus: complaintData.status,
                        comment: 'V2 Persistent Auto-Sync'
                    }
                });
            });
            logger.info(`Successfully synchronized complaint for RTU ${rtuId} (Tag ${tag})`);
        } catch (err) {
            logger.error(`Database sync failed for RTU ${rtuId} Tag ${tag}: ${err.message}`);
            stats.errors++;
        }
    }
    stats.processed++;
}

function checkCondition(actual, condition, threshold) {
    const val = Number(actual);
    const thr = Number(threshold);
    if (isNaN(val) || isNaN(thr)) {
        if (condition === 'equals') return String(actual) === String(threshold);
        return false;
    }
    switch (condition) {
        case 'gt': return val > thr;
        case 'lt': return val < thr;
        case 'gte': return val >= thr;
        case 'lte': return val <= thr;
        case 'equals': return val === thr;
        case 'neq': return val !== thr;
        default: return false;
    }
}
