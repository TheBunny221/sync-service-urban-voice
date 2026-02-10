
import sql from 'mssql';
import { getConfig } from '../config/configLoader.js';
import { v2Logger as logger } from '../logger.js';

let pool = null;

export async function connectToSourceDb() {
    const config = getConfig();

    try {
        if (!pool) {
            pool = await sql.connect({
                user: config.sourceDb.user,
                password: config.sourceDb.password,
                server: config.sourceDb.server,
                port: config.sourceDb.port, // Optional port
                database: config.sourceDb.database,
                options: config.sourceDb.options,
            });
            logger.info('Connected to Source SQL Server');
        }
        return pool;
    } catch (err) {
        // logger.error('Failed to connect to Source SQL Server', err); // Caller handles logging to avoid duplicates
        throw err;
    }
}

async function fetchData(tableName, lastSyncTime) {
    const config = getConfig();
    const pool = await connectToSourceDb();

    const lookbackDate = lastSyncTime || new Date(Date.now() - config.syncRules.lookbackHours * 60 * 60 * 1000);

    logger.info(`Fetching ${tableName} (Lookback: ${config.syncRules.lookbackHours}h, Batch: ${config.syncRules.batchSize}) since ${lookbackDate.toLocaleString()} (UTC: ${lookbackDate.toISOString()})`);

    // Fetch all 64 tags dynamically or just SELECT *
    // Using SELECT * is easier for 64 tags.
    // Note: Ensure batch size limit.
    const result = await pool.request()
        .input('lookbackDate', sql.DateTime, lookbackDate)
        .query(`
      SELECT TOP (${config.syncRules.batchSize}) *
      FROM dbo.[${tableName}]
      WHERE DateTimeField > @lookbackDate
      ORDER BY DateTimeField ASC
    `);

    if (result.recordset.length > 0) {
        const first = result.recordset[0].DateTimeField;
        const last = result.recordset[result.recordset.length - 1].DateTimeField;
        logger.info(`[DB-VAL] ${tableName}: Fetched ${result.recordset.length} rows. Range: ${new Date(first).toLocaleString()} -> ${new Date(last).toLocaleString()}`);
    } else {
        logger.info(`[DB-VAL] ${tableName}: No new rows found since ${lookbackDate.toLocaleString()}.`);
    }

    return result.recordset;
}

export async function fetchAnalogData(lastSyncTime) {
    return fetchData('AnalogData3', lastSyncTime);
}

export async function fetchDigitalData(lastSyncTime) {
    const config = getConfig();
    const pool = await connectToSourceDb();

    const tableName = `DigitalData${config.syncRules.clientId}`;
    const lookbackDate = lastSyncTime || new Date(Date.now() - config.syncRules.lookbackHours * 60 * 60 * 1000);

    logger.info(`Fetching ${tableName} (Lookback: ${config.syncRules.lookbackHours}h) since ${lookbackDate.toLocaleString()} (UTC: ${lookbackDate.toISOString()})`);

    try {
        const result = await pool.request()
            .input('lookbackDate', sql.DateTime, lookbackDate)
            .query(`
                SELECT TOP (${config.syncRules.batchSize}) *
                FROM dbo.[${tableName}]
                WHERE DateTimeField > @lookbackDate
                ORDER BY DateTimeField ASC
            `);

        if (result.recordset.length > 0) {
            const first = result.recordset[0].DateTimeField;
            const last = result.recordset[result.recordset.length - 1].DateTimeField;
            logger.info(`[DB-VAL] ${tableName}: Fetched ${result.recordset.length} rows. Range: ${new Date(first).toLocaleString()} -> ${new Date(last).toLocaleString()}`);
        } else {
            logger.info(`[DB-VAL] ${tableName}: No new rows found since ${lookbackDate.toLocaleString()}.`);
        }

        return result.recordset;
    } catch (err) {
        logger.error(`Error fetching digital data from ${tableName}`, err);
        return [];
    }
}


export async function checkSignalPersistence(rtuId, tag, value, durationMs, sourceType) {
    const config = getConfig();
    const pool = await connectToSourceDb();

    // Determine Table Name
    let tableName;
    if (sourceType === 'DIGITAL') {
        tableName = `DigitalData${config.syncRules.clientId}`;
    } else {
        tableName = `AnalogData${config.syncRules.clientId}`;
    }

    const cutoffTime = new Date(Date.now() - durationMs);

    // Sanitize Tag Column Name (Simple check to prevent injection)
    if (!/^Tag\d+$/.test(tag)) {
        logger.warn(`Invalid tag name for persistence check: ${tag}`);
        return false;
    }

    try {
        // Query: Check if a record exists with the same value at or before the cutoff time.
        // This implies the condition started at least that long ago.
        const query = `
            SELECT TOP 1 DateTimeField
            FROM dbo.[${tableName}]
            WHERE RTUNumber = @rtuId
            AND [${tag}] = @value
            AND DateTimeField <= @cutoff
            ORDER BY DateTimeField DESC
        `;

        const result = await pool.request()
            .input('rtuId', sql.Int, rtuId)
            .input('value', sql.Int, Number(value)) // Ensure value is number
            .input('cutoff', sql.DateTime, cutoffTime)
            .query(query);

        return result.recordset.length > 0;
    } catch (err) {
        logger.error(`Error checking signal persistence on ${tableName}`, err);
        return false;
    }
}

/**
 * Fetches historical data for a set of RTUs over a specified window.
 */
export async function fetchHistory(rtuIds, windowHours, sourceType) {
    const config = getConfig();
    const pool = await connectToSourceDb();

    if (!rtuIds || rtuIds.length === 0) return [];

    let tableName;
    if (sourceType === 'DIGITAL') {
        tableName = `DigitalData${config.syncRules.clientId}`;
    } else {
        tableName = `AnalogData${config.syncRules.clientId}`;
    }

    const cutoffTime = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    try {
        // Constructing safe IN clause for numeric IDs
        const safeIds = rtuIds.map(id => parseInt(id)).filter(id => !isNaN(id));
        if (safeIds.length === 0) return [];

        const query = `
             SELECT *
             FROM dbo.[${tableName}]
             WHERE RTUNumber IN (${safeIds.join(',')})
             AND DateTimeField > @cutoff
             ORDER BY RTUNumber, DateTimeField DESC
         `;

        const result = await pool.request()
            .input('cutoff', sql.DateTime, cutoffTime)
            .query(query);

        return result.recordset;
    } catch (err) {
        logger.error(`Error fetching history from ${tableName}`, err);
        return [];
    }
}

export async function closeSourceDb() {
    if (pool) {
        await pool.close();
        pool = null;
    }
}
