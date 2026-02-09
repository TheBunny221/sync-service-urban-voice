
import { jest } from '@jest/globals';

const mockLogger = { debug: jest.fn(), info: jest.fn(), error: jest.fn() };

jest.unstable_mockModule('../src/utils/logger.js', () => ({
    getLogger: () => mockLogger,
}));

jest.unstable_mockModule('../src/logic/configLoader.js', () => ({
    getConfig: () => ({
        syncRules: {
            ruleSets: {
                diRules: {
                    enabled: true,
                    rules: [
                        { tag: 'Tag1', condition: 'gt', value: 50, alarmType: 'CRITICAL', description: 'High Temp', enabled: true },
                        { tag: 'Tag7', condition: 'neq', value: 'OK', alarmType: 'WARN', description: 'Not OK', enabled: true },
                        // New Inverted Logic Rule
                        { tag: 'Tag8', condition: 'equals', value: 0, table: 'DIGITALDATA', alarmType: 'CRITICAL', description: 'Panel Not Communicating', enabled: true },
                        // Duration Rule
                        {
                            tag: 'TagDuration', condition: 'gt', value: 50, alarmType: 'CRITICAL', description: 'Prolonged High Temp', enabled: true,
                            duration: { value: '5m', mode: 'continuous' }
                        },
                        // Conditional Rule: Tag9 triggers ONLY if Tag6 == 2
                        {
                            tag: 'Tag9', condition: 'equals', value: 'TRIP', alarmType: 'TRIP', description: 'Circuit 2 Trip', enabled: true,
                            complaintType: 'Street Light Fault',
                            prerequisite: { tag: 'Tag6', value: 2, condition: 'equals' }
                        }
                    ]
                },
                aiRules: {
                    enabled: true,
                    rules: [
                        { tag: 'Tag5', condition: 'equals', value: 'ON', alarmType: 'STATUS', description: 'Pump On', enabled: true },
                        { tag: 'Tag6', condition: 'lt', value: 10, alarmType: 'LOW', description: 'Low Pressure', enabled: true },
                        // New Cross-Table Rule
                        {
                            tag: 'Tag11', condition: 'gt', value: 100, alarmType: 'CRITICAL', description: 'Cross Table Rule', enabled: true,
                            prerequisite: { tag: 'Tag10', value: 1, condition: 'equals', table: 'DIGITALDATA' }
                        }
                    ]
                }
            }
        },
    }),
}));

jest.unstable_mockModule('../src/logic/masterRuleEngine.js', () => ({
    checkFaultDuration: jest.fn().mockResolvedValue(true), // Default: duration met
    parseDuration: jest.fn().mockReturnValue(1000)
}));

const { evaluateRule } = await import('../src/logic/ruleEngine.js');
const { checkFaultDuration } = await import('../src/logic/masterRuleEngine.js');

describe('Rule Engine v2 (Dual Sets)', () => {
    test('should match DI rule for DIGITAL source', async () => {
        const data = { rtuId: '1001', tag: 'Tag1', value: 55, sourceType: 'DIGITAL' };
        const rule = await evaluateRule(data);
        expect(rule).toBeDefined();
        expect(rule.description).toBe('High Temp');
    });

    // ... existing tests ...

    test('should match Duration Rule ONLY if checkFaultDuration passes', async () => {
        const data = { rtuId: '1001', tag: 'TagDuration', value: 60, sourceType: 'DIGITAL' };

        // 1. Duration Check FAILS (not long enough)
        checkFaultDuration.mockResolvedValueOnce(false);

        let rule = await evaluateRule(data);
        expect(rule).toBeNull(); // Should be skipped
        expect(checkFaultDuration).toHaveBeenCalledWith('1001', 'TagDuration', 50, { value: '5m', mode: 'continuous' }, data.eventTime);

        // 2. Duration Check PASSES
        checkFaultDuration.mockResolvedValueOnce(true);

        rule = await evaluateRule(data);
        expect(rule).toBeDefined();
        expect(rule.description).toBe('Prolonged High Temp');
    });

    test('should match rule with Cross-Table prerequisite', async () => {
        const data = { rtuId: '9999', tag: 'Tag11', value: 150, sourceType: 'ANALOG' };

        // Context with Digital Point (Prerequisite)
        const relatedPoints = [
            { rtuId: '9999', tag: 'Tag10', value: 1, sourceType: 'DIGITAL' } // Matches Tag10 == 1
        ];

        const rule = await evaluateRule(data, null, { relatedPoints });
        expect(rule).toBeDefined();
        expect(rule.description).toBe('Cross Table Rule');
    });

    test('should NOT match cross-table rule if prerequisite missing', async () => {
        const data = { rtuId: '9999', tag: 'Tag11', value: 150, sourceType: 'ANALOG' };

        // Context with WRONG value
        const relatedPoints = [
            { rtuId: '9999', tag: 'Tag10', value: 0, sourceType: 'DIGITAL' } // 0 != 1
        ];

        const rule = await evaluateRule(data, null, { relatedPoints });
        expect(rule).toBeNull();
    });
});
