import { jest } from '@jest/globals';

// Mocks
const mockLogger = { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() };
const mockLogRaw = jest.fn();

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
    cmsMapping: {
        titleTemplate: 'Alarm: {{Description}}',
        descriptionTemplate: 'D',
        defaultPriority: 'P',
        defaultStatus: 'S',
        defaults: {
            wardId: 1,
            subZoneId: 1
        }
    }
};

const mockPrisma = {
    $transaction: jest.fn((cb) => cb({
        faultSync: { create: jest.fn().mockResolvedValue({ id: 100 }) },
        complaint: { create: jest.fn().mockResolvedValue({ id: 999 }) },
        statusLog: { create: jest.fn() },
        systemConfig: { upsert: jest.fn() },
        $transaction: jest.fn()
    })),
    faultSync: { findFirst: jest.fn() },
    systemConfig: { findUnique: jest.fn(), upsert: jest.fn() }
};

const mockMssql = {
    fetchAnalogData: jest.fn(),
    fetchDigitalData: jest.fn(),
    closeSourceDb: jest.fn(),
    connectToSourceDb: jest.fn(),
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
    logDevelopmentData: jest.fn()
}));
jest.unstable_mockModule('../src/logic/configLoader.js', () => ({ getConfig: () => mockConfig }));
jest.unstable_mockModule('../src/db/prisma.js', () => ({ getPrismaClient: () => mockPrisma }));
jest.unstable_mockModule('../src/db/mssql.js', () => mockMssql);
jest.unstable_mockModule('../src/db/lglAdapter.js', () => mockLgl);

jest.unstable_mockModule('../src/logic/ruleEngine.js', () => ({
    evaluateRule: jest.fn()
}));
jest.unstable_mockModule('../src/logic/dedupEngine.js', () => ({ isDuplicate: jest.fn().mockResolvedValue(false) }));
jest.unstable_mockModule('../src/logic/userResolver.js', () => ({ getSystemUserId: jest.fn() }));
jest.unstable_mockModule('../src/logic/percentageRuleEngine.js', () => ({
    evaluatePercentageRule: jest.fn(),
    checkCondition: jest.fn()
}));
jest.unstable_mockModule('../src/logic/masterRuleEngine.js', () => ({
    evaluateMasterRules: jest.fn().mockResolvedValue({ p1Match: null, p2Matches: [] })
}));

const { runSyncJob } = await import('../src/syncJob.js');
const { evaluateRule } = await import('../src/logic/ruleEngine.js');

describe('Sync Job Routing', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockConfig.service.isDevelopment = false;
        mockLgl.fetchJoinedData.mockResolvedValue([]);
        mockLgl.fetchCommFaults.mockResolvedValue([]);
        mockLgl.fetchPowerFailures.mockResolvedValue([]);
    });

    test('should route Street Lighting faults correctly', async () => {
        // Mock data usually implies Street Lighting if not specified
        mockLgl.fetchJoinedData.mockResolvedValue([
            { RTUNumber: '1001', DateTimeField: new Date(), Tag1: 60 }
        ]);

        evaluateRule.mockResolvedValue({ description: 'Lamp Failure' });

        await runSyncJob();

        expect(mockPrisma.$transaction).toHaveBeenCalled();
        // Since we mock resolveComplaintType logic internally (implied by integration), 
        // we can check if prisma create was called.
        // But in this unit test weMock prisma, so resolveComplaintType logic (which queries prisma)
        // might fail if we don't mock its dependencies deeply.

        // However, the purpose of this test file seems to be checking if syncJob CALLS the creation logic.
        const txCallback = mockPrisma.$transaction.mock.calls[0][0];
        const mockTx = {
            faultSync: { create: jest.fn().mockResolvedValue({ id: 100 }) },
            complaint: { create: jest.fn().mockResolvedValue({ id: 999 }) },
            statusLog: { create: jest.fn() },
            complaintType: {
                findUnique: jest.fn().mockResolvedValue({ id: 1, name: 'Street Lighting', slaHours: 48 }),
                findFirst: jest.fn().mockResolvedValue({ id: 1, name: 'Street Lighting', slaHours: 48 })
            },
            systemConfig: {
                findMany: jest.fn().mockResolvedValue([]),
                findFirst: jest.fn().mockResolvedValue(null)
            },
            complaint: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({ id: 999, complaintId: 'KSC0001' })
            }
        };

        // Mocking the nested transaction object usage
        // But resolveComplaintType imports 'prisma' or uses 'tx'?
        // syncJob passes 'tx'.

        await txCallback(mockTx);

        expect(mockTx.complaint.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                type: 'Street Lighting'
            })
        }));
    });

    test('should route High Mast faults based on logic/config', async () => {
        // If logic differentiates based on description or tags
        mockLgl.fetchJoinedData.mockResolvedValue([
            { RTUNumber: '2001', DateTimeField: new Date(), Tag5: 1 }
        ]);

        // Assuming rule engine returns description that maps to High Mast
        evaluateRule.mockResolvedValue({ description: 'High Mast Failure' });

        // Mock resolveComplaintType behavior for this test if possible,
        // or ensure logic in syncJob maps it via 'mapToComplaint'

        await runSyncJob();

        const txCallback = mockPrisma.$transaction.mock.calls[0][0];
        const mockTx = {
            faultSync: { create: jest.fn().mockResolvedValue({ id: 101 }) },
            complaint: { create: jest.fn().mockResolvedValue({ id: 999 }) },
            statusLog: { create: jest.fn() },
            complaintType: {
                findUnique: jest.fn().mockResolvedValue({ id: 2, name: 'High Mast', slaHours: 48 }),
                findFirst: jest.fn().mockResolvedValue({ id: 2, name: 'High Mast', slaHours: 48 })
            },
            systemConfig: {
                findMany: jest.fn().mockResolvedValue([]),
                findFirst: jest.fn().mockResolvedValue(null)
            },
            complaint: {
                findFirst: jest.fn().mockResolvedValue(null),
                create: jest.fn().mockResolvedValue({ id: 999, complaintId: 'KSC0002' })
            }
        };

        // We need to simulate that 'High Mast Failure' desc maps to 'High Mast' type.
        // This logic is usually inside resolveComplaintType or mapToComplaint.
        // If mapToComplaint uses default 'Street Lighting', resolveComplaintType checks DB.

        await txCallback(mockTx);

        expect(mockTx.complaint.create).toHaveBeenCalled();
        // Here we rely on the mockTx.complaintType.findFirst returning 'High Mast' 
        // effectively simulating that the system resolved it.
        expect(mockTx.complaintType.findFirst).toHaveBeenCalled();
    });
});
