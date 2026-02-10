
import crypto from 'crypto';
import { generateComplaintId, resolveComplaintType } from './utils/cmsIntegration.js';
import { getConfig } from './config/configLoader.js';

export async function mapToCmsPayload(fault, tx) {
    const config = getConfig();
    const now = new Date();
    const mapping = config.cmsMapping || {};
    const defaults = mapping.defaults || {};
    const typeMap = mapping.complaintTypeMap || {};



    // 1. Generate ID using CMS Logic
    // tx is required for DB lookup
    const newComplaintId = await generateComplaintId(tx);

    // 2. Resolve Complaint Type 
    // Priority: 1. Map from Fault Type (Config) -> 2. Default Config Type -> 3. Hardcoded Fallback
    const mappedType = typeMap[fault.faultType]; // e.g. "Unavailability of incoming power supply"
    const typeName = mappedType || defaults.defaultType || 'Street Lighting';

    // Resolve ID from DB based on name
    const resolvedType = await resolveComplaintType(tx, typeName);

    // 3. Map Priority
    let priority = mapping.defaultPriority || 'MEDIUM'; // Default from config
    const typeVal = fault.faultType;
    if (typeVal === 'POWER_FAIL' || typeVal === 'SINGLE_PHASE_TRIP' || typeVal === 'THREE_PHASE_TRIP') {
        priority = 'HIGH';
    } else if (typeVal === 'LAMP_FAILURE') {
        priority = 'MEDIUM';
    } else if (typeVal === 'COMMUNICATION_FAIL') {
        priority = 'LOW';
    }

    const displayedType = typeName || typeVal; // Use Mapped Name if available

    // 4. Construct Value for Description (only include available data)
    const descParts = ['Detailed Fault Report:'];
    if (displayedType) descParts.push(`Type: ${displayedType}`);
    if (fault.value !== null && fault.value !== undefined) descParts.push(`Value: ${fault.value}`);
    if (fault.tag) descParts.push(`Tag: ${fault.tag}`);
    if (fault.detectedAt) descParts.push(`Time: ${fault.detectedAt}`);
    if (fault.failurePercent !== null && fault.failurePercent !== undefined) descParts.push(`Failure%: ${fault.failurePercent}`);
    const description = descParts.join('\n');

    // 5. Construct Payload (Prisma Insert Input)
    // Matches PostgreSQL `complaints` table schema
    return {
        id: crypto.randomUUID(), // Generated UUID for PK
        complaintId: newComplaintId,

        // Link to Complaint Type (Integer ID)
        complaintTypeId: resolvedType ? resolvedType.id : undefined,


        title: `Fault Captured: ${displayedType} (${fault.tag})`
            .replace('{{Description}}', displayedType)
            .replace('{{TagNumber}}', fault.tag),
        description: description,

        type: resolvedType ? resolvedType.name : typeName, // "Lamp Failures", etc.

        status: mapping.defaultStatus || 'REGISTERED',
        priority: priority,
        slaStatus: defaults.slaStatus || 'ON_TIME',

        // Deadlines & Timestamps
        deadline: resolvedType ? new Date(now.getTime() + (resolvedType.slaHours * 3600000)) : undefined,
        submittedOn: now,

        // Contact Info (Required by Schema "contactPhone text NOT NULL")
        contactPhone: defaults.contactPhone || "9876543210",
        contactName: defaults.contactName || "System Agent",
        contactEmail: defaults.contactEmail || "system@fixsmart.dev",
        isAnonymous: defaults.isAnonymous || false,

        // User Refs
        submittedById: defaults.submittedById,

        // Location Defaults
        wardId: defaults.wardId || null,
        subZoneId: defaults.subZoneId || null,
        area: defaults.area || null,
        address: defaults.address || null,
        coordinates: null, // JSON string?
        latitude: null,
        longitude: null,

        // Metadata in Tags
        tags: JSON.stringify({
            rtuId: fault.rtuNumber,
            faultType: typeVal,
            tag: fault.tag,
            value: fault.value,
            generatedBy: 'AlarmToComplaintSyncV2'
        })
    };
}
