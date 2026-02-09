
import { jest } from '@jest/globals';

// Define Mocks BEFORE imports
jest.unstable_mockModule('../src/logic/configLoader.js', () => ({
    getConfig: () => ({
        syncRules: {
            clientId: '1',
            ruleSets: {
                diRules: {
                    enabled: true,
                    rules: [
                        {
                            tag: 'Tag7',
                            value: 1,
                            condition: 'equals',
                            description: 'Circuit 1 Trip',
                            enabled: true,
                            prerequisite: { tag: 'Tag6', value: 1, table: 'ANALOGUEDATA' }
                        },
                        {
                            tag: 'Tag9',
                            value: 1,
                            condition: 'equals',
                            description: 'Circuit 2 Trip',
                            enabled: true,
                            prerequisite: { tag: 'Tag6', value: 2, table: 'ANALOGUEDATA' }
                        }
                    ]
                },
                aiRules: {
                    enabled: true,
                    rules: [
                        {
                            tag: 'Tag5',
                            value: 0.1, // Threshold
                            condition: 'lt',
                            description: 'Lamp Failure',
                            enabled: true,
                            prerequisite: { tag: 'Tag1', value: 0, table: 'DIGITALDATA' }
                        }
                    ]
                },
                masterRules: {
                    enabled: true,
                    rules: [
                        {
                            tag: 'Tag8',
                            value: 0,
                            priority: 1,
                            description: 'Communication Fail',
                            enabled: true,
                            duration: { value: '0h', mode: 'instant' }
                        },
                        {
                            tag: 'Tag16',
                            value: 0,
                            priority: 0, // P2
                            description: 'Power Fail',
                            enabled: true,
                            duration: { value: '0h', mode: 'instant' }
                        }
                    ]
                }
            },
            masterRules: [
                {
                    tag: 'Tag8',
                    value: 0,
                    priority: 1,
                    description: 'Communication Fail',
                    enabled: true,
                    duration: { value: '0h', mode: 'instant' }
                },
                {
                    tag: 'Tag16',
                    value: 0,
                    priority: 0, // P2
                    description: 'Power Fail',
                    enabled: true,
                    duration: { value: '0h', mode: 'instant' }
                }
            ]
        }
    })
}));

jest.unstable_mockModule('../src/utils/logger.js', () => ({
    getLogger: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(), // Allow error logging for now (debug)
        debug: jest.fn()
    })
}));

jest.unstable_mockModule('../src/logic/stateStore.js', () => ({
    stateStore: {
        trackCondition: jest.fn(() => new Date(Date.now() - 100000)),
        clearCondition: jest.fn()
    }
}));

// Dynamic Imports
const { processRawData } = await import('../src/logic/dataProcessor.js');
const { evaluateRule } = await import('../src/logic/ruleEngine.js');
const { evaluateMasterRules } = await import('../src/logic/masterRuleEngine.js');

describe('LGL Logic Validation', () => {

    it('should correctly join Analog Tag6 for Circuit 1 Trip detection', async () => {
        const rawRow = {
            RTUNumber: 1001,
            DateTimeField: new Date().toISOString(),
            Tag7: 1,
            Tag1: 0,
            Tag6: null,
            AnalogTag6: 1
        };

        const processed = processRawData([rawRow], 'RTUNumber', 'DateTimeField', 'UNIFIED');
        processed.forEach(d => {
            if (d.rawRow) d.Tag6 = d.rawRow.AnalogTag6;
        });

        const tripPoint = processed.find(p => p.tag === 'Tag7');
        expect(tripPoint).toBeDefined();

        const rule = await evaluateRule(tripPoint);
        expect(rule).toBeDefined();
        expect(rule.description).toBe('Circuit 1 Trip');
    });

    it('should block Circuit Trip if Analog Tag6 mismatches (Prerequisite Fail)', async () => {
        const rawRow = {
            RTUNumber: 1002,
            DateTimeField: new Date().toISOString(),
            Tag7: 1,
            Tag1: 0,
            AnalogTag6: 2
        };

        const processed = processRawData([rawRow], 'RTUNumber', 'DateTimeField', 'UNIFIED');
        processed.forEach(d => { if (d.rawRow) d.Tag6 = d.rawRow.AnalogTag6; });

        const tripPoint = processed.find(p => p.tag === 'Tag7');

        const rule = await evaluateRule(tripPoint);
        expect(rule).toBeNull();
    });

    it('should identify Lamp Failure using Digital prerequisite for Analog rule', async () => {
        const rawRow = {
            RTUNumber: 1003,
            DateTimeField: new Date().toISOString(),
            Tag5: 0.05,
            Tag1: 0,
            AnalogTag6: 1
        };

        const processed = processRawData([rawRow], 'RTUNumber', 'DateTimeField', 'UNIFIED');

        const lampPoint = processed.find(p => p.tag === 'Tag5');

        const rule = await evaluateRule(lampPoint);
        expect(rule).toBeDefined();
        expect(rule.description).toBe('Lamp Failure');
    });

    it('should prioritize P1 Master Rule (Communication Fail)', async () => {
        const points = [
            { tag: 'Tag8', value: 0, sourceType: 'COMPUTED_STATE', eventTime: new Date() },
            { tag: 'Tag16', value: 0, sourceType: 'COMPUTED_STATE', eventTime: new Date() }
        ];

        const { p1Match, p2Matches } = await evaluateMasterRules('1004', points);

        expect(p1Match).toBeDefined();
        expect(p1Match.rule.description).toBe('Communication Fail');
        expect(p2Matches).toEqual([]);
    });

    it('should correct identify Computed State faults', async () => {
        const commFault = {
            rtuId: '9999',
            tag: 'Tag8',
            value: 0,
            sourceType: 'COMPUTED_STATE',
            description: 'Communication Failure (Computed)',
            eventTime: new Date()
        };

        const { p1Match } = await evaluateMasterRules('9999', [commFault]);
        expect(p1Match).toBeDefined();
        expect(p1Match.rule.description).toBe('Communication Fail');
    });

});
