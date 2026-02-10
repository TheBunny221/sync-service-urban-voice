
import { connectToSourceDb } from '../db/mssql.js';
import { getConfig } from '../config/configLoader.js';
import { v2Logger } from '../logger.js';

export class PowerFailService {
    constructor() {
        this.config = getConfig();
    }

    /**
     * Finds active Power Failures (Tag16 = 0)
     * Limit to last 60 minutes to ensure relevance.
     */
    async detect(sinceDate) {
        try {
            const table = `DigitalData${this.config.syncRules.clientId}`;
            const pool = await connectToSourceDb();

            // Query: Get unique RTUs with Tag16=0 in the window
            // We take the LATEST record for each RTU in the window.
            const query = `
                WITH Latest AS (
                    SELECT RTUNumber, Tag16, DateTimeField,
                           ROW_NUMBER() OVER (PARTITION BY RTUNumber ORDER BY DateTimeField DESC) as rn
                    FROM dbo.[${table}]
                    WHERE DateTimeField >= @since
                )
                SELECT RTUNumber, DateTimeField, Tag16
                FROM Latest
                WHERE rn = 1 AND Tag16 = 0
            `;

            // Adjust sinceDate to max 60 mins lookback for Power Fail specifically?
            // User spec: "Digital TAG16 = 0, last 60 min"
            const effectiveSince = new Date(Date.now() - 60 * 60 * 1000);

            const result = await pool.request()
                .input('since', effectiveSince)
                .query(query);

            return result.recordset.map(row => ({
                rtuId: String(row.RTUNumber),
                type: 'POWER_FAIL',
                tag: 'Tag16',
                val: 0,
                description: 'Power Supply Not Available', // Standard text
                time: row.DateTimeField
            }));

        } catch (error) {
            v2Logger.error('PowerFailService Error', error);
            return [];
        }
    }
}
