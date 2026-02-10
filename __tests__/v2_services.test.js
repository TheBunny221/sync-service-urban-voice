
import { jest } from '@jest/globals';

// 1. Mock the logger
jest.unstable_mockModule('../src/logger.js', () => ({
    v2Logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }
}));

// 2. Mock Config
jest.unstable_mockModule('../src/config/configLoader.js', () => ({
    getConfig: () => ({
        syncRules: {
            clientId: '3'
        }
    })
}));

// 3. Mock DB
const mockRequest = {
    input: jest.fn().mockReturnThis(),
    query: jest.fn()
};

jest.unstable_mockModule('../src/db/mssql.js', () => ({
    connectToSourceDb: jest.fn().mockResolvedValue({
        request: () => mockRequest
    }),
    getConfig: () => ({})
}));

const { PowerFailService } = await import('../src/services/powerFail.service.js');

describe('V2 PowerFail Service', () => {
    test('should detect power failure from database records', async () => {
        const mockRows = [
            { RTUNumber: 101, Tag16: 0, DateTimeField: new Date() }
        ];
        mockRequest.query.mockResolvedValueOnce({ recordset: mockRows });

        const service = new PowerFailService();
        const faults = await service.detect(new Date());

        expect(faults).toHaveLength(1);
        expect(faults[0].rtuId).toBe('101');
        expect(faults[0].type).toBe('POWER_FAIL');
    });

    test('should return empty array if no power failures found', async () => {
        mockRequest.query.mockResolvedValueOnce({ recordset: [] });

        const service = new PowerFailService();
        const faults = await service.detect(new Date());

        expect(faults).toHaveLength(0);
    });
});
