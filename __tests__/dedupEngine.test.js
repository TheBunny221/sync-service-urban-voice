
import { jest } from '@jest/globals';

const mockPrisma = {
    faultSync: { findFirst: jest.fn() },
};

const mockLogger = { info: jest.fn(), error: jest.fn() };
const mockLogSkipped = jest.fn();

jest.unstable_mockModule('../src/db/prisma.js', () => ({
    getPrismaClient: () => mockPrisma,
}));

jest.unstable_mockModule('../src/utils/logger.js', () => ({
    getLogger: () => mockLogger,
    logSkipped: mockLogSkipped
}));

// We don't need configLoader for this logic anymore if we verify hardcoded statuses or pass them in.
// But the original file imports it, so we might need to mock it if it's still imported (it was removed in my write_to_file above).
// Wait, I removed the import of configLoader in the previous step's write_to_file.

const { isDuplicate } = await import('../src/logic/dedupEngine.js');

describe('Dedup Engine v3 (Status Based)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should allow if No previous FaultSync exists', async () => {
        mockPrisma.faultSync.findFirst.mockResolvedValue(null);
        const data = { rtuId: '1001', tag: 'Tag1' };
        expect(await isDuplicate(data)).toBe(false);
    });

    test('should allow if Previous FaultSync exists but has NO complaint', async () => {
        mockPrisma.faultSync.findFirst.mockResolvedValue({
            id: 500,
            complaints: []
        });
        const data = { rtuId: '1001', tag: 'Tag1' };
        expect(await isDuplicate(data)).toBe(false);
    });

    test('should SKIP if Linked Complaint is OPEN', async () => {
        mockPrisma.faultSync.findFirst.mockResolvedValue({
            id: 500,
            complaints: [{ id: 99, status: 'OPEN' }]
        });
        const data = { rtuId: '1001', tag: 'Tag1' };

        expect(await isDuplicate(data)).toBe(true);
        expect(mockLogSkipped).toHaveBeenCalled(); // Check separate log
    });

    test('should SKIP if Linked Complaint is IN_PROGRESS', async () => {
        mockPrisma.faultSync.findFirst.mockResolvedValue({
            id: 500,
            complaints: [{ id: 99, status: 'IN_PROGRESS' }]
        });
        const data = { rtuId: '1001', tag: 'Tag1' };
        expect(await isDuplicate(data)).toBe(true);
    });

    test('should allow if Linked Complaint is CLOSED', async () => {
        mockPrisma.faultSync.findFirst.mockResolvedValue({
            id: 500,
            complaints: [{ id: 99, status: 'CLOSED' }]
        });
        const data = { rtuId: '1001', tag: 'Tag1' };

        expect(await isDuplicate(data)).toBe(false);
        expect(mockLogSkipped).not.toHaveBeenCalled();
    });
});
