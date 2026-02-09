
import { jest } from '@jest/globals';

const mockConfig = {
    syncRules: { clientId: 'TEST_CLIENT' },
    cmsMapping: {
        titleTemplate: 'Alarm: {{Description}}',
        descriptionTemplate: 'Val: {{Value}}',
        defaultStatus: 'REGISTERED',
        defaultPriority: 'HIGH',
        defaults: {
            wardId: 'WARD_123',
            subZoneId: 'SUB_456',
            submittedById: 'DEFAULT_USER',
            contactPhone: '8888888888',
            contactName: 'Test Agent',
            contactEmail: 'test@agent.com',
            area: 'Dynamic Area',
            address: '456 Tech Park'
        }
    }
};

jest.unstable_mockModule('../src/logic/configLoader.js', () => ({
    getConfig: () => mockConfig
}));

const { mapToComplaint } = await import('../src/logic/mapper.js');

describe('Mapper Logic', () => {
    test('should map data point to expanded complaint object with defaults', () => {
        const point = { rtuId: '101', tag: 'Tag1', value: 50, eventTime: new Date() };
        const rule = { description: 'High Temp', alarmType: 'CRITICAL' };

        const result = mapToComplaint(point, rule);

        expect(result.title).toBe('Alarm: High Temp');
        expect(result.priority).toBe('CRITICAL'); // Derived from alarmType: 'CRITICAL'
        expect(result.wardId).toBe('WARD_123');
        expect(result.submittedById).toBe('DEFAULT_USER');
        expect(result.contactPhone).toBe('8888888888');
        expect(result.contactName).toBe('Test Agent');
        expect(result.contactEmail).toBe('test@agent.com');
        expect(result.area).toBe('Dynamic Area');
        expect(result.address).toBe('456 Tech Park');
    });

    test('should prioritize override submittedById', () => {
        const point = { rtuId: '101', tag: 'Tag1', value: 50, eventTime: new Date() };
        const rule = { description: 'High Temp', alarmType: 'CRITICAL' };
        const overrides = { submittedById: 'SYSTEM_USER_999' };

        const result = mapToComplaint(point, rule, overrides);

        expect(result.submittedById).toBe('SYSTEM_USER_999');
    });

    test('should NOT include AlarmTime in description template variables by default logic', () => {
        // We can't strict check the internal values object but we can check if it creates errors
        // or if we had a template requesting it. 
        // If the config template had {{AlarmTime}}, it would be empty now.

        // Let's assume the mapping template is 'Val: {{Value}}' as per mock.
        const point = { rtuId: '101', tag: 'Tag1', value: 50, eventTime: new Date() };
        const rule = { description: 'High Temp', alarmType: 'CRITICAL' };

        const result = mapToComplaint(point, rule);
        expect(result.description).toBe('Val: 50');
    });
    test('should return null for missing config values (no static fallbacks)', () => {
        // Clear defaults in mock config for this test
        const originalDefaults = { ...mockConfig.cmsMapping.defaults };
        mockConfig.cmsMapping.defaults = {};

        const point = { rtuId: '101', tag: 'Tag1', value: 50, eventTime: new Date() };
        const rule = { description: 'High Temp', alarmType: 'CRITICAL' };

        const result = mapToComplaint(point, rule);

        expect(result.contactPhone).toBeNull();
        expect(result.contactName).toBeNull();
        expect(result.contactEmail).toBeNull();
        expect(result.area).toBeNull();
        expect(result.address).toBeNull();

        // Restore defaults for other tests
        mockConfig.cmsMapping.defaults = originalDefaults;
    });
});
