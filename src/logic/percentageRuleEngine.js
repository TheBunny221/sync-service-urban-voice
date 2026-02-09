import { getLogger } from '../utils/logger.js';
import { getConfig } from './configLoader.js';
import { checkFaultDuration } from './masterRuleEngine.js';

/**
 * Evaluates a data point against rules using percentage-based logic over a historical window.
 * 
 * @param {Object} dataPoint - The current data point being evaluated
 * @param {Array} history - The historical records for this RTU (last 48h)
 * @param {Object} ruleSource - Optional rule set override
 * @returns {Object|null} - The matched rule with statistical metadata, or null if no match
 */
export async function evaluatePercentageRule(dataPoint, history = [], ruleSource = null, context = {}) {
    const config = getConfig();
    const logger = getLogger();
    const sourceType = dataPoint.sourceType; // 'DIGITAL' or 'ANALOG'

    // Default rules from config if none provided
    const sourceRules = ruleSource || config.syncRules.ruleSets;

    let rules = [];
    if (sourceType === 'DIGITAL') {
        if (sourceRules.diRules?.enabled) rules = sourceRules.diRules.rules || [];
    } else if (sourceType === 'ANALOG') {
        if (sourceRules.aiRules?.enabled) rules = sourceRules.aiRules.rules || [];
    }

    if (rules.length === 0) return null;

    // Filter rules for this specific tag
    const candidateRules = rules.filter(r => r.enabled && String(r.tag) === String(dataPoint.tag));

    for (const rule of candidateRules) {
        // --- 0. Prerequisite Check (SQL Alignment) ---
        if (rule.prerequisite) {
            const preTag = rule.prerequisite.tag;
            const preVal = rule.prerequisite.value;
            const preCond = rule.prerequisite.condition || 'equals';
            let actualPreVal;

            if (rule.prerequisite.table) {
                const requiredSource = (rule.prerequisite.table === 'DIGITALDATA') ? 'DIGITAL' : 'ANALOG';
                // Look in context (relatedPoints) - passed from syncJob
                if (context && context.relatedPoints) {
                    const foundPoint = context.relatedPoints.find(p =>
                        p.sourceType === requiredSource &&
                        String(p.tag) === String(preTag)
                    );
                    if (foundPoint) {
                        actualPreVal = foundPoint.value;
                    }
                }
            } else {
                // Default: Look in same row
                const row = dataPoint.rawRow;
                if (row) {
                    actualPreVal = row[preTag];
                }
            }

            if (actualPreVal === undefined) {
                // Prerequisite tag not found in current batch context -> condition fails
                logger.debug(`[PERCENT-PRE-SKIP] Prerequisite tag ${preTag} not found for rule ${rule.description}`);
                continue;
            }

            const preMatch = checkCondition(actualPreVal, preCond, preVal);
            if (!preMatch) {
                logger.debug(`[PERCENT-PRE-SKIP] Prerequisite ${preTag} ${preCond} ${preVal} failed (Actual: ${actualPreVal})`);
                continue;
            }
        }

        // 1. Determine Window
        const windowHours = rule.windowHours || 48;
        const cutoffTime = new Date(Date.now() - (windowHours * 60 * 60 * 1000));

        // 2. Filter History for this Tag and Window
        const relevantHistory = history.filter(h => {
            const hTime = new Date(h.DateTimeField);
            return hTime >= cutoffTime && h.hasOwnProperty(rule.tag);
        });

        if (relevantHistory.length === 0) {
            // Should at least have the current point if integrated correctly, 
            // but if empty, we can't calculate percentage.
            continue;
        }

        // 3. Count Faults
        let faultCount = 0;
        for (const record of relevantHistory) {
            if (checkCondition(record[rule.tag], rule.condition, rule.value)) {
                faultCount++;
            }
        }

        const totalCount = relevantHistory.length;
        const percent = (faultCount * 100) / totalCount;
        const threshold = rule.thresholdPercent !== undefined ? rule.thresholdPercent : 80;

        const isTriggered = percent >= threshold;

        if (isTriggered) {
            // Duration Check (as per user request: "keep the duration logic in it")
            if (rule.duration && rule.duration.value) {
                const isLongEnough = await checkFaultDuration(dataPoint.rtuId, rule.tag, rule.value, rule.duration, dataPoint.eventTime);
                if (!isLongEnough) {
                    logger.debug(`[PERCENT-DUR-SKIP] RTU:${dataPoint.rtuId} Tag:${rule.tag} Percentage met (${percent.toFixed(2)}%) but duration not yet reached.`);
                    continue;
                }
            }

            logger.debug(`[PERCENT] RTU:${dataPoint.rtuId} Tag:${rule.tag} -> ${faultCount}/${totalCount} (${percent.toFixed(2)}%) >= ${threshold}%`);

            // Return rule with attached stats for the mapper
            return {
                ...rule,
                stats: {
                    faultCount,
                    totalCount,
                    percent: percent.toFixed(2)
                }
            };
        } else {
            logger.debug(`[PERCENT-SKIP] RTU:${dataPoint.rtuId} Tag:${rule.tag} -> ${faultCount}/${totalCount} (${percent.toFixed(2)}%) < ${threshold}%`);
        }
    }

    return null;
}

/**
 * Shared condition checker (co-located here for independence, but uses same logic as legacy)
 */
export function checkCondition(actual, condition, threshold) {
    const val = Number(actual);
    const thr = Number(threshold);

    if (isNaN(val) || isNaN(thr)) {
        if (condition === 'equals') return String(actual) === String(threshold);
        if (condition === 'neq') return String(actual) !== String(threshold);
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
