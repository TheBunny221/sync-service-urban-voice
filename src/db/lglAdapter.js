
import sql from 'mssql';
import { getConfig } from '../logic/configLoader.js';
import { getLogger } from '../utils/logger.js';
import { connectToSourceDb } from './mssql.js';

/**
 * Streams joined Digital and Analog data since a specific date.
 * Orders by RTUNumber and DateTimeField to allow sequential winner-selection.
 */
export async function fetchJoinedDataStream(sinceDate, handlers) {
    const { onRow, onEnd, onError } = handlers;
    const config = getConfig();
    const logger = getLogger();
    const pool = await connectToSourceDb();

    const digitalTable = `DigitalData${config.syncRules.clientId}`;
    const analogTable = `AnalogData${config.syncRules.clientId}`;

    logger.info(`Streaming JOINED data from ${digitalTable} & ${analogTable} since ${sinceDate.toISOString()}`);

    try {
        const query = `
            SELECT 
                d.*,
                a.Tag6 as AnalogTag6,
                a.Tag4 as AnalogTag4,
                a.Tag13 as AnalogTag13,
                a.Tag14 as AnalogTag14,
                a.Tag16 as AnalogTag16
            FROM dbo.[${digitalTable}] d
            LEFT JOIN dbo.[${analogTable}] a ON d.RTUNumber = a.RTUNumber AND d.DateTimeField = a.DateTimeField
            WHERE d.DateTimeField > @lookbackDate
            ORDER BY d.RTUNumber ASC, d.DateTimeField ASC
        `;

        const request = pool.request();
        request.stream = true;
        request.input('lookbackDate', sql.DateTime, sinceDate);

        // Execute query but return the request immediately
        request.query(query);

        request.on('row', row => {
            onRow({
                ...row,
                sourceType: 'UNIFIED',
                Tag6: row.AnalogTag6,
                Tag4: row.AnalogTag4,
                Tag13: row.AnalogTag13,
                Tag14: row.AnalogTag14
            });
        });

        request.on('error', err => {
            logger.error('Stream error in lglAdapter', err);
            if (onError) onError(err);
        });

        request.on('done', result => {
            if (onEnd) onEnd();
        });

        return request; // Return the request object so caller can pause/resume

    } catch (err) {
        logger.error('Error starting joined LGL data stream', err);
        throw err;
    }
}

export async function fetchCommFaults() {
    const config = getConfig();
    const pool = await connectToSourceDb();
    const digitalTable = `DigitalData${config.syncRules.clientId}`;
    const analogTable = `AnalogData${config.syncRules.clientId}`;

    // Logic: 
    // 1. Digital Data last seen > 1 hour ago (stale)
    // 2. RTU NOT seen in Analog Data for last 24 hours (dead)
    // 3. Status is "Not Communicating" (Tag8=0) -- implicit in the stale check usually, but SQL specifically checks for records where Tag8=0? 
    //    Actually, the USER SQL says: 
    //    WHERE d.TAG8 = 0 AND d.datetimefield <= DATEADD(HOUR, -1, GETDATE()) 
    //    AND d.RTUNUMBER not in (select RTUNUMBER from ANALOGSPOTDATA where datetimefield <= DATEADD(HOUR, -1440, GETDATE()))

    // NOTE: The user's SQL uses 'DIGITALSPOTDATA' which implies latest record. 
    // We are query raw tables, so we must group by RTU to find the 'latest' record first ??
    // actually 'fetchCommFaults' implies getting the current state.
    // The previous implementation used `HAVING MAX(d.DateTimeField)...`.
    // We will stick to the User's SQL logic but adapted for the raw table structure if standard 'Spot' tables aren't available, 
    // OR if we assume DigitalData${Id} acts like a history log, we need the latest.

    // However, the provided SQL is:
    // SELECT d.RTUNUMBER... FROM DIGITALSPOTDATA d ... WHERE d.TAG8=0 AND d.datetimefield <= -1h ...

    // Only 'Communication Fail' if NO data for 1h AND 'Last Known Status' was likely bad? 
    // Actually the SQL says "WHERE d.TAG8=0". This means the *last received packet* said "Not Communicating"? 
    // OR it means "We haven't received data" (which usually implies we can't check tagging). 
    // BUT the query clearly filters `TAG8=0`. 
    // Let's implement exactly as requested: 
    // Find devices where latest Digital entry has Tag8=0 AND is old (>1h) AND no Analog data in 24h.

    // Optimization: Use NOT EXISTS instead of NOT IN with subquery
    // This often yields better performance and handles potential NULLs more gracefully (though RTUNUMBER shouldn't be null).
    const query = `
        SELECT 
            d.RTUNUMBER, 
            MAX(d.DateTimeField) as LastSeen
        FROM dbo.[${digitalTable}] d
        WHERE d.Tag8 = 0
        GROUP BY d.RTUNUMBER
        HAVING MAX(d.DateTimeField) <= DATEADD(HOUR, -1, GETDATE())
        AND NOT EXISTS (
            SELECT 1 
            FROM dbo.[${analogTable}] a
            WHERE a.RTUNumber = d.RTUNumber
            AND a.DateTimeField >= DATEADD(HOUR, -24, GETDATE())
        )
    `;

    // Set a higher timeout for this specific heavy analytical query if possible, 
    // or rely on global pool settings. 
    // We can pass a custom request timeout if supported by the driver usage here.
    // pool.request({ requestTimeout: 60000 })

    const request = pool.request();
    request.setTimeout(60000); // 60s timeout for this query

    const result = await request.query(query);
    return result.recordset.map(row => ({
        rtuId: row.RTUNUMBER,
        tag: 'Tag8',
        value: 0,
        eventTime: row.LastSeen,
        sourceType: 'COMPUTED_STATE',
        description: 'Communication Failure (Computed)'
    }));
}

/**
 * Fetches RTUs that are currently reporting Power Failure.
 * Logic: Tag16=0 in the last 60 minutes.
 */
export async function fetchPowerFailures() {
    const config = getConfig();
    const pool = await connectToSourceDb();
    const digitalTable = `DigitalData${config.syncRules.clientId}`;

    const query = `
        SELECT 
            d.RTUNUMBER, 
            d.DateTimeField
        FROM dbo.[${digitalTable}] d
        WHERE d.Tag16 = 0
        AND d.DateTimeField >= DATEADD(MINUTE, -60, GETDATE())
    `;

    const result = await pool.request().query(query);
    return result.recordset.map(row => ({
        rtuId: row.RTUNUMBER,
        tag: 'Tag16',
        value: 0,
        eventTime: row.DateTimeField,
        sourceType: 'COMPUTED_STATE',
        description: 'Power Failure (Computed)'
    }));
}
