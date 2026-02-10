
import { jest } from '@jest/globals';

// Mocks
jest.unstable_mockModule('../src/logger.js', () => ({
    v2Logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    logV2Payload: jest.fn()
}));

jest.unstable_mockModule('../src/services/powerFail.service.js', () => ({
    PowerFailService: jest.fn().mockImplementation(() => ({
        detect: jest.fn().mockResolvedValue([])
    }))
}));

jest.unstable_mockModule('../src/services/commFail.service.js', () => ({
    CommFailService: jest.fn().mockImplementation(() => ({
        detect: jest.fn().mockResolvedValue([])
    }))
}));

jest.unstable_mockModule('../src/services/trip.service.js', () => ({
    TripService: jest.fn().mockImplementation(() => ({
        detect: jest.fn().mockResolvedValue([])
    }))
}));

jest.unstable_mockModule('../src/services/lampFailure.service.js', () => ({
    LampFailureService: jest.fn().mockImplementation(() => ({
        detect: jest.fn().mockResolvedValue([])
    }))
}));

const { RuleEngine } = await import('../src/ruleEngine.js');

describe('V2 RuleEngine Orchestrator', () => {
    let engine;

    beforeEach(() => {
        jest.clearAllMocks();
        engine = new RuleEngine();
    });

    test('should prioritize Power Failure over everything else', async () => {
        // Mock Power service to return a fault
        engine.powerService.detect.mockResolvedValue([
            { rtuId: '101', type: 'POWER_FAIL', description: 'Power Out', time: new Date() }
        ]);

        // Mock Lamp service to also return a fault (subordinate)
        engine.lampService.detect.mockResolvedValue([
            { rtuId: '101', type: 'LAMP_FAILURE', description: 'Lamp Out', time: new Date() }
        ]);

        const payloads = await engine.run(new Date());

        expect(payloads).toHaveLength(1);
        expect(payloads[0].faultType).toBe('POWER_FAIL');
        expect(payloads[0].rtuNumber).toBe(101);
    });

    test('should allow multiple Trip and Lamp faults for same RTU if no P1/P2', async () => {
        engine.tripService.detect.mockResolvedValue([
            { rtuId: '202', type: 'SINGLE_PHASE_TRIP', description: 'Trip R', time: new Date() }
        ]);
        engine.lampService.detect.mockResolvedValue([
            { rtuId: '202', type: 'LAMP_FAILURE', description: 'Lamp Fail', time: new Date() }
        ]);

        const payloads = await engine.run(new Date());

        expect(payloads).toHaveLength(2);
        const types = payloads.map(p => p.faultType);
        expect(types).toContain('SINGLE_PHASE_TRIP');
        expect(types).toContain('LAMP_FAILURE');
    });
});
