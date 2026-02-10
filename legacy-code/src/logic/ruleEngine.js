
import { getConfig } from '../logic/configLoader.js';
import { getLogger } from '../utils/logger.js';

import { checkFaultDuration } from './masterRuleEngine.js';

export async function evaluateRule(dataPoint, providedRuleSets = null, context = {}) {
    const config = getConfig();

    // Determine Source Type (from dataPoint.sourceType)
    const sourceType = dataPoint.sourceType; // 'DIGITAL' or 'ANALOG'

    let targetRuleSet = [];

    // Use provided rules or default config
    const ruleSource = providedRuleSets || config.syncRules.ruleSets;

    // Collect candidate rules from relevant sets
    // Collect candidate rules from relevant sets
    // UNIFIED/COMPUTED types can trigger both AI and DI rules depending on the tag
    const isDigital = sourceType === 'DIGITAL' || sourceType === 'UNIFIED' || sourceType === 'COMPUTED_STATE';
    const isAnalog = sourceType === 'ANALOG' || sourceType === 'UNIFIED'; // Unified has analog data too

    if (isDigital) {
        if (ruleSource.diRules?.enabled) {
            targetRuleSet = [...targetRuleSet, ...(ruleSource.diRules.rules || [])];
        }
    }
    if (isAnalog) {
        if (ruleSource.aiRules?.enabled) {
            targetRuleSet = [...targetRuleSet, ...(ruleSource.aiRules.rules || [])];
        }
    }

    // Also include Master Rules if provided in the set (custom structure passed from syncJob)
    if (ruleSource.masterRules?.enabled) {
        targetRuleSet = [...targetRuleSet, ...(ruleSource.masterRules.rules || [])];
    }


    if (!targetRuleSet || targetRuleSet.length === 0) {
        return null; // Rules disabled for this source or empty
    }

    // Find matching rules (enabled only)
    const matchingRules = targetRuleSet.filter(rule => {
        if (!rule.enabled) return false;

        // Check Tag (handle number vs string loose match)
        // dataPoint.tag is usually number or string. rule.tag can be either.
        if (String(rule.tag) !== String(dataPoint.tag)) return false;

        // Check Table Source if specified
        if (rule.table) {
            const isUnified = sourceType === 'UNIFIED' || sourceType === 'COMPUTED_STATE';
            if (!isUnified) {
                const requiredSource = (rule.table === 'DIGITALDATA') ? 'DIGITAL' : 'ANALOG';
                if (dataPoint.sourceType !== requiredSource) {
                    return false;
                }
            }
        }

        return true;
    });


    for (const rule of matchingRules) {
        // Check Prerequisite if exists
        if (rule.prerequisite) {
            const preTag = rule.prerequisite.tag;
            const preVal = rule.prerequisite.value;
            const preCond = rule.prerequisite.condition || 'equals';

            // Priority: direct dataPoint property > relatedPoints context
            let actualPreVal = dataPoint[preTag];

            // If not found in point, and table is specified, look in relatedPoints
            if (actualPreVal === undefined && rule.prerequisite.table) {
                const requiredSource = (rule.prerequisite.table === 'DIGITALDATA') ? 'DIGITAL' : 'ANALOG';
                if (context.relatedPoints) {
                    const foundPoint = context.relatedPoints.find(p =>
                        p.sourceType === requiredSource &&
                        String(p.tag) === String(preTag)
                    );
                    if (foundPoint) actualPreVal = foundPoint.value;
                }
            }

            if (actualPreVal === undefined) {
                // Prerequisite tag not found, condition fails
                continue;
            }

            const preMatch = checkCondition(actualPreVal, preCond, preVal);
            if (!preMatch) {
                continue; // Prerequisite not met
            }
        }

        const isMatch = checkCondition(dataPoint.value, rule.condition, rule.value);
        // console.log(`Primary match: ${isMatch} (Actual: ${dataPoint.value}, Expected: ${rule.value})`);


        if (isMatch) {
            // Duration Check
            if (rule.duration && rule.duration.value) {
                const mode = rule.duration.mode || 'continuous';
                if (mode === 'continuous') {
                    // Note: This relies on the raw data history (Source DB).
                    // IMPORTANT: 'checkFaultDuration' now queries Source DB.
                    const isLongEnough = await checkFaultDuration(dataPoint.rtuId, rule.tag, rule.value, rule.duration, dataPoint.eventTime);


                    if (!isLongEnough) {
                        continue;
                    }
                }
            }
            return rule;
        }
    }

    return null;
}

function checkCondition(actual, condition, threshold) {
    // Coerce values for comparison if needed
    // Using loose comparison '==' can be helpful if types vary (string vs number)
    // or explicit parsing.

    const val = Number(actual);
    const thr = Number(threshold);

    if (isNaN(val) || isNaN(thr)) {
        // If numbers fail, try string comparison for equals/neq
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
