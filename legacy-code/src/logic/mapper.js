
import { getConfig } from '../logic/configLoader.js';

function formatString(template, values) {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] || '');
}

function mapPriority(alarmType) {
    if (!alarmType) return null;
    const type = alarmType.toUpperCase();
    if (type === 'CRITICAL') return 'CRITICAL';
    if (type === 'MAJOR') return 'HIGH';
    if (type === 'MINOR' || type === 'WARN' || type === 'WARNING') return 'MEDIUM';
    if (type === 'INFO' || type === 'STATUS' || type === 'LOW') return 'LOW';
    return null; // Fallback to default
}

export function mapToComplaint(dataPoint, rule, overrides = {}) {
    const config = getConfig();
    const mapping = config.cmsMapping;
    const defaults = mapping.defaults || {};

    // Prepare values for templates
    const values = {
        Description: rule.description || 'Fault Detected',
        TagNumber: dataPoint.tag,
        AlarmType: rule.alarmType || 'GENERAL',
        // AlarmTime removed from description as per CMS requirement
        Value: dataPoint.value,
        RtuId: dataPoint.rtuId,
        // Statistical fields for percentage engine
        FaultCount: rule.stats?.faultCount || 0,
        TotalCount: rule.stats?.totalCount || 0,
        Percent: rule.stats?.percent || '0.00'
    };

    const title = formatString(mapping.titleTemplate, values);
    const description = formatString(mapping.descriptionTemplate, values);
    const now = new Date(); // Local processing time for submittedOn

    return {
        // Core Fields
        title,
        description,
        status: mapping.defaultStatus,  // e.g. REGISTERED
        priority: mapPriority(rule.alarmType) || mapping.defaultPriority,
        clientId: config.syncRules.clientId,

        // Extended Fields
        type: rule.complaintType || 'Street Lighting',
        complaintTypeId: null, // We intentionally do not link ID to avoid DB dependency issues
        slaStatus: defaults.slaStatus || 'ON_TIME',
        isAnonymous: typeof defaults.isAnonymous === 'boolean' ? defaults.isAnonymous : false,
        assignToTeam: typeof defaults.assignToTeam === 'boolean' ? defaults.assignToTeam : false,
        submittedOn: now, // Urban Voice standard: submission time is now
        contactPhone: overrides.contactPhone || defaults.contactPhone || null,
        contactName: defaults.contactName || null,
        contactEmail: defaults.contactEmail || null,

        // Location & User Defaults 
        wardId: defaults.wardId || null,
        subZoneId: defaults.subZoneId || null,
        submittedById: overrides.submittedById || defaults.submittedById, // Prefer override (System User)
        area: defaults.area || null,
        address: defaults.address || null,

        // Links
        tags: JSON.stringify({
            rtuId: dataPoint.rtuId,
            tag: dataPoint.tag,
            rawType: rule.alarmType,
            value: dataPoint.value
        }),
    };
}
