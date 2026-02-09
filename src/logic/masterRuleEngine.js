import { getLogger } from '../utils/logger.js';
import { stateStore } from './stateStore.js';
import { getConfig } from './configLoader.js';

/**
 * Parses duration string like '24h', '30m', '2d' into milliseconds.
 * ...
 */
export function parseDuration(duration) {
    if (!duration) return 0;

    // Handle object duration { value, mode }
    const durationStr = (typeof duration === 'object' && duration !== null)
        ? duration.value
        : duration;

    if (!durationStr || typeof durationStr !== 'string') return 0;

    const value = parseInt(durationStr);
    if (isNaN(value)) return 0;

    if (durationStr.endsWith('h')) return value * 60 * 60 * 1000;
    if (durationStr.endsWith('m')) return value * 60 * 1000;
    if (durationStr.endsWith('d')) return value * 24 * 60 * 60 * 1000;

    return 0;
}

/**
 * Checks if a specific fault condition has been active for longer than duration.
 * Now uses stateStore for persistence tracking.
 */
export async function checkFaultDuration(rtuId, tag, value, duration, eventTime) {
    // If it's an object with mode 'instant', it doesn't need persistence check
    if (typeof duration === 'object' && duration !== null && duration.mode === 'instant') {
        return true;
    }

    const durationMs = parseDuration(duration);
    if (durationMs <= 0) return true; // If no duration specified, it's instant

    // Get or start tracking the fault start time
    const startTime = stateStore.trackCondition(rtuId, tag, value, eventTime);
    const eventDate = new Date(eventTime);

    const elapsedMs = eventDate.getTime() - startTime.getTime();
    return elapsedMs >= durationMs;
}


/**
 * Checks if an RTU is "blocked" by a Master Rule.
 */
/**
 * Evaluates Master Rules for an RTU.
 * Priority 1: Blocking. If matched, returns immediately (suppresses everything else).
 * Priority >1: Non-blocking (Window). collected but suppresses AI/DI.
 */
export async function evaluateMasterRules(rtuId, currentDataPoints) {
    const config = getConfig();
    const logger = getLogger();

    if (!config.syncRules.masterRules || config.syncRules.masterRules.length === 0) {
        return { p1Match: null, p2Matches: [] };
    }
    // console.error(`Evaluating ${config.syncRules.masterRules.length} master rules against ${currentDataPoints.length} points`);

    const p2Matches = [];

    for (const rule of config.syncRules.masterRules) {
        if (!rule.enabled) continue;

        // 1. Check if current data matches the Master Rule condition
        const matchingPoint = currentDataPoints.find(p => {
            // Optional: Check Table Source if specified
            if (rule.table) {
                // If data is UNIFIED or COMPUTED, we trust the rule engine to apply it regardless of table strictness
                // unless it explicitly mismatches.
                // For legacy compatibility:
                const isUnified = p.sourceType === 'UNIFIED' || p.sourceType === 'COMPUTED_STATE';

                if (!isUnified) {
                    const requiredSource = (rule.table === 'DIGITALDATA') ? 'DIGITAL' : 'ANALOG';
                    if (p.sourceType !== requiredSource) {
                        return false;
                    }
                }
            }

            const tagMatch = String(p.tag) === String(rule.tag);
            const valMatch = String(p.value) === String(rule.value);
            // console.error(`Checking MR ${rule.description}: Tag ${p.tag}/${rule.tag}=${tagMatch}, Val ${p.value}/${rule.value}=${valMatch}`);
            return tagMatch && valMatch;
        });

        if (matchingPoint) {
            // 2. Condition is currently ACTIVE. Check Duration/Mode.
            const isActive = await checkFaultDuration(rtuId, rule.tag, rule.value, rule.duration, matchingPoint.eventTime);

            if (isActive) {
                const priority = (rule.priority === undefined) ? 1 : rule.priority;
                const matchObj = { rule, point: matchingPoint };

                if (Number(priority) === 1) { // Force number check just in case
                    // P1: Immediate Override. Win.
                    const durLabel = (typeof rule.duration === 'object') ? rule.duration.value : rule.duration;
                    logger.warn(`RTU ${rtuId} MASTER OVERRIDE (P1): ${rule.description} (Active > ${durLabel})`);
                    return { p1Match: matchObj, p2Matches: [] };
                } else {
                    // P2: Collect, but don't stop looking for P1
                    p2Matches.push(matchObj);
                }
            }
        } else {
            // Condition NOT active. Clear state tracking.
            stateStore.clearCondition(rtuId, rule.tag, rule.value);
        }
    }

    return { p1Match: null, p2Matches };
}
