// Selective Data Processor Logic
export function processRawData(rawData, rtuKey = 'RTUNumber', timeKey = 'DateTimeField', sourceType = 'UNKNOWN', enrichKeys = [], filterTags = []) {
    const normalized = [];

    // Determine which tags we actually care about to avoid 1..64 loop
    const activeTags = filterTags.length > 0 ? filterTags : Array.from({ length: 64 }, (_, i) => `Tag${i + 1}`);

    for (const row of rawData) {
        const rtuId = row[rtuKey];
        const eventTime = row[timeKey];

        for (const tagKey of activeTags) {
            if (row[tagKey] !== undefined && row[tagKey] !== null) {
                const point = {
                    rtuId: String(rtuId),
                    tag: tagKey,
                    value: row[tagKey],
                    eventTime: new Date(eventTime),
                    sourceType: sourceType,
                };

                // Add enriched properties
                enrichKeys.forEach(key => {
                    if (row[key] !== undefined) point[key] = row[key];
                });

                normalized.push(point);
            }
        }
    }

    return normalized;
}
