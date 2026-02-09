
import { loadConfig } from './src/logic/configLoader.js';
import { evaluateRule } from './src/logic/ruleEngine.js';
import { mapToComplaint } from './src/logic/mapper.js';
import path from 'path';

console.log('--- Verifying Configuration and Rules ---');

// 1. Load Actual Config
try {
    const configPath = path.resolve('./sync-config.json');
    console.log(`Loading config from: ${configPath}`);
    const config = loadConfig(configPath);
    console.log('Config loaded successfully.');

    // 2. Verify Rules
    console.log('\n--- Testing Rules ---');

    // TestCase A: Tag1 > 50 -> Should Match CRITICAL
    const testA = { rtuId: 100, tag: 'Tag1', value: 60, eventTime: new Date() };
    const ruleA = evaluateRule(testA);
    if (ruleA && ruleA.alarmType === 'CRITICAL' && ruleA.description === 'High Temp Alert') {
        console.log('✅ PASS: Tag1 > 50 triggered CRITICAL High Temp Alert');
    } else {
        console.error('❌ FAIL: Tag1 > 50 did not trigger expected rule.', ruleA);
    }

    // TestCase B: Tag1 < 50 -> Should NOT Match
    const testB = { rtuId: 100, tag: 'Tag1', value: 40, eventTime: new Date() };
    const ruleB = evaluateRule(testB);
    if (!ruleB) {
        console.log('✅ PASS: Tag1 < 50 did not trigger rule (Correct)');
    } else {
        console.error('❌ FAIL: Tag1 < 50 triggered rule unexpected.', ruleB);
    }

    // TestCase C: Tag5 = "1" -> Should Match MAJOR
    const testC = { rtuId: 100, tag: 'Tag5', value: "1", eventTime: new Date() };
    const ruleC = evaluateRule(testC);
    if (ruleC && ruleC.alarmType === 'MAJOR' && ruleC.description === 'Pump Status Fault') {
        console.log('✅ PASS: Tag5 = "1" triggered MAJOR Pump Status Fault');
    } else {
        console.error('❌ FAIL: Tag5 = "1" did not trigger expected rule.', ruleC);
    }

    // 3. Verify Mapping
    console.log('\n--- Testing Mapping ---');
    if (ruleA) {
        const complaint = mapToComplaint(testA, ruleA, { submittedById: 'TEST_USER' });

        // Assert Description (No Time)
        const descMatch = complaint.description.includes('Value: 60') && !complaint.description.includes('Time:');
        if (descMatch) {
            console.log('✅ PASS: Description format correct (No Time, Includes Value)');
        } else {
            console.error('❌ FAIL: Description format incorrect.', complaint.description);
        }

        // Assert Status
        if (complaint.status === 'REGISTERED') {
            console.log('✅ PASS: Default Status is REGISTERED');
        } else {
            console.error('❌ FAIL: Default Status incorrect.', complaint.status);
        }
    }

} catch (error) {
    console.error('CRITICAL: Verification Failed', error);
    process.exit(1);
}
