
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
                        { tag: 'Tag1', condition: 'equals', value: 0, thresholdPercent: 25, windowHours: 48, enabled: true },
                        { tag: 'Tag2', condition: 'gt', value: 10, thresholdPercent: 50, windowHours: 24, enabled: true }
                    ]
                }
            }
        },
    }),
}));
const mockEvaluateMasterRules = {
    checkFaultDuration: jest.fn().mockResolvedValue(true)
};

jest.unstable_mockModule('../src/logic/masterRuleEngine.js', () => mockEvaluateMasterRules);

const { evaluatePercentageRule } = await import('../src/logic/percentageRuleEngine.js');

describe('Percentage Rule Engine', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should trigger if threshold met (N=32, F=8 -> 25%)', async () => {
        const dataPoint = { rtuId: '1001', tag: 'Tag1', value: 0, sourceType: 'DIGITAL' };

        // Generate history with 8 faulty (0) and 24 healthy (1) records
        const history = [];
        for (let i = 0; i < 8; i++) history.push({ RTUNumber: '1001', Tag1: 0, DateTimeField: new Date() });
        for (let i = 0; i < 24; i++) history.push({ RTUNumber: '1001', Tag1: 1, DateTimeField: new Date() });

        const rule = await evaluatePercentageRule(dataPoint, history);

        expect(rule).toBeDefined();
        expect(rule.tag).toBe('Tag1');
        expect(Number(rule.stats.percent)).toBe(25);
        expect(rule.stats.faultCount).toBe(8);
        expect(rule.stats.totalCount).toBe(32);
    });

    test('should NOT trigger if threshold not met (N=32, F=2 -> 6.25%)', async () => {
        const dataPoint = { rtuId: '1001', tag: 'Tag1', value: 0, sourceType: 'DIGITAL' };

        const history = [];
        for (let i = 0; i < 2; i++) history.push({ RTUNumber: '1001', Tag1: 0, DateTimeField: new Date() });
        for (let i = 0; i < 30; i++) history.push({ RTUNumber: '1001', Tag1: 1, DateTimeField: new Date() });

        const rule = await evaluatePercentageRule(dataPoint, history);

        expect(rule).toBeNull();
    });

    test('should respect windowHours when filtering history', async () => {
        const dataPoint = { rtuId: '1001', tag: 'Tag2', value: 15, sourceType: 'DIGITAL' };

        const now = Date.now();
        const history = [
            { RTUNumber: '1001', Tag2: 15, DateTimeField: new Date(now - 1 * 60 * 60 * 1000) }, // 1h ago (IN)
            { RTUNumber: '1001', Tag2: 15, DateTimeField: new Date(now - 20 * 60 * 60 * 1000) }, // 20h ago (IN)
            { RTUNumber: '1001', Tag2: 15, DateTimeField: new Date(now - 30 * 60 * 60 * 1000) }, // 30h ago (OUT of 24h window)
            { RTUNumber: '1001', Tag2: 5, DateTimeField: new Date(now - 5 * 60 * 60 * 1000) }    // 5h ago (IN, but healthy)
        ];

        // Rules: thresholdPercent: 50, windowHours: 24
        // In window: 3 records (1h, 20h, 5h). 
        // Faulty in window: 2 records (1h, 20h).
        // Percent: 2/3 = 66.67% (Should trigger)

        const rule = await evaluatePercentageRule(dataPoint, history);

        expect(rule).toBeDefined();
        expect(rule.stats.totalCount).toBe(3);
        expect(rule.stats.faultCount).toBe(2);
        expect(Number(rule.stats.percent)).toBeCloseTo(66.67);
    });

    test('should handle missing tags in history records gracefully', async () => {
        const dataPoint = { rtuId: '1001', tag: 'Tag1', value: 0, sourceType: 'DIGITAL' };
        const history = [
            { RTUNumber: '1001', Tag1: 0, DateTimeField: new Date() },
            { RTUNumber: '1001', OtherTag: 10, DateTimeField: new Date() } // Missing Tag1
        ];

        const rule = await evaluatePercentageRule(dataPoint, history);

        // Should count only 1st record. 1/1 = 100%
        expect(rule).toBeDefined();
        expect(rule.stats.totalCount).toBe(1);
    });

    describe('SQL Alignment Checks', () => {
        // Mock Config for this specific test block
        const alignmentConfig = {
            syncRules: {
                ruleSets: {
                    diRules: {
                        enabled: true,
                        rules: [
                            {
                                tag: 'Tag7', condition: 'equals', value: 1, thresholdPercent: 10, windowHours: 24, enabled: true,
                                prerequisite: { tag: 'Tag6', value: 1, table: 'ANALOGUEDATA', condition: 'equals' }
                            }
                        ]
                    }
                }
            }
        };

        // Re-mock helper to inject custom config just for this sub-suite? 
        // Or simply pass rules directly since evaluatePercentageRule accepts ruleSource.
        // The function signature is (dataPoint, history, ruleSource, context)

        test('should IGNORE fault if prerequisite (Tag6=1) is MISSING in context', async () => {
            const dataPoint = { rtuId: '2001', tag: 'Tag7', value: 1, sourceType: 'DIGITAL' };
            const history = Array(10).fill({ RTUNumber: '2001', Tag7: 1, DateTimeField: new Date() }); // 100% fault
            const context = { relatedPoints: [] }; // Empty context

            const rule = await evaluatePercentageRule(dataPoint, history, alignmentConfig.syncRules.ruleSets, context);

            expect(rule).toBeNull(); // Should skip due to missing pre
        });

        test('should IGNORE fault if prerequisite (Tag6=1) is INVALID (Tag6=0)', async () => {
            const dataPoint = { rtuId: '2001', tag: 'Tag7', value: 1, sourceType: 'DIGITAL' };
            const history = Array(10).fill({ RTUNumber: '2001', Tag7: 1, DateTimeField: new Date() });
            const context = {
                relatedPoints: [
                    { rtuId: '2001', tag: 'Tag6', value: 0, sourceType: 'ANALOG' } // Tag6=0 (OFF)
                ]
            };

            const rule = await evaluatePercentageRule(dataPoint, history, alignmentConfig.syncRules.ruleSets, context);

            expect(rule).toBeNull(); // Should skip due to value mismatch
        });

        test('should REGISTER fault if prerequisite (Tag6=1) is VALID', async () => {
            const dataPoint = { rtuId: '2001', tag: 'Tag7', value: 1, sourceType: 'DIGITAL' };
            const history = Array(10).fill({ RTUNumber: '2001', Tag7: 1, DateTimeField: new Date() });
            const context = {
                relatedPoints: [
                    { rtuId: '2001', tag: 'Tag6', value: 1, sourceType: 'ANALOG' } // Tag6=1 (ON)
                ]
            };

            const rule = await evaluatePercentageRule(dataPoint, history, alignmentConfig.syncRules.ruleSets, context);

            expect(rule).toBeDefined();
            expect(rule.description).toBeUndefined(); // Config mock didn't have desc, but object should exist
            expect(rule.tag).toBe('Tag7');
        });
    });
});
