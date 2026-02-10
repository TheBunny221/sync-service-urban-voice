
/**
 * Builds the complaint payload for Urban Voice CMS
 */
export function buildPayload(rtuId, fault) {
    return {
        rtuNumber: Number(rtuId),
        panelName: `RTU-${rtuId}`, // Default, ideally fetched from RTU Master
        faultType: fault.type, // POWER | COMM | SINGLE_TRIP | THREE_TRIP | LAMP
        description: fault.description,
        failurePercent: fault.pct || (fault.type === 'LAMP_FAILURE' ? 100 : null), // Default 100% impact for system faults, actual % for lamp
        detectedAt: fault.time ? new Date(fault.time).toISOString() : new Date().toISOString(),
        source: 'AlarmToComplaintSyncV2',
        // Internal metadata for UI
        tag: fault.tag,
        value: fault.val
    };
}
