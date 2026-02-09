import { getPrismaClient } from '../db/prisma.js';
import { getSystemUserId } from '../logic/userResolver.js';
import { generateComplaintId, resolveComplaintType } from '../logic/cmsIntegration.js';
import { mapToComplaint } from '../logic/mapper.js';
import { getConfig } from '../logic/configLoader.js';
import { getLogger, logRawData, logDevelopmentData } from '../utils/logger.js';
import { checkFaultDuration } from '../logic/masterRuleEngine.js';
import { stateStore } from '../logic/stateStore.js';
import { fetchJoinedDataStream, fetchCommFaults } from '../db/lglAdapter.js';
import { isDuplicate } from '../logic/dedupEngine.js';

let isJobRunning = false;

/**
 * V2 Lightweight Sync Job
 * Strictly follows DATABASE_VALIDATION_QUERIES.md logic:
 * Tier 1: Power (Tag16=0)
 * Tier 2: Comm (Tag8=0)
 * Tier 3: AI/DI (Phase-aware Trips & Lamp Failures)
 */
export async function runV2SyncJob() {
    const logger = getLogger();
    const config = getConfig();
    const prisma = getPrismaClient();

    if (isJobRunning) {
        logger.warn('V2 Sync Job already in progress. Skipping.');
        return;
    }
    isJobRunning = true;

    try {
        const systemUserId = await getSystemUserId(config.service.systemUserEmail);
        logger.info('Starting V2 Lightweight Sync Job (Validation-Aware).');

        const stats = { processed: 0, skipped: 0, errors: 0 };
        const mainBatchSet = new Set();
        let latestEventTime = null;

        // 1. Get Sync State (Incremental Start)
        const syncKey = `V2_LAST_SYNC_TIME_${config.syncRules.clientId}`;
        const syncState = await prisma.systemConfig.findUnique({ where: { key: syncKey } });
        let sinceDate = syncState ? new Date(syncState.value) : new Date(Date.now() - config.syncRules.lookbackHours * 60 * 60 * 1000);

        // Safety: If sync state is in future (e.g. from bad data), reset to lookback
        if (sinceDate > new Date()) {
            logger.warn(`Future sync state detected (${sinceDate.toISOString()}). Resetting to lookback ${config.syncRules.lookbackHours}h.`);
            sinceDate = new Date(Date.now() - config.syncRules.lookbackHours * 60 * 60 * 1000);
        }

        // 1.5 Fetch & Process Communication Faults (Tier 2 - Computed State)
        try {
            const commFaults = await fetchCommFaults();
            logger.info(`Found ${commFaults.length} active communication faults.`);
            const commRule = config.syncRules.masterRules.find(r => r.tag === 'Tag8' && r.enabled);

            if (commRule) {
                for (const fault of commFaults) {
                    // Inject rule metadata
                    fault.rule = commRule;
                    await syncPersistFault(fault.rtuId, { rule: commRule, val: 0, time: fault.eventTime }, prisma, systemUserId, mainBatchSet, stats);
                }
            }
        } catch (e) {
            logger.error('Failed to fetch/process comm faults', e);
        }


        // 2. Prepare Rules (UI Configurable)
        const masterRules = (config.syncRules.masterRules || []).filter(r => r.enabled);
        const diRules = (config.syncRules.ruleSets.diRules?.rules || []).filter(r => r.enabled);
        const aiRules = (config.syncRules.ruleSets.aiRules?.rules || []).filter(r => r.enabled);

        // 3. Streaming Loop
        let currentRtuId = null;
        let rtuBuffer = []; // { row }

        const flushRtuBuffer = async () => {
            if (!currentRtuId || rtuBuffer.length === 0) return;

            // Pick "The Winner" for this RTU window
            let winner = null;

            // Priority 1: Power Failure (Tag16=0)
            const p1Rule = masterRules.find(r => r.priority === 1 || r.tag === 'Tag16');
            if (p1Rule) {
                for (const item of rtuBuffer) {
                    if (checkVal(item.row['Tag16'], p1Rule.condition, p1Rule.value)) {
                        if (await checkFaultDuration(currentRtuId, 'Tag16', item.row['Tag16'], p1Rule.duration, item.time)) {
                            winner = { rule: p1Rule, val: item.row['Tag16'], time: item.time };
                            break;
                        }
                    } else stateStore.clearCondition(currentRtuId, 'Tag16', item.row['Tag16']);
                }
            }

            // Priority 2: Comm Failure (Tag8=0)
            if (!winner) {
                const p2Rule = masterRules.find(r => r.priority === 2 || r.tag === 'Tag8');
                if (p2Rule) {
                    for (const item of rtuBuffer) {
                        if (checkVal(item.row['Tag8'], p2Rule.condition, p2Rule.value)) {
                            if (await checkFaultDuration(currentRtuId, 'Tag8', item.row['Tag8'], p2Rule.duration, item.time)) {
                                winner = { rule: p2Rule, val: item.row['Tag8'], time: item.time };
                                break;
                            }
                        } else stateStore.clearCondition(currentRtuId, 'Tag8', item.row['Tag8']);
                    }
                }
            }

            // Priority 3: AI / DI Faults (Phase-Aware)
            if (!winner) {
                const contenders = [];
                for (const item of rtuBuffer) {
                    // DI Rules (Ckt 1/2 Trip etc)
                    for (const rule of diRules) {
                        if (checkVal(item.row[rule.tag], rule.condition, rule.value)) {
                            // Prerequisite check (Phase awareness: a.Tag6 = 1 or 2)
                            let prePass = true;
                            if (rule.prerequisite) {
                                const preVal = item.row[rule.prerequisite.tag] ?? item.row[`Analog${rule.prerequisite.tag}`];
                                prePass = checkVal(preVal, rule.prerequisite.condition || 'equals', rule.prerequisite.value);
                            }
                            if (prePass && await checkFaultDuration(currentRtuId, rule.tag, item.row[rule.tag], rule.duration, item.time)) {
                                contenders.push({ rule, val: item.row[rule.tag], time: item.time });
                            }
                        } else stateStore.clearCondition(currentRtuId, rule.tag, item.row[rule.tag]);
                    }
                    // AI Rules (Lamp Failure etc)
                    for (const rule of aiRules) {
                        const val = item.row[rule.tag] ?? item.row[`Analog${rule.tag}`];
                        if (val !== undefined && checkVal(val, rule.condition, rule.value)) {
                            let prePass = true;
                            if (rule.prerequisite) {
                                const preVal = item.row[rule.prerequisite.tag] ?? item.row[`Analog${rule.prerequisite.tag}`];
                                prePass = checkVal(preVal, rule.prerequisite.condition || 'equals', rule.prerequisite.value);
                            }
                            if (prePass && await checkFaultDuration(currentRtuId, rule.tag, val, rule.duration, item.time)) {
                                contenders.push({ rule, val, time: item.time });
                            }
                        } else stateStore.clearCondition(currentRtuId, rule.tag, val);
                    }
                }
                // Pick the latest AI/DI as the potential winner if multiple
                if (contenders.length > 0) winner = contenders[contenders.length - 1];
            }

            // Sync the Winner
            if (winner) {
                await syncPersistFault(currentRtuId, winner, prisma, systemUserId, mainBatchSet, stats);
            }

            rtuBuffer = [];
        };

        const stream = await fetchJoinedDataStream(sinceDate, {
            onRow: async (row) => {
                stream.pause();
                try {
                    const rtuId = String(row.RTUNumber);
                    const eventTime = new Date(row.DateTimeField);
                    if (!latestEventTime || eventTime > latestEventTime) latestEventTime = eventTime;

                    if (config.service.isDevelopment) logRawData('V2_EXTRACTION', row);

                    if (rtuId !== currentRtuId) {
                        await flushRtuBuffer();
                        currentRtuId = rtuId;
                    }
                    rtuBuffer.push({ row, time: eventTime });
                } catch (e) { logger.error('V2 Row Error', e.message); }
                finally { stream.resume(); }
            },
            onEnd: async () => { await flushRtuBuffer(); poolDone = true; }
        });

        let poolDone = false;
        await new Promise(res => {
            const check = setInterval(() => { if (poolDone) { clearInterval(check); res(); } }, 100);
            stream.on('error', (err) => { clearInterval(check); res(); });
        });

        // 4. Update Sync State
        if (latestEventTime) {
            await prisma.systemConfig.upsert({
                where: { key: syncKey },
                update: { value: latestEventTime.toISOString() },
                create: { key: syncKey, value: latestEventTime.toISOString(), type: 'SYNC_STATE' }
            });
        }

        logger.info(`V2 Sync Job Completed. Processed: ${stats.processed}, Skipped: ${stats.skipped}`);

    } catch (err) {
        logger.error('V2 Sync Job Failed Critical', err);
    } finally {
        isJobRunning = false;
    }
}

