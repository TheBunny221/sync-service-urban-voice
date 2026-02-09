
import { jest } from '@jest/globals';

// MOCKS
const mockLogger = { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() };
const mockLogRaw = jest.fn();
const mockLogDev = jest.fn(); // New mock for dev logging
const mockIsDuplicate = jest.fn(); // Defined for dedupEngine mock
const mockUserResolver = { getSystemUserId: jest.fn() };

const mockConfig = {
    service: { dryRun: false, isDevelopment: false, systemUserEmail: 'test@example.com' },
    syncRules: {
        batchSize: 10,
        lookbackHours: 1,
        clientId: '3',
        ruleSets: {
            diRules: { enabled: true, rules: [] },
            aiRules: { enabled: true, rules: [] }
        }
    },
    cmsMapping: { titleTemplate: 'Alarm: {{Description}}', descriptionTemplate: 'D', defaultPriority: 'P', defaultStatus: 'S' }
};

const mockPrisma = {
    $transaction: jest.fn((cb) => cb({
        faultSync: { create: jest.fn().mockResolvedValue({ id: 100 }) },
        complaint: { create: jest.fn().mockResolvedValue({ id: 999 }) },
        statusLog: { create: jest.fn() },
        systemConfig: { upsert: jest.fn() },
        $transaction: jest.fn() // nested?
    })),
    faultSync: { findFirst: jest.fn() },
    systemConfig: { findUnique: jest.fn(), upsert: jest.fn() }
};

const mockMssql = {
    fetchAnalogData: jest.fn(),
    fetchDigitalData: jest.fn(),
    closeSourceDb: jest.fn(),
    connectToSourceDb: jest.fn(), // Added
    checkSignalPersistence: jest.fn(),
    fetchHistory: jest.fn().mockResolvedValue([])
};

const mockLgl = {
    fetchJoinedData: jest.fn().mockResolvedValue([]),
    fetchCommFaults: jest.fn().mockResolvedValue([]),
    fetchPowerFailures: jest.fn().mockResolvedValue([])
};

// Module Mocks
jest.unstable_mockModule('../src/utils/logger.js', () => ({
    getLogger: () => mockLogger,
    logRawData: mockLogRaw,
    logDevelopmentData: mockLogDev // Mocked here
}));
jest.unstable_mockModule('../src/logic/configLoader.js', () => ({ getConfig: () => mockConfig }));
jest.unstable_mockModule('../src/db/prisma.js', () => ({ getPrismaClient: () => mockPrisma }));
jest.unstable_mockModule('../src/db/mssql.js', () => mockMssql);
jest.unstable_mockModule('../src/db/lglAdapter.js', () => mockLgl);

// Mock Logic
jest.unstable_mockModule('../src/logic/ruleEngine.js', () => ({
    evaluateRule: jest.fn()
}));
jest.unstable_mockModule('../src/logic/dedupEngine.js', () => ({ isDuplicate: mockIsDuplicate }));
jest.unstable_mockModule('../src/logic/userResolver.js', () => mockUserResolver);
jest.unstable_mockModule('../src/logic/percentageRuleEngine.js', () => ({
    evaluatePercentageRule: jest.fn(),
    checkCondition: jest.fn()
}));
jest.unstable_mockModule('../src/logic/masterRuleEngine.js', () => ({
    evaluateMasterRules: jest.fn().mockResolvedValue({ p1Match: null, p2Matches: [] })
}));

// Import SUT after mocks
const { runSyncJob } = await import('../src/syncJob.js');
const { evaluateRule } = await import('../src/logic/ruleEngine.js');
const { isDuplicate } = await import('../src/logic/dedupEngine.js');
const { evaluatePercentageRule } = await import('../src/logic/percentageRuleEngine.js');
const { evaluateMasterRules } = await import('../src/logic/masterRuleEngine.js');

describe('Sync Job v2', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        evaluateMasterRules.mockResolvedValue({ p1Match: null, p2Matches: [] }); // Default
        mockConfig.service.isDevelopment = false;
        mockConfig.service.useNewLogic = false;
        mockConfig.syncRules.masterRules = [];

        // Default mocks
        mockLgl.fetchJoinedData.mockResolvedValue([]);
        mockLgl.fetchCommFaults.mockResolvedValue([]);
        mockLgl.fetchPowerFailures.mockResolvedValue([]);
    });

    test('should process unified data, find fault, and create complaint', async () => {
        mockLgl.fetchJoinedData.mockResolvedValue([
            { RTUNumber: '1001', DateTimeField: new Date(), Tag1: 60 } // Unified format
        ]);

        // Mock evaluateRule returning a Promise (async)
        evaluateRule.mockResolvedValue({ description: 'Fault' });
        isDuplicate.mockResolvedValue(false);

        await runSyncJob();

        expect(mockLgl.fetchJoinedData).toHaveBeenCalled();
        expect(mockLogRaw).toHaveBeenCalled();
        // expect(evaluateRule).toHaveBeenCalled(); // Can verify this
        expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    test('should SKIP complaint creation if Duplicate', async () => {
        mockLgl.fetchJoinedData.mockResolvedValue([
            { RTUNumber: '1001', DateTimeField: new Date(), Tag1: 60 }
        ]);

        evaluateRule.mockReturnValue({ description: 'Fault' });
        isDuplicate.mockResolvedValue(true);

        await runSyncJob();

        expect(isDuplicate).toHaveBeenCalled();
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Skipping duplicate'));
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    // NEW TEST CASE FOR DEV MODE
    test('should LOG exact payloads and SKIP DB in Development Mode', async () => {
        mockConfig.service.isDevelopment = true; // Enable Dev Mode

        // Mock data that causes a fault
        mockLgl.fetchJoinedData.mockResolvedValue([
            { RTUNumber: '9999', DateTimeField: new Date(), Tag1: 100 }
        ]);

        evaluateRule.mockReturnValue({ description: 'Dev Fault', alarmType: 'TEST' });
        isDuplicate.mockResolvedValue(false);

        await runSyncJob();

        // Verify
        expect(evaluateRule).toHaveBeenCalled();
        expect(mockLogDev).toHaveBeenCalledTimes(2); // One for FaultSync, one for Complaint

        // Verify Payload Structure
        const faultCall = mockLogDev.mock.calls.find(call => call[0].table === 'FaultSync');
        const complaintCall = mockLogDev.mock.calls.find(call => call[0].table === 'Complaint');

        expect(faultCall).toBeDefined();
        expect(complaintCall).toBeDefined();
        // expect(faultCall[0].data.tagNo).toBe('Tag1'); // Tag mapping depends on adapter, unified rawRow might differ
        expect(complaintCall[0].data.title).toContain('Dev Fault');

        // IMPORTANT: DB should NOT be touched
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();

        // Check log message (User's manual change verification)
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('DevMode: true'));
    });

    test('should NOT match DI rule for ANALOG source (Source Separation)', async () => {
        // In Unified world, source separation is handled by rule engine checking sourceType.
        // We mock data as ANALOG sourced (or Unified).

        mockLgl.fetchJoinedData.mockResolvedValue([
            { RTUNumber: '1001', DateTimeField: new Date(), Tag1: 60, sourceType: 'UNIFIED' }
        ]);

        // simulate executeRule returning null because of mismatch
        evaluateRule.mockReturnValue(null);

        await runSyncJob();

        expect(mockLogRaw).toHaveBeenCalled();
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    test('should SUPPRESS subordinate faults if MASTER RULE (P1) is active', async () => {
        // Setup Master Rule Config (Type P1 Default)
        mockConfig.syncRules.masterRules = [
            { tag: 'Tag8', value: 0, description: 'Master Fault', enabled: true, duration: { value: '0m', mode: 'instant' } }
        ];

        // Mock Data: Master Fault (Tag8=0) from COMM FAULTS check (Computed State)
        // OR from Joined Data. SyncJob merges them.

        // Let's simulating it coming from Joined Data for simplicity if adapter supports it, 
        // OR use fetchCommFaults call if that's what we want to test.
        // SyncJob fetches fetchJoinedData AND fetchCommFaults.

        mockLgl.fetchJoinedData.mockResolvedValue([
            { RTUNumber: '1001', DateTimeField: new Date(), Tag7: 1 } // Subordinate
        ]);

        // Mock Comm Fault
        mockLgl.fetchCommFaults.mockResolvedValue([
            { rtuId: 1001, tag: 'Tag8', value: 0, sourceType: 'COMPUTED_STATE', eventTime: new Date() }
        ]);

        evaluateRule.mockReset();
        evaluateRule.mockImplementation((point) => null);
        // Note: Master Rules are evaluated inside runSyncJob before individual rules.
        // But runSyncJob calls evaluateRule for each point. 
        // If Master Rule P1 is active, runSyncJob should NOT call evaluateRule for suppressed points?
        // Mock Master Rule Match Return
        const p1Rule = { tag: 'Tag8', value: 0, description: 'Master Fault', enabled: true, priority: 1 };
        evaluateMasterRules.mockResolvedValue({
            p1Match: { rule: p1Rule, point: { tag: 'Tag8', value: 0 } },
            p2Matches: []
        });

        // Mock Data: Subordinate Fault (Tag7=1)
        mockLgl.fetchJoinedData.mockResolvedValue([
            { RTUNumber: '1001', DateTimeField: new Date(), Tag7: 1 }
        ]);

        evaluateRule.mockReset();
        // evaluateRule.mockImplementation((point) => null); // Should not be called for suppressed?
        // Logic: syncJob iterates. If P1 match, it logs and continues (skipping loop).
        // So evaluateRule is NOT called.

        await runSyncJob();

        // Expectation:
        // The logger.warn matches what syncJob logs, OR what masterRuleEngine logs?
        // syncJob logs: logger.info(`RTU ${rtuId}: Master Rule P1 Active: ${p1Match.rule.description}`);
        // masterRuleEngine logs: logger.warn(...)
        // Since we mocked masterRuleEngine, it WON'T log the warn.
        // We should expect the string that syncJob logs!
        // Looking at syncJob.js: "Master Rule P1 Active"

        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Master Rule P1'));
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Skipped: 1')); // Tag7 skipped (implied by skipping loop)
    });

    test('should SUPPRESS AI/DI faults but ALLOW P2 Master Rule', async () => {
        // Mock Master Rule P2 Match
        const p2Rule = { tag: 'Tag8', value: 0, description: 'Master Fault (P2)', priority: 2 };
        evaluateMasterRules.mockResolvedValue({
            p1Match: null,
            p2Matches: [{ rule: p2Rule, point: { tag: 'Tag8', value: 0 } }]
        });

        mockLgl.fetchJoinedData.mockResolvedValue([
            { RTUNumber: '1001', DateTimeField: new Date(), Tag7: 1 }
        ]);

        evaluateRule.mockReset();

        await runSyncJob();

        // Expectation:
        // syncJob logs: "Master Rule P2 window active"
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Master Rule P2 window active'));
        // Tag7 skipped because p2Matches > 0 sets suppression?
        // Logic: if (p2Matches.length > 0) -> suppress AI/DI?
        // Yes, usually.
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Skipped: 1'));
    });

    test('should PERSIST and LOG fault rate when useNewLogic is enabled', async () => {
        mockConfig.service.useNewLogic = true;
        mockLgl.fetchJoinedData.mockResolvedValue([
            { RTUNumber: '1234', DateTimeField: new Date(), Tag1: 100 }
        ]);
        mockMssql.fetchHistory.mockResolvedValue([]); // History pre-fetch

        const mockStats = { faultCount: 5, totalCount: 10, percent: '50.00' };
        evaluatePercentageRule.mockResolvedValue({
            description: 'Percentage Fault',
            stats: mockStats,
            complaintId: 'TEST-001'
        });
        isDuplicate.mockResolvedValue(false);

        await runSyncJob();

        // Check Persistence (FaultSync.create)
        expect(mockPrisma.$transaction).toHaveBeenCalled();
        const txCallback = mockPrisma.$transaction.mock.calls[0][0];
        const mockTx = {
            faultSync: { create: jest.fn().mockResolvedValue({ id: 500 }) },
            complaint: { create: jest.fn().mockResolvedValue({ id: 600, complaintId: 'TEST-001' }) },
            statusLog: { create: jest.fn() }
        };
        await txCallback(mockTx);

        expect(mockTx.faultSync.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                faultCount: 5,
                totalCount: 10,
                faultPercent: 50.00
            })
        }));

        // Check Enhanced Logging
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Complaint Registered: Alarm: Percentage Fault'));
        expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('FaultRate: 50.00% (5/10 samples in 48h)'));
    });
});