async function syncPersistFault(rtuId, fault, prisma, userId, mainSet, stats) {
    const { rule, val, time } = fault;
    const key = `${rtuId}-${rule.tag}`;
    if (mainSet.has(key)) return;
    mainSet.add(key);

    const logger = getLogger();
    const config = getConfig();

    // Deduplication check
    try {
        if (await isDuplicate({ rtuId, tag: rule.tag, value: val, eventTime: time })) {
            stats.skipped++; return;
        }
    } catch (e) { logger.warn('V2 Dup Fail', e.message); }

    if (config.service.isDevelopment || config.service.dryRun) {
        logger.info(`[V2-SIM] PERSIST RTU ${rtuId} -> ${rule.description}`);
        logDevelopmentData({
            table: 'V2_FAULT',
            data: {
                rtuId,
                tag: rule.tag,
                value: val,
                type: rule.description,
                faultPercent: 100,
                val,
                description: rule.description,
                time
            }
        });
    } else {
        try {
            const complaintData = mapToComplaint({ rtuId, tag: rule.tag, value: val, eventTime: time, sourceType: 'UNIFIED' }, rule, { submittedById: userId });

            await prisma.$transaction(async (tx) => {
                const faultLog = await tx.faultSync.create({
                    data: {
                        rtuNumber: BigInt(rtuId),
                        tagNo: rule.tag,
                        tagValue: String(val),
                        eventTime: time,
                        sourceType: 'UNIFIED'
                    }
                });

                const resolved = await resolveComplaintType(tx, complaintData.type || 'General Street Light');
                const complaintId = await generateComplaintId(tx);

                const complaint = await tx.complaint.create({
                    data: {
                        ...complaintData,
                        slmsRef: faultLog.id,
                        complaintId,
                        complaintTypeId: resolved?.id,
                        type: resolved?.name || complaintData.type,
                        deadline: resolved?.slaHours
                            ? new Date(Date.now() + resolved.slaHours * 60 * 60 * 1000)
                            : complaintData.deadline
                    }
                });

                await tx.statusLog.create({
                    data: {
                        complaintId: complaint.id,
                        userId: userId,
                        toStatus: complaintData.status,
                        comment: 'V2 Verified Persistent Sync'
                    }
                });
            });
            logger.info(`V2: Registered Complaint ${rule.description} for RTU ${rtuId}`);
        } catch (e) {
            logger.error(`V2 DB Sync Error for RTU ${rtuId}: ${e.message}`);
            stats.errors++;
        }
    }
    stats.processed++;
}

function checkVal(actual, condition, threshold) {
    const a = Number(actual);
    const t = Number(threshold);
    if (isNaN(a) || isNaN(t)) {
        if (condition === 'equals') return String(actual) === String(threshold);
        return false;
    }
    switch (condition) {
        case 'gt': return a > t;
        case 'lt': return a < t;
        case 'gte': return a >= t;
        case 'lte': return a <= t;
        case 'equals': return a === t;
        case 'neq': return a !== t;
        default: return false;
    }
}
